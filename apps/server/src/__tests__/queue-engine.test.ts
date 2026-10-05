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

  beforeAll(async () => {
    // Clean up test keys
    const testQueues = [stdQueueName, fifoQueueName, 'temp-purge-queue'];
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
  });

  afterAll(async () => {
    const testQueues = [stdQueueName, fifoQueueName, 'temp-purge-queue'];
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
});
