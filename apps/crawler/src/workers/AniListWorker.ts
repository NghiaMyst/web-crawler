import axios from 'axios';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';

const SOURCE_ID = 'anilist';

const ANILIST_QUERY = `
  query {
    Page(page: 1, perPage: 50) {
      media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
        id
        title { romaji english }
        nextAiringEpisode { airingAt episode }
      }
    }
  }
`;

export interface AniListJobData {
  // No specific fields needed — worker uses hardcoded query
}

interface AniListMedia {
  id: number;
  title: { romaji: string; english: string | null };
  nextAiringEpisode: { airingAt: number; episode: number } | null;
}

interface AniListResponse {
  data: {
    Page: {
      media: AniListMedia[];
    };
  };
}

export function createAniListWorker(): Worker<AniListJobData> {
  const worker = new Worker<AniListJobData>(
    'crawl-anilist',
    async (job: Job<AniListJobData>): Promise<void> => {
      const url = 'https://graphql.anilist.co';

      logger.info('AniList fetch started', { url, sourceId: SOURCE_ID, jobId: job.id });

      try {
        const response = await axios.post<AniListResponse>(
          url,
          { query: ANILIST_QUERY },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'PersonalCrawlerBot/1.0',
            },
            timeout: 10_000,
          },
        );

        const data = response.data;

        // Phase 2: log raw response — no storage yet (storage in Phase 3)
        logger.info('AniList raw response', {
          sourceId: SOURCE_ID,
          jobId: job.id,
          mediaCount: data.data.Page.media.length,
        });

        logger.info('AniList fetch complete', { url, sourceId: SOURCE_ID, jobId: job.id });
      } catch (err) {
        const error = err as Error;
        logger.error('AniList fetch failed', {
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

  worker.on('completed', (job: Job<AniListJobData>) => {
    logger.info('AniList job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<AniListJobData> | undefined, err: Error) => {
    logger.error('AniList job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
}
