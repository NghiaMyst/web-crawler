import { Pool } from 'pg';
import { logger } from '../logger.js';

// pg Pool uses standard PostgreSQL connection string (postgresql://user:pass@host:port/db)
// NOT the Npgsql format (Host=;Port=;Database=) — that is .NET only
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://crawler:changeme@localhost:5432/webcrawler',
});

export interface CrawlJobInsert {
  jobId: string;
  sourceId: string;
  url: string;
  status: string;
  contentHash: string | null;
  parserKey: string;
}

/**
 * Inserts a crawl_jobs row and emits pg_notify in a single transaction.
 * NOTIFY only fires on COMMIT — if the INSERT fails, no notification is sent.
 *
 * CRITICAL: Redis raw content must be written BEFORE calling this function.
 * pg_notify fires on COMMIT, and the .NET listener reads Redis immediately.
 * Writing Redis after BEGIN creates a race condition.
 *
 * The caller provides jobId so it matches the Redis key job:raw:{jobId} already written.
 * All values are passed as parameterized query parameters — no string concatenation (T-03-03).
 * pg_notify payload is JSON.stringify of known fields only — no user-controlled raw SQL (T-03-04).
 */
export async function insertCrawlJobAndNotify(data: CrawlJobInsert): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO crawl_jobs (id, source_id, url, status, content_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [data.jobId, data.sourceId, data.url, data.status, data.contentHash],
    );

    const notifyPayload = JSON.stringify({
      job_id: data.jobId,
      source_id: data.sourceId,
      parser_key: data.parserKey,
    });

    // All fields in notifyPayload are internal/known — no user-controlled SQL (T-03-04)
    await client.query(`SELECT pg_notify('crawler_events', $1)`, [notifyPayload]);
    await client.query('COMMIT');

    logger.info('crawl_jobs INSERT + NOTIFY committed', {
      jobId: data.jobId,
      sourceId: data.sourceId,
      parserKey: data.parserKey,
    });
    return data.jobId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Graceful shutdown — drain pool connections */
export async function closePgPool(): Promise<void> {
  await pool.end();
}
