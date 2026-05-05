import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api.server.ts BEFORE importing the actions module — mirrors source-actions.test.ts pattern
vi.mock('@/lib/api.server', () => ({
  // existing mocks (kept so other test files importing this module are unaffected)
  createSource: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  fetchSources: vi.fn(),
  fetchEntries: vi.fn(),
  fetchJobs: vi.fn(),
  retryJob: vi.fn(),
  // Phase 8 additions
  fetchAlertRules: vi.fn(),
  createAlertRule: vi.fn(),
  updateAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
}));

import {
  createAlertRuleAction,
  updateAlertRuleAction,
} from '../actions/alert-rule.actions';
import * as apiServer from '@/lib/api.server';

const VALID_RULE_INPUT = {
  sourceId: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test rule',
  channel: 'telegram',
  isActive: true,
  condition: { type: 'new_item' as const },
};

describe('createAlertRuleAction (DASH-05) — Zod validation path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns { ok: false } with fieldErrors when input is empty', async () => {
    const r = await createAlertRuleAction({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toBeDefined();
  });

  it('returns fieldErrors when sourceId is missing', async () => {
    const { sourceId: _sid, ...withoutSourceId } = VALID_RULE_INPUT;
    const r = await createAlertRuleAction(withoutSourceId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toHaveProperty('sourceId');
  });

  it('returns fieldErrors when condition.type is invalid', async () => {
    const r = await createAlertRuleAction({
      ...VALID_RULE_INPUT,
      condition: { type: 'bogus' },
    });
    expect(r.ok).toBe(false);
  });

  it('does NOT call createAlertRule when validation fails', async () => {
    await createAlertRuleAction({});
    expect(apiServer.createAlertRule).not.toHaveBeenCalled();
  });
});

describe('updateAlertRuleAction (DASH-05) — Zod validation path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT call updateAlertRule when condition Zod parse fails', async () => {
    await updateAlertRuleAction('id-1', { condition: { type: 'threshold' /* missing fields */ } });
    expect(apiServer.updateAlertRule).not.toHaveBeenCalled();
  });

  it('returns { ok: false, fieldErrors } when condition is invalid shape', async () => {
    const r = await updateAlertRuleAction('id-1', {
      condition: { type: 'threshold' /* missing fieldPath + threshold */ },
    });
    expect(r.ok).toBe(false);
  });
});
