import { Worker, Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { cheerioFetch } from './CheerioWorker.js';
import type { CrawlJobData } from '../producers/crawlProducer.js';

export function createCrawlWorker(): Worker<CrawlJobData> {
  const worker = new Worker<CrawlJobData>(
    'crawl:default',
    async (job: Job<CrawlJobData>): Promise<void> => {
      const { url, sourceId, strategy } = job.data;
      logger.info('Crawl job started', { url, sourceId, jobId: job.id, strategy });

      if (strategy === 'cheerio') {
        await cheerioFetch(url, sourceId, job.id ?? 'unknown');
      } else {
        // Phase 1: placeholder for other strategies (playwright added in 01-06)
        logger.info('Crawl job completed (stub)', { url, sourceId, jobId: job.id });
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
