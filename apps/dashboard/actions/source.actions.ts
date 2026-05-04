'use server';

import { revalidatePath } from 'next/cache';
import {
  createSource as apiCreateSource,
  updateSource as apiUpdateSource,
  deleteSource as apiDeleteSource,
} from '@/lib/api.server';
import { sourceSchema, sourceUpdateSchema } from '@/lib/schemas/source';
import type { Source } from '@/types/api';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createSourceAction(
  input: unknown,
): Promise<ActionResult<Source>> {
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed. Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    // parserKey is required by the .NET API; sourceSchema enforces it.
    const source = await apiCreateSource({
      name: parsed.data.name,
      displayName: parsed.data.displayName,
      url: parsed.data.url,
      category: parsed.data.category,
      parserKey: parsed.data.parserKey,
      crawlerType: parsed.data.crawlerType,
      crawlInterval: parsed.data.crawlInterval,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    });
    revalidatePath('/sources');
    return { ok: true, data: source };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `Could not save source. ${err.message}`
        : 'Could not save source. Check the URL and try again.',
    };
  }
}

export async function updateSourceAction(
  id: string,
  input: unknown,
): Promise<ActionResult<Source>> {
  const parsed = sourceUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Validation failed. Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const source = await apiUpdateSource(id, parsed.data);
    revalidatePath('/sources');
    return { ok: true, data: source };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `Could not save source. ${err.message}`
        : 'Could not save source. Check the URL and try again.',
    };
  }
}

export async function deleteSourceAction(id: string): Promise<ActionResult> {
  try {
    await apiDeleteSource(id);
    revalidatePath('/sources');
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error
        ? `Failed to delete source. ${err.message}`
        : 'Failed to delete source. It has been restored.',
    };
  }
}
