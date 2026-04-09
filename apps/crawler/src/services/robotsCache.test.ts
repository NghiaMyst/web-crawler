import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ../connection.js before importing the module under test
vi.mock('../connection.js', () => ({
  connection: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock axios before importing the module under test
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

import { connection } from '../connection.js';
import axios from 'axios';
import { isUrlAllowed } from './robotsCache.js';

const mockGet = vi.mocked(connection.get as (...args: unknown[]) => Promise<string | null>);
const mockSet = vi.mocked(connection.set as (...args: unknown[]) => Promise<unknown>);
const mockAxiosGet = vi.mocked(axios.get as (...args: unknown[]) => Promise<unknown>);

const DISALLOW_SECRET_ROBOTS = 'User-agent: *\nDisallow: /secret';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isUrlAllowed', () => {
  it('Test 1: returns false for a URL disallowed by robots.txt', async () => {
    mockGet.mockResolvedValueOnce(null); // cache miss
    mockAxiosGet.mockResolvedValueOnce({ data: DISALLOW_SECRET_ROBOTS });
    mockSet.mockResolvedValueOnce('OK');

    const result = await isUrlAllowed('https://example.com/secret');

    expect(result).toBe(false);
  });

  it('Test 2: returns true for a URL allowed (not disallowed) by robots.txt', async () => {
    mockGet.mockResolvedValueOnce(null); // cache miss
    mockAxiosGet.mockResolvedValueOnce({ data: DISALLOW_SECRET_ROBOTS });
    mockSet.mockResolvedValueOnce('OK');

    const result = await isUrlAllowed('https://example.com/public');

    expect(result).toBe(true);
  });

  it('Test 3: uses cached robots.txt and does NOT trigger HTTP fetch', async () => {
    mockGet.mockResolvedValueOnce(DISALLOW_SECRET_ROBOTS); // cache hit

    await isUrlAllowed('https://example.com/public');

    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('Test 4: returns true (permissive) when fetch fails', async () => {
    mockGet.mockResolvedValueOnce(null); // cache miss
    mockAxiosGet.mockRejectedValueOnce(new Error('network error'));
    mockSet.mockResolvedValueOnce('OK');

    const result = await isUrlAllowed('https://example.com/any-path');

    expect(result).toBe(true);
  });

  it('Test 5: calls connection.set with correct key, content, EX, and 86400 TTL', async () => {
    mockGet.mockResolvedValueOnce(null); // cache miss
    mockAxiosGet.mockResolvedValueOnce({ data: DISALLOW_SECRET_ROBOTS });
    mockSet.mockResolvedValueOnce('OK');

    await isUrlAllowed('https://example.com/public');

    expect(mockSet).toHaveBeenCalledWith(
      'crawl:robots:example.com',
      DISALLOW_SECRET_ROBOTS,
      'EX',
      86400,
    );
  });
});
