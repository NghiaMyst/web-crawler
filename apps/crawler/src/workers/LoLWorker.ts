import axios from 'axios';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { insertCrawlJobAndNotify } from '../db/crawlJobsDb.js';

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          timeout: 15_000,
          responseType: 'text',
        });

        const html = response.data;
        const $ = cheerio.load(html);
        const scriptContent = $('script#__NEXT_DATA__').text();
        if (!scriptContent) {
          throw new Error('__NEXT_DATA__ script not found — u.gg may be blocking the request');
        }
        const nextData = JSON.parse(scriptContent) as Record<string, unknown>;

        logger.info('LoL tier list fetch complete', { url, sourceId: SOURCE_ID, jobId: job.id });

        // Phase 3: stage raw content in Redis, then write crawl_jobs row + NOTIFY
        const jobId = crypto.randomUUID();
        await connection.set(`job:raw:${jobId}`, JSON.stringify(nextData), 'EX', 300);
        await insertCrawlJobAndNotify({
          jobId,
          sourceId: SOURCE_ID,
          url,
          status: 'done',
          contentHash: null,
          parserKey: 'lol',
        });
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
