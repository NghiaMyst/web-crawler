# Architecture Research
_Researched: 2026-04-07_

> **Confidence note:** WebSearch and WebFetch were unavailable during this research session.
> All findings are based on training data (cutoff August 2025) for stable, well-documented
> technologies. Confidence levels are marked per section. These patterns are mature and
> unlikely to have changed materially, but verify version-specific APIs against official docs.

---

## 1. Monorepo Structure — Node.js + .NET + Next.js Hybrid

**Confidence: MEDIUM** — Turborepo and Nx are well-documented; hybrid .NET support patterns are stable.

### Finding

The core problem with hybrid monorepos is that standard JS tooling (Turborepo, Nx, pnpm workspaces) understands the JS side of the repo natively but treats the .NET project as an opaque directory. This is not a blocker — it is a well-understood configuration pattern.

**Turborepo** is the better fit for this project over Nx because:
- Turborepo is task-graph-focused with zero opinion on language — it orchestrates `turbo.json`-defined tasks and caches their outputs regardless of which runtime executes them. A `dotnet build` task is no different from `tsc` from Turborepo's perspective.
- Nx is more opinionated and pushes toward Nx-specific project structure and code generators. The overhead is not worth it for a personal project with a fixed, small set of services.
- Plain npm workspaces + dotnet sln is viable but gives up build caching and the clean `turbo run build` orchestration that makes monorepo DX pleasant.

**Recommended layout:**

```
web-crawler/                    ← repo root
├── package.json                ← root workspace, turbo dependency
├── turbo.json                  ← pipeline definition
├── pnpm-workspace.yaml         ← JS workspace members
├── WebCrawler.sln              ← .NET solution at root
│
├── apps/
│   ├── crawler/                ← Node.js/TypeScript BullMQ worker
│   │   ├── package.json
│   │   └── src/
│   ├── api/                    ← .NET ASP.NET Core project
│   │   ├── WebCrawler.Api.csproj
│   │   └── src/
│   └── dashboard/              ← Next.js
│       ├── package.json
│       └── src/
│
├── packages/
│   └── shared-types/           ← TypeScript types shared between crawler + dashboard
│       └── package.json
│
└── infra/
    ├── docker-compose.yml
    └── docker-compose.prod.yml
```

**turbo.json pipeline example:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "bin/**", "obj/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    }
  }
}
```

The `.NET` project is registered in `turbo.json` as a workspace with a `build` script in a thin `package.json` wrapper that shells out to `dotnet build`:

```json
// apps/api/package.json
{
  "name": "@web-crawler/api",
  "scripts": {
    "build": "dotnet build WebCrawler.Api.csproj -c Release",
    "dev": "dotnet watch run --project WebCrawler.Api.csproj"
  }
}
```

This lets `turbo run build` orchestrate the full repo including the .NET project without Turborepo needing to understand MSBuild.

### Recommendation

Use **Turborepo + pnpm workspaces** with a thin `package.json` wrapper around the .NET project. Keep the `WebCrawler.sln` at repo root so .NET tooling (Rider, VS, `dotnet` CLI) continues to work unmodified.

### Trade-offs

- Turborepo's remote caching is a paid feature (Vercel); for a personal project, local caching (`.turbo/` cache) is sufficient and free.
- The .NET `package.json` wrapper is a minor impedance mismatch — `dotnet watch` works fine inside it but is not as tightly integrated as a native Nx .NET plugin would be.
- pnpm is strongly preferred over npm for workspaces due to its strict dependency isolation and symlink efficiency; switching later is low-cost but adds friction mid-project.

---

## 2. Docker Compose for Local Dev

**Confidence: HIGH** — Docker Compose v2 syntax and health check patterns are stable and well-documented.

### Finding

The service graph has clear dependencies:
- `postgres` and `redis` have no upstream dependencies — they start first
- `api` (.NET) depends on `postgres` being healthy
- `crawler` (Node.js) depends on `redis` being healthy (BullMQ) and `postgres` being healthy (direct writes)
- `dashboard` (Next.js) depends on `api` for API calls — but in dev mode this can be soft (just env vars pointing at api host)

**Health check strategy:**

```yaml
# postgres health: use pg_isready, not just container startup
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 5s
  timeout: 5s
  retries: 10
  start_period: 10s

