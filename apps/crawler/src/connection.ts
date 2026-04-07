import { Redis } from 'ioredis';

// maxRetriesPerRequest: null is REQUIRED for BullMQ Worker blocking connections.
// Without it, Workers throw errors on BLPOP and similar blocking commands.
export const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

connection.on('error', (err: Error) => {
  // Log to stderr before logger is initialized
  console.error('[connection] Redis connection error:', err.message);
});
