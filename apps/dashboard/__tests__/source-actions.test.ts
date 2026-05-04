import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/api.server before importing the action module.
// This prevents any actual HTTP calls and avoids the server-only side-effect.
vi.mock('@/lib/api.server', () => ({
  createSource: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  fetchSources: vi.fn(),
  fetchEntries: vi.fn(),
  fetchJobs: vi.fn(),
  retryJob: vi.fn(),
}));

import { createSourceAction } from '../actions/source.actions';
import * as apiServer from '@/lib/api.server';

// Gap 7 (DASH-03 / T-07-15): createSourceAction returns { ok: false, fieldErrors }
// when given invalid input — Zod validation runs before any API call is made.

describe('createSourceAction — Zod validation path (DASH-03 / T-07-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: false } with fieldErrors when input is completely empty', async () => {
    const result = await createSourceAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toBeDefined();
      expect(typeof result.fieldErrors).toBe('object');
    }
  });

  it('returns fieldErrors containing `name` when name is missing', async () => {
    const result = await createSourceAction({
      url: 'https://example.com',
      parserKey: 'my-parser',
      displayName: 'Test',
      category: 'game',
      crawlerType: 'cheerio',
      crawlInterval: 3600,
      priority: 5,
      isActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.fieldErrors) {
      expect(result.fieldErrors).toHaveProperty('name');
    }
  });

  it('returns fieldErrors containing `url` when URL is invalid', async () => {
    const result = await createSourceAction({
      name: 'test-source',
      displayName: 'Test Source',
      url: 'not-a-url',
      category: 'game',
      parserKey: 'test',
      crawlerType: 'cheerio',
      crawlInterval: 3600,
      priority: 5,
      isActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.fieldErrors) {
      expect(result.fieldErrors).toHaveProperty('url');
    }
  });

  it('returns fieldErrors containing `parserKey` when parserKey is empty string', async () => {
    const result = await createSourceAction({
      name: 'test-source',
      displayName: 'Test Source',
      url: 'https://example.com',
      category: 'game',
      parserKey: '',
      crawlerType: 'cheerio',
      crawlInterval: 3600,
      priority: 5,
      isActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.fieldErrors) {
      expect(result.fieldErrors).toHaveProperty('parserKey');
    }
  });

  it('does NOT call the API when validation fails', async () => {
    await createSourceAction({});
    expect(apiServer.createSource).not.toHaveBeenCalled();
  });

  it('returns the validation error message string when input is invalid', async () => {
    const result = await createSourceAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
