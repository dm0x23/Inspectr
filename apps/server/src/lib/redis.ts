import Redis, { type RedisOptions } from 'ioredis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOptions: RedisOptions = {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times: number): number | void {
    const maxRetryDelay = 3000;
    // Exponential backoff with jitter
    const delay = Math.min(Math.pow(2, times) * 50, maxRetryDelay);
    const jitter = Math.floor(Math.random() * 200);
    const totalDelay = delay + jitter;

    console.warn(`[Redis] Connection lost. Attempting reconnect #${times} in ${totalDelay}ms...`);
    return totalDelay;
  },
  reconnectOnError(err: Error): boolean {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    const shouldReconnect = targetErrors.some((target) =>
      err.message.toUpperCase().includes(target)
    );
    if (shouldReconnect) {
      console.warn(`[Redis] Reconnecting due to error: ${err.message}`);
      return true;
    }
    return false;
  },
};

// Singleton Redis Client Holder
let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(REDIS_URL, redisOptions);

    redisInstance.on('connect', () => {
      console.log(`[Redis] Connecting to ${REDIS_URL}...`);
    });

    redisInstance.on('ready', () => {
      console.log('[Redis] Connection established and ready to accept commands.');
    });

    redisInstance.on('error', (err: Error) => {
      console.error('[Redis] Client error:', err.message);
    });

    redisInstance.on('close', () => {
      console.warn('[Redis] Connection closed.');
    });

    redisInstance.on('reconnecting', (timeToNext?: number) => {
      console.info(`[Redis] Reconnecting in ${timeToNext ?? 'unknown'}ms...`);
    });

    redisInstance.on('end', () => {
      console.warn('[Redis] Connection ended.');
    });
  }

  return redisInstance;
}

export const redis = getRedisClient();

// Handle graceful process shutdown
let isShuttingDown = false;
const handleShutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (redisInstance && redisInstance.status !== 'end') {
    console.log('[Redis] Gracefully disconnecting Redis client...');
    try {
      await redisInstance.quit();
    } catch {
      redisInstance.disconnect();
    }
  }
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

export default redis;
