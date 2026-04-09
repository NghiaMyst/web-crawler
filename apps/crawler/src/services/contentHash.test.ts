import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

// Mock the Redis connection before importing the module under test
vi.mock('../connection.js', () => ({
  connection: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { connection } from '../connection.js';
import { isContentChanged } from './contentHash.js';

const mockGet = connection.get as ReturnType<typeof vi.fn>;
const mockSet = connection.set as ReturnType<typeof vi.fn>;

// Helper to compute expected MD5 hex for a given string
function md5(body: string): string {
  return createHash('md5').update(body).digest('hex');
}

describe('isContentChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue('OK');
  });

  it('returns true when no previous hash exists (first visit)', async () => {
    mockGet.mockResolvedValue(null);

    const result = await isContentChanged('source-1', '<html>hello</html>');

    expect(result).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('crawl:hash:source-1');
    expect(mockSet).toHaveBeenCalledWith('crawl:hash:source-1', md5('<html>hello</html>'));
  });

  it('returns false when body hash matches stored hash (unchanged content)', async () => {
    const body = '<html>same content</html>';
    const hash = md5(body);
    mockGet.mockResolvedValue(hash);

    const result = await isContentChanged('source-2', body);

    expect(result).toBe(false);
    // Should NOT update hash in Redis
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns true and updates hash when body hash differs (changed content)', async () => {
    const oldBody = '<html>old content</html>';
    const newBody = '<html>new content</html>';
    const oldHash = md5(oldBody);
    const newHash = md5(newBody);
    mockGet.mockResolvedValue(oldHash);

    const result = await isContentChanged('source-3', newBody);

    expect(result).toBe(true);
    expect(mockSet).toHaveBeenCalledWith('crawl:hash:source-3', newHash);
  });

  it('returns true for same body but different sourceId (per-source tracking)', async () => {
    const body = '<html>shared body</html>';
    // source-a has this body stored already
    mockGet.mockResolvedValueOnce(md5(body)); // source-a → unchanged
    mockGet.mockResolvedValueOnce(null);       // source-b → first visit

    const resultA = await isContentChanged('source-a', body);
    const resultB = await isContentChanged('source-b', body);

    expect(resultA).toBe(false); // source-a: same hash
    expect(resultB).toBe(true);  // source-b: no previous hash

    expect(mockGet).toHaveBeenCalledWith('crawl:hash:source-a');
    expect(mockGet).toHaveBeenCalledWith('crawl:hash:source-b');
  });

  it('uses the correct Redis key pattern crawl:hash:{sourceId}', async () => {
    mockGet.mockResolvedValue(null);

    await isContentChanged('my-source-id', 'body content');

    expect(mockGet).toHaveBeenCalledWith('crawl:hash:my-source-id');
    expect(mockSet).toHaveBeenCalledWith('crawl:hash:my-source-id', expect.any(String));
  });

  it('computes MD5 correctly for known string (MD5 of "hello" = 5d41402abc4b2a76b9719d911017c592)', async () => {
    mockGet.mockResolvedValue(null);

    await isContentChanged('verify-source', 'hello');

    expect(mockSet).toHaveBeenCalledWith(
      'crawl:hash:verify-source',
      '5d41402abc4b2a76b9719d911017c592',
    );
  });
});
