import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { redis } from './redis';
import { MetricsService } from './metrics-service';
import type {
  QueueMeta,
  QueueType,
  QueueWithStats,
  CreateQueueInput,
  SendMessageInput,
  MessageMetadata,
  DLQMessageMetadata,
  ReceiveMessageResponse,
  ReceiveMessagesOptions,
  RedriveResponse,
  BurstLoadResponse,
} from '../types/queue';

// Lua script to atomically receive up to N messages from ready queue and place into inflight ZSET.
// If receiveCount > maxReceiveCount, moves message to DLQ instead of returning to consumer.
const RECEIVE_MESSAGES_LUA = `
local readyKey = KEYS[1]
local inflightKey = KEYS[2]
local dlqReadyKey = KEYS[3]
local dlqMetaKey = KEYS[4]

local maxCount = tonumber(ARGV[1])
local expireAt = tonumber(ARGV[2])
local qName = ARGV[3]
local dlqName = ARGV[4]
local maxReceive = tonumber(ARGV[5]) or 3
local failedAt = ARGV[6]
local errorTrace = ARGV[7]
local nowIso = ARGV[8]
local qType = ARGV[9] or 'standard'

local results = {}
local movedToDlq = {}
local skipped = {}

-- Ensure DLQ meta exists in Redis if messages are moved to DLQ
local function ensureDlqMeta()
  local dlqExists = redis.call('EXISTS', dlqMetaKey)
  if dlqExists == 0 then
    redis.call('SADD', 'queues:all', dlqName)
    redis.call('HSET', dlqMetaKey,
      'name', dlqName,
      'type', qType,
      'visibilityTimeout', '30',
      'maxReceiveCount', '3',
      'createdAt', nowIso
    )
  end
end

-- If FIFO, collect all messageGroupIds that are currently in-flight
local inflightGroups = {}
if qType == 'fifo' then
  local currentInflight = redis.call('ZRANGE', inflightKey, 0, -1)
  for _, ifId in ipairs(currentInflight) do
    local grp = redis.call('HGET', 'msg:' .. qName .. ':' .. ifId, 'messageGroupId')
    if grp and grp ~= '' then
      inflightGroups[grp] = true
    end
  end
end

local safetyLimit = 50
local iterations = 0

while #results < maxCount and iterations < safetyLimit do
  iterations = iterations + 1
  local msgId = redis.call('LPOP', readyKey)
  if not msgId then
    break
  end

  local msgKey = 'msg:' .. qName .. ':' .. msgId
  local exists = redis.call('EXISTS', msgKey)

  if exists == 1 then
    -- Check FIFO group concurrency
    local canDeliver = true
    local grp = nil
    if qType == 'fifo' then
      grp = redis.call('HGET', msgKey, 'messageGroupId')
      if grp and grp ~= '' and inflightGroups[grp] then
        canDeliver = false
      end
    end

    if not canDeliver then
      -- Another message from this group is currently in-flight or already in this batch.
      -- Defer to preserve strict FIFO ordering per messageGroupId.
      table.insert(skipped, msgId)
    else
      local newReceiveCount = redis.call('HINCRBY', msgKey, 'receiveCount', 1)

      if newReceiveCount > maxReceive then
        -- Exceeded maxReceiveCount! Move message to DLQ
        ensureDlqMeta()

        local dlqMsgKey = 'msg:' .. dlqName .. ':' .. msgId
        redis.call('RENAME', msgKey, dlqMsgKey)

        local reason = 'MaxReceiveCountExceeded (Attempted ' .. newReceiveCount .. ' times)'
        redis.call('HSET', dlqMsgKey,
          'failedAt', failedAt,
          'failureReason', reason,
          'errorTrace', errorTrace,
          'sourceQueue', qName
        )

        redis.call('RPUSH', dlqReadyKey, msgId)
        table.insert(movedToDlq, msgId)
      else
        -- Deliver to consumer
        redis.call('ZADD', inflightKey, expireAt, msgId)
        table.insert(results, msgId)
        if grp and grp ~= '' then
          inflightGroups[grp] = true
        end
      end
    end
  end
end

-- Put any skipped messages back to the front of ready queue in reverse order
if #skipped > 0 then
  for i = #skipped, 1, -1 do
    redis.call('LPUSH', readyKey, skipped[i])
  end
end

return { results, movedToDlq }
`;

// Lua script to atomically acknowledge (delete) message from inflight and delete hash
const ACK_MESSAGE_LUA = `
local inflightKey = KEYS[1]
local msgKey = KEYS[2]
local msgId = ARGV[1]

local removed = redis.call('ZREM', inflightKey, msgId)
local deleted = redis.call('DEL', msgKey)

return { removed, deleted }
`;

