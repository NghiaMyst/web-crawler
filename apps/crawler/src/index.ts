import { logger } from './logger.js';
import { createCrawlWorker, setupGracefulShutdown } from './workers/crawlWorker.js';
import { browserPool } from './workers/BrowserPool.js';
import { runPlaywrightSmokeTest } from './workers/PlaywrightWorker.js';
import { footballDataQueue } from './queues/footballDataQueue.js';
import { createFootballDataWorker } from './workers/FootballDataWorker.js';

logger.info('Crawler service starting', { service: 'crawler' });

// Initialize Playwright browser pool
await browserPool.initialize();

// ARM validation: confirm Playwright works in this Docker environment
await runPlaywrightSmokeTest();

// Start general-purpose crawl worker (Cheerio + Playwright strategies)
const crawlWorker = createCrawlWorker();

// Start football-data.org dedicated worker
const footballWorker = createFootballDataWorker();

// Schedule football-data.org EPL standings fetch every 30 minutes
// upsertJobScheduler is the BullMQ v5 API for repeatable jobs.
// It upserts — safe to call on every startup; won't create duplicate schedules.
await footballDataQueue.upsertJobScheduler(
  'epl-standings-scheduler', // stable scheduler ID — deduplicates on restart
  { every: 30 * 60 * 1000 }, // 30 minutes in milliseconds
  {
    name: 'fetch-epl-standings',
    data: { competition: 'PL' },
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

logger.info('EPL standings scheduler registered', {
  scheduleId: 'epl-standings-scheduler',
  intervalMs: 30 * 60 * 1000,
});

// Graceful shutdown — single registration via setupGracefulShutdown.
// crawlWorker drains first, then additionalCleanup closes browser pool and footballWorker.
await setupGracefulShutdown(crawlWorker, async () => {
  await browserPool.closeAll();
  await footballWorker.close();
});

logger.info('Crawler service ready', {
  queues: ['crawl:default', 'crawl:football-data.org'],
  scheduler: 'epl-standings-scheduler',
});
