import { crawlQueue } from '../queues/crawlQueue.js';
import { logger } from '../logger.js';

export interface CrawlJobData {
  url: string;
  sourceId: string;
  strategy: 'cheerio' | 'playwright' | 'api';
}

export async function enqueueCrawlJob(data: CrawlJobData): Promise<void> {
  const job = await crawlQueue.add('crawl', data);
  logger.info('Crawl job enqueued', {
    url: data.url,
    sourceId: data.sourceId,
    jobId: job.id,
  });
}
