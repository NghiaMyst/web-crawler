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

const mockGet = vi.mocked(connection.get);
const mockSet = vi.mocked(connection.set);

describe('enforcePoliteness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves without delay when Redis returns null (no previous timestamp)', async () => {
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');

    // With fake timers, we do NOT advance time — if a setTimeout was scheduled
    // the promise would never resolve. Resolving immediately proves no delay.
    const promise = enforcePoliteness('example.com');
    // Allow microtasks to flush (no timer advancement needed for null path)
    await promise;

    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('waits approximately the remaining delay when timestamp is from 500ms ago', async () => {
    const fakeNow = 1000000;
    vi.setSystemTime(fakeNow);

    // Timestamp from 500ms ago
    mockGet.mockResolvedValue(String(fakeNow - 500));
    mockSet.mockResolvedValue('OK');

    let resolved = false;
    const promise = enforcePoliteness('example.com').then(() => {
      resolved = true;
    });

    // Advance by 1499ms — should not be resolved yet (need ~1500ms wait)
    vi.advanceTimersByTime(1499);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);

    // Advance by 1 more ms — now at 1500ms total, should resolve
    vi.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it('resolves immediately when timestamp is from 3000ms ago (>2s elapsed)', async () => {
    const fakeNow = 5000000;
    vi.setSystemTime(fakeNow);

    // Timestamp from 3000ms ago — elapsed > POLITENESS_DELAY_MS
    mockGet.mockResolvedValue(String(fakeNow - 3000));
    mockSet.mockResolvedValue('OK');

    const start = Date.now();
    const promise = enforcePoliteness('example.com');
    vi.advanceTimersByTime(0);
    await promise;

    // No delay — resolves immediately
    expect(Date.now() - start).toBeLessThan(100);
    expect(mockSet).toHaveBeenCalledOnce();
  });

  it('calls connection.set with correct key pattern, EX, and TTL', async () => {
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');

    const domain = 'test-domain.org';
    const promise = enforcePoliteness(domain);
    vi.advanceTimersByTime(0);
    await promise;

    expect(mockSet).toHaveBeenCalledWith(
      `crawl:politeness:${domain}`,
      expect.any(String),
      'EX',
      KEY_TTL_S,
    );
  });

  it('does not delay requests to different domains independently', async () => {
    const fakeNow = 9000000;
    vi.setSystemTime(fakeNow);

    // 'other.com' was seen 500ms ago — would wait
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'crawl:politeness:other.com') return String(fakeNow - 500);
      return null; // 'different.com' has no record
    });
    mockSet.mockResolvedValue('OK');

    // 'different.com' should resolve immediately (no record)
    const start = Date.now();
    const promise = enforcePoliteness('different.com');
    vi.advanceTimersByTime(0);
    await promise;

    expect(Date.now() - start).toBeLessThan(100);
  });
});
