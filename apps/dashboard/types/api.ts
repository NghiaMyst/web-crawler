// Mirrors apps/api/Data/Entities/Source.cs serialized via JsonNamingPolicy.CamelCase
export interface Source {
  id: string;
  name: string;
  displayName: string;
  url: string;
  category: string;
  crawlerType: 'cheerio' | 'playwright';
  crawlInterval: number;
  priority: number;
  isActive: boolean;
  lastCrawledAt: string | null;
  createdAt: string;
  updatedAt: string;
  parserKey: string;
}

// Mirrors apps/api/Data/Entities/CrawlJob.cs
export interface CrawlJob {
  id: string;
  sourceId: string;
  url: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  priority: number;
  contentHash: string | null;
  attemptCount: number;
  errorMessage: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Mirrors apps/api/Models/Responses/DataEntryResponse.cs
export interface DataEntry {
  id: string;
  sourceId: string;
  category: string;
  entryKey: string | null;
  payload: Record<string, unknown>;
  crawledAt: string;
}

export interface PaginatedEntries {
  items: DataEntry[];
  nextCursor: string | null;
}

export interface EntryFilters {
  category?: string;
  sourceId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export type JobStatus = CrawlJob['status'];

export interface CreateSourceRequest {
  name: string;
  displayName?: string;
  url: string;
  category?: string;
  parserKey: string;
  crawlerType?: 'cheerio' | 'playwright';
  crawlInterval?: number;
  priority?: number;
  isActive?: boolean;
}

export interface UpdateSourceRequest {
  displayName?: string;
  url?: string;
  crawlInterval?: number;
  priority?: number;
  isActive?: boolean;
}

// ── Alert Rules (Phase 8 — DASH-05) ──────────────────────────────────
export type AlertConditionType = 'new_item' | 'field_changed' | 'threshold';

export type AlertCondition =
  | { type: 'new_item' }
  | { type: 'field_changed'; fieldPath: string }
  | { type: 'threshold'; fieldPath: string; threshold: number };

// Mirrors apps/api/Data/Entities/AlertRule.cs serialized via JsonNamingPolicy.CamelCase
export interface AlertRule {
  id: string;
  sourceId: string;
  name: string;
  condition: AlertCondition;
  messageTpl: string;
  channel: 'telegram' | 'discord';
  isActive: boolean;
  createdAt: string;
}

export interface CreateAlertRuleRequest {
  sourceId: string;
  name: string;
  condition: AlertCondition;
  messageTpl?: string;
  channel: 'telegram' | 'discord';
  isActive?: boolean;
}

export interface UpdateAlertRuleRequest {
  name?: string;
  channel?: 'telegram' | 'discord';
  messageTpl?: string;
  isActive?: boolean;
  condition?: AlertCondition;
}
