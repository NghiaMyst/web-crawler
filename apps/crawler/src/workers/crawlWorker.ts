import { Worker, Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { cheerioFetch } from './CheerioWorker.js';
import { playwrightFetch } from './PlaywrightWorker.js';
import { enforcePoliteness } from '../services/politenessGuard.js';
import { isUrlAllowed } from '../services/robotsCache.js';
import { isContentChanged } from '../services/contentHash.js';
import type { CrawlJobData } from '../producers/crawlProducer.js';

export function createCrawlWorker(): Worker<CrawlJobData> {
  const worker = new Worker<CrawlJobData>(
    'crawl-default',
    async (job: Job<CrawlJobData>): Promise<void> => {
      const { url, sourceId, strategy } = job.data;
      logger.info('Crawl job started', { url, sourceId, jobId: job.id, strategy });

      // --- Pre-fetch guard chain (RESEARCH.md Pattern 5, D-01, D-03) ---

      // Step 1: Extract domain for politeness key
      const { hostname } = new URL(url);

      // Step 2: Politeness guard — enforce 2s per-domain delay (D-01)
      await enforcePoliteness(hostname);

      // Step 3: robots.txt check — skip disallowed URLs (D-03)
      // Disallowed URLs complete without error (policy skip, not a failure)
      const allowed = await isUrlAllowed(url);
      if (!allowed) {
        logger.warn('URL disallowed by robots.txt -- skipping', { url, sourceId, jobId: job.id });
        return;
      }

      // --- Strategy dispatch (fetch) ---
      let responseBody: string | undefined;

      if (strategy === 'cheerio') {
        const result = await cheerioFetch(url, sourceId, job.id ?? 'unknown');
        responseBody = result.rawHtml;
      } else if (strategy === 'playwright') {
        const result = await playwrightFetch(url, sourceId, job.id ?? 'unknown');
        responseBody = result.html;
      } else {
        logger.info('Crawl job completed (stub)', { url, sourceId, jobId: job.id });
      }

      // --- Post-fetch: content hash dedup (D-04) ---
      // Skip processing if content is unchanged since last crawl
      if (responseBody && sourceId) {
        const changed = await isContentChanged(sourceId, responseBody);
        if (!changed) {
          logger.info('Content unchanged -- skipping', { url, sourceId, jobId: job.id });
          return;
        }
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job: Job<CrawlJobData>) => {
    logger.info('Job completed', { jobId: job.id, name: job.name });
  });

  worker.on('failed', (job: Job<CrawlJobData> | undefined, err: Error) => {
    logger.error('Job failed', { jobId: job?.id, err: err.message, stack: err.stack });
  });

  return worker;
}

// SIGTERM graceful shutdown — INFRA-06
// worker.close() marks worker as closing (no new jobs picked up), then waits for
// the current in-flight job to complete or fail before resolving.
export async function setupGracefulShutdown(
  worker: Worker,
  additionalCleanup?: () => Promise<void>,
): Promise<void> {
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    // 30-second hard timeout guard (D-INFRA-06 requirement)
    // .unref() prevents the timer from blocking Node.js event loop exit
    const timeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout (30s) reached, forcing exit');
      process.exit(1);
    }, 30_000);
    timeout.unref();

    // ORDERING CRITICAL: close worker first to drain in-flight jobs,
    // THEN run additionalCleanup (closes browser pool / other workers),
    // THEN quit the Redis connection.
    await worker.close();

    if (additionalCleanup) {
      await additionalCleanup();
    }

    clearTimeout(timeout);
    await connection.quit();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
}