# redis health: use redis-cli ping
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 5s
  timeout: 3s
  retries: 5
```

Do NOT use `depends_on: service_name` (the implicit "started" check) — use `depends_on: condition: service_healthy` to gate on actual readiness.

**Full recommended compose topology:**

```yaml
# docker-compose.yml
services:

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: crawler
      POSTGRES_PASSWORD: crawler_dev
      POSTGRES_DB: webcrawler
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U crawler -d webcrawler"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "5000:8080"
    environment:
      ConnectionStrings__DefaultConnection: "Host=postgres;Port=5432;Database=webcrawler;Username=crawler;Password=crawler_dev"
      ASPNETCORE_ENVIRONMENT: Development
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./apps/api:/app           # bind mount for dotnet watch hot reload
      - /app/obj                  # exclude obj from bind mount
      - /app/bin                  # exclude bin from bind mount

  crawler:
    build:
      context: ./apps/crawler
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: "postgresql://crawler:crawler_dev@postgres:5432/webcrawler"
      REDIS_URL: "redis://redis:6379"
      NODE_ENV: development
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/crawler:/app
      - /app/node_modules         # prevent host node_modules from being mounted

  dashboard:
    build:
      context: ./apps/dashboard
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: "http://localhost:5000"
      API_URL: "http://api:8080"   # server-side Next.js calls use internal Docker hostname
    depends_on:
      - api
    volumes:
      - ./apps/dashboard:/app
      - /app/node_modules
      - /app/.next

volumes:
  postgres_data:
  redis_data:
```

**Key patterns:**

1. **Two API URLs for Next.js**: `NEXT_PUBLIC_API_URL` (browser, uses `localhost`) vs `API_URL` (server-side, uses Docker internal hostname `api`). This is a common Next.js Docker gotcha.
2. **Exclude `node_modules` and `obj`/`bin`** from bind mounts with anonymous volumes — prevents host artifacts from shadowing container-installed packages.
3. **`appendonly yes` on Redis** — ensures BullMQ job state survives container restarts during development. Without this, all queued jobs are lost on restart.
4. **ARM compatibility**: All images above (`postgres:16-alpine`, `redis:7-alpine`) have official ARM64 builds on Docker Hub, compatible with Oracle Cloud Ampere A1.

### Recommendation

Use the topology above verbatim as the starting point. Add a `docker-compose.override.yml` for any developer-local overrides (e.g., different port mappings) to keep the base file clean for CI and production parity.

### Trade-offs

- Bind mounts with hot-reload work well locally but add filesystem I/O overhead; this is acceptable on a dev machine but should be removed in the production compose file.
- `dotnet watch` inside a container on Windows with bind mounts can have file-change detection issues (inotify). If this becomes a problem, set `DOTNET_USE_POLLING_FILE_WATCHER=true` in the api service environment.

---

## 3. URL Frontier — BullMQ Priority Queue vs Direct Redis ZSET

**Confidence: HIGH** — BullMQ internals and Redis ZSET semantics are well-documented; the trade-offs are clear.

### Finding

**BullMQ priority queue** uses Redis Sorted Sets (ZSET) internally. When you add a job with `{ priority: N }`, BullMQ stores it in a ZSET keyed like `bull:{queue}:priority:{N}`. Workers poll across priority levels, draining higher priorities first. This is built on top of ZSET — you do not get a different data structure, you get BullMQ's job lifecycle management on top of ZSET.

**Direct Redis ZSET** gives you raw control: `ZADD frontier <score> <url>` where score encodes priority. You pop with `ZPOPMIN` (lowest score = highest priority) or `ZRANGEBYSCORE`.

**For a URL Frontier, BullMQ is the correct choice** because:

1. **Job lifecycle tracking** — BullMQ tracks `waiting`, `active`, `completed`, `failed` states. A direct ZSET gives you no visibility into whether a URL is currently being crawled vs waiting vs failed.
2. **Retry with backoff** — failed crawls (rate-limited, network error) retry automatically with configurable backoff. A raw ZSET requires you to implement this yourself.
3. **Concurrency control** — BullMQ workers declare concurrency; BullMQ handles locking so two workers never process the same job. Raw ZSET pop has a race condition unless you use Lua scripts or `ZPOPMIN` atomically.
4. **Persistence and crash recovery** — BullMQ uses Redis transactions and Lua scripts for atomic state transitions; a worker crash returns the job to the queue via `stalledCheck`.

The only scenario where a raw ZSET is better is if you need sub-millisecond enqueue throughput at very high scale and cannot afford BullMQ's per-job overhead. For a personal crawler doing O(hundreds) of jobs per run, this is irrelevant.

**Implementing per-domain politeness with BullMQ:**

BullMQ has a built-in rate limiter at the queue level, but for **per-domain** rate limiting you need per-domain queues or a custom approach:

**Option A — One queue per domain (recommended for this project):**

```typescript
// Create a queue per domain, each with its own rate limiter
function getDomainQueue(domain: string): Queue {
  return new Queue(`crawl:${domain}`, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    }
  });
}

