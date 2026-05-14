import pkg from 'bloom-filters';
const { BloomFilter } = pkg;
import { connection } from '../connection.js';

const BLOOM_REDIS_KEY = 'bloom:filter';
const BLOOM_TTL_SECONDS = 604800; // 7 days

export let bloomFilter = BloomFilter.create(100000, 0.01);

export async function loadBloomFilter(): Promise<void> {
  try {
    const serialized = await connection.get(BLOOM_REDIS_KEY);
    if (serialized) {
      bloomFilter = BloomFilter.fromJSON(JSON.parse(serialized));
    }
  } catch {
    // Redis unavailable or corrupt data — start fresh (in-memory filter already set above)
  }
}

export async function saveBloomFilter(): Promise<void> {
  const json = JSON.stringify(bloomFilter.saveAsJSON());
  await connection.setex(BLOOM_REDIS_KEY, BLOOM_TTL_SECONDS, json);
}

/**
 * Returns true if the URL has previously been marked as seen.
 * May return true for URLs never seen (1% false positive rate).
 */
export function isUrlSeen(url: string): boolean {
  return bloomFilter.has(url);
}

/**
 * Marks a URL as seen in the Bloom Filter.
 * Subsequent calls to isUrlSeen for this URL will return true.
 */
export function markUrlSeen(url: string): void {
  bloomFilter.add(url);
}
