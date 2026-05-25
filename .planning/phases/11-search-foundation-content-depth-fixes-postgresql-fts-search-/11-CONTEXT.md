# Phase 11: Search Foundation - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add full-text search to the Web Crawler data aggregator:

1. **Content depth fixes** — Audit all 5 parsers (`FootballParser`, `GenshinParser`, `LolParser`,
   `AniListParser`, `MangaDexParser`). Fix any that produce shallow or broken JSONB payloads.
   Enrich text fields so FTS has meaningful content to index.

2. **PostgreSQL FTS infrastructure** — A `search_config` table mapping `source_id → json_paths[]`
   (hand-picked per-source fields). A `tsvector` generated column on `data_entries` populated by
   a trigger that reads `search_config` for the row's source. GIN index on the `tsvector` column.
   Language: `english`.

3. **Search API** — Extend the existing `GET /api/entries` endpoint with a `?q=` parameter.
   When `q` is present, apply an `@@` FTS filter alongside existing `category`/`sourceId`/`date`
   filters. Results always sorted by date (newest first) — FTS acts as a filter, not a ranker.
   Cursor pagination preserved unchanged.

4. **Dashboard search UI** — A global search input in the navigation bar (both `Sidebar.tsx`
   and `MobileNav.tsx`). On Enter, navigates to `/entries?q=<query>`. The `/entries` page reads
   the `q` URL param and passes it to the API. Matched tokens are highlighted in entry display
   (either `ts_headline()` from the API or client-side mark-up).