// Lua script to atomically purge all messages in ready and inflight queues
const PURGE_QUEUE_LUA = `
local readyKey = KEYS[1]
local inflightKey = KEYS[2]
local qName = ARGV[1]

local readyMsgs = redis.call('LRANGE', readyKey, 0, -1)
for _, id in ipairs(readyMsgs) do
  redis.call('DEL', 'msg:' .. qName .. ':' .. id)
end
redis.call('DEL', readyKey)

local inflightMsgs = redis.call('ZRANGE', inflightKey, 0, -1)
for _, id in ipairs(inflightMsgs) do
  redis.call('DEL', 'msg:' .. qName .. ':' .. id)
end
redis.call('DEL', inflightKey)

return { #readyMsgs, #inflightMsgs }
`;

// Lua script for sweeper to move expired inflight messages back to ready list
const SWEEP_EXPIRED_LUA = `
local inflightKey = KEYS[1]
local readyKey = KEYS[2]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2]) or 100

local expired = redis.call('ZRANGEBYSCORE', inflightKey, 0, now, 'LIMIT', 0, limit)
local moved = 0

for _, id in ipairs(expired) do
  redis.call('ZREM', inflightKey, id)
  redis.call('LPUSH', readyKey, id)
  moved = moved + 1
end

return moved
`;

// Lua script to redrive messages from DLQ back to sourceQueue
const REDRIVE_LUA = `
local dlqReadyKey = KEYS[1]
local dlqInflightKey = KEYS[2]
local dlqName = ARGV[1]
local numArgs = #ARGV

local idsToRedrive = {}

if numArgs > 1 then
  for i = 2, numArgs do
    table.insert(idsToRedrive, ARGV[i])
  end
else
  local readyIds = redis.call('LRANGE', dlqReadyKey, 0, -1)
  for _, id in ipairs(readyIds) do
    table.insert(idsToRedrive, id)
  end
  local inflightIds = redis.call('ZRANGE', dlqInflightKey, 0, -1)
  for _, id in ipairs(inflightIds) do
    table.insert(idsToRedrive, id)
  end
end

local redriven = {}

for _, msgId in ipairs(idsToRedrive) do
  local dlqMsgKey = 'msg:' .. dlqName .. ':' .. msgId
  if redis.call('EXISTS', dlqMsgKey) == 1 then
    local srcQueue = redis.call('HGET', dlqMsgKey, 'sourceQueue')
    if not srcQueue or srcQueue == '' then
      srcQueue = string.gsub(dlqName, '%-dlq$', '')
    end

    local srcMsgKey = 'msg:' .. srcQueue .. ':' .. msgId
    local srcReadyKey = 'queue:' .. srcQueue .. ':ready'

    -- Move hash to source queue
    redis.call('RENAME', dlqMsgKey, srcMsgKey)
    -- Reset receiveCount = 0 and clear error metadata
    redis.call('HSET', srcMsgKey, 'receiveCount', '0')
    redis.call('HDEL', srcMsgKey, 'failedAt', 'failureReason', 'errorTrace', 'sourceQueue')

    -- Remove from DLQ
    redis.call('LREM', dlqReadyKey, 0, msgId)
    redis.call('ZREM', dlqInflightKey, msgId)

    -- Push to source queue ready list
    redis.call('RPUSH', srcReadyKey, msgId)
    table.insert(redriven, msgId)
  end
end

return redriven
`;

// Lua script to simulate failure on an inflight message
const SIMULATE_FAIL_LUA = `
local inflightKey = KEYS[1]
local dlqReadyKey = KEYS[2]
local dlqMetaKey = KEYS[3]
local qName = ARGV[1]
local msgId = ARGV[2]
local dlqName = ARGV[3]
local maxReceive = tonumber(ARGV[4]) or 3
local failedAt = ARGV[5]
local errorTrace = ARGV[6]
local nowIso = ARGV[7]
local qType = ARGV[8] or 'standard'
local customReason = ARGV[9]

local msgKey = 'msg:' .. qName .. ':' .. msgId
if redis.call('EXISTS', msgKey) == 0 then
  return { 0, 0, 0 } -- Not found
end

-- Remove from inflight
redis.call('ZREM', inflightKey, msgId)

local newReceiveCount = redis.call('HINCRBY', msgKey, 'receiveCount', 1)
local reason = (customReason and customReason ~= '') and customReason or ('MaxReceiveCountExceeded (Attempted ' .. newReceiveCount .. ' times)')

if newReceiveCount > maxReceive then
  -- Exceeded! Move to DLQ
  local dlqExists = redis.call('EXISTS', dlqMetaKey)
  if dlqExists == 0 then
    redis.call('SADD', 'queues:all', dlqName)
    redis.call('HSET', dlqMetaKey,
      'name', dlqName,
      'type', qType,
      'visibilityTimeout', '30',
      'maxReceiveCount', '3',
      'createdAt', nowIso
    )
  end

  local dlqMsgKey = 'msg:' .. dlqName .. ':' .. msgId
  redis.call('RENAME', msgKey, dlqMsgKey)

  redis.call('HSET', dlqMsgKey,
    'failedAt', failedAt,
    'failureReason', reason,
    'errorTrace', errorTrace,
    'sourceQueue', qName
  )

  redis.call('RPUSH', dlqReadyKey, msgId)
  return { 1, 1, newReceiveCount } -- { success, movedToDlq, newReceiveCount }
else
  -- Return back to ready list with incremented receiveCount and failure trace
  local readyKey = 'queue:' .. qName .. ':ready'
  redis.call('HSET', msgKey,
    'failedAt', failedAt,
    'failureReason', reason,
    'errorTrace', errorTrace
  )
  redis.call('LPUSH', readyKey, msgId)
  return { 1, 0, newReceiveCount } -- { success, movedToDlq=0, newReceiveCount }
end
`;

