import { logger } from './logger.js';
import { createCrawlWorker, setupGracefulShutdown } from './workers/crawlWorker.js';

logger.info('Crawler service starting', { service: 'crawler' });

const worker = createCrawlWorker();
await setupGracefulShutdown(worker);

logger.info('Crawler service ready — worker listening on crawl:default queue');