// Worker for a domain queue
function createDomainWorker(domain: string): Worker {
  return new Worker(
    `crawl:${domain}`,
    crawlProcessor,
    {
      connection: redis,
      concurrency: 1,          // one request at a time per domain
      limiter: {
        max: 1,                // 1 job
        duration: 2000         // per 2000ms = 2 second politeness delay
      }
    }
  );
}
```

**Option B — Single queue with job grouping (BullMQ Pro feature):**

BullMQ Pro (paid) has a `group` feature that provides per-group rate limiting within a single queue. Not worth it for a personal project — Option A is free and simple.

**Option C — Custom Redis-based politeness check:**

Before processing each job, check a Redis key `politeness:{domain}` with a TTL of 2 seconds. If key exists, delay job (re-queue with delay). This works but adds complexity and re-queue overhead.

**For a personal crawler with a fixed set of ~20 domains:** Option A (one queue per domain) is cleanest. The queue count is bounded and known. You can pre-create queues at startup from the `sources` table.

**Domain queue discovery pattern:**

```typescript
// At startup, load all active sources and create queues
const sources = await db.query('SELECT DISTINCT domain FROM sources WHERE enabled = true');
const domainQueues = new Map<string, Queue>();
const domainWorkers = new Map<string, Worker>();

for (const { domain } of sources) {
  domainQueues.set(domain, getDomainQueue(domain));
  domainWorkers.set(domain, createDomainWorker(domain));
}

// When a new source is added at runtime, create its queue dynamically
```

### Recommendation

Use **BullMQ with one queue per domain**, each queue having `concurrency: 1` and `limiter: { max: 1, duration: 2000 }`. This maps directly to the ByteByteGo politeness queue model and gives you job lifecycle tracking, retry, and crash recovery for free.

### Trade-offs

- Many queues mean more Redis memory per queue (each queue has its own metadata keys). For 20-50 domains this is negligible (kilobytes), but for a dynamic crawler discovering new domains you would want a different strategy.
- BullMQ's rate limiter is worker-local — if you run multiple crawler instances, each worker gets its own 1-per-2s limit, multiplying the effective rate. For a personal single-instance crawler this is fine; just document the assumption.
- `BULLMQ_STALLED_CHECK_INTERVAL` defaults to 30s — jobs held by a crashed worker return to queue within 30s. Acceptable for this use case.

---

## 4. Strategy Pattern in .NET — IContentParser with DI

**Confidence: HIGH** — ASP.NET Core DI and strategy pattern with keyed services is well-documented up to .NET 8/9.

### Finding

The Strategy Pattern for per-domain parsers has a clean implementation path in .NET using **keyed services**, introduced in .NET 8 (`IKeyedServiceProvider`). Prior to .NET 8, the common approach was a factory or dictionary-based resolver; keyed services eliminate the need for that boilerplate.

**Interface definition:**

```csharp
public interface IContentParser
{
    string SourceType { get; }  // matches sources.source_type in DB
    Task<ParsedContent> ParseAsync(string html, CrawlContext context);
}

