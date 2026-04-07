import { Queue } from 'bullmq';
import { connection } from '../connection.js';

// Named queue per CONVENTIONS.md: 'crawl:{domain}'
export const footballDataQueue = new Queue('crawl:football-data.org', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
