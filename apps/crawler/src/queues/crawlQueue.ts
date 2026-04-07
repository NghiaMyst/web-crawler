import { Queue } from 'bullmq';
import { connection } from '../connection.js';

// Named queue — BullMQ forbids ':' in queue names, use '-' as separator
export const crawlQueue = new Queue('crawl-default', {
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