public record ParsedContent(
    string Title,
    string? Url,
    DateTimeOffset? PublishedAt,
    JsonDocument Payload  // JSONB-destined flexible data
);
```

**Concrete parsers:**

```csharp
public class GenshinBannerParser : IContentParser
{
    public string SourceType => "genshin_banner";

    public Task<ParsedContent> ParseAsync(string html, CrawlContext context)
    {
        // HtmlAgilityPack or AngleSharp parsing logic
    }
}

public class EplFixtureParser : IContentParser
{
    public string SourceType => "epl_fixture";
    // ...
}
```

**Registration with .NET 8 keyed services:**

```csharp
// Program.cs
builder.Services.AddKeyedScoped<IContentParser, GenshinBannerParser>("genshin_banner");
builder.Services.AddKeyedScoped<IContentParser, EplFixtureParser>("epl_fixture");
builder.Services.AddKeyedScoped<IContentParser, AnimeMangaParser>("anime_manga");
// ... register all parsers
```

**Runtime resolution:**

```csharp
public class ParserService
{
    private readonly IServiceProvider _serviceProvider;

    public ParserService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public IContentParser GetParser(string sourceType)
    {
        var parser = _serviceProvider.GetKeyedService<IContentParser>(sourceType);
        if (parser is null)
            throw new NotSupportedException($"No parser registered for source type '{sourceType}'");
        return parser;
    }
}
```

**Usage in a controller or background service:**

```csharp
public class ParseJobHandler
{
    private readonly ParserService _parserService;

    public async Task HandleAsync(ParseJobMessage message)
    {
        var parser = _parserService.GetParser(message.SourceType);
        var result = await parser.ParseAsync(message.Html, message.Context);
        // persist result...
    }
}
```

**Alternative: Dictionary-based factory (for .NET 6/7 or preference):**

```csharp
// Register all parsers as IEnumerable<IContentParser>
builder.Services.AddScoped<IContentParser, GenshinBannerParser>();
builder.Services.AddScoped<IContentParser, EplFixtureParser>();

// Factory resolves by SourceType property
public class ContentParserFactory
{
    private readonly IEnumerable<IContentParser> _parsers;

    public ContentParserFactory(IEnumerable<IContentParser> parsers)
    {
        _parsers = parsers;
    }

