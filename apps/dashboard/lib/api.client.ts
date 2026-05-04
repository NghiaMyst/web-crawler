import type { DataEntry, PaginatedEntries, EntryFilters } from '@/types/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} on ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchEntriesClient(filters: EntryFilters): Promise<PaginatedEntries> {
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

export type { DataEntry, PaginatedEntries, EntryFilters };
