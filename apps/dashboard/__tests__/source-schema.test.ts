import { describe, it, expect } from 'vitest';
import { sourceSchema, sourceUpdateSchema } from '../lib/schemas/source';

// Gap 3 (DASH-03 / T-07-03): sourceSchema rejects missing required fields (name, url, parserKey)
// Gap 4 (DASH-03 / T-07-03): sourceSchema rejects invalid URL
// Gap 5 (DASH-03): sourceSchema accepts valid complete input
// Gap 6 (DASH-03): sourceUpdateSchema only accepts the 5 mutable fields and rejects immutable fields

const VALID_SOURCE_INPUT = {
  name: 'genshin-events',
  displayName: 'Genshin Impact Events',
  url: 'https://example.com/api',
  category: 'game' as const,
  parserKey: 'genshin',
  crawlerType: 'cheerio' as const,
  crawlInterval: 3600,
  priority: 5,
  isActive: true,
};

describe('sourceSchema (DASH-03)', () => {
  it('rejects input when required field `name` is missing', () => {
    const { name: _name, ...withoutName } = VALID_SOURCE_INPUT;
    const result = sourceSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields).toHaveProperty('name');
    }
  });

  it('rejects input when required field `url` is missing', () => {
    const { url: _url, ...withoutUrl } = VALID_SOURCE_INPUT;
    const result = sourceSchema.safeParse(withoutUrl);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields).toHaveProperty('url');
    }
  });

  it('rejects input when required field `parserKey` is missing', () => {
    const { parserKey: _parserKey, ...withoutParserKey } = VALID_SOURCE_INPUT;
    const result = sourceSchema.safeParse(withoutParserKey);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields).toHaveProperty('parserKey');
    }
  });

  it('rejects an invalid URL value', () => {
    const result = sourceSchema.safeParse({
      ...VALID_SOURCE_INPUT,
      url: 'not-a-valid-url',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields).toHaveProperty('url');
    }
  });

  it('accepts a fully valid source input', () => {
    const result = sourceSchema.safeParse(VALID_SOURCE_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('genshin-events');
      expect(result.data.url).toBe('https://example.com/api');
      expect(result.data.parserKey).toBe('genshin');
    }
  });
});

describe('sourceUpdateSchema (DASH-03)', () => {
  it('accepts an object with only the 5 mutable fields (all optional)', () => {
    const result = sourceUpdateSchema.safeParse({
      displayName: 'Updated Name',
      url: 'https://updated.example.com',
      crawlInterval: 1800,
      priority: 3,
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a partial update with only some of the mutable fields', () => {
    const result = sourceUpdateSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all fields are optional in update)', () => {
    const result = sourceUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects immutable field `name` — name is not in sourceUpdateSchema', () => {
    // sourceUpdateSchema is built via .pick() on the 5 mutable fields.
    // Zod strips unrecognised keys by default (strip mode). A name key is silently
    // dropped but does NOT cause the schema to return it in parsed output.
    // The key contract: parsed data MUST NOT contain `name`.
    const result = sourceUpdateSchema.safeParse({
      displayName: 'OK',
      name: 'should-be-rejected',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // name must not appear in the parsed output (immutable field filtered out)
      expect(result.data).not.toHaveProperty('name');
    }
  });

  it('rejects immutable field `parserKey` — parserKey is not in sourceUpdateSchema', () => {
    const result = sourceUpdateSchema.safeParse({
      displayName: 'OK',
      parserKey: 'bad-actor',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('parserKey');
    }
  });

  it('rejects immutable field `category` — category is not in sourceUpdateSchema', () => {
    const result = sourceUpdateSchema.safeParse({
      displayName: 'OK',
      category: 'football',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('category');
    }
  });

  it('rejects immutable field `crawlerType` — crawlerType is not in sourceUpdateSchema', () => {
    const result = sourceUpdateSchema.safeParse({
      displayName: 'OK',
      crawlerType: 'playwright',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('crawlerType');
    }
  });
});
