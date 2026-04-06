# Coding Conventions
_Last updated: 2026-04-06_

## Status Note

No source code exists yet. This project is in the planning phase. All conventions below are **prescriptive** — they describe how code SHOULD be written based on the technology choices in `ARCHITECTURE.md`, `ROADMAP.md`, and `REQUIREMENTS.md`. When Phase 1 implementation begins, these should be enforced with tooling.

---

## Project Structure

The monorepo is planned with three top-level service directories:

```
web-crawler/
├── crawler/        # Node.js + TypeScript — crawl workers, URL Frontier, BullMQ
├── api/            # .NET (ASP.NET Core) — REST API, SignalR hub, notification service
├── dashboard/      # Next.js — frontend dashboard
├── ARCHITECTURE.md
├── REQUIREMENTS.md
├── ROADMAP.md
└── SCHEMA.md
```

Each service is independently deployable and has its own package manifest and tooling config.

---

## Node.js / TypeScript (`crawler/` and `dashboard/`)

### File Naming

- Source files: `camelCase.ts` for modules, `PascalCase.ts` for classes (e.g., `bloomFilter.ts`, `CrawlWorker.ts`)
- Test files: co-located with source as `*.test.ts` (e.g., `bloomFilter.test.ts`)
- Config files: `camelCase.config.ts` or lowercase (e.g., `jest.config.ts`, `tsconfig.json`)

### TypeScript Conventions

- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types on public functions
- Avoid `any`; use `unknown` when type is genuinely unknown
- Use `async/await` over raw Promises; no `.then()` chains in application code

```typescript
// Correct
async function isAllowed(url: string): Promise<boolean> {
  const { hostname } = new URL(url);
  if (!robotsCache.has(hostname)) {
    const robotsTxt = await fetchRobotsTxt(hostname);
    robotsCache.set(hostname, parseRobots(robotsTxt));
  }
  return robotsCache.get(hostname)!.isAllowed(url, 'PersonalCrawlerBot');
}
```

### Naming

- **Variables and functions**: `camelCase`
- **Classes and interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE` for module-level true constants, `camelCase` for runtime values
- **Enums**: `PascalCase` name, `PascalCase` members (e.g., `CrawlerType.Cheerio`)
- **Queue names**: `kebab-case` string literals (e.g., `'queue:parsed-data'`, `'crawl:${domain}'`)
- **Database field names**: `snake_case` (mirrors PostgreSQL schema)

### Import Organization

Order imports as follows, separated by blank lines:

1. Node.js built-ins (`node:crypto`, `node:url`)
2. External packages (`axios`, `cheerio`, `bullmq`)
3. Internal modules (`../services/robotsCache`, `./types`)

No barrel `index.ts` re-exports unless the directory represents a public API boundary.

### Error Handling

- Never swallow errors silently
- Crawl workers: catch errors per-job, log with context, let BullMQ handle retries via `attempts: 3` + exponential backoff
- At module boundaries, throw typed error classes (e.g., `class CrawlError extends Error`)

```typescript
// Worker error pattern
try {
  const content = await fetchPage(url);
  await processContent(content, url);
} catch (err) {
  logger.error({ url, err }, 'Crawl job failed');
  throw err; // Re-throw so BullMQ records the failure
}
```

### Logging

- Logger: **winston** (planned per ROADMAP.md Phase 4)
- Format: structured JSON in production, pretty-print in development
- Always include context fields: `{ url, sourceId, jobId }`
- Log levels: `error` for failures, `warn` for retries/skips, `info` for job lifecycle, `debug` for internals

```typescript
logger.info({ url, sourceId }, 'Crawl job started');
logger.warn({ url, attempt }, 'Crawl retry attempt');
logger.error({ url, err }, 'Crawl job exhausted retries');
```

### User-Agent

All HTTP requests must set a clear bot identifier:
```typescript
headers: { 'User-Agent': 'PersonalCrawlerBot/1.0' }
```

---

## .NET / C# (`api/`)

### File Naming

- One class per file
- File name matches class name: `GenshinEventParser.cs`, `NotificationWorker.cs`
- Interfaces prefixed with `I`: `IContentParser.cs`
- Migrations: `YYYYMMDD_Description` (e.g., `20250406_InitialSchema`)

### Naming

- **Classes, interfaces, methods, properties**: `PascalCase`
- **Private fields**: `_camelCase` with underscore prefix
- **Local variables and parameters**: `camelCase`
- **Constants**: `PascalCase` (C# convention)

```csharp
public class GenshinEventParser : IContentParser {
    private readonly ILogger<GenshinEventParser> _logger;

    public ParsedData Parse(string rawContent, string sourceType) { ... }
}
```

### Patterns

- **Strategy Pattern** for content parsers — each domain has one class implementing `IContentParser`
- **BackgroundService** (`IHostedService`) for the notification worker
- **Dependency Injection** via ASP.NET Core's built-in DI container — no service locator
- **Repository pattern** for database access (optional, but keeps controllers thin)

### Error Handling

- Use `ILogger<T>` from Microsoft.Extensions.Logging throughout
- Background services: catch and log exceptions inside the loop; do not let exceptions escape `ExecuteAsync` and kill the service
- Return `ProblemDetails` from API controllers for error responses

### Migrations

Use Entity Framework Core migrations. Naming: `YYYYMMDD_Description`.

```bash
dotnet ef migrations add 20250406_InitialSchema
dotnet ef database update
```

---

## SQL / Database

- Table names: `snake_case`, plural (e.g., `sources`, `crawl_jobs`, `data_entries`)
- Column names: `snake_case`
- Index names: `idx_{table}_{column(s)}` (e.g., `idx_sources_category`)
- Primary keys: `UUID` with `gen_random_uuid()` default
- Timestamps: `TIMESTAMPTZ`, always use `NOW()` default for `created_at`
- JSONB column for flexible per-domain payloads: `payload JSONB NOT NULL`

---

## Configuration

- All secrets (DB connection strings, Telegram token, Redis URL) via environment variables — never hardcoded
- Environment variables: `UPPER_SNAKE_CASE` (e.g., `DATABASE_URL`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`)
- Source configurations (crawl interval, priority, URL) managed in the `sources` database table — not hardcoded in application code

---

## Comments and Documentation

- Write self-documenting code; avoid comments that restate what the code does
- Use comments to explain **why**, not **what**
- Document non-obvious trade-offs (Bloom Filter false-positive rate, politeness delay rationale)
- Architecture decisions belong in `ARCHITECTURE.md`, not inline comments

---

## Linting and Formatting

No tooling is configured yet (no source code exists). Recommended setup for Phase 1:

**Node.js / TypeScript (`crawler/`, `dashboard/`):**
- Linter: ESLint with `@typescript-eslint` ruleset
- Formatter: Prettier
- Config files: `.eslintrc.json`, `.prettierrc` at each service root

**C# (`api/`):**
- Formatter: `dotnet format` (built-in since .NET 6)
- Code style: `.editorconfig` at repo root

**Recommended `.editorconfig` settings:**
- `indent_style = space`
- `indent_size = 2` for TypeScript/JSON, `indent_size = 4` for C#
- `end_of_line = lf`
- `charset = utf-8`
- `trim_trailing_whitespace = true`
- `insert_final_newline = true`
