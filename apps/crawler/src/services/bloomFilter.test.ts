import { describe, it, expect } from 'vitest';
import { bloomFilter, isUrlSeen, markUrlSeen } from './bloomFilter.js';

describe('Bloom Filter', () => {
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
