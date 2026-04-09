import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Redis connection before importing the module under test
vi.mock('../connection.js', () => ({
  connection: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { connection } from '../connection.js';
import { enforcePoliteness, POLITENESS_DELAY_MS, KEY_TTL_S } from './politenessGuard.js';

const mockGet = connection.get as ReturnType<typeof vi.fn>;
const mockSet = connection.set as ReturnType<typeof vi.fn>;

describe('enforcePoliteness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves without delay when Redis returns null (first visit)', async () => {
    mockGet.mockResolvedValue(null);

    const start = Date.now();
    await enforcePoliteness('example.com');
    const elapsed = Date.now() - start;

    // Should complete in well under 100ms — no delay
    expect(elapsed).toBeLessThan(500);
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('waits when last timestamp is within politeness window', async () => {
    vi.useFakeTimers();

    // Simulate timestamp recorded 500ms ago (well within 2000ms window)
    const now = Date.now();
    const lastTs = (now - 500).toString();
    mockGet.mockResolvedValue(lastTs);

    const promise = enforcePoliteness('example.com');

    // Advance time by remaining delay (1500ms)
    await vi.advanceTimersByTimeAsync(1500);

    await promise;

    expect(mockSet).toHaveBeenCalledOnce();
  }, 10_000);

  it('resolves immediately when last timestamp is older than POLITENESS_DELAY_MS', async () => {
    // Timestamp from 3000ms ago — beyond 2s window
    const lastTs = (Date.now() - 3000).toString();
    mockGet.mockResolvedValue(lastTs);

    const start = Date.now();
    await enforcePoliteness('other.com');
    const elapsed = Date.now() - start;

    // Should complete quickly — no delay needed
    expect(elapsed).toBeLessThan(500);
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('uses the crawl:politeness:{domain} key pattern', async () => {
    mockGet.mockResolvedValue(null);

    await enforcePoliteness('mysite.io');

    expect(mockGet).toHaveBeenCalledWith('crawl:politeness:mysite.io');
    expect(mockSet).toHaveBeenCalledWith(
      'crawl:politeness:mysite.io',
      expect.any(String),
      'EX',
      KEY_TTL_S,
    );
  });

  it('does not delay requests to different domains independently', async () => {
    mockGet.mockResolvedValue(null);

    await enforcePoliteness('domain-a.com');
    await enforcePoliteness('domain-b.com');

    // Both calls should use different keys
    expect(mockGet).toHaveBeenCalledWith('crawl:politeness:domain-a.com');
    expect(mockGet).toHaveBeenCalledWith('crawl:politeness:domain-b.com');
  });

  it('exports POLITENESS_DELAY_MS = 2000', () => {
    expect(POLITENESS_DELAY_MS).toBe(2000);
  });

  it('exports KEY_TTL_S = 10', () => {
    expect(KEY_TTL_S).toBe(10);
  });
});
