import axios from 'axios';
import * as cheerio from 'cheerio';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';

const SOURCE_ID = 'lol-tierlist';

// Check RIOT_API_KEY at import time — warn if missing but do NOT crash.
// The u.gg scrape works without it.
if (!process.env.RIOT_API_KEY) {
  logger.warn('RIOT_API_KEY not set — Riot API endpoints unavailable; u.gg scrape will proceed without it', {
    sourceId: SOURCE_ID,
  });
}

export interface LoLJobData {
  // No specific fields needed — worker uses hardcoded endpoints
}

export function createLoLWorker(): Worker<LoLJobData> {
  const worker = new Worker<LoLJobData>(
    'crawl-lol',
    async (job: Job<LoLJobData>): Promise<void> => {
      const url = 'https://u.gg/lol/tier-list';

      logger.info('LoL tier list fetch started', { url, sourceId: SOURCE_ID, jobId: job.id });

      try {
        // Fetch raw HTML from u.gg (axios, not cheerioFetch — we need __NEXT_DATA__ extraction)
        const response = await axios.get<string>(url, {
          headers: {
            'User-Agent': 'PersonalCrawlerBot/1.0',
            'Accept': 'text/html,application/xhtml+xml',
          },
          timeout: 10_000,
          responseType: 'text',
        });

        const html = response.data;
        const $ = cheerio.load(html);
        const scriptContent = $('script#__NEXT_DATA__').text();
        const nextData = JSON.parse(scriptContent) as Record<string, unknown>;

        // Phase 2: log raw data — no storage yet (storage in Phase 3)
        logger.info('u.gg tier list raw data', {
          sourceId: SOURCE_ID,
          jobId: job.id,
          dataKeys: Object.keys((nextData.props as Record<string, unknown>) ?? {}),
        });

        logger.info('LoL tier list fetch complete', { url, sourceId: SOURCE_ID, jobId: job.id });
      } catch (err) {
        const error = err as Error;
        logger.error('LoL tier list fetch failed', {
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

  worker.on('completed', (job: Job<LoLJobData>) => {
    logger.info('LoL job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<LoLJobData> | undefined, err: Error) => {
    logger.error('LoL job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
}
