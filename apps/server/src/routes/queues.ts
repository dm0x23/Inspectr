import { Hono, type Context } from 'hono';
import { QueueService } from '../lib/queue-service';
import type { CreateQueueInput, SendMessageInput } from '../types/queue';

export const queuesRoute = new Hono();

/**
 * GET /api/queues
 * List all queues with message count stats
 */
queuesRoute.get('/', async (c: Context) => {
  try {
    const queues = await QueueService.listQueues();
    return c.json(queues, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list queues';
    return c.json({ error: 'InternalError', message }, 500);
  }
});

/**
 * GET /api/queues/:name
 * Get single queue details with stats
 */
queuesRoute.get('/:name', async (c: Context) => {
  try {
    const name = c.req.param('name');
    if (!name) {
      return c.json({ error: 'InvalidRequest', message: 'Queue name is required' }, 400);
    }
    const queue = await QueueService.getQueue(name);
    if (!queue) {
      return c.json({ error: 'QueueNotFound', message: `Queue "${name}" does not exist` }, 404);
    }
    return c.json(queue, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get queue';
    return c.json({ error: 'InternalError', message }, 500);
  }
});

/**
 * POST /api/queues
 * Create a queue
 */
queuesRoute.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<CreateQueueInput>().catch(() => null);
    if (!body || !body.name) {
      return c.json({ error: 'InvalidRequest', message: 'Queue name is required' }, 400);
    }

    const result = await QueueService.createQueue(body);
    const statusCode = result.created ? 201 : 200;
    return c.json(
      {
        success: true,
        created: result.created,
        queue: result.queue,
      },
      statusCode
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create queue';
    return c.json({ error: 'InvalidRequest', message }, 400);
  }
});

/**
 * POST /api/queues/:name/messages
 * Send a message
 */
queuesRoute.post('/:name/messages', async (c: Context) => {
  try {
    const name = c.req.param('name');
    if (!name) {
      return c.json({ error: 'InvalidRequest', message: 'Queue name is required' }, 400);
    }
    const body = await c.req.json<SendMessageInput>().catch(() => null);

    if (!body || body.body === undefined || body.body === null) {
      return c.json({ error: 'InvalidRequest', message: 'Message body is required' }, 400);
    }

    const result = await QueueService.sendMessage(name, body);

    if (result.deduplicated) {
      return c.json(
        {
          deduplicated: true,
          message: result.message,
        },
        200
      );
    }

    return c.json(
      {
        deduplicated: false,
        message: result.message,
      },
      201
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    if (message.includes('Queue not found')) {
      return c.json({ error: 'QueueNotFound', message }, 404);
    }
    return c.json({ error: 'BadRequest', message }, 400);
  }
});

/**
 * GET /api/queues/:name/messages
 * Receive/Poll messages
 */
queuesRoute.get('/:name/messages', async (c: Context) => {
  try {
    const name = c.req.param('name');
    if (!name) {
      return c.json({ error: 'InvalidRequest', message: 'Queue name is required' }, 400);
    }
    const maxMessages = c.req.query('maxMessages') ? Number(c.req.query('maxMessages')) : undefined;
    const visibilityTimeout = c.req.query('visibilityTimeout')
      ? Number(c.req.query('visibilityTimeout'))
      : undefined;
    const waitTimeSeconds = c.req.query('waitTimeSeconds')
      ? Number(c.req.query('waitTimeSeconds'))
      : undefined;

    const messages = await QueueService.receiveMessages(name, {
      maxMessages,
      visibilityTimeout,
      waitTimeSeconds,
    });

    return c.json(messages, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to receive messages';
    if (message.includes('Queue not found')) {
      return c.json({ error: 'QueueNotFound', message }, 404);
    }
    return c.json({ error: 'InternalError', message }, 500);
  }
});

/**
 * DELETE /api/queues/:name/messages/:id
 * Acknowledge (ACK) message
 */
queuesRoute.delete('/:name/messages/:id', async (c: Context) => {
  try {
    const name = c.req.param('name');
    const id = c.req.param('id');
    if (!name || !id) {
      return c.json({ error: 'InvalidRequest', message: 'Queue name and message ID are required' }, 400);
    }

    const result = await QueueService.ackMessage(name, id);
    return c.json(
      {
        success: true,
        messageId: id,
        acknowledged: result.acknowledged,
      },
      200
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to acknowledge message';
    return c.json({ error: 'InternalError', message }, 500);
  }
});

/**
 * POST /api/queues/:name/purge
 * Purge all messages from ready and in-flight sets
 */
queuesRoute.post('/:name/purge', async (c: Context) => {
  try {
    const name = c.req.param('name');
    if (!name) {
      return c.json({ error: 'InvalidRequest', message: 'Queue name is required' }, 400);
    }
    const result = await QueueService.purgeQueue(name);

    return c.json(
      {
        success: true,
        queue: name,
        purgedReady: result.purgedReadyCount,
        purgedInFlight: result.purgedInFlightCount,
        totalPurged: result.purgedReadyCount + result.purgedInFlightCount,
      },
      200
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to purge queue';
    if (message.includes('Queue not found')) {
      return c.json({ error: 'QueueNotFound', message }, 404);
    }
    return c.json({ error: 'InternalError', message }, 500);
  }
});

export default queuesRoute;
