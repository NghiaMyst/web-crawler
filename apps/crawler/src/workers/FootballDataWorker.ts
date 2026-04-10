import axios from 'axios';
import crypto from 'node:crypto';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { insertCrawlJobAndNotify } from '../db/crawlJobsDb.js';
import type { EplStandingsResponse } from '@web-crawler/shared-types';

const SOURCE_ID = 'football-data.org';

// API client — auth header required on every request
const apiClient = axios.create({
  baseURL: 'https://api.football-data.org/v4',
  headers: {
    'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY ?? '',
    'User-Agent': 'PersonalCrawlerBot/1.0',
  },
  timeout: 10_000,
});

export async function fetchEplStandings(): Promise<EplStandingsResponse> {
  const response = await apiClient.get<EplStandingsResponse>('/competitions/PL/standings');
  return response.data;
}

export interface FootballDataJobData {
  competition: string; // 'PL' for Premier League
}

export function createFootballDataWorker(): Worker<FootballDataJobData> {
  const worker = new Worker<FootballDataJobData>(
    'crawl-football-data.org',
    async (job: Job<FootballDataJobData>): Promise<void> => {
      const { competition } = job.data;
      const url = `https://api.football-data.org/v4/competitions/${competition}/standings`;

      logger.info('Football-data fetch started', { url, sourceId: SOURCE_ID, jobId: job.id });

      try {
        const data = await fetchEplStandings();

        logger.info('Football-data fetch complete', {
          url,
          sourceId: SOURCE_ID,
          jobId: job.id,
          matchday: data.season.currentMatchday,
          teamsCount: data.standings[0]?.table.length ?? 0,
        });

        // Phase 3: stage raw content in Redis, then write crawl_jobs row + NOTIFY
        const jobId = crypto.randomUUID();
        await connection.set(`job:raw:${jobId}`, JSON.stringify(data), 'EX', 300);
        await insertCrawlJobAndNotify({
          jobId,
          sourceId: SOURCE_ID,
          url,
          status: 'done',
          contentHash: null,
          parserKey: 'football',
        });
      } catch (err) {
        const error = err as Error;
        logger.error('Football-data fetch failed', {
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

  worker.on('completed', (job: Job<FootballDataJobData>) => {
    logger.info('Football-data job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<FootballDataJobData> | undefined, err: Error) => {
    logger.error('Football-data job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
}