    public IContentParser GetParser(string sourceType) =>
        _parsers.FirstOrDefault(p => p.SourceType == sourceType)
        ?? throw new NotSupportedException(sourceType);
}
```

The keyed services approach (.NET 8+) is cleaner because it avoids scanning all registered parsers at runtime and uses the DI container's own key resolution. The `IEnumerable` approach works fine for small parser counts (< 50) and is compatible with older .NET versions.

**Adding a new parser** requires only: creating the class, registering it in `Program.cs`, and adding the source_type to the `sources` table. No other code changes.

### Recommendation

Use **.NET 8 keyed services** (`AddKeyedScoped`) for parser registration and `IServiceProvider.GetKeyedService<IContentParser>(sourceType)` for resolution. This is the idiomatic approach as of .NET 8+ and avoids the factory/dictionary boilerplate.

### Trade-offs

- Keyed services are `.NET 8+` only. If you ever need to run on .NET 6/7 LTS, fall back to the `IEnumerable` factory pattern.
- `GetKeyedService` returns `null` for unknown keys (not throws) — you must add a null guard. `GetRequiredKeyedService` throws `InvalidOperationException` instead, which may be preferable for fail-fast behavior.
- Parser registration in `Program.cs` is manual — adding a new domain requires a code change and redeploy. This is acceptable for a personal project. A plugin-discovery approach (scan assemblies for `IContentParser` implementations) is possible but adds complexity without clear value here.

---

## 5. Cross-Service Contract — Node.js Crawler + .NET API Sharing PostgreSQL

**Confidence: HIGH** — This is a fundamental distributed systems design question with well-established patterns.

### Finding

Two services sharing a PostgreSQL database creates an implicit coupling contract. The question is where to place the boundary:

| Approach | How it works | Coupling type |
|----------|--------------|---------------|
| **A: Shared DB, direct writes from both** | Crawler writes `crawl_jobs` + raw HTML; API writes `data_entries` + notifications | Schema coupling, race conditions possible |
| **B: Queue-based handoff** | Crawler writes `crawl_jobs` + publishes to BullMQ; .NET consumes queue, parses, writes `data_entries` | Behavioral coupling only; schema changes isolated |
| **C: API-mediated writes** | Crawler calls .NET API endpoints to persist everything | HTTP coupling; API becomes bottleneck |

**Analysis for this project:**

Option C (API-mediated writes) is the worst choice for a crawler: it adds HTTP latency to every crawl operation, makes the API a bottleneck, and creates availability coupling (crawler stops working if API is down).

Option A (shared DB, direct writes from both) is pragmatic for a personal project but carries risk: if the `crawl_jobs` or `data_entries` schema changes, you must update both services simultaneously. For a single developer this is manageable, but it's easy to forget and causes subtle bugs.

**Option B (queue-based handoff) is the correct architecture for this system** and aligns with how the system is already designed: the crawler is the producer, .NET is the consumer. Specifically:

```
Crawler (Node.js)
  → fetches HTML
  → writes crawl_jobs (status: 'fetched') to PostgreSQL
  → publishes ParseJob { crawl_job_id, source_type, html, url } to BullMQ queue "parse"

.NET API / Background Service
  → consumes "parse" queue via BullMQ (or polls crawl_jobs table)
  → runs IContentParser.ParseAsync
  → writes data_entries to PostgreSQL
  → updates crawl_jobs (status: 'completed' | 'failed')
  → evaluates alert rules → sends notifications
```

However, there is a practical nuance: **.NET does not have a native BullMQ client**. BullMQ is a Node.js library. Options for .NET to consume BullMQ queues:

1. **Direct Redis protocol** — .NET reads from the same Redis lists/sorted sets that BullMQ uses. This is fragile; BullMQ's internal data structure is undocumented and has changed across versions.
2. **Separate "parse" microservice in Node.js** — a second Node.js worker consumes the parse queue and calls .NET via HTTP for parsing. Adds a service boundary.
3. **Crawler pushes to a PostgreSQL table as queue (outbox pattern)** — crawler writes completed fetches to a `parse_queue` table; .NET polls that table. Simple, no Redis dependency for the .NET side.
4. **Use a language-agnostic queue** — replace BullMQ with a queue that has first-class .NET support: RabbitMQ (AMQP), or a Redis-based protocol like RESP3 streams that both sides understand natively.

**For this specific project**, the simplest correct approach is the **PostgreSQL outbox pattern**:

```
Crawler:
  1. Fetch HTML
  2. INSERT INTO crawl_jobs (source_id, status='fetched', raw_content=..., fetched_at=now())
  3. NOTIFY parse_ready  ← PostgreSQL LISTEN/NOTIFY for low-latency signaling

.NET background service (IHostedService):
  1. LISTEN on parse_ready channel (Npgsql supports this natively)
  2. On notification: SELECT crawl_jobs WHERE status='fetched' ORDER BY fetched_at LIMIT 10
  3. Parse + write data_entries
  4. UPDATE crawl_jobs SET status='completed'
