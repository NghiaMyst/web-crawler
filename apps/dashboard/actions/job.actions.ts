'use server';

import { revalidatePath } from 'next/cache';
import { retryJob as apiRetryJob } from '@/lib/api.server';

export type RetryResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export async function retryJobAction(id: string): Promise<RetryResult> {
  try {
    const result = await apiRetryJob(id);
    revalidatePath('/jobs');
    return { ok: true, jobId: result.jobId };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Failed to retry job. ${err.message}`
          : 'Failed to retry job. Please try again.',
    };
  }
}
