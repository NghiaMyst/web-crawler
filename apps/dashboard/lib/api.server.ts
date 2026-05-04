import 'server-only';
import type {
  Source,
  CrawlJob,
  PaginatedEntries,
  EntryFilters,
  CreateSourceRequest,
  UpdateSourceRequest,
  JobStatus,
} from '@/types/api';

const BASE_URL = process.env.API_URL ?? 'http://localhost:5000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} on ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchEntries(filters: EntryFilters): Promise<PaginatedEntries> {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.sourceId) params.set('sourceId', filters.sourceId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cursor) params.set('cursor', filters.cursor);
  params.set('limit', String(filters.limit ?? 20));
  const qs = params.toString();
  return request<PaginatedEntries>(`/api/entries${qs ? `?${qs}` : ''}`);
}

export async function fetchSources(): Promise<Source[]> {
  return request<Source[]>('/api/sources');
}

export async function createSource(body: CreateSourceRequest): Promise<Source> {
  return request<Source>('/api/sources', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateSource(id: string, body: UpdateSourceRequest): Promise<Source> {
  return request<Source>(`/api/sources/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteSource(id: string): Promise<void> {
  await request<void>(`/api/sources/${id}`, { method: 'DELETE' });
}

export async function fetchJobs(status?: JobStatus): Promise<CrawlJob[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<CrawlJob[]>(`/api/jobs${qs}`);
}

export async function retryJob(id: string): Promise<{ jobId: string; status: 'pending' }> {
  return request<{ jobId: string; status: 'pending' }>(`/api/jobs/${id}/retry`, {
    method: 'POST',
  });
}
