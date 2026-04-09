import { logger } from './logger.js';
import { createCrawlWorker, setupGracefulShutdown } from './workers/crawlWorker.js';
import { browserPool } from './workers/BrowserPool.js';
import { runPlaywrightSmokeTest } from './workers/PlaywrightWorker.js';
import { footballDataQueue } from './queues/footballDataQueue.js';
import { createFootballDataWorker } from './workers/FootballDataWorker.js';
import { genshinQueue } from './queues/genshinQueue.js';
import { lolQueue } from './queues/lolQueue.js';
import { anilistQueue } from './queues/anilistQueue.js';
import { mangadexQueue } from './queues/mangadexQueue.js';
import { createGenshinWorker } from './workers/GenshinWorker.js';
import { createLoLWorker } from './workers/LoLWorker.js';
import { createAniListWorker } from './workers/AniListWorker.js';
import { createMangaDexWorker } from './workers/MangaDexWorker.js';

logger.info('Crawler service starting', { service: 'crawler' });

// Initialize Playwright browser pool
await browserPool.initialize();

// ARM validation: confirm Playwright works in this Docker environment
await runPlaywrightSmokeTest();

// Start general-purpose crawl worker (Cheerio + Playwright strategies)
const crawlWorker = createCrawlWorker();

// Start football-data.org dedicated worker
const footballWorker = createFootballDataWorker();

// Start new data source workers
const genshinWorker = createGenshinWorker();
const lolWorker = createLoLWorker();
const anilistWorker = createAniListWorker();
const mangadexWorker = createMangaDexWorker();

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

// Schedule Genshin events fetch every 6 hours
await genshinQueue.upsertJobScheduler(
  'genshin-events-scheduler',
  { every: 6 * 60 * 60 * 1000 },
  {
    name: 'fetch-genshin-events',
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

// Schedule LoL tier list fetch every 12 hours
await lolQueue.upsertJobScheduler(
  'lol-tierlist-scheduler',
  { every: 12 * 60 * 60 * 1000 },
  {
    name: 'fetch-lol-tierlist',
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

// Schedule AniList airing schedule fetch every 6 hours
await anilistQueue.upsertJobScheduler(
  'anilist-airing-scheduler',
  { every: 6 * 60 * 60 * 1000 },
  {
    name: 'fetch-anilist-airing',
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

// Schedule MangaDex recent chapters fetch every 1 hour
await mangadexQueue.upsertJobScheduler(
  'mangadex-chapters-scheduler',
  { every: 60 * 60 * 1000 },
  {
    name: 'fetch-mangadex-chapters',
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

// Graceful shutdown — single registration via setupGracefulShutdown.
// crawlWorker drains first, then additionalCleanup closes browser pool and all other workers.
await setupGracefulShutdown(crawlWorker, async () => {
  await browserPool.closeAll();
  await footballWorker.close();
  await genshinWorker.close();
  await lolWorker.close();
  await anilistWorker.close();
  await mangadexWorker.close();
});

logger.info('Crawler service ready', {
  queues: ['crawl-default', 'crawl-football-data.org', 'crawl-genshin', 'crawl-lol', 'crawl-anilist', 'crawl-mangadex'],
  schedulers: ['epl-standings-scheduler', 'genshin-events-scheduler', 'lol-tierlist-scheduler', 'anilist-airing-scheduler', 'mangadex-chapters-scheduler'],
});
