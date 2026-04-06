# Database Schema

PostgreSQL là database chính. JSONB được dùng cho `payload` để linh hoạt với từng domain mà vẫn có thể index và query.

---

## ERD Overview

```
sources ──< crawl_jobs
sources ──< data_entries
sources ──< alert_rules
alert_rules ──< notification_logs
```

---

## Tables

### `sources` — Quản lý nguồn crawl

```sql
CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,       -- "genshin-events", "epl-standings"
    display_name    TEXT NOT NULL,              -- "Genshin Impact Events"
    url             TEXT NOT NULL,
    category        TEXT NOT NULL,              -- "game" | "football" | "anime" | "manga" | "music"
    crawler_type    TEXT NOT NULL DEFAULT 'cheerio', -- "cheerio" | "playwright"
    crawl_interval  INT  NOT NULL DEFAULT 3600, -- giây, default 1 giờ
    priority        INT  NOT NULL DEFAULT 5,    -- 1-10, ảnh hưởng URL Frontier
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_crawled_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho query theo category
CREATE INDEX idx_sources_category ON sources(category);
CREATE INDEX idx_sources_active ON sources(is_active) WHERE is_active = true;
```

### `crawl_jobs` — Lịch sử crawl jobs

```sql
CREATE TABLE crawl_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
                    -- "pending" | "running" | "done" | "failed" | "skipped"
    priority        INT  NOT NULL DEFAULT 5,
    content_hash    TEXT,                        -- MD5 của raw content, dùng để dedup
    attempt_count   INT  NOT NULL DEFAULT 0,
    error_message   TEXT,
    scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crawl_jobs_source    ON crawl_jobs(source_id);
CREATE INDEX idx_crawl_jobs_status    ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_url_hash  ON crawl_jobs(url, content_hash);
```

### `data_entries` — Data đã parse từ các nguồn

```sql
CREATE TABLE data_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    job_id      UUID REFERENCES crawl_jobs(id),
    category    TEXT NOT NULL,              -- mirror từ source.category để query nhanh
    entry_key   TEXT,                       -- unique key trong domain (ví dụ: event_id, match_id)
    payload     JSONB NOT NULL,             -- structured data, schema khác nhau per domain
    crawled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_entries_source     ON data_entries(source_id);
CREATE INDEX idx_data_entries_category   ON data_entries(category);
CREATE INDEX idx_data_entries_crawled_at ON data_entries(crawled_at DESC);
CREATE INDEX idx_data_entries_payload    ON data_entries USING gin(payload);
-- GIN index cho phép query JSONB: payload @> '{"tier": "S"}'
```

#### Ví dụ payload per domain

```json
// Genshin event
{
  "event_name": "Windblume's Breath",
  "start_date": "2025-03-14",
  "end_date": "2025-04-03",
  "rewards": ["Primogems", "Mora"],
  "is_active": true
}

// LoL meta entry
{
  "champion": "Jinx",
  "role": "ADC",
  "tier": "S+",
  "win_rate": 52.4,
  "pick_rate": 18.2,
  "patch": "15.5"
}

// Football match
{
  "home_team": "Arsenal",
  "away_team": "Chelsea",
  "home_score": 2,
  "away_score": 1,
  "match_date": "2025-04-05",
  "competition": "Premier League",
  "status": "finished"
}

// Anime entry
{
  "title": "Dungeon Meshi",
  "episode": 24,
  "air_date": "2025-04-06",
  "status": "airing",
  "mal_score": 8.7
}
```

### `alert_rules` — Cấu hình điều kiện trigger notification

```sql
CREATE TABLE alert_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    condition   JSONB NOT NULL,     -- xem bên dưới
    message_tpl TEXT NOT NULL,      -- template: "Event mới: {event_name}"
    channel     TEXT NOT NULL,      -- "telegram" | "discord"
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_source ON alert_rules(source_id);
```

#### Ví dụ condition JSONB

```json
// Trigger khi có item mới
{ "type": "new_item" }

// Trigger khi field cụ thể thay đổi
{ "type": "field_changed", "field": "patch_version" }

// Trigger khi value vượt ngưỡng
{ "type": "threshold", "field": "win_rate", "operator": ">", "value": 55 }
```

### `notification_logs` — Lịch sử notification đã gửi

```sql
CREATE TABLE notification_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_rule_id   UUID NOT NULL REFERENCES alert_rules(id),
    data_entry_id   UUID REFERENCES data_entries(id),
    channel         TEXT NOT NULL,
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'sent', -- "sent" | "failed"
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_rule    ON notification_logs(alert_rule_id);
CREATE INDEX idx_notification_logs_sent_at ON notification_logs(sent_at DESC);
```

---

## Migrations

Dùng **Entity Framework Core Migrations** cho .NET. Naming convention: `YYYYMMDD_description`.

```bash
# Tạo migration mới
dotnet ef migrations add 20250406_InitialSchema

# Apply migration
dotnet ef database update
```

---

## Query Examples

```sql
-- Lấy entries Genshin trong 24h qua
SELECT payload
FROM data_entries
WHERE source_id = (SELECT id FROM sources WHERE name = 'genshin-events')
  AND crawled_at > NOW() - INTERVAL '24 hours'
ORDER BY crawled_at DESC;

-- Lấy tất cả event đang active (query JSONB)
SELECT payload->>'event_name', payload->>'end_date'
FROM data_entries
WHERE category = 'game'
  AND payload @> '{"is_active": true}'
ORDER BY crawled_at DESC;

-- Win rate LoL theo patch (trending)
SELECT 
    payload->>'patch'   AS patch,
    payload->>'champion' AS champion,
    (payload->>'win_rate')::float AS win_rate
FROM data_entries
WHERE source_id = (SELECT id FROM sources WHERE name = 'lol-meta')
ORDER BY patch DESC, win_rate DESC;

-- Đếm failed jobs trong 24h
SELECT s.name, COUNT(*) AS failed_count
FROM crawl_jobs j
JOIN sources s ON j.source_id = s.id
WHERE j.status = 'failed'
  AND j.created_at > NOW() - INTERVAL '24 hours'
GROUP BY s.name
ORDER BY failed_count DESC;
```

---

## Lưu ý thiết kế

`payload JSONB` được chọn thay vì tạo bảng riêng per domain vì side project này có nhiều domain với schema khác nhau. JSONB vẫn cho phép index (GIN) và query linh hoạt với operator `@>`, `->`, `->>`  của PostgreSQL mà không cần schema cứng nhắc.

Khi một domain phát triển đủ lớn và query patterns rõ ràng, có thể tạo materialized view hoặc bảng riêng để optimize performance — đây là bước tự nhiên khi scale lên Phase 5.