export class QueueService {
  /**
   * Helper to derive standard DLQ name
   */
  public static getDLQName(queueName: string): string {
    return `${queueName}-dlq`;
  }

  /**
   * Detect poison pill chaos payload and construct authentic runtime stack trace
   */
  public static getPoisonPillError(body: string | Record<string, unknown>): {
    isPoisonPill: boolean;
    failureReason: string;
    errorTrace: string;
  } | null {
    try {
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      if (!data || typeof data !== 'object') return null;

      if (data.failProcessing !== true) {
        return null;
      }

      if (data.simulateError === 'TypeError' || data.orderId === null) {
        return {
          isPoisonPill: true,
          failureReason: "TypeError: Cannot read properties of null (reading 'orderId')",
          errorTrace: "TypeError: Cannot read properties of null (reading 'orderId')\n    at OrderProcessor.execute (/var/task/worker.ts:42:15)\n    at processMessage (/var/task/handler.ts:89:12)\n    at Runtime.handleEvent (/var/runtime/index.ts:14:5)",
        };
      }

      if (data.simulateError === 'SyntaxError' || (data.invalidXml && typeof data.invalidXml === 'string')) {
        return {
          isPoisonPill: true,
          failureReason: "SyntaxError: Unexpected token '<' in JSON at position 0",
          errorTrace: "SyntaxError: Unexpected token < in JSON at position 0\n    at XMLParser.parse (/var/task/worker.ts:88:22)\n    at OrderProcessor.execute (/var/task/worker.ts:45:18)\n    at processMessage (/var/task/handler.ts:89:12)",
        };
      }

      return {
        isPoisonPill: true,
        failureReason: `${data.simulateError || 'ProcessingError'}: Chaos injection processing failure`,
        errorTrace: `${data.simulateError || 'RuntimeError'}: Simulated chaos failure during worker processing\n    at OrderProcessor.execute (/var/task/worker.ts:42:15)\n    at processMessage (/var/task/handler.ts:89:12)`,
      };
    } catch {
      return null;
    }
  }


  /**
   * Validate queue name according to SQS specifications
   */
  public static validateQueueName(name: string, type?: QueueType): { name: string; type: QueueType } {
    if (!name || typeof name !== 'string') {
      throw new Error('Queue name must be a non-empty string');
    }

    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      throw new Error('Queue name must be between 1 and 80 characters');
    }

    const validNamePattern = /^[a-zA-Z0-9_.-]+$/;
    if (!validNamePattern.test(trimmed)) {
      throw new Error('Queue name can only contain alphanumeric characters, hyphens, and underscores');
    }

    const isFifoName = trimmed.endsWith('.fifo');

    // If it is a DLQ for a FIFO queue (e.g. orders.fifo-dlq), allow it
    if (type === 'fifo' && !isFifoName && !trimmed.endsWith('-dlq')) {
      throw new Error('FIFO queue name must end with the .fifo suffix');
    }

    if (type === 'standard' && isFifoName) {
      throw new Error('Standard queue name cannot end with the .fifo suffix');
    }

