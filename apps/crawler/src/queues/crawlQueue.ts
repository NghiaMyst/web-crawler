import { Queue } from 'bullmq';
import { connection } from '../connection.js';

// Named queue per CONVENTIONS.md: 'crawl:{domain}'
// 'crawl:default' is the general-purpose queue for Phase 1
export const crawlQueue = new Queue('crawl:default', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s initial delay, then 10s, 20s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
