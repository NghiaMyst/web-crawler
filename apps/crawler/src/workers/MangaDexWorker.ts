import axios from 'axios';
import crypto from 'node:crypto';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { insertCrawlJobAndNotify } from '../db/crawlJobsDb.js';

const SOURCE_ID = 'mangadex';

export interface MangaDexJobData {
  // No specific fields needed — worker uses hardcoded endpoint
}

interface MangaDexChapter {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface MangaDexResponse {
  data: MangaDexChapter[];
  total: number;
}

export function createMangaDexWorker(): Worker<MangaDexJobData> {
  const worker = new Worker<MangaDexJobData>(
    'crawl-mangadex',
    async (job: Job<MangaDexJobData>): Promise<void> => {
      const url = 'https://api.mangadex.org/chapter?order[publishAt]=desc&limit=10';

      logger.info('MangaDex fetch started', { url, sourceId: SOURCE_ID, jobId: job.id });

      try {
        const response = await axios.get<MangaDexResponse>(url, {
          headers: {
            'User-Agent': 'PersonalCrawlerBot/1.0',
          },
          timeout: 10_000,
        });

        const data = response.data;

        logger.info('MangaDex fetch complete', { url, sourceId: SOURCE_ID, jobId: job.id });

        // Phase 3: stage raw content in Redis, then write crawl_jobs row + NOTIFY
        const jobId = crypto.randomUUID();
        await connection.set(`job:raw:${jobId}`, JSON.stringify(data), 'EX', 300);
        await insertCrawlJobAndNotify({
          jobId,
          sourceId: SOURCE_ID,
          url,
          status: 'done',
          contentHash: null,
          parserKey: 'mangadex',
        });
      } catch (err) {
        const error = err as Error;
        logger.error('MangaDex fetch failed', {
          url,
          sourceId: SOURCE_ID,
          jobId: job.id,
          err: error.message,
          stack: error.stack,
        });
        throw err; // Re-throw so BullMQ records the failure and applies retry
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job: Job<MangaDexJobData>) => {
    logger.info('MangaDex job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<MangaDexJobData> | undefined, err: Error) => {
    logger.error('MangaDex job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
}
