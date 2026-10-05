import { redis } from '../lib/redis';
import { QueueService } from '../lib/queue-service';

let sweeperInterval: ReturnType<typeof setInterval> | null = null;
let isSweeping = false;

/**
 * Sweep timed-out messages across all active queues and move them back to ready list
 */
export async function runSweepCycle(): Promise<{ queuesChecked: number; totalMoved: number }> {
  if (isSweeping) {
    return { queuesChecked: 0, totalMoved: 0 };
  }

  isSweeping = true;
  let queuesChecked = 0;
  let totalMoved = 0;

  try {
    const queueNames = await redis.smembers('queues:all');
    queuesChecked = queueNames.length;
    const now = Date.now();

    for (const name of queueNames) {
      try {
        const moved = await QueueService.sweepExpiredMessages(name, now);
        if (moved > 0) {
          totalMoved += moved;
          console.log(`[Sweeper] Re-queued ${moved} timed-out message(s) back to ready queue: ${name}`);
        }
      } catch (err: unknown) {
        console.error(`[Sweeper Error] Failed to sweep queue "${name}":`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err: unknown) {
    console.error('[Sweeper Error] Failed to fetch queues list:', err instanceof Error ? err.message : err);
  } finally {
    isSweeping = false;
  }

  return { queuesChecked, totalMoved };
}

/**
 * Start background visibility sweeper worker loop
 */
export function startVisibilitySweeper(intervalMs = 1000): { stop: () => void } {
  if (sweeperInterval) {
    return { stop: stopVisibilitySweeper };
  }

  console.log(`⏱️  [Sweeper] Visibility sweeper worker initialized (polling every ${intervalMs}ms)`);

  sweeperInterval = setInterval(async () => {
    await runSweepCycle();
  }, intervalMs);

  return { stop: stopVisibilitySweeper };
}

/**
 * Stop background visibility sweeper worker loop
 */
export function stopVisibilitySweeper(): void {
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
    console.log('🛑 [Sweeper] Visibility sweeper worker stopped');
  }
}
