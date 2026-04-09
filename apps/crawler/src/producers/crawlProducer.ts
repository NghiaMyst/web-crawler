import { crawlQueue } from '../queues/crawlQueue.js';
import { logger } from '../logger.js';
import { isUrlSeen, markUrlSeen } from '../services/bloomFilter.js';

export interface CrawlJobData {
  url: string;
  sourceId: string;
  strategy: 'cheerio' | 'playwright' | 'api';
}

export async function enqueueCrawlJob(data: CrawlJobData): Promise<void> {
  // Bloom Filter dedup (D-02): skip URLs already seen at enqueue time.
  // Mark BEFORE enqueue so concurrent calls don't create duplicates.
  // BullMQ retries re-run the worker for the SAME job — filter is not consulted on retries.
  if (isUrlSeen(data.url)) {
    logger.info('URL already seen -- skipping (Bloom Filter)', {
      url: data.url,
      sourceId: data.sourceId,
    });
    return;
  }
  markUrlSeen(data.url);

  const job = await crawlQueue.add('crawl', data);
  logger.info('Crawl job enqueued', {
    url: data.url,
    sourceId: data.sourceId,
    jobId: job.id,
  });
}
