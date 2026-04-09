import { Queue } from 'bullmq';
import { connection } from '../connection.js';

// Named queue — BullMQ forbids ':' in queue names, use '-' as separator
export const genshinQueue = new Queue('crawl-genshin', {
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
