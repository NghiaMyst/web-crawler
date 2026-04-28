-- Full schema + seed data for local development
-- Run with: psql postgresql://postgres:postgres@localhost:5432/webcrawler -f db/seed.sql

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sources (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    display_name    TEXT        NOT NULL,
    url             TEXT        NOT NULL,
    category        TEXT        NOT NULL,
    crawler_type    TEXT        NOT NULL DEFAULT 'cheerio',
    crawl_interval  INT         NOT NULL DEFAULT 3600,
    priority        INT         NOT NULL DEFAULT 5,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    last_crawled_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    parser_key      TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    condition   JSONB       NOT NULL,
    message_tpl TEXT        NOT NULL,
    channel     TEXT        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawl_jobs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     UUID        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    url           TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'pending',
    priority      INT         NOT NULL DEFAULT 5,
    content_hash  TEXT,
    attempt_count INT         NOT NULL DEFAULT 0,
    error_message TEXT,
    scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_entries (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    job_id      UUID        REFERENCES crawl_jobs(id) ON DELETE SET NULL,
    category    TEXT        NOT NULL,
    entry_key   TEXT,
    payload     JSONB       NOT NULL,
    crawled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_rule_id UUID        NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    data_entry_id UUID        REFERENCES data_entries(id) ON DELETE SET NULL,
    channel       TEXT        NOT NULL,
    message       TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'sent',
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS ix_sources_name               ON sources(name);
CREATE INDEX        IF NOT EXISTS ix_sources_category           ON sources(category);
CREATE INDEX        IF NOT EXISTS ix_sources_is_active          ON sources(is_active) WHERE is_active = true;
CREATE INDEX        IF NOT EXISTS ix_crawl_jobs_source_id       ON crawl_jobs(source_id);
CREATE INDEX        IF NOT EXISTS ix_crawl_jobs_status          ON crawl_jobs(status);
CREATE INDEX        IF NOT EXISTS ix_crawl_jobs_url_hash        ON crawl_jobs(url, content_hash);
CREATE INDEX        IF NOT EXISTS ix_data_entries_source_id     ON data_entries(source_id);
CREATE INDEX        IF NOT EXISTS ix_data_entries_category      ON data_entries(category);
CREATE INDEX        IF NOT EXISTS ix_data_entries_crawled_at    ON data_entries(crawled_at DESC);
CREATE INDEX        IF NOT EXISTS ix_data_entries_job_id        ON data_entries(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_data_entries_source_entry  ON data_entries(source_id, entry_key);
CREATE INDEX        IF NOT EXISTS ix_data_entries_payload       ON data_entries USING gin(payload);
CREATE INDEX        IF NOT EXISTS ix_alert_rules_source_id      ON alert_rules(source_id);
CREATE INDEX        IF NOT EXISTS ix_notif_logs_rule            ON notification_logs(alert_rule_id);
CREATE INDEX        IF NOT EXISTS ix_notif_logs_entry           ON notification_logs(data_entry_id);
CREATE INDEX        IF NOT EXISTS ix_notif_logs_sent_at         ON notification_logs(sent_at DESC);

-- EF Core migration history — prevents dotnet ef from re-applying this schema
CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId"    VARCHAR(150) NOT NULL,
    "ProductVersion" VARCHAR(32)  NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260410064655_20260410_InitialSchema', '8.0.0')
ON CONFLICT DO NOTHING;

-- ── Seed: sources ─────────────────────────────────────────────────────────────

INSERT INTO sources (name, display_name, url, category, crawler_type, crawl_interval, priority, parser_key)
VALUES
    ('football-data.org', 'EPL Standings',
     'https://api.football-data.org/v4/competitions/PL/standings',
     'football', 'api', 1800, 7, 'football'),

    ('hoyowiki-genshin', 'Genshin Impact Events',
     'https://sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/home',
     'game', 'api', 21600, 6, 'genshin'),

    ('lol-tierlist', 'LoL Tier List',
     'https://u.gg/lol/tier-list',
     'game', 'cheerio', 43200, 6, 'lol'),

    ('anilist', 'AniList Airing Schedule',
     'https://graphql.anilist.co',
     'anime', 'api', 21600, 5, 'anilist'),

    ('mangadex', 'MangaDex Recent Chapters',
     'https://api.mangadex.org/chapter?order[publishAt]=desc&limit=10',
     'manga', 'api', 3600, 5, 'mangadex')

ON CONFLICT (name) DO NOTHING;
