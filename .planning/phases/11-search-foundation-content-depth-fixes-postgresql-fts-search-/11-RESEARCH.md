# Phase 11: Search Foundation — Research

**Researched:** 2026-05-25
**Domain:** PostgreSQL FTS / Npgsql EF Core 8 / Next.js 16 App Router
**Confidence:** HIGH (core technical areas verified against official docs and GitHub issues)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Agent audits all 5 parsers, identifies thin/empty/broken payloads, fixes and enriches JSONB fields. No specific field list mandated — quality judgment delegated.
- **D-02:** Per-source field list stored in a new `search_config` table. Schema: `source_id (FK → sources.id)`, `json_paths TEXT[]`. Populated via a seed migration.
- **D-03:** PostgreSQL trigger on `data_entries` INSERT reads `search_config` for the row's `source_id`, extracts listed JSONB paths, concatenates values, and writes to `search_vector tsvector` column using `to_tsvector('english', ...)`. Manual SQL migration is acceptable.
- **D-04:** Language: `english` — standard stemming for all 5 sources.
- **D-05:** GIN index on `data_entries.search_vector`, created in the same migration.
- **D-06:** Extend `GET /api/entries` with optional `?q=` parameter. Use EF Core `.Where()` clause: `e.SearchVector.Matches(EF.Functions.ToTsQuery("english", q))` or raw SQL if EF FTS support is limited.
- **D-07:** Results sorted by date (newest first) regardless of `q`. No `ts_rank()`, no relevance reordering. Cursor pagination unchanged.
- **D-08:** Add `q?: string` to `EntryFilters` interface in `apps/dashboard/types/api.ts` and pass through `fetchEntries()` in `apps/dashboard/lib/api.server.ts`.
- **D-09:** Global nav search bar in both `Sidebar.tsx` (desktop) and `MobileNav.tsx` (mobile). Shadcn `Input` component. On Enter, navigate to `/entries?q=<query>`.
- **D-10:** `/entries` page reads `q` from `searchParams` (RSC), passes to `fetchEntries()`. Existing filter controls pre-filled with `defaultValue` showing current `q`.
- **D-11:** Keyword highlighting via `ts_headline()` on the .NET side when `q` is present (`highlight?: string` field on `DataEntryResponse`). Fall back to client-side `<mark>` wrapping if EF/Npgsql cannot call `ts_headline` cleanly.

### Claude's Discretion

- Exact parser field audit findings and which fields to add per parser
- Whether the `tsvector` trigger is a PL/pgSQL trigger or a C# `IDbContextSaveChangesInterceptor`
- Whether `ts_headline()` is called server-side or tokens are highlighted client-side
- Exact Shadcn Input size/variant used in the nav search bar
- Whether the nav search bar uses `<form action="/entries">` (no JS) or a client component with `router.push`

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 11 scope. The following are explicitly excluded from Phase 11: relevance ranking, a dedicated `/search` route, Cmd+K modal, multi-language FTS, new data sources, CI/CD changes (Phase 12).
</user_constraints>

---

## Summary

Phase 11 adds full-text search to the web crawler aggregator across four layers: (1) parser enrichment so each of the 5 parsers produces text-rich JSONB payloads, (2) PostgreSQL FTS infrastructure with a `search_config` lookup table, a PL/pgSQL trigger that populates a `search_vector tsvector` column per-insert, and a GIN index, (3) a `?q=` filter on `GET /api/entries` using Npgsql EF Core's `NpgsqlTsVector.Matches()` LINQ extension, and (4) a global search input in the dashboard nav that navigates to `/entries?q=`.

