'use server';

import { revalidatePath } from 'next/cache';
import {
  createAlertRule as apiCreateAlertRule,
  updateAlertRule as apiUpdateAlertRule,
  deleteAlertRule as apiDeleteAlertRule,
} from '@/lib/api.server';
import { alertRuleSchema, alertRuleUpdateSchema } from '@/lib/schemas/alert-rule';
import type { AlertRule } from '@/types/api';
import type { ActionResult } from './source.actions';

export async function createAlertRuleAction(
  input: unknown,
): Promise<ActionResult<AlertRule>> {
  const parsed = alertRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed. Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const rule = await apiCreateAlertRule({
      sourceId: parsed.data.sourceId,
      name: parsed.data.name,
      condition: parsed.data.condition,
      messageTpl: parsed.data.messageTpl,
      channel: parsed.data.channel,
      isActive: parsed.data.isActive,
    });
    revalidatePath('/alerts');
    return { ok: true, data: rule };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `Could not save alert rule. ${err.message}`
        : 'Could not save alert rule.',
    };
  }
}

export async function updateAlertRuleAction(
  id: string,
  input: unknown,
): Promise<ActionResult<AlertRule>> {
  const parsed = alertRuleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed. Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const rule = await apiUpdateAlertRule(id, parsed.data);
    revalidatePath('/alerts');
    return { ok: true, data: rule };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `Could not save alert rule. ${err.message}`
        : 'Could not save alert rule.',
    };
  }
}

export async function deleteAlertRuleAction(id: string): Promise<ActionResult> {
  try {
    await apiDeleteAlertRule(id);
    revalidatePath('/alerts');
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `Failed to delete alert rule. ${err.message}`
        : 'Failed to delete alert rule. It has been restored.',
    };
  }
}
