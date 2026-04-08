import { BloomFilter } from 'bloom-filters';

// Singleton Bloom Filter: 100k URL capacity, 1% false positive rate (D-02)
// State is in-memory only — lost on restart is acceptable (Redis persistence deferred to Phase 10)
export const bloomFilter = BloomFilter.create(100000, 0.01);

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
