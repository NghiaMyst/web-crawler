import { createHash } from 'node:crypto';
import { connection } from '../connection.js';

/**
 * Checks whether the content body for a given sourceId has changed since the last crawl.
 *
 * Computes an MD5 hash of the body and compares it against the stored hash in Redis.
 * If the hash differs (or no previous hash exists), updates Redis with the new hash and returns true.
 * If the hash matches, returns false (content unchanged).
 *
 * Redis key pattern: crawl:hash:{sourceId}
 * No TTL -- persists until overwritten by the next crawl.
 *
 * Note: MD5 is used for change detection only, not for security purposes.
 */
export async function isContentChanged(sourceId: string, body: string): Promise<boolean> {
  const hash = createHash('md5').update(body).digest('hex');
  const key = `crawl:hash:${sourceId}`;

  const prevHash = await connection.get(key);

  if (prevHash === hash) {
    return false;
  }

  await connection.set(key, hash);
  return true;
}
