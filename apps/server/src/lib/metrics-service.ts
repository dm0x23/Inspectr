import { redis } from './redis';
import type { QueueMetricPoint } from '../types/queue';

export class MetricsService {
  private static readonly BUCKET_MS = 2000; // 2-second resolution
  private static readonly TTL_SECONDS = 180; // Retain 3 minutes in Redis

  /**
   * Helper to compute bucket timestamp aligned to BUCKET_MS
   */
  public static getBucket(timestampMs = Date.now()): number {
    return Math.floor(timestampMs / this.BUCKET_MS) * this.BUCKET_MS;
  }

  /**
   * Record a metric event (sent, received, deleted, deadLettered)
   */
  public static async recordMetric(
    queueName: string,
    metric: 'sent' | 'received' | 'deleted' | 'deadLettered',
    amount = 1,
    queueDepth?: { visible?: number; inFlight?: number }
  ): Promise<void> {
    try {
      const now = Date.now();
      const bucket = this.getBucket(now);
      const metricKey = `metrics:${queueName}:${bucket}`;
      const bucketsIndexKey = `metrics:${queueName}:buckets`;

      const pipeline = redis.pipeline();
      pipeline.hincrby(metricKey, metric, amount);
      pipeline.expire(metricKey, this.TTL_SECONDS);
      pipeline.zadd(bucketsIndexKey, bucket, bucket.toString());

      if (queueDepth) {
        if (queueDepth.visible !== undefined) {
          pipeline.hset(metricKey, 'visible', queueDepth.visible.toString());
        }
        if (queueDepth.inFlight !== undefined) {
          pipeline.hset(metricKey, 'inFlight', queueDepth.inFlight.toString());
        }
      }

      await pipeline.exec();
    } catch (err: unknown) {
      console.error(`[MetricsService Error] Failed to record metric for ${queueName}:`, err);
    }
  }

  /**
   * Record a snapshot of queue depth (visible & in-flight)
   */
  public static async recordQueueDepth(
    queueName: string,
    visible: number,
    inFlight: number
  ): Promise<void> {
    try {
      const now = Date.now();
      const bucket = this.getBucket(now);
      const metricKey = `metrics:${queueName}:${bucket}`;
      const bucketsIndexKey = `metrics:${queueName}:buckets`;

      const pipeline = redis.pipeline();
      pipeline.hset(metricKey, 'visible', visible.toString(), 'inFlight', inFlight.toString());
      pipeline.expire(metricKey, this.TTL_SECONDS);
      pipeline.zadd(bucketsIndexKey, bucket, bucket.toString());
      await pipeline.exec();
    } catch (err: unknown) {
      console.error(`[MetricsService Error] Failed to record depth for ${queueName}:`, err);
    }
  }

  /**
   * Fetch rolling metrics for the last N intervals (default 30 intervals = 60 seconds)
   */
  public static async getMetrics(
    queueName: string,
    intervals = 30
  ): Promise<QueueMetricPoint[]> {
    const now = Date.now();
    const currentBucket = this.getBucket(now);

    // Fetch live queue depth
    const [readyCount, inFlightCount] = await Promise.all([
      redis.llen(`queue:${queueName}:ready`).catch(() => 0),
      redis.zcard(`queue:${queueName}:inflight`).catch(() => 0),
    ]);

    // Build bucket timeline
    const bucketTimestamps: number[] = [];
    for (let i = intervals - 1; i >= 0; i--) {
      bucketTimestamps.push(currentBucket - i * this.BUCKET_MS);
    }

    // Single pipeline to fetch all bucket hashes and clean old index entries
    const pipeline = redis.pipeline();
    for (const b of bucketTimestamps) {
      pipeline.hgetall(`metrics:${queueName}:${b}`);
    }

    // Clean buckets older than retention window
    const cutoff = now - this.TTL_SECONDS * 1000;
    pipeline.zremrangebyscore(`metrics:${queueName}:buckets`, 0, cutoff);

    // Record live depth into current bucket
    pipeline.hset(`metrics:${queueName}:${currentBucket}`, 'visible', readyCount.toString(), 'inFlight', inFlightCount.toString());

    const execResults = await pipeline.exec();
    if (!execResults) {
      return [];
    }

    const dataPoints: QueueMetricPoint[] = [];
    let lastKnownVisible = readyCount;
    let lastKnownInFlight = inFlightCount;

    // Scan backwards to track most recent known depth values for forward-filling
    for (let i = 0; i < bucketTimestamps.length; i++) {
      const bTime = bucketTimestamps[i];
      const raw = (execResults[i]?.[1] as Record<string, string>) || {};

      const sent = Number(raw.sent) || 0;
      const received = Number(raw.received) || 0;
      const deleted = Number(raw.deleted) || 0;
      const deadLettered = Number(raw.deadLettered) || 0;

      let visible = raw.visible !== undefined ? Number(raw.visible) : undefined;
      let inFlight = raw.inFlight !== undefined ? Number(raw.inFlight) : undefined;

      if (i === bucketTimestamps.length - 1) {
        visible = readyCount;
        inFlight = inFlightCount;
      }

      if (visible !== undefined) lastKnownVisible = visible;
      if (inFlight !== undefined) lastKnownInFlight = inFlight;

      const dateObj = new Date(bTime);
      const timeStr = dateObj.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      dataPoints.push({
        timestamp: bTime,
        time: timeStr,
        ApproximateNumberOfMessagesVisible: visible ?? lastKnownVisible,
        ApproximateNumberOfMessagesNotVisible: inFlight ?? lastKnownInFlight,
        NumberOfMessagesSent: sent,
        NumberOfMessagesReceived: received,
        NumberOfMessagesDeleted: deleted,
        NumberOfMessagesDeadLettered: deadLettered,
      });
    }

    return dataPoints;
  }
}