```

This keeps BullMQ as the URL Frontier (what it is good at), uses PostgreSQL for the crawler→parser handoff (eliminating the .NET/BullMQ compatibility problem), and PostgreSQL LISTEN/NOTIFY provides near-real-time signaling without polling overhead.

**Ownership boundaries on the schema:**

| Table | Writer | Reader |
|-------|--------|--------|
| `sources` | .NET API | Crawler (reads config), .NET |
| `crawl_jobs` | Crawler (insert + status=fetched), .NET (update status=completed/failed) | Both |
| `data_entries` | .NET | .NET API (queries), Dashboard |
| `alert_rules` | .NET API | .NET (alert engine) |
| `notification_logs` | .NET | .NET API |

The only shared write table is `crawl_jobs`, and the write ownership is disjoint by column: crawler writes the row and initial status, .NET updates the status. This minimizes conflict potential.

**Entity Framework Core migrations** remain owned exclusively by the .NET project — the crawler never runs migrations, only reads/writes data. The crawler should use a lightweight query library (e.g., `pg` or `postgres.js`) without schema management responsibilities.

### Recommendation

Use the **PostgreSQL outbox pattern** for the crawler→parser handoff: crawler inserts into `crawl_jobs` with `status='fetched'`, signals via `NOTIFY`; .NET listens via Npgsql's `LISTEN/NOTIFY` support and processes the parse queue. Keep BullMQ for the URL Frontier (its strength). Never let the .NET service touch BullMQ internals directly.

### Trade-offs

- The outbox pattern adds one round-trip through PostgreSQL vs direct queue message, but for a personal crawler this latency (< 5ms) is irrelevant.
- LISTEN/NOTIFY does not persist across connection drops — if the .NET service is restarted, it misses any NOTIFY events that occurred during downtime. Mitigate with a startup poll: on startup, query all `status='fetched'` rows before entering listen mode.
- This couples the parse throughput to PostgreSQL write capacity, which is a non-issue for O(hundreds) of jobs per day but worth noting.
- EF Core migration ownership in .NET means the crawler service must wait for the API to run migrations on startup. Sequence: `postgres` healthy → `api` runs `dotnet ef database update` → `crawler` starts. Enforce this in Docker Compose `depends_on`.

---

## Component Boundary Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Redis                            │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ BullMQ Frontier │    │   DNS Cache (hash)      │ │
│  │ per-domain Qs   │    │   Bloom Filter state    │ │
│  └────────┬────────┘    └─────────────────────────┘ │
└───────────│─────────────────────────────────────────┘
            │ dequeue URL
            ▼
┌───────────────────────┐
│   Crawler (Node.js)   │
│  ┌──────────────────┐ │
│  │  Cheerio Worker  │ │  → static pages
│  │  Playwright Worker│ │  → JS-rendered pages
│  └──────────────────┘ │
│  Bloom Filter check   │
│  Content hash check   │
└───────────┬───────────┘
            │ INSERT crawl_jobs (status=fetched)
            │ NOTIFY parse_ready
            ▼
┌─────────────────────────────────────────────────────┐
│                  PostgreSQL                         │
│  sources | crawl_jobs | data_entries                │
│  alert_rules | notification_logs                    │
└───────────┬─────────────────────────────────────────┘
            │ LISTEN parse_ready
            ▼
┌───────────────────────────────────────────────────┐
│           .NET API (ASP.NET Core)                 │
│  ┌──────────────────┐   ┌──────────────────────┐  │
│  │  IContentParser  │   │   Alert Rule Engine  │  │
│  │  (Strategy DI)   │   │   Notification Svc   │  │
│  └──────────────────┘   └──────────────────────┘  │
│  REST API → dashboard                              │
│  SignalR → real-time updates                       │
└───────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────┐     ┌─────────────────────┐
│  Next.js Dashboard    │     │  Telegram / Discord │
│  (Vercel free tier)   │     │  Webhooks           │
└───────────────────────┘     └─────────────────────┘
```

---

## Sources

- Training data: Turborepo docs, BullMQ docs (v4/v5), ASP.NET Core .NET 8 DI docs, Docker Compose v2 spec, PostgreSQL LISTEN/NOTIFY documentation
- **Confidence caveat:** All findings based on training data (cutoff Aug 2025). Verify BullMQ rate limiter API signature, .NET keyed services API (`AddKeyedScoped`), and Docker Compose health check syntax against current official docs before implementation.
- ByteByteGo "Design a Web Crawler" (Alex Xu, System Design Interview Vol.1) — referenced for URL Frontier pattern alignment
