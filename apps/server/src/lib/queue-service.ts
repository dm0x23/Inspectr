import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { redis } from './redis';
import type {
  QueueMeta,
  QueueType,
  QueueWithStats,
  CreateQueueInput,
  SendMessageInput,
  MessageMetadata,
  ReceiveMessageResponse,
  ReceiveMessagesOptions,
} from '../types/queue';

// Lua script to atomically receive up to N messages from ready queue and place into inflight ZSET
const RECEIVE_MESSAGES_LUA = `
local readyKey = KEYS[1]
local inflightKey = KEYS[2]
local maxCount = tonumber(ARGV[1])
local expireAt = tonumber(ARGV[2])
local qName = ARGV[3]

local results = {}

for i = 1, maxCount do
  local msgId = redis.call('LPOP', readyKey)
  if not msgId then
    break
  end

  local msgKey = 'msg:' .. qName .. ':' .. msgId
  local exists = redis.call('EXISTS', msgKey)
  if exists == 1 then
    redis.call('HINCRBY', msgKey, 'receiveCount', 1)
    redis.call('ZADD', inflightKey, expireAt, msgId)
    table.insert(results, msgId)
  end
end

return results
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

export class QueueService {
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

    // Allow alphanumeric characters, hyphens (-), underscores (_), and periods (.) for .fifo
    const validNamePattern = /^[a-zA-Z0-9_-]+(\.fifo)?$/;
    if (!validNamePattern.test(trimmed)) {
      throw new Error('Queue name can only contain alphanumeric characters, hyphens, and underscores');
    }

    const isFifoName = trimmed.endsWith('.fifo');

    if (type === 'fifo' && !isFifoName) {
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
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const queues: QueueWithStats[] = [];

    for (let i = 0; i < queueNames.length; i++) {
      const metaIndex = i * 3;
      const readyIndex = i * 3 + 1;
      const inflightIndex = i * 3 + 2;

      const metaRaw = results[metaIndex][1] as Record<string, string>;
      const readyCount = (results[readyIndex][1] as number) || 0;
      const inFlightCount = (results[inflightIndex][1] as number) || 0;

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
        },
      });
    }

    // Sort alphabetically by name
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

    const pipeline = redis.pipeline();
    pipeline.hgetall(`queue:${name}:meta`);
    pipeline.llen(`queue:${name}:ready`);
    pipeline.zcard(`queue:${name}:inflight`);

    const results = await pipeline.exec();
    if (!results) return null;

    const metaRaw = results[0][1] as Record<string, string>;
    const readyCount = (results[1][1] as number) || 0;
    const inFlightCount = (results[2][1] as number) || 0;

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
      },
    };
  }

  /**
   * Create a new queue
   */
  public static async createQueue(input: CreateQueueInput): Promise<{ queue: QueueMeta; created: boolean }> {
    const { name, type } = this.validateQueueName(input.name, input.type);

    const exists = await redis.sismember('queues:all', name);
    const visibilityTimeout = Math.max(0, Math.min(43200, Number(input.visibilityTimeout) || 30));
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

    let messageGroupId = input.messageGroupId?.trim();
    let messageDeduplicationId = input.messageDeduplicationId?.trim();

    // FIFO specific validations & deduplication window
    if (queue.type === 'fifo') {
      if (!messageGroupId) {
        throw new Error('FIFO queues require a non-empty messageGroupId');
      }

      // Auto-generate SHA-256 deduplication ID if not provided
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
      // Set deduplication key with 5-minute TTL (300 seconds)
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
   * Receive/Poll messages from queue with visibility timeout
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
        ? Math.max(0, Math.min(43200, Number(options.visibilityTimeout)))
        : queue.visibilityTimeout;

    const waitTimeSeconds = Math.min(20, Math.max(0, Number(options.waitTimeSeconds) || 0));
    const readyKey = `queue:${queueName}:ready`;
    const inflightKey = `queue:${queueName}:inflight`;

    // Basic polling delay if queue is empty and waitTimeSeconds > 0
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

    // Atomically pull messages from ready list and insert into inflight ZSET
    const pulledIds = (await redis.eval(
      RECEIVE_MESSAGES_LUA,
      2,
      readyKey,
      inflightKey,
      maxMessages,
      expireAt,
      queueName
    )) as string[];

    if (!pulledIds || pulledIds.length === 0) {
      return [];
    }

    // Retrieve metadata for pulled messages in pipeline
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

    return messages;
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
