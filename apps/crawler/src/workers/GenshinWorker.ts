import axios from 'axios';
import crypto from 'node:crypto';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { insertCrawlJobAndNotify } from '../db/crawlJobsDb.js';
import { cheerioFetch } from './CheerioWorker.js';

const SOURCE_ID = 'hoyowiki-genshin';

export interface GenshinJobData {
  // No specific fields needed — worker uses hardcoded endpoints
}

export function createGenshinWorker(): Worker<GenshinJobData> {
  const worker = new Worker<GenshinJobData>(
    'crawl-genshin',
    async (job: Job<GenshinJobData>): Promise<void> => {
      const url = 'https://sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/home';

      logger.info('Genshin fetch started', { url, sourceId: SOURCE_ID, jobId: job.id });

      try {
        let data: unknown;

        try {
          // Primary: HoYoWiki API
          const response = await axios.get<unknown>(url, {
            headers: {
              'User-Agent': 'PersonalCrawlerBot/1.0',
            },
            timeout: 10_000,
          });
          data = response.data;
        } catch (apiErr) {
          // Fallback: Cheerio scrape of HoYoLab official circle page
          logger.warn('HoYoWiki API failed, falling back to cheerioFetch', {
            sourceId: SOURCE_ID,
            jobId: job.id,
            err: (apiErr as Error).message,
          });
          const fallbackUrl = 'https://www.hoyolab.com/circles/2/41/official';
          const result = await cheerioFetch(fallbackUrl, SOURCE_ID, job.id ?? 'unknown');
          data = result.rawHtml;
        }

        logger.info('Genshin fetch complete', { url, sourceId: SOURCE_ID, jobId: job.id });

        // Phase 3: stage raw content in Redis, then write crawl_jobs row + NOTIFY
        const jobId = crypto.randomUUID();
        await connection.set(`job:raw:${jobId}`, JSON.stringify(data), 'EX', 300);
        await insertCrawlJobAndNotify({
          jobId,
          sourceId: SOURCE_ID,
          url,
          status: 'done',
          contentHash: null,
          parserKey: 'genshin',
        });
      } catch (err) {
        const error = err as Error;
        logger.error('Genshin fetch failed', {
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

  worker.on('completed', (job: Job<GenshinJobData>) => {
    logger.info('Genshin job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<GenshinJobData> | undefined, err: Error) => {
    logger.error('Genshin job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
}
