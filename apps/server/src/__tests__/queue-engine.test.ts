import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { redis } from '../lib/redis';
import { QueueService } from '../lib/queue-service';
import { queuesRoute } from '../routes/queues';
import { runSweepCycle } from '../worker/sweeper';

describe('Inspectr Core SQS Queue Engine', () => {
  const app = new Hono();
  app.route('/api/queues', queuesRoute);

  const stdQueueName = 'test-standard-orders';
  const fifoQueueName = 'test-payments.fifo';

  const cleanupTestKeys = async () => {
    const testQueues = [
      stdQueueName,
      fifoQueueName,
      'temp-purge-queue',
      'test-dlq-trigger',
      'test-dlq-trigger-dlq',
    ];
    for (const q of testQueues) {
      await redis.srem('queues:all', q);
      await redis.del(`queue:${q}:meta`);
      await redis.del(`queue:${q}:ready`);
      await redis.del(`queue:${q}:inflight`);
    }
    const dedupKeys = await redis.keys('dedup:*');
    if (dedupKeys.length > 0) {
      await redis.del(...dedupKeys);
    }
    const msgKeys = await redis.keys('msg:test-*');
    if (msgKeys.length > 0) {
      await redis.del(...msgKeys);
    }
    const tempKeys = await redis.keys('msg:temp-*');
    if (tempKeys.length > 0) {
      await redis.del(...tempKeys);
    }
  };

  beforeAll(async () => {
    await cleanupTestKeys();
  });

  afterAll(async () => {
    await cleanupTestKeys();
  });

  describe('1. Queue Creation & Validation', () => {
    it('should create a standard queue with default settings', async () => {
      const res = await app.request('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stdQueueName }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.queue.name).toBe(stdQueueName);
      expect(data.queue.type).toBe('standard');
      expect(data.queue.visibilityTimeout).toBe(30);
      expect(data.queue.maxReceiveCount).toBe(3);

      // Verify Redis data structures
      const isMember = await redis.sismember('queues:all', stdQueueName);
      expect(isMember).toBe(1);

      const meta = await redis.hgetall(`queue:${stdQueueName}:meta`);
      expect(meta.name).toBe(stdQueueName);
      expect(meta.type).toBe('standard');
    });

    it('should reject FIFO queue without .fifo suffix', async () => {
      const res = await app.request('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'invalid-fifo-name', type: 'fifo' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('InvalidRequest');
    });

    it('should create a FIFO queue with .fifo suffix', async () => {
      const res = await app.request('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fifoQueueName,
          visibilityTimeout: 2, // short timeout for testing sweeper
          maxReceiveCount: 5,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.queue.type).toBe('fifo');
      expect(data.queue.visibilityTimeout).toBe(2);

      const meta = await redis.hgetall(`queue:${fifoQueueName}:meta`);
      expect(meta.type).toBe('fifo');
    });

    it('should list all queues with stats', async () => {
      const res = await app.request('/api/queues');
      expect(res.status).toBe(200);
      const queues = await res.json();
      expect(Array.isArray(queues)).toBe(true);

      const std = queues.find((q: any) => q.name === stdQueueName);
      expect(std).toBeDefined();
      expect(std.stats).toBeDefined();
      expect(std.stats.readyCount).toBe(0);
      expect(std.stats.inFlightCount).toBe(0);
    });
  });

  describe('2. Message Sending & Size Calculation', () => {
    it('should send standard message and calculate size in KB', async () => {
      const payload = { orderId: 'ord_123', amount: 99.95 };
      const res = await app.request(`/api/queues/${stdQueueName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: payload }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.message.id).toBeDefined();
      expect(data.message.sizeKb).toBeGreaterThan(0);
      expect(data.message.receiveCount).toBe(0);

      // Verify ready list has 1 item
      const readyLen = await redis.llen(`queue:${stdQueueName}:ready`);
      expect(readyLen).toBe(1);

      // Verify message hash in Redis
      const msgHash = await redis.hgetall(`msg:${stdQueueName}:${data.message.id}`);
      expect(msgHash.id).toBe(data.message.id);
      expect(msgHash.receiveCount).toBe('0');
    });

    it('should reject FIFO message without messageGroupId', async () => {
      const res = await app.request(`/api/queues/${fifoQueueName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'test without group id' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('messageGroupId');
    });

    it('should enforce FIFO deduplication within 5-minute window', async () => {
      const dedupId = 'dedup-unique-txn-1';
      const body = { transactionId: 'txn-999', amount: 500 };

      // First send
      const res1 = await app.request(`/api/queues/${fifoQueueName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          messageGroupId: 'group-alpha',
          messageDeduplicationId: dedupId,
        }),
      });

      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      expect(data1.deduplicated).toBe(false);
      const firstId = data1.message.id;

      // Check TTL on dedup key
      const ttl = await redis.ttl(`dedup:${fifoQueueName}:${dedupId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);

      // Duplicate send with same dedup ID
      const res2 = await app.request(`/api/queues/${fifoQueueName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          messageGroupId: 'group-alpha',
          messageDeduplicationId: dedupId,
        }),
      });

      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.deduplicated).toBe(true);
      expect(data2.message.id).toBe(firstId);

      // Verify FIFO ready list only contains 1 item (no duplicate pushed)
      const readyLen = await redis.llen(`queue:${fifoQueueName}:ready`);
      expect(readyLen).toBe(1);
    });

    it('should maintain FIFO delivery order per messageGroupId without concurrent delivery of same group', async () => {
      const groupQueue = 'test-group-order.fifo';
      await QueueService.createQueue({ name: groupQueue, visibilityTimeout: 30 });

      // Send 3 messages: A1, A2, B1
      const m1 = await QueueService.sendMessage(groupQueue, { body: 'msg-A1', messageGroupId: 'group-A' });
      const m2 = await QueueService.sendMessage(groupQueue, { body: 'msg-A2', messageGroupId: 'group-A' });
      const m3 = await QueueService.sendMessage(groupQueue, { body: 'msg-B1', messageGroupId: 'group-B' });

      // Poll up to 3 messages: Should deliver A1 and B1, while deferring A2
      const poll1 = await QueueService.receiveMessages(groupQueue, { maxMessages: 3 });
      expect(poll1.length).toBe(2);
      expect(poll1.map((m) => m.id)).toEqual([m1.message.id, m3.message.id]);

      // A2 is still in the ready queue, waiting for group-A to be unlocked
      expect(await redis.llen(`queue:${groupQueue}:ready`)).toBe(1);

      // Now acknowledge A1
      await QueueService.ackMessage(groupQueue, m1.message.id);

      // Poll again: A2 can now be delivered!
      const poll2 = await QueueService.receiveMessages(groupQueue, { maxMessages: 1 });
      expect(poll2.length).toBe(1);
      expect(poll2[0].id).toBe(m2.message.id);

      // Clean up
      await QueueService.purgeQueue(groupQueue);
      await redis.srem('queues:all', groupQueue);
      await redis.del(`queue:${groupQueue}:meta`);
    });
  });

  describe('3. Receive Messages & In-Flight Transition', () => {
    it('should atomically pull message from ready, increment receiveCount, and add to inflight ZSET', async () => {
      const res = await app.request(`/api/queues/${stdQueueName}/messages?maxMessages=1&visibilityTimeout=5`);
      expect(res.status).toBe(200);
      const messages = await res.json();
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg.receiveCount).toBe(1);
      expect(msg.receiptHandle).toBeDefined();

      // Ready list should now be empty
      const readyLen = await redis.llen(`queue:${stdQueueName}:ready`);
      expect(readyLen).toBe(0);

      // In-flight ZSET should have 1 item
      const inflightCount = await redis.zcard(`queue:${stdQueueName}:inflight`);
      expect(inflightCount).toBe(1);

      // Score should be in the future (around now + 5000ms)
      const score = await redis.zscore(`queue:${stdQueueName}:inflight`, msg.id);
      expect(Number(score)).toBeGreaterThan(Date.now());
    });
  });

  describe('4. Acknowledge (ACK) Message', () => {
    it('should acknowledge message by removing from in-flight and deleting hash', async () => {
      // First get the inflight message ID
      const inflightIds = await redis.zrange(`queue:${stdQueueName}:inflight`, 0, -1);
      expect(inflightIds.length).toBe(1);
      const msgId = inflightIds[0];

      const res = await app.request(`/api/queues/${stdQueueName}/messages/${msgId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.acknowledged).toBe(true);

      // Inflight ZSET should be 0
      const inflightCount = await redis.zcard(`queue:${stdQueueName}:inflight`);
      expect(inflightCount).toBe(0);

      // Message hash should be deleted
      const exists = await redis.exists(`msg:${stdQueueName}:${msgId}`);
      expect(exists).toBe(0);
    });
  });

  describe('5. Visibility Sweeper Worker', () => {
    it('should sweep timed-out in-flight messages and move them back to ready queue (LPUSH)', async () => {
      // Receive message from FIFO queue with 1 second visibility
      const receiveRes = await app.request(`/api/queues/${fifoQueueName}/messages?maxMessages=1&visibilityTimeout=1`);
      expect(receiveRes.status).toBe(200);
      const msgs = await receiveRes.json();
      expect(msgs.length).toBe(1);
      const msgId = msgs[0].id;

      // Inflight has 1 message, ready has 0
      expect(await redis.zcard(`queue:${fifoQueueName}:inflight`)).toBe(1);
      expect(await redis.llen(`queue:${fifoQueueName}:ready`)).toBe(0);

      // Wait 1.1 seconds for visibility timeout to expire
      await new Promise((r) => setTimeout(r, 1100));

      // Run sweep cycle
      const sweepResult = await runSweepCycle();
      expect(sweepResult.totalMoved).toBeGreaterThanOrEqual(1);

      // Inflight should now be 0
      expect(await redis.zcard(`queue:${fifoQueueName}:inflight`)).toBe(0);

      // Ready queue should have the message back at the front
      expect(await redis.llen(`queue:${fifoQueueName}:ready`)).toBe(1);
      const frontMsgId = await redis.lindex(`queue:${fifoQueueName}:ready`, 0);
      expect(frontMsgId).toBe(msgId);
    });
  });

  describe('6. Purge Queue', () => {
    it('should purge all ready and in-flight messages', async () => {
      // Send two messages to temp queue
      await QueueService.createQueue({ name: 'temp-purge-queue' });
      await QueueService.sendMessage('temp-purge-queue', { body: 'msg-1' });
      await QueueService.sendMessage('temp-purge-queue', { body: 'msg-2' });

      // Receive one into inflight
      await QueueService.receiveMessages('temp-purge-queue', { maxMessages: 1 });

      expect(await redis.llen('queue:temp-purge-queue:ready')).toBe(1);
      expect(await redis.zcard('queue:temp-purge-queue:inflight')).toBe(1);

      const res = await app.request('/api/queues/temp-purge-queue/purge', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.purgedReady).toBe(1);
      expect(data.purgedInFlight).toBe(1);
      expect(data.totalPurged).toBe(2);

      // Both should be 0
      expect(await redis.llen('queue:temp-purge-queue:ready')).toBe(0);
      expect(await redis.zcard('queue:temp-purge-queue:inflight')).toBe(0);
    });
  });

  describe('7. DLQ Engine & Inspection', () => {
    const dlqSourceQueue = 'test-dlq-trigger';
    const dlqName = 'test-dlq-trigger-dlq';

    it('should automatically route message to DLQ when receiveCount > maxReceiveCount', async () => {
      // Create queue with maxReceiveCount = 2
      await QueueService.createQueue({
        name: dlqSourceQueue,
        maxReceiveCount: 2,
        visibilityTimeout: 1,
      });

      // Send a message
      const sendRes = await QueueService.sendMessage(dlqSourceQueue, { body: { errorSim: true, value: 42 } });
      const msgId = sendRes.message.id;

      // 1st receive: receiveCount becomes 1 (<= 2) -> delivered
      const r1 = await QueueService.receiveMessages(dlqSourceQueue, { maxMessages: 1, visibilityTimeout: 1 });
      expect(r1.length).toBe(1);
      expect(r1[0].receiveCount).toBe(1);

      // Sweep back to ready
      await new Promise((r) => setTimeout(r, 1100));
      await runSweepCycle();

      // 2nd receive: receiveCount becomes 2 (<= 2) -> delivered
      const r2 = await QueueService.receiveMessages(dlqSourceQueue, { maxMessages: 1, visibilityTimeout: 1 });
      expect(r2.length).toBe(1);
      expect(r2[0].receiveCount).toBe(2);

      // Sweep back to ready
      await new Promise((r) => setTimeout(r, 1100));
      await runSweepCycle();

      // 3rd receive: receiveCount becomes 3 (> maxReceiveCount 2) -> NOT delivered, moved to DLQ!
      const r3 = await QueueService.receiveMessages(dlqSourceQueue, { maxMessages: 1 });
      expect(r3.length).toBe(0); // NOT returned to consumer

      // Ready queue in source should be empty
      expect(await redis.llen(`queue:${dlqSourceQueue}:ready`)).toBe(0);

      // DLQ should now have this message in ready queue
      const dlqReadyLen = await redis.llen(`queue:${dlqName}:ready`);
      expect(dlqReadyLen).toBe(1);
    });

    it('should list messages with full error traces via GET /api/queues/:dlqName/inspector', async () => {
      const res = await app.request(`/api/queues/${dlqName}/inspector`);
      expect(res.status).toBe(200);
      const dlqMsgs = await res.json();
      expect(dlqMsgs.length).toBe(1);

      const msg = dlqMsgs[0];
      expect(msg.failedAt).toBeDefined();
      expect(msg.failureReason).toContain('MaxReceiveCountExceeded');
      expect(msg.errorTrace).toContain('ProcessingError');
      expect(msg.sourceQueue).toBe(dlqSourceQueue);
    });

    it('should mutate message payload via PUT /api/queues/:dlqName/messages/:messageId', async () => {
      const inspectRes = await app.request(`/api/queues/${dlqName}/inspector`);
      const dlqMsgs = await inspectRes.json();
      const msgId = dlqMsgs[0].id;

      const updatedPayload = { errorSim: false, fixed: true, value: 100 };
      const putRes = await app.request(`/api/queues/${dlqName}/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: updatedPayload }),
      });

      expect(putRes.status).toBe(200);
      const data = await putRes.json();
      expect(data.success).toBe(true);
      expect(data.message.body).toContain('"fixed": true');

      // Verify in inspector
      const inspectAfter = await app.request(`/api/queues/${dlqName}/inspector`);
      const afterMsgs = await inspectAfter.json();
      expect(afterMsgs[0].body).toContain('"fixed": true');
    });

    it('should redrive messages back to source queue and reset receiveCount via POST /api/queues/:dlqName/redrive', async () => {
      const redriveRes = await app.request(`/api/queues/${dlqName}/redrive`, {
        method: 'POST',
      });

      expect(redriveRes.status).toBe(200);
      const data = await redriveRes.json();
      expect(data.success).toBe(true);
      expect(data.redrivenCount).toBe(1);

      // DLQ should now be empty
      expect(await redis.llen(`queue:${dlqName}:ready`)).toBe(0);

      // Source queue should now have the message back in ready
      expect(await redis.llen(`queue:${dlqSourceQueue}:ready`)).toBe(1);

      // Polling source queue should now receive the fixed message with receiveCount reset
      const pollRes = await QueueService.receiveMessages(dlqSourceQueue, { maxMessages: 1 });
      expect(pollRes.length).toBe(1);
      expect(pollRes[0].receiveCount).toBe(1);
      expect(pollRes[0].body).toContain('"fixed": true');
    });
  });
});