The key technical finding is that `HasGeneratedTsVectorColumn()` does **not** work reliably for JSONB columns in Npgsql 8.x (GitHub issue #3075 open as of 2024, unfixed). The correct approach is: add `search_vector` as a plain `NpgsqlTsVector` property on `DataEntry`, configure it via `HasColumnType("tsvector")` and `migrationBuilder.Sql()` for the raw DDL, and use a PL/pgSQL trigger (not EF interceptor) to populate it on INSERT. This approach avoids the JSONB generated-column limitation while fitting naturally into the locked decision D-03.

For the dashboard search UI, the `next/form` component (`<Form action="/entries">`) is the cleanest choice: it renders without JavaScript, supports progressive enhancement, prefetches the target route, and avoids the `useRouter.push` boilerplate. The nav search bar in `Sidebar.tsx` and `MobileNav.tsx` wraps a Shadcn `Input` inside `<Form action="/entries" replace>` with `<input type="hidden" name="category" value={currentCategory}>` hidden fields to preserve existing filter state.

**Primary recommendation:** PL/pgSQL trigger for `search_vector` population + `NpgsqlTsVector.Matches(EF.Functions.PlainToTsQuery(...))` for the API filter + `next/form` with `<Form action="/entries">` for nav search + client-side `<mark>` highlight (simpler and avoids ts_headline XSS risk).

---

## Standard Stack

### Core (already in project — verified from `WebCrawlerApi.csproj`)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Npgsql.EntityFrameworkCore.PostgreSQL | 8.0.11 | EF Core PostgreSQL provider including FTS types | Already installed [VERIFIED: csproj] |
| Microsoft.EntityFrameworkCore | 8.0.22 | ORM; `.Where()` chain; migrations | Already installed [VERIFIED: csproj] |
| next | 16.2.2 | Dashboard App Router; `next/form` component | Already installed [VERIFIED: package.json] |
| react | ^19.0.0 | Dashboard UI | Already installed [VERIFIED: package.json] |

### Supporting (no new packages required)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| NpgsqlTsVector | built into Npgsql 8.x | .NET type mapping for PostgreSQL tsvector | In `NpgsqlTypes` namespace [VERIFIED: Npgsql docs] |
| NpgsqlTsQuery | built into Npgsql 8.x | .NET type mapping for PostgreSQL tsquery | Used in LINQ `.Matches()` call |
| next/form | built into Next.js 15+ | Form component for search nav (GET + client nav) | Available in Next.js 16 [VERIFIED: Next.js docs] |

**No new NuGet or npm packages are required for Phase 11.** All needed libraries are already installed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PL/pgSQL trigger | `IDbContextSaveChangesInterceptor` | Interceptor runs in C# SaveChanges path — misses direct SQL INSERTs from the LISTEN/NOTIFY handler, which uses ADO.NET. Trigger is more reliable. [ASSUMED for exact insert path — see Assumptions] |
| `PlainToTsQuery` (recommended) | `ToTsQuery` | `ToTsQuery` interprets `&`, `|`, `!` as operators — unsafe with raw user input. `PlainToTsQuery` ignores punctuation. [VERIFIED: Npgsql docs] |
| Client-side `<mark>` highlighting | `ts_headline()` server-side | `ts_headline` output is **not safe for direct HTML inclusion** (XSS risk from PostgreSQL docs). Client-side mark is simpler, safer, and avoids a server-side HTML injection vector. |
| `<Form action="/entries">` | `useRouter.push` client component | `useRouter.push` requires 'use client', more boilerplate, no prefetching. `next/form` supports progressive enhancement. [VERIFIED: Next.js docs] |

---

## Architecture Patterns

### Pattern 1: tsvector Column — Plain Property + Raw Migration SQL

`HasGeneratedTsVectorColumn()` with JSONB columns throws `NullReferenceException` in Npgsql 8.0 (GitHub issue #3075, open as of February 2024, unfixed). [VERIFIED: GitHub issue #3075]

**Correct approach:**

**Step 1 — Entity property:**
```csharp
// DataEntry.cs
using NpgsqlTypes;
public NpgsqlTsVector? SearchVector { get; set; }
```

**Step 2 — ModelBuilder configuration (AppDbContext.cs):**
```csharp
// Source: Npgsql EF Core docs + workaround for issue #3075
entity.Property(e => e.SearchVector)
    .HasColumnType("tsvector")
    .HasComputedColumnSql(null); // Don't use HasGeneratedTsVectorColumn with JSONB
```

Or more simply — just declare the column type and let the trigger populate it:
```csharp
entity.Property(e => e.SearchVector)
    .HasColumnType("tsvector");
```

**Step 3 — Migration: use raw SQL for all FTS DDL** (EF Core cannot express tsvector GIN index or triggers natively):
```csharp
// In migration Up():
migrationBuilder.Sql("ALTER TABLE data_entries ADD COLUMN search_vector tsvector;");
migrationBuilder.Sql("CREATE INDEX ix_data_entries_search_vector ON data_entries USING GIN (search_vector);");
migrationBuilder.Sql(@"
    CREATE TABLE search_config (
        source_id UUID PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
        json_paths TEXT[] NOT NULL DEFAULT '{}'
    );
");
// Seed rows — one per source (source_ids must match sources table)
migrationBuilder.Sql(@"
    -- Football: team names + competition + status
    INSERT INTO search_config (source_id, json_paths)
    SELECT id, ARRAY['$.home_team','$.away_team','$.competition','$.status','$.team']
    FROM sources WHERE parser_key = 'football';
    -- Genshin: event name
    INSERT INTO search_config (source_id, json_paths)
    SELECT id, ARRAY['$.event_name']
    FROM sources WHERE parser_key = 'genshin';
    -- LoL: champion + role + tier
    INSERT INTO search_config (source_id, json_paths)
    SELECT id, ARRAY['$.champion','$.role','$.tier']
    FROM sources WHERE parser_key = 'lol';
    -- AniList: title + status
    INSERT INTO search_config (source_id, json_paths)
    SELECT id, ARRAY['$.title','$.status']
    FROM sources WHERE parser_key = 'anilist';
    -- MangaDex: manga_title + title
    INSERT INTO search_config (source_id, json_paths)
    SELECT id, ARRAY['$.manga_title','$.title']
    FROM sources WHERE parser_key = 'mangadex';
");
```

### Pattern 2: PL/pgSQL Trigger for tsvector Population

The trigger reads `search_config` to get the `json_paths` for the new row's `source_id`, extracts values from `NEW.payload` using `jsonb_path_query_array`, concatenates them, and writes to `NEW.search_vector`.

```sql
-- Source: PostgreSQL FTS docs + jsonb_path_query_array() docs
CREATE OR REPLACE FUNCTION data_entries_search_vector_update()
RETURNS TRIGGER AS $$
DECLARE
    v_paths TEXT[];
    v_path  TEXT;
    v_text  TEXT := '';
    v_extracted TEXT;
BEGIN
    -- Fetch the json_paths for this source (empty if no config row)
    SELECT json_paths
    INTO v_paths
    FROM search_config
    WHERE source_id = NEW.source_id;

    IF v_paths IS NOT NULL THEN
        FOREACH v_path IN ARRAY v_paths LOOP
            -- Extract text values at the given JSONPath from the JSONB payload
            SELECT string_agg(elem #>> '{}', ' ')
            INTO v_extracted
            FROM jsonb_path_query(NEW.payload, v_path::jsonpath) AS elem;

            IF v_extracted IS NOT NULL THEN
                v_text := v_text || ' ' || v_extracted;
            END IF;
        END LOOP;
    END IF;

    -- Fall back to entry_key if no text extracted
    IF trim(v_text) = '' THEN
        v_text := COALESCE(NEW.entry_key, '');
    END IF;

    NEW.search_vector := to_tsvector('english', trim(v_text));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER data_entries_search_vector_trigger
    BEFORE INSERT OR UPDATE ON data_entries
    FOR EACH ROW EXECUTE FUNCTION data_entries_search_vector_update();
```

**Key note:** The `json_paths` values like `$.home_team` must be valid JSONPath expressions. PostgreSQL's `jsonb_path_query(payload, '$.home_team'::jsonpath)` returns the value of that key. [VERIFIED: PostgreSQL JSON docs]

### Pattern 3: EF Core FTS Filter in GetEntries

`NpgsqlTsVector.Matches()` is the correct LINQ extension method — it generates the PostgreSQL `@@` operator. Use `EF.Functions.PlainToTsQuery` for user-supplied input (safer than `ToTsQuery` which interprets punctuation as operators).

```csharp
// Source: Npgsql EF Core Full Text Search docs
// In EntriesEndpoints.cs GetEntries(), add alongside existing .Where() chain:
if (!string.IsNullOrWhiteSpace(q))
    query = query.Where(e => e.SearchVector!.Matches(
        EF.Functions.PlainToTsQuery("english", q)));
```

**Method signature confirmation:**
```csharp
// Both overloads available [VERIFIED: Npgsql LINQ extensions API docs]:
bool Matches(this NpgsqlTsVector vector, string query)
bool Matches(this NpgsqlTsVector vector, NpgsqlTsQuery query)
```

`EF.Functions.PlainToTsQuery("english", q)` maps to `plainto_tsquery('english', q)` in SQL. [VERIFIED: Npgsql DB functions API docs]

### Pattern 4: ts_headline / Client-Side Highlighting

**Option A (preferred): Client-side mark** — simpler, no XSS risk, no API response shape change in the hot path. The `entries-table.tsx` payload preview can wrap occurrences of the `q` string in `<mark>` tags using a plain string split:

```tsx
// Safe — only wraps the exact q string, no HTML injected from server
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 rounded-sm px-0.5">{part}</mark>
      : part
  );
}
```

**Option B: ts_headline server-side** — if chosen, the output wraps matched tokens in `<b>...</b>` by default, or custom tags via `StartSel=<mark>, StopSel=</mark>`. The PostgreSQL docs warn the output **is NOT safe for direct HTML inclusion** without sanitization. If used, output must go through DOMPurify or an equivalent before `dangerouslySetInnerHTML`. [VERIFIED: PostgreSQL textsearch-controls docs]

`GetResultHeadline()` in Npgsql LINQ:
```csharp
// Source: Npgsql LINQ extensions API docs
// In a Select() projection:
.Select(e => new {
    entry = e,
    highlight = EF.Functions.PlainToTsQuery("english", q)
        .GetResultHeadline("english",
            e.EntryKey + " " + ..., // concatenated text field
            "StartSel=<mark>, StopSel=</mark>, MaxFragments=3, MaxWords=10")
})
```

**Recommendation: Use Option A (client-side mark).** The payload preview in `entries-table.tsx` (`formatPayloadPreview`) already concatenates payload keys to a string — apply the highlight regex there. Zero API shape changes, zero XSS risk.

### Pattern 5: Next.js nav/form Search Input

The `next/form` component (available in Next.js 15+ — project is on 16.2.2) [VERIFIED: package.json] provides GET form submission with client-side navigation and prefetching. This avoids needing `'use client'` on `Sidebar.tsx` (which is currently a Server Component).

**Problem:** `Sidebar.tsx` is a Server Component — it cannot call `useSearchParams()` to read current filter state and inject hidden fields. Two solutions:

1. **Simple approach** — search navigates to `/entries?q=<query>` only (drops existing category/source filters). Acceptable per the CONTEXT.md `specifics` note, which says "preserving existing category and sourceId filter params if already set" — this is a `specifics` note, not a locked decision.

2. **Client component wrapper** — extract just the search input into a `SearchInput.tsx` client component that reads `useSearchParams()` and uses `router.push` to preserve existing params.

**Recommendation: Use a `SearchInput.tsx` client component** inside `Sidebar.tsx` (which stays a Server Component). This is the established pattern from `entries-filters.tsx` (already a client component using `useSearchParams` + `router.push`). The search input pushes to `/entries?q=<query>&category=<current>&sourceId=<current>` preserving state.

```tsx
// SearchInput.tsx — 'use client'
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';

export function SearchInput(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const [, startTransition] = useTransition();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cursor'); // reset pagination
    if (value.trim()) {
      params.set('q', value.trim());
    } else {
      params.delete('q');
    }
    startTransition(() => {
      router.push(`/entries?${params.toString()}`);
    });
  };

  return (
    <Input
      type="search"
      placeholder="Search entries..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className="h-8 text-sm"
      aria-label="Search entries"
    />
  );
}
```

### Pattern 6: Pre-filling `q` in the /entries page

`EntriesPage` already reads `searchParams` as a Promise (RSC pattern). Add `q` extraction:

```tsx
// app/entries/page.tsx — existing RSC pattern
const filters: EntryFilters = {
  category: getStringParam(params['category']),
  sourceId: getStringParam(params['sourceId']),
  from: getStringParam(params['from']),
  to: getStringParam(params['to']),
  q: getStringParam(params['q']),  // ADD THIS
  limit: 20,
};
```

The `EntriesFilters` client component can additionally show a "Searching for: {q}" badge when `q` is set, with an X to clear.

### Recommended Project Structure — New Files

```
apps/api/
├── Data/
│   └── Entities/
│       └── SearchConfig.cs          # New entity for search_config table
├── Migrations/
│   └── 20260525_XXXXXX_AddFTS.cs   # New migration: column + index + table + trigger
└── Endpoints/
    └── EntriesEndpoints.cs          # Modified: add q? param + FTS .Where()

apps/dashboard/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx              # Modified: add SearchInput
│   │   └── MobileNav.tsx           # Modified: add SearchInput
│   └── search/
│       └── SearchInput.tsx          # New 'use client' component
│   └── entries/
│       └── entries-table.tsx        # Modified: highlight q tokens in payload preview
└── types/
    └── api.ts                       # Modified: add q?: string to EntryFilters
```

### Anti-Patterns to Avoid

- **Using `HasGeneratedTsVectorColumn()` with the `Payload` JSONB column** — throws `NullReferenceException` in Npgsql 8.0 (issue #3075). Use raw SQL migration instead. [VERIFIED: GitHub issue]
- **Using `ToTsQuery` with raw user input** — treats `&`, `|`, `!`, `:*` as FTS operators. Use `PlainToTsQuery` for user-facing search. [VERIFIED: Npgsql docs]
- **Rendering `ts_headline` output as raw HTML without sanitization** — PostgreSQL explicitly warns this is XSS-unsafe. [VERIFIED: PostgreSQL textsearch-controls docs]
- **Putting the FTS `.Where()` before cursor decoding** — the FTS filter must be chained in the same `.Where()` sequence before `.Take(limit+1)`, but after the OrderBy. The existing cursor logic works by filtering on `CrawledAt` + `Id` — FTS filter just adds another `.Where()` to the chain.
- **Adding `search_vector` to InMemory EF tests** — `NpgsqlTsVector` and `@@` operator are PostgreSQL-specific. The existing `EntriesEndpointsTests.cs` uses `InMemoryDatabase` — FTS tests cannot use InMemory. Either mock the FTS filter or use a real Postgres test DB. Mark the FTS filter test as an integration test.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| tsquery generation from user input | Custom tokenizer/escaper | `EF.Functions.PlainToTsQuery("english", q)` | PostgreSQL handles stemming, stopwords, normalization |
| Token highlighting logic | Regex-based multi-token highlight | Client-side regex on `formatPayloadPreview` output (simple) | Simple single-token highlight is sufficient for payload preview |
| JSONB value extraction in C# | Custom JsonElement path walker | PL/pgSQL `jsonb_path_query()` inside trigger | Trigger runs in DB, closer to data, no C# deserialization cost |
| GIN index creation | Raw `HasIndex(...).HasMethod("gin")` without correct type | `migrationBuilder.Sql("CREATE INDEX ... USING GIN (search_vector)")` | EF Core `.HasMethod("gin")` works for the existing payload GIN index, but for tsvector the raw SQL path is cleaner and avoids snapshot issues |

---

## Parser Audit Findings

Reading all 5 parser implementations against the FTS content-depth criteria:

### FootballParser — ADEQUATE with enrichment possible
Current payload fields: `home_team`, `away_team`, `home_score`, `away_score`, `match_date`, `competition`, `status` (for match entries); `team`, `position`, `points`, `played`, `won`, `draw`, `lost`, `goals_for`, `goals_against`, `goal_difference`, `competition` (for standing entries).

FTS-searchable fields: `home_team`, `away_team`, `competition`, `status`, `team` — all present. No depth fix needed.
[VERIFIED: FootballParser.cs read]

Recommended `search_config.json_paths`: `{$.home_team, $.away_team, $.competition, $.status, $.team}`

### GenshinParser — ADEQUATE
Current payload fields: `event_name`, `start_date`, `end_date`, `rewards` (array), `is_active`.

FTS-searchable: `event_name` is the key field. `rewards` is an array — `jsonb_path_query` can extract string elements. No depth fix needed — but the parser category is `"game"` not `"genshin"`, consistent with the source.
[VERIFIED: GenshinParser.cs read]

Recommended `search_config.json_paths`: `{$.event_name}`

### LolParser — ADEQUATE
Current payload: `champion`, `role`, `tier`, `win_rate`, `pick_rate`, `patch`.

FTS-searchable: `champion`, `role`, `tier`, `patch` — all text fields. No depth fix needed.
[VERIFIED: LolParser.cs read]

Recommended `search_config.json_paths`: `{$.champion, $.role, $.tier, $.patch}`

### AniListParser — SHALLOW — needs enrichment
Current payload: `title`, `episode` (int), `air_date`, `status`, `mal_score`.

FTS-searchable: `title` and `status` present. But the parser comment notes: "AniListWorker Phase 2 query does not fetch these fields" — `status` and `mal_score` are read defensively and will often be null. The **critical gap** is `manga_title` is missing (that's MangaDex), but more importantly the AniList query in the crawler may not be fetching `status`. This is a **Claude's discretion** fix (D-01): verify the AniList crawler query includes `status` field and enrich if not.
[VERIFIED: AniListParser.cs read — comment at lines 117-118 confirms status may be null]

Recommended `search_config.json_paths`: `{$.title, $.status}`

### MangaDexParser — SHALLOW — critical gap (manga_title always null)
Current payload: `manga_title` (always null per code comment at lines 83-84), `chapter`, `title`, `volume`, `language`, `publish_date`.

The code comment explicitly says: "MangaDexWorker Phase 2 does not request `includes[]=manga`" — so `manga_title` will always be null. This is the primary depth fix for MangaDex: the crawler worker must add `includes[]=manga` to the API request. Without it, FTS on manga entries will only match chapter titles (often null or very sparse).
[VERIFIED: MangaDexParser.cs read — comment at lines 83-84 confirms this]

Recommended `search_config.json_paths`: `{$.manga_title, $.title}` (after fix)

**Content depth fix priority:**
1. MangaDex — add `includes[]=manga` to crawler query (HIGH priority — manga_title is always null)
2. AniList — verify `status` field is fetched by crawler (MEDIUM priority — status may be null)
3. Football/Genshin/LoL — no depth fixes needed

---

## Common Pitfalls

### Pitfall 1: HasGeneratedTsVectorColumn() NullReferenceException with JSONB
**What goes wrong:** Using `entity.HasGeneratedTsVectorColumn(e => e.SearchVector, "english", e => new { e.Payload })` causes migration creation to throw `NullReferenceException` in Npgsql 8.0.
**Why it happens:** GitHub issue #3075 — the Npgsql 8.0 migration generator doesn't handle the JSONB column type path for this API.
**How to avoid:** Use `migrationBuilder.Sql("ALTER TABLE data_entries ADD COLUMN search_vector tsvector")` in the migration `Up()` method. Configure the EF property with just `.HasColumnType("tsvector")` in ModelBuilder.
**Warning signs:** Migration creation throws `NullReferenceException` or generates invalid SQL.
[VERIFIED: GitHub issue #3075]

### Pitfall 2: NpgsqlTsVector NOT supported in InMemory EF provider
**What goes wrong:** Adding FTS `.Where()` clause to `GetEntries` breaks existing `EntriesEndpointsTests.cs` which uses `UseInMemoryDatabase`. InMemory doesn't support `NpgsqlTsVector.Matches()`.
**Why it happens:** The InMemory provider doesn't translate PostgreSQL-specific operators.
**How to avoid:** Guard the test with a null-check or a feature flag, or mark FTS-specific endpoint tests as integration tests requiring a real Postgres connection. The existing InMemory tests for GetEntries should continue to pass as long as `q` is null (the FTS branch is only entered when `q` is non-null).
**Warning signs:** Tests throw `InvalidOperationException: ... could not be translated`.

### Pitfall 3: jsonb_path_query vs jsonb_path_query_array in trigger
**What goes wrong:** Using `jsonb_path_query(payload, '$.rewards')` when `rewards` is an array returns a JSONB array literal — calling `#>> '{}'` on it produces `[...]` not the inner strings.
**Why it happens:** `jsonb_path_query` returns each matching element as a separate row; `string_agg` handles this correctly when iterated. But for path expressions that return a scalar string in one source and an array in another, the `#>> '{}'` cast behavior differs.
**How to avoid:** Use `jsonb_path_query(payload, path::jsonpath)` inside a `string_agg(..., ' ')` aggregate — this works for both scalar values and array elements. Test with both scalar and array payloads.
**Warning signs:** Trigger produces `[{"item1"},{"item2"}]` in `search_vector` — visible in a raw `SELECT search_vector FROM data_entries LIMIT 5`.

### Pitfall 4: PlainToTsQuery empty string throws on PostgreSQL
**What goes wrong:** Passing an empty string `''` to `plainto_tsquery('english', '')` returns an empty tsquery, and `tsvector @@ tsquery` with empty tsquery returns true (matches everything). This is not a crash but is semantically wrong — all entries pass the FTS filter when `q = ""`.
**Why it happens:** PostgreSQL's `plainto_tsquery` with whitespace-only input produces an empty tsquery.
**How to avoid:** Guard in C#: only apply the FTS `.Where()` when `!string.IsNullOrWhiteSpace(q)`. Already implied by D-06 ("when `q` is non-null and non-empty"), but must be explicit.
**Warning signs:** Search with an empty string returns all entries with no filtering.

### Pitfall 5: GIN index not used without `search_vector IS NOT NULL` guard
**What goes wrong:** The GIN index on `search_vector` won't be used for rows where `search_vector IS NULL`. Rows inserted before the migration (pre-trigger) will have null `search_vector`.
**Why it happens:** The trigger fires on INSERT/UPDATE — existing rows don't get a `search_vector` value until they are updated.
**How to avoid:** Add a `UPDATE data_entries SET search_vector = ''::tsvector` or run a backfill update in the migration `Up()` to trigger the trigger for existing rows, or run a one-time backfill query. Document this in the migration.
**Warning signs:** FTS returns no results for data that existed before the migration was applied.

### Pitfall 6: MobileNav.tsx is a client component — SearchInput must also be client
**What goes wrong:** `MobileNav.tsx` is already `'use client'` (uses `useState`). Adding a new `SearchInput.tsx` client component inside it works. But `Sidebar.tsx` is a Server Component — the `SearchInput` client component import must not use hooks at the Sidebar level.
**Why it happens:** React Server Component boundary rules — client components can be imported into server components only as leaf children.
**How to avoid:** Keep `SearchInput.tsx` as a standalone `'use client'` component. Import it into `Sidebar.tsx` as a child — this is fine because Server Components can render client components.
**Warning signs:** `Error: useState can only be used in a Client Component` during `next build`.
[VERIFIED: MobileNav.tsx read — `'use client'` at line 1]

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `tsvector_update_trigger` built-in | Custom PL/pgSQL trigger with SELECT from config table | Built-in trigger doesn't support per-row config lookups |
| `HasGeneratedTsVectorColumn()` for all types | `migrationBuilder.Sql()` for JSONB columns | HasGeneratedTsVectorColumn is broken for JSONB in Npgsql 8.x |
| `<form action="">` HTML form | `next/form` from `'next/form'` | next/form adds client-side navigation + prefetching |
| `ToTsQuery` for all queries | `PlainToTsQuery` for user input | ToTsQuery is operator-unsafe for user input |

---

## Runtime State Inventory

> Phase 11 is a greenfield feature addition (not a rename/refactor). The only runtime state concern is existing `data_entries` rows that predate the migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `data_entries` rows with no `search_vector` (column doesn't exist yet) | Migration adds column; backfill UPDATE in migration or manual after-migration script |
| Live service config | `search_config` table is new — no existing config to migrate | Seed via migration INSERT |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

**Backfill note:** After the migration runs on production, existing `data_entries` rows will have `search_vector = NULL` until they are re-inserted/updated. Options: (a) run `UPDATE data_entries SET payload = payload;` to fire the trigger on all rows (expensive on large tables), or (b) accept that pre-migration entries are unsearchable and build up FTS coverage over time as new crawls run. For a personal project with GCP e2-medium constraints, option (b) is safer.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | xUnit 2.5.3 (.NET) + Vitest (dashboard) |
| Config file | `apps/api.Tests/WebCrawlerApi.Tests.csproj` |
| Quick run command | `dotnet test apps/api.Tests/ --filter "FullyQualifiedName~EntriesEndpoints" -x` |
| Full suite command | `dotnet test apps/api.Tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-06 (FTS filter) | `GET /api/entries?q=Arsenal` returns only matching entries | integration | requires Postgres — InMemory won't work | ❌ Wave 0 |
| D-06 (no-q path) | Existing `GetEntries` tests still pass when `q` is absent | unit (InMemory) | `dotnet test apps/api.Tests/ --filter "EntriesEndpoints"` | ✅ (existing) |
| D-07 (sort preserved) | Entries with `q` still sorted by `crawledAt` descending | integration | — | ❌ Wave 0 |
| D-08 (TypeScript) | `EntryFilters` has `q?: string`, `fetchEntries` passes it | build | `pnpm --filter dashboard build` | ✅ (build check) |
| D-09 (nav search) | SearchInput renders in Sidebar + MobileNav | visual | manual | ❌ Wave 0 |
| D-10 (pre-fill) | `/entries?q=foo` pre-fills search input with "foo" | visual | manual | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `apps/api.Tests/Endpoints/EntriesEndpointsFtsTests.cs` — integration tests for `?q=` filter requiring real Postgres (skip in CI, run manually)
- [ ] The `SearchInput.tsx` client component — new file, no test needed (snapshot/visual)

*(No new test framework installs needed — xUnit and Vitest already configured)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `string.IsNullOrWhiteSpace(q)` guard + `PlainToTsQuery` (not `ToTsQuery`) for safe tsquery generation |
| V5 Output Encoding | yes | Client-side highlight must escape `q` before inserting into regex: `q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` |
| V2 Authentication | no | Personal project — no auth |
| V3 Session Management | no | Stateless API |
| V4 Access Control | no | No user roles |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| FTS operator injection via `?q=` | Tampering | Use `PlainToTsQuery` (not `ToTsQuery`) — ignores `&`, `|`, `!` operators [VERIFIED: Npgsql docs] |
| XSS via `ts_headline` HTML output | XSS / Information Disclosure | Do NOT render `ts_headline` output as `dangerouslySetInnerHTML` without DOMPurify. Prefer client-side mark approach. [VERIFIED: PostgreSQL docs] |
| SQL injection via `?q=` | Tampering | `PlainToTsQuery` is parameterized through EF Core — no raw string interpolation. [ASSUMED: parameterization — standard EF Core behavior] |
| Regex DoS (ReDoS) in client highlight | Denial of Service | Escape `q` before inserting into regex pattern. Use simple split-on-literal rather than complex regex. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The CrawlerEventListener uses ADO.NET direct SQL (not EF Core SaveChanges) for data_entries INSERT, which is why a PL/pgSQL trigger is more reliable than an EF interceptor | Standard Stack — Alternatives Considered | If CrawlerEventListener uses EF Core SaveChanges, an interceptor would also work. Planner should verify by reading CrawlerEventListener.cs |
| A2 | The AniList crawler worker does NOT currently request the `status` field from the AniList GraphQL query | Parser Audit — AniListParser | If the crawler already fetches status, no depth fix needed for AniList |
| A3 | EF Core's `PlainToTsQuery` extension correctly parameterizes the query string (not string-interpolated into SQL) | Security Domain | If parameterization fails, SQL injection risk exists — verify via EF Core query logs |
| A4 | The `sources` table has rows with `parser_key` values 'football', 'genshin', 'lol', 'anilist', 'mangadex' (matching the INSERT seeds in the migration) | Architecture Patterns — Pattern 1 | If parser_key values differ, the seed INSERT statements produce no rows |
| A5 | Backfilling `search_vector` for pre-migration rows via a trigger-firing UPDATE is acceptable latency on a GCP e2-medium with the current data volume | Runtime State Inventory | If the data_entries table is very large, the UPDATE could timeout or cause resource pressure |

---

## Open Questions

1. **What INSERT path does CrawlerEventListener use for `data_entries`?**
   - What we know: `CrawlerEventListener.cs` exists and is the .NET handler for PostgreSQL NOTIFY events
   - What's unclear: Does it use EF Core `db.DataEntries.Add()` / `SaveChanges()`, or raw ADO.NET `INSERT` SQL?
   - Recommendation: Read `CrawlerEventListener.cs` before choosing trigger vs. interceptor. If it uses `SaveChanges()`, either approach works; if it uses raw SQL, trigger is required.

2. **What are the actual `parser_key` values in the `sources` table in production?**
   - What we know: `Source.ParserKey` is a required string field; the parsers are named `FootballParser`, `GenshinParser`, etc.
   - What's unclear: Whether `parser_key` stores the full class name, a lowercase key, or a custom string
   - Recommendation: Check the Sources seeding logic or `SELECT parser_key FROM sources LIMIT 10` in the production DB.

3. **Does the AniList crawler worker fetch `status` in its GraphQL query?**
   - What we know: `AniListParser.cs` reads `status` defensively (line 119) but notes it may be null
   - What's unclear: Whether the Phase 2 AniList worker GraphQL query actually requests the `status` field
   - Recommendation: Read the AniList worker file (likely in `apps/crawler/`) before planning the depth fix.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | FTS trigger + GIN index | ✓ (prod on GCP) | 14+ (assumed) | — |
| Npgsql EF Core 8.x | FTS LINQ filter | ✓ | 8.0.11 | — |
| dotnet 8 | API build + migrations | ✓ | net8.0 | — |
| Node.js / pnpm | Dashboard build | ✓ | (project builds) | — |
| next/form | Nav search form | ✓ | Next.js 16.2.2 | Use `<form>` HTML element |

---

## Sources

### Primary (HIGH confidence)
- [Npgsql EF Core FTS docs](https://www.npgsql.org/efcore/mapping/full-text-search.html) — `HasGeneratedTsVectorColumn`, `Matches()`, `PlainToTsQuery`, `GetResultHeadline` APIs
- [Npgsql LINQ Extensions API](https://www.npgsql.org/efcore/api/Microsoft.EntityFrameworkCore.NpgsqlFullTextSearchLinqExtensions.html) — full method signatures for Matches(), GetResultHeadline()
- [Npgsql DB Functions API](https://www.npgsql.org/efcore/api/Microsoft.EntityFrameworkCore.NpgsqlFullTextSearchDbFunctionsExtensions.html) — PlainToTsQuery, ToTsQuery signatures
- [PostgreSQL textsearch-controls docs](https://www.postgresql.org/docs/current/textsearch-controls.html) — ts_headline StartSel/StopSel options, XSS warning
- [Next.js Form component docs](https://nextjs.org/docs/app/api-reference/components/form) — Form action string behavior, GET submission, prefetching

### Secondary (MEDIUM confidence)
- [GitHub issue #3075 — HasGeneratedTsVectorColumn with JSONB](https://github.com/npgsql/efcore.pg/issues/3075) — Verified NullReferenceException bug in Npgsql 8.0, workaround via HasComputedColumnSql
- [WebSearch — PlainToTsQuery vs ToTsQuery for user input safety](https://www.npgsql.org/efcore/api/Microsoft.EntityFrameworkCore.NpgsqlFullTextSearchDbFunctionsExtensions.html) — confirmed PlainToTsQuery is correct for user input

### Tertiary (LOW confidence)
- Parser key values ('football', 'genshin', etc.) — inferred from parser class names and code patterns — unverified against actual `sources` table data [A4]
- CrawlerEventListener insert path — not read in this research session [A1]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from project files
- Architecture (FTS column/trigger): HIGH — JSONB limitation verified via GitHub issue, workaround verified via official docs
- Architecture (EF FTS filter): HIGH — Matches() and PlainToTsQuery verified via Npgsql official API docs
- Architecture (Dashboard search): HIGH — next/form behavior verified via Next.js official docs
- Parser audit findings: HIGH — all 5 parser files read directly; MangaDex gap is explicit in code comment
- Pitfalls: MEDIUM-HIGH — most verified via official docs or GitHub issues; Pitfall 5 (backfill) is ASSUMED

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable domain — Npgsql 8.x and Next.js 16 APIs are stable)
