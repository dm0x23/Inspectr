import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import dotenv from 'dotenv';
import { healthRoute } from './routes/health';
import './lib/redis'; // Initialize Redis client connection

// Load environment variables
dotenv.config();

const PORT = Number(process.env.PORT) || 3001;

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', prettyJSON());

// Mount routes
app.route('/health', healthRoute);

// Base route info
app.get('/', (c) => {
  return c.json({
    name: 'Inspectr API',
    description: 'Amazon SQS Simulation Platform & Visual DLQ Inspector',
    version: '0.1.0',
    endpoints: {
      health: '/health',
    },
  });
});

// 404 Handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Path ${c.req.path} does not exist on Inspectr API`,
    },
    404
  );
});

// Error Handler
app.onError((err, c) => {
  console.error('[API Error]:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

console.log(`🚀 [Inspectr API] Server listening on port ${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