    const resolvedType: QueueType = type ?? (isFifoName ? 'fifo' : 'standard');
    return { name: trimmed, type: resolvedType };
  }

  /**
   * List all queues with stats
   */
  public static async listQueues(): Promise<QueueWithStats[]> {
    const queueNames = await redis.smembers('queues:all');
    if (queueNames.length === 0) {
      return [];
    }

    const pipeline = redis.pipeline();
    for (const name of queueNames) {
      pipeline.hgetall(`queue:${name}:meta`);
      pipeline.llen(`queue:${name}:ready`);
      pipeline.zcard(`queue:${name}:inflight`);
      const dlqName = `${name}-dlq`;
      pipeline.llen(`queue:${dlqName}:ready`);
      pipeline.zcard(`queue:${dlqName}:inflight`);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const queues: QueueWithStats[] = [];

    for (let i = 0; i < queueNames.length; i++) {
      const baseIdx = i * 5;
      const metaRaw = results[baseIdx][1] as Record<string, string>;
      const readyCount = (results[baseIdx + 1][1] as number) || 0;
      const inFlightCount = (results[baseIdx + 2][1] as number) || 0;
      const dlqReady = (results[baseIdx + 3][1] as number) || 0;
      const dlqInflight = (results[baseIdx + 4][1] as number) || 0;
      const dlqCount = dlqReady + dlqInflight;

      const queueName = queueNames[i];
      const type: QueueType = (metaRaw?.type as QueueType) || (queueName.endsWith('.fifo') ? 'fifo' : 'standard');
      const visibilityTimeout = Number(metaRaw?.visibilityTimeout) || 30;
      const maxReceiveCount = Number(metaRaw?.maxReceiveCount) || 3;
      const createdAt = metaRaw?.createdAt || new Date().toISOString();

      queues.push({
        name: queueName,
        type,
        visibilityTimeout,
        maxReceiveCount,
        createdAt,
        stats: {
          readyCount,
          inFlightCount,
          totalApproximate: readyCount + inFlightCount,
          dlqCount,
        },
      });
    }

    return queues.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get single queue metadata with stats
   */
  public static async getQueue(name: string): Promise<QueueWithStats | null> {
    const isMember = await redis.sismember('queues:all', name);
    if (!isMember) {
      return null;
    }

    const dlqName = `${name}-dlq`;
    const pipeline = redis.pipeline();
    pipeline.hgetall(`queue:${name}:meta`);
    pipeline.llen(`queue:${name}:ready`);
    pipeline.zcard(`queue:${name}:inflight`);
    pipeline.llen(`queue:${dlqName}:ready`);
    pipeline.zcard(`queue:${dlqName}:inflight`);

    const results = await pipeline.exec();
    if (!results) return null;

    const metaRaw = results[0][1] as Record<string, string>;
    const readyCount = (results[1][1] as number) || 0;
    const inFlightCount = (results[2][1] as number) || 0;
    const dlqReady = (results[3][1] as number) || 0;
    const dlqInflight = (results[4][1] as number) || 0;

    const type: QueueType = (metaRaw?.type as QueueType) || (name.endsWith('.fifo') ? 'fifo' : 'standard');
    const visibilityTimeout = Number(metaRaw?.visibilityTimeout) || 30;
    const maxReceiveCount = Number(metaRaw?.maxReceiveCount) || 3;
    const createdAt = metaRaw?.createdAt || new Date().toISOString();

    return {
      name,
      type,
      visibilityTimeout,
      maxReceiveCount,
      createdAt,
      stats: {
        readyCount,
        inFlightCount,
        totalApproximate: readyCount + inFlightCount,
        dlqCount: dlqReady + dlqInflight,
      },
    };
  }

  /**
   * Create a new queue
   */
  public static async createQueue(input: CreateQueueInput): Promise<{ queue: QueueMeta; created: boolean }> {
    const { name, type } = this.validateQueueName(input.name, input.type);

    const exists = await redis.sismember('queues:all', name);
    const visibilityTimeout = Math.max(1, Math.min(43200, Number(input.visibilityTimeout) || 30));
    const maxReceiveCount = Math.max(1, Math.min(1000, Number(input.maxReceiveCount) || 3));

    if (exists) {
      const existingMeta = await redis.hgetall(`queue:${name}:meta`);
      return {
        queue: {
          name,
          type: (existingMeta.type as QueueType) || type,
          visibilityTimeout: Number(existingMeta.visibilityTimeout) || visibilityTimeout,
          maxReceiveCount: Number(existingMeta.maxReceiveCount) || maxReceiveCount,
          createdAt: existingMeta.createdAt || new Date().toISOString(),
        },
        created: false,
      };
    }

    const createdAt = new Date().toISOString();
    const queueMeta: QueueMeta = {
      name,
      type,
      visibilityTimeout,
      maxReceiveCount,
      createdAt,
    };

    const pipeline = redis.pipeline();
    pipeline.sadd('queues:all', name);
    pipeline.hset(`queue:${name}:meta`, {
      name,
      type,
      visibilityTimeout: visibilityTimeout.toString(),
      maxReceiveCount: maxReceiveCount.toString(),
      createdAt,
    });

    await pipeline.exec();

    return {
      queue: queueMeta,
      created: true,
    };
  }

  /**
   * Send a message to a queue
   */
  public static async sendMessage(
    queueName: string,
    input: SendMessageInput
  ): Promise<{ message: MessageMetadata; deduplicated?: boolean }> {
    const queue = await this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    if (input.body === undefined || input.body === null || input.body === '') {
      throw new Error('Message body cannot be empty');
    }

    const bodyStr = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
    const bytes = Buffer.byteLength(bodyStr, 'utf8');
    const sizeKb = Number((bytes / 1024).toFixed(3));

    const messageGroupId = input.messageGroupId?.trim();
    let messageDeduplicationId = input.messageDeduplicationId?.trim();

    // FIFO specific validations & deduplication window
    if (queue.type === 'fifo') {
      if (!messageGroupId) {
        throw new Error('FIFO queues require a non-empty messageGroupId');
      }

      if (!messageDeduplicationId) {
        messageDeduplicationId = createHash('sha256').update(bodyStr).digest('hex');
      }

      const dedupKey = `dedup:${queueName}:${messageDeduplicationId}`;
      const existingMessageId = await redis.get(dedupKey);

      if (existingMessageId) {
        const existingData = await redis.hgetall(`msg:${queueName}:${existingMessageId}`);
        if (existingData && existingData.id) {
          return {
            message: {
              id: existingData.id,
              body: existingData.body,
              sizeKb: Number(existingData.sizeKb) || 0,
              enqueueTime: existingData.enqueueTime,
              receiveCount: Number(existingData.receiveCount) || 0,
              messageGroupId: existingData.messageGroupId,
              messageDeduplicationId: existingData.messageDeduplicationId,
            },
            deduplicated: true,
          };
        }
      }

      const messageId = nanoid();
      await redis.set(dedupKey, messageId, 'EX', 300);

      const msgKey = `msg:${queueName}:${messageId}`;
      const enqueueTime = new Date().toISOString();

      const hashData: Record<string, string> = {
        id: messageId,
        body: bodyStr,
        sizeKb: sizeKb.toString(),
        enqueueTime,
        receiveCount: '0',
        messageGroupId,
        messageDeduplicationId,
      };

      const pipeline = redis.pipeline();
      pipeline.hset(msgKey, hashData);
      pipeline.rpush(`queue:${queueName}:ready`, messageId);
      await pipeline.exec();

      await MetricsService.recordMetric(queueName, 'sent', 1);

      return {
        message: {
          id: messageId,
          body: bodyStr,
          sizeKb,
          enqueueTime,
          receiveCount: 0,
          messageGroupId,
          messageDeduplicationId,
        },
        deduplicated: false,
      };
    }

    // Standard Queue
    const messageId = nanoid();
    const msgKey = `msg:${queueName}:${messageId}`;
    const enqueueTime = new Date().toISOString();

    const hashData: Record<string, string> = {
      id: messageId,
      body: bodyStr,
      sizeKb: sizeKb.toString(),
      enqueueTime,
      receiveCount: '0',
    };
    if (messageGroupId) hashData.messageGroupId = messageGroupId;
    if (messageDeduplicationId) hashData.messageDeduplicationId = messageDeduplicationId;

    const pipeline = redis.pipeline();
    pipeline.hset(msgKey, hashData);
    pipeline.rpush(`queue:${queueName}:ready`, messageId);
    await pipeline.exec();

    await MetricsService.recordMetric(queueName, 'sent', 1);

    return {
      message: {
        id: messageId,
        body: bodyStr,
        sizeKb,
        enqueueTime,
        receiveCount: 0,
        messageGroupId,
        messageDeduplicationId,
      },
      deduplicated: false,
    };
  }

  /**
   * Send a burst of randomized realistic messages using a Redis pipeline for maximum throughput
   */
  public static async sendBurstMessages(
    queueName: string,
    count = 25
  ): Promise<BurstLoadResponse> {
    const queue = await this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const safeCount = Math.min(100, Math.max(1, Number(count) || 25));
    const messageIds: string[] = [];
    const pipeline = redis.pipeline();
    const enqueueTime = new Date().toISOString();

    const customerNames = [
      'Alex Mercer',
      'Devon Vance',
      'Elena Rostova',
      'Marcus Brody',
      'Sophia Lin',
      'Kaito Tanaka',
      'Zoe Martinez',
      'Liam O\'Connor',
      'Aria Sterling',
      'Noah Kim',
      'Amara Patel',
      'Lucas Bennett',
    ];

    const categories = ['Electronics', 'Accessories', 'Cloud Infrastructure', 'Payments', 'Logistics'];
    const statuses = ['CONFIRMED', 'PENDING_SETTLEMENT', 'PROCESSING', 'AUTHORIZED'];

    for (let i = 0; i < safeCount; i++) {
      const messageId = nanoid();
      messageIds.push(messageId);

      const customer = customerNames[Math.floor(Math.random() * customerNames.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const orderNum = Math.floor(100000 + Math.random() * 900000);
      const totalAmount = Number((Math.random() * 450 + 12.5).toFixed(2));
      const itemsCount = Math.floor(Math.random() * 5) + 1;

      const payload = {
        orderId: `ord_${orderNum}`,
        customer,
        category,
        itemsCount,
        totalAmount,
        currency: 'USD',
        status,
        traceId: `trc_${nanoid(12)}`,
        burstIndex: i + 1,
        timestamp: enqueueTime,
      };

      const bodyStr = JSON.stringify(payload);
      const bytes = Buffer.byteLength(bodyStr, 'utf8');
      const sizeKb = Number((bytes / 1024).toFixed(3));

      const msgKey = `msg:${queueName}:${messageId}`;
      const hashData: Record<string, string> = {
        id: messageId,
        body: bodyStr,
        sizeKb: sizeKb.toString(),
        enqueueTime,
        receiveCount: '0',
      };

      if (queue.type === 'fifo') {
        const groupId = `burst-stream-${(i % 5) + 1}`;
        const dedupId = nanoid();
        hashData.messageGroupId = groupId;
        hashData.messageDeduplicationId = dedupId;
        pipeline.set(`dedup:${queueName}:${dedupId}`, messageId, 'EX', 300);
      }

      pipeline.hset(msgKey, hashData);
      pipeline.rpush(`queue:${queueName}:ready`, messageId);
    }

    await pipeline.exec();

    // Record burst telemetry metric
    await MetricsService.recordMetric(queueName, 'sent', safeCount);

    return {
      success: true,
      queue: queueName,
      count: safeCount,
      messageIds,
      enqueuedAt: enqueueTime,
    };
  }


  /**
   * Receive/Poll messages from queue with DLQ routing on maxReceiveCount exceeded
   */
  public static async receiveMessages(
    queueName: string,
    options: ReceiveMessagesOptions = {}
  ): Promise<ReceiveMessageResponse[]> {
    const queue = await this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const maxMessages = Math.min(10, Math.max(1, Number(options.maxMessages) || 1));
    const visibilityTimeout =
      options.visibilityTimeout !== undefined && !isNaN(Number(options.visibilityTimeout))
        ? Math.max(1, Math.min(43200, Number(options.visibilityTimeout)))
        : queue.visibilityTimeout;

    const waitTimeSeconds = Math.min(20, Math.max(0, Number(options.waitTimeSeconds) || 0));
    const readyKey = `queue:${queueName}:ready`;
    const inflightKey = `queue:${queueName}:inflight`;
    const dlqName = this.getDLQName(queueName);
    const dlqReadyKey = `queue:${dlqName}:ready`;
    const dlqMetaKey = `queue:${dlqName}:meta`;

    // Polling delay if queue is empty and waitTimeSeconds > 0
    if (waitTimeSeconds > 0) {
      const readyLen = await redis.llen(readyKey);
      if (readyLen === 0) {
        const start = Date.now();
        const maxWaitMs = waitTimeSeconds * 1000;
        while (Date.now() - start < maxWaitMs) {
          const len = await redis.llen(readyKey);
          if (len > 0) break;
          const remainingMs = maxWaitMs - (Date.now() - start);
          if (remainingMs <= 0) break;
          await new Promise((r) => setTimeout(r, Math.min(100, remainingMs)));
        }
      }
    }

    const expireAt = Date.now() + visibilityTimeout * 1000;
    const nowIso = new Date().toISOString();
    const errorTrace =
      'ProcessingError: Consumer worker failed to acknowledge within VisibilityTimeout. Maximum retry threshold reached at worker-node-primary.';

    // Execute atomic Lua script
    const evalResult = (await redis.eval(
      RECEIVE_MESSAGES_LUA,
      4,
      readyKey,
      inflightKey,
      dlqReadyKey,
      dlqMetaKey,
      maxMessages,
      expireAt,
      queueName,
      dlqName,
      queue.maxReceiveCount,
      nowIso,
      errorTrace,
      nowIso,
      queue.type
    )) as [string[], string[]];

    const pulledIds = evalResult[0] || [];
    const movedToDlq = evalResult[1] || [];

    if (movedToDlq.length > 0) {
      console.log(
        `🚨 [DLQ Trigger] Moved ${movedToDlq.length} message(s) exceeding maxReceiveCount (${queue.maxReceiveCount}) from "${queueName}" to "${dlqName}"`
      );
      await MetricsService.recordMetric(queueName, 'deadLettered', movedToDlq.length);

      // Verify if any moved message is a poison pill chaos payload and ensure authentic stack trace
      for (const dlqMsgId of movedToDlq) {
        const dlqKey = `msg:${dlqName}:${dlqMsgId}`;
        const raw = await redis.hgetall(dlqKey);
        if (raw && raw.body) {
          const poison = this.getPoisonPillError(raw.body);
          if (poison) {
            await redis.hset(dlqKey, {
              failureReason: poison.failureReason,
              errorTrace: poison.errorTrace,
            });
          }
        }
      }
    }

    if (pulledIds.length === 0) {
      return [];
    }

    await MetricsService.recordMetric(queueName, 'received', pulledIds.length);

    // Retrieve metadata for successfully delivered messages
    const pipeline = redis.pipeline();
    for (const msgId of pulledIds) {
      pipeline.hgetall(`msg:${queueName}:${msgId}`);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const messages: ReceiveMessageResponse[] = [];

    for (let i = 0; i < pulledIds.length; i++) {
      const msgId = pulledIds[i];
      const raw = results[i][1] as Record<string, string>;

      if (raw && raw.id) {
        messages.push({
          id: msgId,
          body: raw.body,
          sizeKb: Number(raw.sizeKb) || 0,
          enqueueTime: raw.enqueueTime,
          receiveCount: Number(raw.receiveCount) || 1,
          messageGroupId: raw.messageGroupId,
          messageDeduplicationId: raw.messageDeduplicationId,
          receiptHandle: `${msgId}:${expireAt}`,
        });
      }
    }

    if (options.autoFail) {
      for (const msg of messages) {
        const poison = this.getPoisonPillError(msg.body);
        if (poison) {
          await this.simulateFailure(queueName, msg.id);
        }
      }
    }

    return messages;
  }

  /**
   * Simulate a processing failure on an in-flight message
   */
  public static async simulateFailure(
    queueName: string,
    messageId: string,
    customError?: { errorTrace?: string; failureReason?: string }
  ): Promise<{
    success: boolean;
    movedToDlq: boolean;
    currentReceiveCount: number;
    errorTrace?: string;
    failureReason?: string;
  }> {
    const queue = await this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const msgKey = `msg:${queueName}:${messageId}`;
    const rawMsg = await redis.hgetall(msgKey);
    if (!rawMsg || !rawMsg.id) {
      return { success: false, movedToDlq: false, currentReceiveCount: 0 };
    }

    let errorTrace =
      customError?.errorTrace ||
      'ProcessingError: Consumer worker failed to acknowledge within VisibilityTimeout. Maximum retry threshold reached at worker-node-primary.';
    let failureReason = customError?.failureReason || '';

    // Check if the message contains a poison pill error payload
    if (rawMsg.body) {
      const poison = this.getPoisonPillError(rawMsg.body);
      if (poison) {
        errorTrace = customError?.errorTrace || poison.errorTrace;
        failureReason = customError?.failureReason || poison.failureReason;
      }
    }

    const inflightKey = `queue:${queueName}:inflight`;
    const dlqName = this.getDLQName(queueName);
    const dlqReadyKey = `queue:${dlqName}:ready`;
    const dlqMetaKey = `queue:${dlqName}:meta`;
    const nowIso = new Date().toISOString();

    const res = (await redis.eval(
      SIMULATE_FAIL_LUA,
      3,
      inflightKey,
      dlqReadyKey,
      dlqMetaKey,
      queueName,
      messageId,
      dlqName,
      queue.maxReceiveCount,
      nowIso,
      errorTrace,
      nowIso,
      queue.type,
      failureReason
    )) as [number, number, number];

    const success = res[0] === 1;
    const movedToDlq = res[1] === 1;
    const currentReceiveCount = res[2];

    if (movedToDlq) {
      await MetricsService.recordMetric(queueName, 'deadLettered', 1);
    }

    return {
      success,
      movedToDlq,
      currentReceiveCount,
      errorTrace,
      failureReason,
    };
  }


  /**
   * Inspect DLQ: list all messages in DLQ with error traces and metadata
   */
  public static async inspectDLQ(dlqName: string): Promise<DLQMessageMetadata[]> {
    const readyKey = `queue:${dlqName}:ready`;
    const inflightKey = `queue:${dlqName}:inflight`;

    const readyIds = await redis.lrange(readyKey, 0, -1);
    const inflightIds = await redis.zrange(inflightKey, 0, -1);
    const allIds = Array.from(new Set([...readyIds, ...inflightIds]));

    if (allIds.length === 0) {
      return [];
    }

    const pipeline = redis.pipeline();
    for (const msgId of allIds) {
      pipeline.hgetall(`msg:${dlqName}:${msgId}`);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const messages: DLQMessageMetadata[] = [];

    for (let i = 0; i < allIds.length; i++) {
      const msgId = allIds[i];
      const raw = results[i][1] as Record<string, string>;

      if (raw && raw.id) {
        messages.push({
          id: msgId,
          body: raw.body,
          sizeKb: Number(raw.sizeKb) || 0,
          enqueueTime: raw.enqueueTime,
          receiveCount: Number(raw.receiveCount) || 0,
          messageGroupId: raw.messageGroupId,
          messageDeduplicationId: raw.messageDeduplicationId,
          failedAt: raw.failedAt || raw.enqueueTime || new Date().toISOString(),
          failureReason: raw.failureReason || 'MaxReceiveCountExceeded',
          errorTrace:
            raw.errorTrace ||
            'ProcessingError: Consumer worker failed to acknowledge within VisibilityTimeout. Maximum retry threshold reached at worker-node-primary.',
          sourceQueue: raw.sourceQueue || dlqName.replace(/-dlq$/, ''),
        });
      }
    }

    return messages;
  }

  /**
   * Edit/Mutate message payload directly in the DLQ before re-driving
   */
  public static async updateDLQMessage(
    dlqName: string,
    messageId: string,
    newBody: string | Record<string, unknown>
  ): Promise<DLQMessageMetadata> {
    const dlqMsgKey = `msg:${dlqName}:${messageId}`;
    const exists = await redis.exists(dlqMsgKey);
    if (!exists) {
      throw new Error(`Message "${messageId}" not found in DLQ "${dlqName}"`);
    }

    const bodyStr = typeof newBody === 'string' ? newBody : JSON.stringify(newBody, null, 2);
    const bytes = Buffer.byteLength(bodyStr, 'utf8');
    const sizeKb = Number((bytes / 1024).toFixed(3));

    await redis.hset(dlqMsgKey, {
      body: bodyStr,
      sizeKb: sizeKb.toString(),
    });

    const updated = await redis.hgetall(dlqMsgKey);

    return {
      id: messageId,
      body: bodyStr,
      sizeKb,
      enqueueTime: updated.enqueueTime,
      receiveCount: Number(updated.receiveCount) || 0,
      messageGroupId: updated.messageGroupId,
      messageDeduplicationId: updated.messageDeduplicationId,
      failedAt: updated.failedAt,
      failureReason: updated.failureReason,
      errorTrace: updated.errorTrace,
      sourceQueue: updated.sourceQueue || dlqName.replace(/-dlq$/, ''),
    };
  }

  /**
   * Redrive messages from DLQ back to their source queue
   */
  public static async redriveMessages(dlqName: string, messageIds?: string[]): Promise<RedriveResponse> {
    const dlqReadyKey = `queue:${dlqName}:ready`;
    const dlqInflightKey = `queue:${dlqName}:inflight`;

    const args: (string | number)[] = [dlqName];
    if (messageIds && messageIds.length > 0) {
      args.push(...messageIds);
    }

    const redrivenIds = (await redis.eval(
      REDRIVE_LUA,
      2,
      dlqReadyKey,
      dlqInflightKey,
      ...args
    )) as string[];

    const sourceQueue = dlqName.replace(/-dlq$/, '');

    return {
      success: true,
      redrivenCount: redrivenIds.length,
      messageIds: redrivenIds,
      targetQueue: sourceQueue,
    };
  }

  /**
   * Acknowledge (ACK) and delete message
   */
  public static async ackMessage(
    queueName: string,
    messageId: string
  ): Promise<{ acknowledged: boolean; removedFromInFlight: boolean; deleted: boolean }> {
    const inflightKey = `queue:${queueName}:inflight`;
    const msgKey = `msg:${queueName}:${messageId}`;

    const res = (await redis.eval(ACK_MESSAGE_LUA, 2, inflightKey, msgKey, messageId)) as [number, number];

    const removedFromInFlight = res[0] > 0;
    const deleted = res[1] > 0;

    if (deleted || removedFromInFlight) {
      await MetricsService.recordMetric(queueName, 'deleted', 1);
    }

    return {
      acknowledged: removedFromInFlight || deleted,
      removedFromInFlight,
      deleted,
    };
  }

  /**
   * Purge all ready and in-flight messages from a queue
   */
  public static async purgeQueue(
    queueName: string
  ): Promise<{ purgedReadyCount: number; purgedInFlightCount: number }> {
    const queue = await this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const readyKey = `queue:${queueName}:ready`;
    const inflightKey = `queue:${queueName}:inflight`;

    const res = (await redis.eval(PURGE_QUEUE_LUA, 2, readyKey, inflightKey, queueName)) as [number, number];

    return {
      purgedReadyCount: res[0],
      purgedInFlightCount: res[1],
    };
  }

  /**
   * Sweeper operation: move expired inflight messages back to ready list
   */
  public static async sweepExpiredMessages(queueName: string, nowMs = Date.now()): Promise<number> {
    const inflightKey = `queue:${queueName}:inflight`;
    const readyKey = `queue:${queueName}:ready`;

    const moved = (await redis.eval(SWEEP_EXPIRED_LUA, 2, inflightKey, readyKey, nowMs, 100)) as number;
    return moved || 0;
  }
}
