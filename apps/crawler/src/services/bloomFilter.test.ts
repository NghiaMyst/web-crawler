import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BloomFilter } from 'bloom-filters';

vi.mock('../connection.js', () => ({
  connection: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

import { connection } from '../connection.js';
import { bloomFilter, isUrlSeen, markUrlSeen, loadBloomFilter, saveBloomFilter } from './bloomFilter.js';

describe('Bloom Filter in-memory operations', () => {
  it('returns false for a URL that has never been seen', () => {
    const result = isUrlSeen('https://example.com/never-seen-url-unique-12345');
    expect(result).toBe(false);
  });

  it('returns true for a URL after markUrlSeen is called', () => {
    const url = 'https://example.com/page1-unique-67890';
    markUrlSeen(url);
    expect(isUrlSeen(url)).toBe(true);
  });

  it('returns false for a different URL that was not marked', () => {
    const markedUrl = 'https://example.com/marked-page-abcde';
    const otherUrl = 'https://example.com/other-page-fghij';
    markUrlSeen(markedUrl);
    expect(isUrlSeen(otherUrl)).toBe(false);
  });

  it('bloomFilter singleton is defined', () => {
    expect(bloomFilter).toBeDefined();
  });
});

describe('Bloom Filter Redis persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (connection.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (connection.setex as ReturnType<typeof vi.fn>).mockResolvedValue('OK');
  });

  it('loadBloomFilter starts fresh when Redis key does not exist', async () => {
    (connection.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await loadBloomFilter();
    expect(connection.get).toHaveBeenCalledWith('bloom:filter');
  });

  it('loadBloomFilter restores previously-seen URLs from Redis', async () => {
    const preFilter = BloomFilter.create(100000, 0.01);
    preFilter.add('https://example.com/persisted-url-xyz-99999');
    const serialized = JSON.stringify(preFilter.saveAsJSON());
    (connection.get as ReturnType<typeof vi.fn>).mockResolvedValue(serialized);

    await loadBloomFilter();

    expect(isUrlSeen('https://example.com/persisted-url-xyz-99999')).toBe(true);
  });

  it('loadBloomFilter falls back to a fresh filter when Redis data is corrupt', async () => {
    (connection.get as ReturnType<typeof vi.fn>).mockResolvedValue('not-valid-json{{{');
    await expect(loadBloomFilter()).resolves.not.toThrow();
  });

  it('saveBloomFilter writes to bloom:filter with TTL 604800', async () => {
    markUrlSeen('https://example.com/url-to-persist-88888');
    await saveBloomFilter();

    expect(connection.setex).toHaveBeenCalledWith(
      'bloom:filter',
      604800,
      expect.any(String),
    );
  });

  it('saveBloomFilter serializes a round-trip-valid JSON blob', async () => {
    markUrlSeen('https://example.com/round-trip-url-77777');
    await saveBloomFilter();

    const call = (connection.setex as ReturnType<typeof vi.fn>).mock.calls[0];
    const blob = call[2] as string;
    const restored = BloomFilter.fromJSON(JSON.parse(blob));
    expect(restored.has('https://example.com/round-trip-url-77777')).toBe(true);
  });
});
