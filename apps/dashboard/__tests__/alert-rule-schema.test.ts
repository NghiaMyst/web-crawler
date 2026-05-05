import { describe, it, expect } from 'vitest';
import { alertRuleSchema, alertConditionSchema } from '../lib/schemas/alert-rule';

const VALID_BASE = {
  sourceId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'New Genshin event',
  channel: 'telegram' as const,
  isActive: true,
};

describe('alertRuleSchema (DASH-05) — discriminated union conditions', () => {
  it('accepts a new_item condition', () => {
    const r = alertRuleSchema.safeParse({ ...VALID_BASE, condition: { type: 'new_item' } });
    expect(r.success).toBe(true);
  });

  it('accepts a field_changed condition with fieldPath', () => {
    const r = alertRuleSchema.safeParse({
      ...VALID_BASE,
      condition: { type: 'field_changed', fieldPath: 'patch_version' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a threshold condition with fieldPath + threshold', () => {
    const r = alertRuleSchema.safeParse({
      ...VALID_BASE,
      condition: { type: 'threshold', fieldPath: 'price', threshold: 100 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects threshold condition missing fieldPath', () => {
    const r = alertRuleSchema.safeParse({
      ...VALID_BASE,
      condition: { type: 'threshold', threshold: 100 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects field_changed condition with empty fieldPath', () => {
    const r = alertRuleSchema.safeParse({
      ...VALID_BASE,
      condition: { type: 'field_changed', fieldPath: '' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown condition type', () => {
    const r = alertConditionSchema.safeParse({ type: 'bogus' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-UUID sourceId', () => {
    const r = alertRuleSchema.safeParse({
      ...VALID_BASE,
      sourceId: 'not-a-uuid',
      condition: { type: 'new_item' },
    });
    expect(r.success).toBe(false);
  });
});
