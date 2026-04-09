import { connection } from '../connection.js';

/** Minimum delay between consecutive requests to the same domain (D-01). */
export const POLITENESS_DELAY_MS = 2000;

/**
 * Short TTL for the politeness key in Redis.
 * The key only needs to survive for the 2-second check window; 10s is a safe margin.
 */
export const KEY_TTL_S = 10;

/**
 * Enforces a per-domain politeness delay using Redis timestamp tracking (D-01).
 *
 * Reads the last-request timestamp for the given domain from Redis.
 * If the elapsed time since the last request is less than POLITENESS_DELAY_MS,
 * this function waits for the remaining duration before returning.
 * After any delay, it records the current timestamp back to Redis so the
 * next caller for the same domain will respect the window.
 *
 * Key pattern: `crawl:politeness:{domain}` with EX KEY_TTL_S.
 */
export async function enforcePoliteness(domain: string): Promise<void> {
  const key = `crawl:politeness:${domain}`;

  const lastTs = await connection.get(key);

  if (lastTs !== null) {
    const elapsed = Date.now() - parseInt(lastTs, 10);
    const remaining = POLITENESS_DELAY_MS - elapsed;

    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }

  // Record the ACTUAL dispatch time (after any delay) so cross-job coordination works
  await connection.set(key, Date.now().toString(), 'EX', KEY_TTL_S);
}
