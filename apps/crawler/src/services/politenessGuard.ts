import { connection } from '../connection.js';

// Minimum delay between requests to the same domain (D-01)
export const POLITENESS_DELAY_MS = 2000;

// Short TTL — only needed for the ~2s check window
export const KEY_TTL_S = 10;

/**
 * Enforces per-domain politeness by ensuring at least POLITENESS_DELAY_MS
 * milliseconds between consecutive requests to the same domain.
 *
 * Uses Redis to coordinate across jobs within the process. The key pattern
 * `crawl:politeness:{domain}` stores the last dispatch timestamp as a string.
 */
export async function enforcePoliteness(domain: string): Promise<void> {
  const key = `crawl:politeness:${domain}`;

  const lastTs = await connection.get(key);

  if (lastTs !== null) {
    const elapsed = Date.now() - parseInt(lastTs, 10);
    if (elapsed < POLITENESS_DELAY_MS) {
      const remaining = POLITENESS_DELAY_MS - elapsed;
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }

  // Record the actual dispatch time after any delay
  await connection.set(key, Date.now().toString(), 'EX', KEY_TTL_S);
}
