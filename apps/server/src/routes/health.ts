import { Hono, type Context } from 'hono';
import { redis } from '../lib/redis';

export interface HealthCheckSuccess {
  status: 'healthy';
  service: 'inspectr-api';
  timestamp: string;
  redis: 'connected';
  uptime: number;
}

export interface HealthCheckFailure {
  status: 'unhealthy';
  service: 'inspectr-api';
  timestamp: string;
  redis: 'disconnected';
  uptime: number;
  error?: string;
}

export type HealthCheckResponse = HealthCheckSuccess | HealthCheckFailure;

export const healthRoute = new Hono();

export const checkHealth = async (c: Context) => {
  try {
    const pingResponse = await redis.ping();
    if (pingResponse !== 'PONG') {
      throw new Error(`Unexpected Redis response: ${pingResponse}`);
    }

    const payload: HealthCheckSuccess = {
      status: 'healthy',
      service: 'inspectr-api',
      timestamp: new Date().toISOString(),
      redis: 'connected',
      uptime: Number(process.uptime().toFixed(2)),
    };

    return c.json(payload, 200);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Redis unreachable';
    const payload: HealthCheckFailure = {
      status: 'unhealthy',
      service: 'inspectr-api',
      timestamp: new Date().toISOString(),
      redis: 'disconnected',
      uptime: Number(process.uptime().toFixed(2)),
      error: errorMessage,
    };

    return c.json(payload, 503);
  }
};

healthRoute.get('/', checkHealth);

export default healthRoute;
