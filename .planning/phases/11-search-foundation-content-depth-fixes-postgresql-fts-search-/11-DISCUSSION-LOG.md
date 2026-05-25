# Phase 11: Search Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 11-search-foundation-content-depth-fixes-postgresql-fts-search
**Areas discussed:** Content depth scope, FTS indexable fields, Search API design, Dashboard search UI

---

## Content Depth Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Richer JSONB fields for FTS | Add more text fields to existing parser payloads | |
| Fix broken/shallow parsers | Fix parsers that produce thin or malformed payloads | |
| Both — fix shallow AND enrich | Audit all 5, fix broken + add richer fields | |
| Claude's discretion | Agent handles parser audit and depth assessment | ✓ |

**User's choice:** Claude's discretion — audit all 5 parsers, fix shallow/broken ones, enrich fields so FTS has good content.

---

## FTS Indexable Fields

### Index strategy

| Option | Description | Selected |
|--------|-------------|----------|
| jsonb_to_tsvector (auto, all text) | PostgreSQL indexes every string value automatically | |
| Per-source field list (hand-picked) | Define which JSONB fields to index per source | ✓ |
| Dedicated search_text column | Add TEXT column, parsers write pre-formatted search string | |

**User's choice:** Per-source field list.

### Where the field list lives

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded in migration/function | PostgreSQL function encodes field list per source | |
| Config table in the database | New search_config table (source_id → json_paths[]) | ✓ |
| Claude's discretion | Pick simplest approach | |

**User's choice:** Config table in the database — `search_config` table.

### Language config

| Option | Description | Selected |
|--------|-------------|----------|
| english (default PostgreSQL config) | Standard stemming, good for EPL/anime/LoL content | ✓ |
| simple (no stemming) | Exact tokens only | |
| Claude's discretion | Agent decides | |

**User's choice:** `english`.

---

## Search API Design

### Endpoint shape

| Option | Description | Selected |
|--------|-------------|----------|
| Extend GET /api/entries with ?q= | Add q param to existing endpoint | ✓ |
| New GET /api/search endpoint | Separate route with own response shape | |

**User's choice:** Extend existing `/api/entries` with `?q=`.

### Result ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Always by date (newest first) | FTS is a filter, not a ranker | ✓ |
| By FTS relevance rank when q present | ts_rank() based ordering, different pagination | |

**User's choice:** Always by date (newest first).

---

## Dashboard Search UI

### Search input placement

| Option | Description | Selected |
|--------|-------------|----------|
| Entries page only (beside existing filters) | Search input in filters bar on /entries | |
| Global nav search bar | Search accessible from all pages, navigates to /entries?q= | ✓ |
| Dedicated /search route | Separate search results page | |

**User's choice:** Global nav search bar.

### Trigger behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Press Enter — navigates to /entries?q=... | Simple URL-based navigation | ✓ |
| Cmd+K modal with instant results | Floating modal, keyboard shortcut | |
| Claude's discretion | Agent decides | |

**User's choice:** Press Enter → navigate to `/entries?q=...`.

### Keyword highlighting

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — highlight matching tokens | ts_headline() or client-side mark | ✓ |
| No — just filter results | Same display as normal entries | |
| Claude's discretion | Agent decides | |

**User's choice:** Yes — highlight matching tokens.

---

## Claude's Discretion

- Exact parser fields to add per source (after audit)
- Whether tsvector trigger is PL/pgSQL or C# interceptor
- Whether ts_headline() is server-side or client-side mark-up
- Shadcn Input variant in nav
- Whether nav search uses `<form>` (no JS) or `router.push` client component

## Deferred Ideas

None — discussion stayed within Phase 11 scope.
GCP AMD64 deployment todo noted as out-of-scope (Phase 10 backfill).