Not in scope: relevance ranking, a dedicated `/search` route, Cmd+K modal, multi-language FTS,
new data sources, or CI/CD changes (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Content Depth Fixes
- **D-01:** **Claude's discretion** — Agent audits all 5 parsers, identifies which produce
  thin/empty/broken payloads, fixes them, and enriches JSONB fields as needed so FTS has
  sufficient text content to be useful. No specific field list mandated by user; quality
  judgment delegated to the implementing agent.

### FTS Index Design
- **D-02:** **Per-source field list** stored in a new `search_config` database table.
  Schema: `source_id (FK → sources.id)`, `json_paths TEXT[]` (e.g.,
  `{$.home_team, $.away_team, $.status}` for football). Populated via a seed migration.
  This replaces hardcoded logic in a function — the DB is the single source of truth.

- **D-03:** A PostgreSQL **trigger on `data_entries` INSERT** reads `search_config` for the
  row's `source_id`, extracts the listed JSONB paths, concatenates the values, and writes
  the result to a `search_vector tsvector` column using `to_tsvector('english', ...)`.
  The `tsvector` column is added via an EF Core migration (manual SQL migration is fine
  if EF cannot express it directly).

- **D-04:** Language config: **`english`** — standard stemming suits the English-language
  content across all 5 sources (EPL team names, anime titles, champion names, etc.).

- **D-05:** GIN index on `data_entries.search_vector`. Created in the same migration
  as the column.

### Search API
- **D-06:** **Extend `GET /api/entries`** with an optional `?q=string` query parameter.
  In `EntriesEndpoints.cs`, when `q` is non-null and non-empty, add an EF Core `.Where()`
  clause: `e.SearchVector.Matches(EF.Functions.ToTsQuery("english", q))` (or raw SQL
  via `FromSqlRaw` if EF FTS support is limited).

- **D-07:** Results always **sorted by date (newest first)** regardless of `q`. FTS is a
  filter only — no `ts_rank()` scoring, no relevance reordering. Cursor pagination is
  unchanged.

- **D-08:** Add `q?: string` to `EntryFilters` interface in `apps/dashboard/types/api.ts`
  and pass it through `fetchEntries()` in `apps/dashboard/lib/api.server.ts`.

### Dashboard Search UI
- **D-09:** **Global nav search bar** in both `Sidebar.tsx` (desktop) and `MobileNav.tsx`
  (mobile). Shadcn `Input` component styled to fit the nav. On Enter key, navigate to
  `/entries?q=<query>` (use Next.js `router.push` or a `<form action="/entries">`).

- **D-10:** The `/entries` page reads the `q` param from `searchParams` (RSC) and passes
  it to `fetchEntries()`. The existing filter controls on the page should display the
  current `q` value (pre-filled `defaultValue`) so the user sees what they searched for.

- **D-11:** **Keyword highlighting** — surface matched tokens in the entry payload display.
  Preferred approach: add a `highlight?: string` field to the `DataEntryResponse` DTO,
  populated by `ts_headline('english', <search_field_concat>, tsquery)` on the .NET side
  when `q` is present. If EF/Npgsql cannot call `ts_headline` cleanly, fall back to
  client-side `<mark>` wrapping the q tokens in the rendered payload.

### Claude's Discretion
- Exact parser field audit findings and which fields to add per parser
- Whether the `tsvector` trigger is a PL/pgSQL trigger or a C# `IDbContextSaveChangesInterceptor`
- Whether `ts_headline()` is called server-side or tokens are highlighted client-side
- Exact Shadcn Input size/variant used in the nav search bar
- Whether the nav search bar uses `<form action="/entries">` (no JS) or a client component
  with `router.push` (for persisting category/source filter state)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — Active requirements this phase closes (CRAWL-01 crawling
  is live, but search is not yet a named requirement — Phase 11 adds FTS capability)
- `.planning/ROADMAP.md` — Phase 11 goal and success criteria (SC-1: content depth fixes,
  SC-2: tsvector index, SC-3: search API, SC-4: dashboard search UI)

### Existing API & Schema
- `apps/api/Endpoints/EntriesEndpoints.cs` — Existing `GetEntries` method; `?q=` param
  must be added here. Read the cursor pagination logic before modifying.
- `apps/api/Data/AppDbContext.cs` — EF Core context; add `SearchVector` property on
  `DataEntry` entity and configure as a shadow/owned property if needed.
- `apps/api/Data/Entities/DataEntry.cs` (or equivalent) — `DataEntry` entity class;
  `search_vector tsvector` column must be added.

### Dashboard Patterns (must follow)
- `.planning/phases/08-next-js-dashboard-alerts-charts/08-CONTEXT.md` — Shadcn/ui
  Tailwind v4 CSS-first patterns, Server Actions, RHF+Zod conventions
- `.planning/phases/07-next-js-dashboard-core-views/07-CONTEXT.md` (if exists) —
  Entries page layout, filter component patterns
- `apps/dashboard/lib/api.server.ts` — Extend `fetchEntries()` to pass `q` param
- `apps/dashboard/types/api.ts` — Add `q?: string` to `EntryFilters`
- `apps/dashboard/components/layout/Sidebar.tsx` — Add search input here (desktop)
- `apps/dashboard/components/layout/MobileNav.tsx` — Add search input here (mobile)
- `apps/dashboard/app/entries/page.tsx` — Read `q` from `searchParams`, pass to fetch

### Parser Source Files (for depth audit)
- `apps/api/Parsers/FootballParser.cs`
- `apps/api/Parsers/GenshinParser.cs`
- `apps/api/Parsers/LolParser.cs`
- `apps/api/Parsers/AniListParser.cs`
- `apps/api/Parsers/MangaDexParser.cs`

### Deployment Context (relevant constraint)
- `.planning/todos/pending/2026-05-19-update-phase-10-deployment-for-gcp-amd64-and-prepare-local-s.md`
  — Production target is GCP e2-medium (AMD64, 4GB RAM). FTS index size and trigger
  performance should be conservative for this host.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/Endpoints/EntriesEndpoints.cs` — `GetEntries` already takes `category`, `sourceId`,
  `from`, `to`, `cursor`, `limit` — add `q` as another nullable param using the same EF `.Where()`
  chain pattern.
- `apps/dashboard/components/ui/` — Shadcn `Input` component available; use for the nav search bar.
- `apps/dashboard/lib/api.server.ts` — `fetchEntries()` builds a `URLSearchParams` object; add
  `if (filters.q) params.set('q', filters.q)` to pass through.
- `apps/dashboard/components/entries/` — Existing filter controls pattern for how to pre-fill
  the search input with the current `q` value from URL.

### Established Patterns
- EF Core LINQ `.Where()` chain — each filter adds one `.Where()` clause; FTS filter follows same
  pattern (may need `EF.Functions.ToTsQuery` or `FromSqlRaw` for FTS-specific operators).
- Cursor pagination: compound `CrawledAt + Id` cursor — unaffected by adding a search filter
  (filter applies before pagination).
- Shadcn/ui Tailwind v4 CSS-first: all styling in `globals.css @theme` — no new config files.
- `EntryFilters` interface in `types/api.ts` — already has optional fields; add `q?: string`.

### Integration Points
- `apps/api/Migrations/` — New migration needed: add `search_vector tsvector` column,
  create `search_config` table, add GIN index, add trigger. Use `migrationBuilder.Sql()` for
  raw PostgreSQL DDL (EF Core cannot express tsvector/GIN directly).
- `apps/dashboard/app/entries/page.tsx` — `searchParams` (RSC) already used for existing filters;
  add `q: searchParams.q` extraction.
- `apps/dashboard/components/layout/Sidebar.tsx` and `MobileNav.tsx` — Nav already has brand
  area and links; search input goes here, same area where the SignalR dot was added in Phase 9.

</code_context>

<specifics>
## Specific Ideas

- `search_config` table is seeded via a migration with one row per source (matching `parserKey`
  or `sourceId`). If a source has no config row, FTS falls back to not indexing that source
  (or indexes `entry_key` only as a safe default).
- The `/entries` page nav search input should keep the user on the filtered result set —
  when they press Enter, navigate to `/entries?q=<query>` preserving existing `category` and
  `sourceId` filter params if already set (pass them through as additional URL params on the
  form action).
- `ts_headline()` is the preferred approach for server-side highlighting. The response shape
  change is small: `DataEntryResponse` gets an optional `Highlight string?` field returned
  only when `q` is present.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 11 scope.

### Reviewed Todos (not folded)
- **Update Phase 10 deployment for GCP AMD64** — Phase 10 backfill (ARM64→AMD64 fixes in
  docker-compose.prod.yml and plan docs). Not Phase 11 scope. Address separately.

</deferred>

---

*Phase: 11-search-foundation-content-depth-fixes-postgresql-fts-search*
*Context gathered: 2026-05-25*
