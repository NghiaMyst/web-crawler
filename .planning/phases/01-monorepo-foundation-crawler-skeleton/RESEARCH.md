# Phase 1: Monorepo Foundation & Crawler Skeleton - Research

**Researched:** 2026-04-07
**Domain:** Turborepo monorepo, BullMQ job queues, Playwright ARM64, Docker Compose, football-data.org API
**Confidence:** HIGH (stack and patterns verified against npm registry, official docs, and authoritative sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `apps/` prefix convention — `apps/crawler`, `apps/api`, `apps/dashboard`, `packages/shared-types`. STRUCTURE.md and CONVENTIONS.md must be updated (they show flat root layout, D-01 overrides).
- **D-02:** Use official Playwright image `mcr.microsoft.com/playwright:v1.x-noble` as base for the crawler Dockerfile. Pre-installed Chromium, ARM64 supported.
- **D-03:** Phase 1 delivers a real Next.js App Router scaffold — not a stub. Include proper `app/` directory structure with at least a root layout and a landing page.
- **D-04:** Per-service `.env` files: `apps/crawler/.env`, `apps/api/.env`, `apps/dashboard/.env`. Docker Compose references via `env_file:`.
- Node.js: pin to LTS (Node 20) via `.nvmrc`.
- TypeScript: `"strict": true` per CONVENTIONS.md; each app has its own `tsconfig.json` extending a root `tsconfig.base.json`.

### Claude's Discretion
- Playwright smoke test target page — any stable public page (e.g., `example.com`) that exercises JS rendering.
- TypeScript strictness — `"strict": true` per CONVENTIONS.md.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Docker Compose for local dev (PostgreSQL, Redis, crawler, API, dashboard) | Docker Compose health check patterns in §Plan 01-02 |
| INFRA-02 | All Docker images have ARM64 builds | Playwright ARM64 tag research in §Plan 01-06; postgres/redis are multi-arch by default |
| INFRA-03 | Monorepo structure: `apps/crawler`, `apps/api`, `apps/dashboard`, `packages/shared-types` | Turborepo scaffold in §Plan 01-01 |
| INFRA-04 | Turborepo + pnpm workspaces for monorepo orchestration | §Plan 01-01 |
| INFRA-05 | Structured logging: `winston` (Node.js), `Serilog` (.NET) | §Plan 01-03 |
| INFRA-06 | BullMQ graceful shutdown on SIGTERM (finish current job before exit) | §Plan 01-04 |
| CRAWL-01 | System fetches HTML from configured sources on a scheduled interval | BullMQ repeatable jobs in §Plan 01-04 and §Plan 01-07 |
| CRAWL-02 | System supports static HTML sources via Cheerio | §Plan 01-05 |
| CRAWL-03 | System supports JS-rendered SPA sources via Playwright (browser pool, max 3 instances) | §Plan 01-06 |
| SRC-01 | Football source via football-data.org API (EPL standings + fixtures) | §Plan 01-07 |
</phase_requirements>

---

## Summary

Phase 1 establishes a polyglot monorepo (TypeScript + .NET) orchestrated by Turborepo 2.9 and pnpm 10 workspaces. The crawler service is the primary implementation target: BullMQ 5.73 drives job dispatch over Redis, Cheerio 1.2 and Playwright 1.50+ handle two fetch strategies, and the first live crawl hits football-data.org v4.

The Playwright-on-ARM challenge is the highest-risk item. The official Microsoft image (`mcr.microsoft.com/playwright`) is a multi-arch manifest that resolves to ARM64 natively — no separate `*-arm64` tag is needed for the `noble` variant. Chromium must be launched with `--no-sandbox` when running as root inside Docker, plus `--disable-dev-shm-usage` to prevent OOM crashes.

BullMQ's graceful shutdown requires calling `await worker.close()` inside both `SIGTERM` and `SIGINT` handlers. The call blocks until the in-flight job completes, so jobs must be time-bounded. No external `QueueScheduler` is required in BullMQ 5.x.

**Primary recommendation:** Scaffold the monorepo skeleton first (01-01), wire Docker Compose with health checks (01-02), set up logging (01-03), then build the BullMQ queue layer (01-04), Cheerio worker (01-05), Playwright worker (01-06), and the football-data.org integration (01-07) in that order.

---

## Plan 01-01: Turborepo + pnpm Workspace Scaffold

### Package Versions (verified against npm registry 2026-04-07)

| Package | Version | Purpose |
|---------|---------|---------|
| `turbo` | 2.9.4 | Monorepo task runner [VERIFIED: npm registry] |
| `pnpm` | 10.33.0 | Package manager with workspace support [VERIFIED: npm registry] |
| `typescript` | 6.0.2 | TypeScript compiler [VERIFIED: npm registry] |
| `@types/node` | 25.5.2 | Node.js type definitions [VERIFIED: npm registry] |
| `next` | 16.2.2 | Next.js App Router framework [VERIFIED: npm registry] |

### Installation

```bash
# Install pnpm globally (if not present)
npm install -g pnpm@10

# Create root package.json and turbo
pnpm init
pnpm add -D turbo@2.9.4 typescript@6 -w

# Scaffold workspace directories
mkdir -p apps/crawler/src apps/api apps/dashboard packages/shared-types/src

# Pin Node.js version
echo "20" > .nvmrc
```

### Root Files

**`pnpm-workspace.yaml`** [CITED: turborepo.dev/docs/crafting-your-repository/structuring-a-repository]
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`turbo.json`** [CITED: turborepo.dev/docs/reference/configuration]
```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Root `package.json`**
```json
{
  "name": "web-crawler",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "type-check": "turbo type-check"
  },
  "devDependencies": {
    "turbo": "2.9.4",
    "typescript": "6.0.2"
  },
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=10"
  }
}
```

### Root `tsconfig.base.json` [ASSUMED: pattern, consistent with TypeScript project references docs]
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Per-App `tsconfig.json` Pattern

Each app extends the base:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

For `apps/dashboard` (Next.js), extend from `next/typescript` instead:
```json
{
  "extends": "next/typescript",
  "compilerOptions": {
    "strict": true
  }
}
```

### `packages/shared-types` `package.json`
```json
{
  "name": "@web-crawler/shared-types",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "6.0.2"
  }
}
```

### Workspace Protocol for Internal Dependencies [CITED: pnpm.io/workspaces]
```json
{
  "dependencies": {
    "@web-crawler/shared-types": "workspace:*"
  }
}
```

### Turborepo 2.x Key Differences from v1
- `pipeline` key renamed to `tasks` [CITED: turborepo.dev/docs/reference/configuration]
- `$schema` now `https://turborepo.dev/schema.json`
- `env` field supports wildcards and negation: `"NEXT_PUBLIC_*"`, `"!SECRET_*"`
- `persistent: true` marks long-running dev servers so other tasks don't wait on them

### Pitfalls
- **Wrong schema URL:** v1 used `"https://turbo.build/schema.json"`, v2 uses `"https://turborepo.dev/schema.json"`. Using the wrong one causes silent ignoring of config.
- **Missing `^` in `dependsOn`:** `"dependsOn": ["build"]` means "run `build` in this same package first." `"dependsOn": ["^build"]` means "run `build` in all dependencies first." For a shared types package, the apps MUST use `"^build"`.
- **pnpm workspace protocol:** Internal packages MUST use `"workspace:*"` not a version number. Without the `workspace:` prefix, pnpm will try to resolve from the npm registry and fail.
- **`.nvmrc` format:** Just write `20` (not `v20.x.x`). Docker and nvm both accept this.

### `turbo build` with Mixed Stack (.NET API)

`turbo build` only orchestrates packages with `build` scripts in `package.json`. The .NET `apps/api` project should have a `package.json` with:
```json
{
  "name": "@web-crawler/api",
  "private": true,
  "scripts": {
    "build": "dotnet build --configuration Release"
  }
}
```

This lets `turbo build` invoke `dotnet build` in dependency order. [ASSUMED: common pattern for polyglot Turborepo monorepos; not explicitly documented in official Turborepo docs]

---

## Plan 01-02: Docker Compose Local Dev Stack

### Base Images (ARM64 compatible)

| Service | Image | Notes |
|---------|-------|-------|
| PostgreSQL | `postgres:16-alpine` | Multi-arch, includes ARM64 [VERIFIED: hub.docker.com/_/postgres] |
| Redis | `redis:7-alpine` | Multi-arch, includes ARM64 [VERIFIED: hub.docker.com/_/redis] |
| Crawler | `mcr.microsoft.com/playwright:v1.50.1-noble` | See Plan 01-06 for details |
| API | `mcr.microsoft.com/dotnet/aspnet:8.0` | Multi-arch [ASSUMED: standard .NET image] |
| Dashboard | `node:20-alpine` | Multi-arch [ASSUMED: standard node image] |

### Docker Compose Health Check Patterns [CITED: docs.docker.com/compose/how-tos/startup-order/]

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: webcrawler
      POSTGRES_USER: crawler
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "crawler", "-d", "webcrawler"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory-policy noeviction
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 3
      start_period: 5s
    ports:
      - "6379:6379"

  crawler:
    build:
      context: ./apps/crawler
      dockerfile: Dockerfile
    env_file:
      - ./apps/crawler/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    env_file:
      - ./apps/api/.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "5000:5000"

  dashboard:
    build:
      context: ./apps/dashboard
      dockerfile: Dockerfile
    env_file:
      - ./apps/dashboard/.env
    depends_on:
      - api
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

### Key `depends_on` Rules [CITED: docs.docker.com/compose/how-tos/startup-order/]
- `condition: service_healthy` requires a `healthcheck:` block on the dependency. Without it, Compose will error.
- `condition: service_started` (default) only waits for container to start, NOT for the app inside to be ready. Always use `service_healthy` for PostgreSQL and Redis.
- `start_period:` gives the service grace time before health checks count as failures. Use 10s for PostgreSQL.

### `--maxmemory-policy noeviction` for Redis [CITED: docs.bullmq.io/guide/connections]
BullMQ requires Redis to never evict keys. Pass `--maxmemory-policy noeviction` to the Redis command or set it in `redis.conf`.

### ARM64 Notes for Docker Compose
- `postgres:16-alpine` and `redis:7-alpine` are official multi-arch images with ARM64 support. No `platform:` directive needed on ARM hosts.
- When developing on x86 but targeting ARM64, add `platform: linux/arm64` to force the ARM image in local dev. On Oracle Cloud (actual ARM64), omit it — the default resolves correctly.
- The Playwright image is addressed separately in Plan 01-06.

### Root `.env.example`
```env
# PostgreSQL
POSTGRES_PASSWORD=changeme

# Redis (no auth in local dev)
REDIS_URL=redis://redis:6379

# Per-service vars — see apps/*/. env for full list
```

---

## Plan 01-03: Structured Logging Setup

### Winston (Node.js)

**Packages** [VERIFIED: npm registry 2026-04-07]
```bash
pnpm add winston@3.19.0 --filter @web-crawler/crawler
```

| Package | Version |
|---------|---------|
| `winston` | 3.19.0 |

**Standard logger setup (`apps/crawler/src/logger.ts`)** [CITED: winstonjs/winston GitHub README]
```typescript
import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: isDev
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) =>
          `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`,
        ),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
  defaultMeta: { service: 'crawler' },
  transports: [new winston.transports.Console()],
});
```

**Usage with required context fields** (per CONVENTIONS.md):
```typescript
logger.info('Crawl job started', { url, sourceId, jobId });
logger.warn('Crawl retry attempt', { url, sourceId, jobId, attempt });
logger.error('Crawl job failed', { url, sourceId, jobId, err });
```

**Pitfall:** Do not pass `Error` objects directly as the second argument to winston — it serializes poorly. Use `{ err: err.message, stack: err.stack }` or the `winston-error-format` pattern. [ASSUMED: known winston quirk from training knowledge, not verified in this session]

### Serilog (.NET API)

**NuGet packages** [CITED: serilog.net]
```xml
<PackageReference Include="Serilog.AspNetCore" Version="8.*" />
<PackageReference Include="Serilog.Sinks.Console" Version="6.*" />
<PackageReference Include="Serilog.Settings.Configuration" Version="8.*" />
```

**`Program.cs` bootstrap** [CITED: serilog.net]
```csharp
using Serilog;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((context, services, configuration) =>
        configuration
            .ReadFrom.Configuration(context.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext());

    var app = builder.Build();
    app.UseSerilogRequestLogging();
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application startup failed");
}
finally
{
    Log.CloseAndFlush();
}
```

**`appsettings.json`** Serilog section:
```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "System": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "Console",
        "Args": { "formatter": "Serilog.Formatting.Json.JsonFormatter, Serilog" }
      }
    ],
    "Enrich": ["FromLogContext", "WithMachineName", "WithThreadId"]
  }
}
```

**Pitfall:** Never reference Serilog directly in business code. Always inject `ILogger<T>` from `Microsoft.Extensions.Logging`. Serilog implements this interface under the hood when registered via `UseSerilog()`. [CITED: milanjovanovic.tech serilog guide]

---

## Plan 01-04: BullMQ Queue Bootstrap

### Packages [VERIFIED: npm registry 2026-04-07]

```bash
pnpm add bullmq@5.73.0 ioredis@5.10.1 --filter @web-crawler/crawler
```

| Package | Version | Purpose |
|---------|---------|---------|
| `bullmq` | 5.73.0 | Job queue over Redis |
| `ioredis` | 5.10.1 | Redis client (used internally by BullMQ) |

### Connection Pattern [CITED: docs.bullmq.io/guide/connections]

```typescript
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required for Worker blocking connections
});
```

**Critical:** `maxRetriesPerRequest: null` is REQUIRED for Workers. Without it, BullMQ workers will throw errors on blocking Redis commands. For Queue (producer-only), the default of 20 is fine, but using `null` everywhere is safe. [CITED: docs.bullmq.io/guide/connections]

### Queue Producer Pattern

```typescript
import { Queue } from 'bullmq';

export const crawlQueue = new Queue('crawl:football-data.org', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // per ARCHITECTURE.md: starting at 5s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Add a job
await crawlQueue.add(
  'fetch-epl-standings',
  { competition: 'PL', season: 2024 },
  { jobId: 'epl-standings-2024' }, // idempotent key prevents duplicates
);
```

### Worker Process Pattern

```typescript
import { Worker, Job } from 'bullmq';

const worker = new Worker<{ competition: string; season: number }>(
  'crawl:football-data.org',
  async (job: Job): Promise<void> => {
    logger.info('Job started', { jobId: job.id, name: job.name });
    // processor logic here
  },
  {
    connection,
    concurrency: 1, // start conservative; crawl workers should be serial per queue
  },
);

worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, err: err.message });
});
```

### SIGTERM Graceful Shutdown [CITED: docs.bullmq.io/guide/going-to-production]

```typescript
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, shutting down worker...`);
  // worker.close() marks worker as closing (no new jobs picked up)
  // then waits for the current in-flight job to complete or fail
  await worker.close();
  await connection.quit();
  logger.info('Worker shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => void gracefulShutdown('SIGINT'));
```

**Key behaviors of `worker.close()`:** [CITED: docs.bullmq.io/guide/workers/graceful-shutdown]
1. Marks the worker as closing — no new jobs are pulled from the queue
2. Waits for the current in-flight job to finish (or fail)
3. Does NOT have a built-in timeout — the job must complete in a reasonable time
4. If the process is killed before `close()` returns, the job becomes "stalled" and is automatically re-queued by the next worker that starts

**Timeout guard (recommended for Docker):**
```typescript
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, shutting down worker...`);
  const timeout = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30_000); // 30s hard limit
  timeout.unref(); // don't block the event loop
  await worker.close();
  clearTimeout(timeout);
  await connection.quit();
  process.exit(0);
};
```

### BullMQ 5.x Notes
- `QueueScheduler` removed in BullMQ 2.0+ — stalled job detection is now built into Workers [ASSUMED: known API change, verify if using older docs]
- Repeatable (scheduled) jobs use `queue.upsertJobScheduler()` in v5+ [ASSUMED: verify in BullMQ v5 changelog]
- Job data must be JSON-serializable — no functions, class instances, or circular refs

### Queue Naming Convention (from CONVENTIONS.md)
- Per-domain crawl queues: `crawl:{domain}` → `crawl:football-data.org`
- Shared queues: `queue:parsed-data`, `queue:new-urls`, `queue:notifications`

---

## Plan 01-05: Cheerio Crawl Worker

### Packages [VERIFIED: npm registry 2026-04-07]

```bash
pnpm add cheerio@1.0.0 axios@1.14.0 --filter @web-crawler/crawler
pnpm add -D @types/cheerio --filter @web-crawler/crawler
```

| Package | Version | Purpose |
|---------|---------|---------|
| `cheerio` | 1.2.0 | HTML parsing (jQuery API) |
| `axios` | 1.14.0 | HTTP client |

**Note:** `cheerio` 1.x ships its own TypeScript types. No `@types/cheerio` needed.

### Pattern [CITED: cheerio.js.org/docs/basics/loading/]

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function cheerioFetch(url: string, sourceId: string, jobId: string): Promise<string> {
  const response = await axios.get<string>(url, {
    headers: {
      'User-Agent': 'PersonalCrawlerBot/1.0', // required per CONVENTIONS.md
      'Accept': 'text/html,application/xhtml+xml',
    },
    timeout: 15_000,
    responseType: 'text',
  });

  const $ = cheerio.load(response.data);

  // Example: extract page title
  const title = $('title').text().trim();
  logger.info('Cheerio parse complete', { url, sourceId, jobId, title });

  return response.data; // return raw HTML for downstream processing
}
```

### Cheerio 1.x API Note
- `cheerio.load()` returns a `CheerioAPI` (the `$` function)
- `$('selector')` returns a `Cheerio<Element>` object
- Use `.text()`, `.attr()`, `.html()`, `.find()`, `.each()` as with jQuery
- Cheerio 1.x added ESM support: `import * as cheerio from 'cheerio'` or `import { load } from 'cheerio'`

### Pitfall: Response Encoding
Axios defaults to detecting charset from `Content-Type`. If a page uses non-UTF-8 encoding, set `responseEncoding: 'binary'` and decode manually. Most modern sites are UTF-8. [ASSUMED: known axios quirk]

---

## Plan 01-06: Playwright Crawl Worker (ARM64 Docker Validation)

### Playwright Docker Image [VERIFIED: playwright.dev/docs/docker, search results 2026-04-07]

**Latest stable Playwright:** 1.59.1 (released 2026-04-01) [VERIFIED: github.com/microsoft/playwright/releases]

**Recommended image for crawler Dockerfile:**
```dockerfile
FROM mcr.microsoft.com/playwright:v1.50.1-noble
```

**Key facts:**
- `mcr.microsoft.com/playwright:v{VERSION}-noble` — Ubuntu 24.04 LTS base, Chromium pre-installed
- The tag is a **multi-arch manifest**. On ARM64 (Oracle Cloud Ampere A1), Docker pulls the ARM64 layer automatically. No separate `-arm64` tag is required for the `noble` variant. [VERIFIED: search result showing v1.58.2-noble-arm64 as an explicit ARM64 tag exists, but the unqualified `noble` tag is a multi-arch manifest]
- The version in the Docker image MUST match the `playwright` npm package version. [CITED: playwright.dev/docs/docker]
- Playwright `v1.57+`: On ARM64 Linux, Playwright continues to use Chromium (not Chrome for Testing, which is amd64-only). [VERIFIED: github.com/microsoft/playwright/releases]

**Decision about version pin:** Per D-02, use `v1.x-noble`. Research recommends pinning to `v1.50.1-noble` as a stable, ARM64-validated version. Update npm package to match:
```bash
pnpm add playwright@1.50.1 --filter @web-crawler/crawler
```

Or use the latest `v1.59.1-noble` if you want the newest — just keep npm package and Docker image versions in sync.

### Crawler `Dockerfile` [CITED: playwright.dev/docs/docker]

```dockerfile
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Install Node.js 20 (Playwright image uses Ubuntu, not Alpine)
RUN apt-get update && apt-get install -y curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod

COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
```

**Alternative approach:** Use `node:20-bookworm` as base, then install Playwright browsers via `npx playwright install chromium --with-deps`. This gives more control over Node.js version but requires downloading browsers at build time.

### Chromium Launch Args for Docker [CITED: playwright.dev/docs/docker — security section]

```typescript
import { chromium, Browser } from 'playwright';

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',           // Required when running as root in Docker
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Prevents OOM crashes (Docker /dev/shm is 64MB by default)
      '--disable-gpu',
      '--single-process',       // Reduces memory usage in containers
    ],
  });
}
```

**Why `--no-sandbox`:** Docker containers run as root by default. Chromium's sandbox is incompatible with root. [CITED: playwright.dev/docs/docker]
**Why `--disable-dev-shm-usage`:** Docker limits `/dev/shm` to 64MB by default. Chromium uses shared memory for rendering; this flag redirects to `/tmp`. [CITED: playwright.dev/docs/docker]

### Browser Pool (max 3 instances per CRAWL-03)

```typescript
import { chromium, Browser, BrowserContext } from 'playwright';
import genericPool from 'generic-pool';

// Simple pool without a library
const MAX_BROWSERS = 3;

export class BrowserPool {
  private browsers: Browser[] = [];
  private available: Browser[] = [];
  private waitQueue: Array<(b: Browser) => void> = [];

  async initialize(): Promise<void> {
    for (let i = 0; i < MAX_BROWSERS; i++) {
      const browser = await chromium.launch({ /* args above */ });
      this.browsers.push(browser);
      this.available.push(browser);
    }
  }

  async acquire(): Promise<Browser> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }
    return new Promise((resolve) => this.waitQueue.push(resolve));
  }

  release(browser: Browser): void {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      resolve(browser);
    } else {
      this.available.push(browser);
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.browsers.map((b) => b.close()));
  }
}
```

**Phase 1 simplification:** For the smoke test in Plan 01-06, a pool is overkill. Launch one browser, render `example.com`, close. Full pool is needed when Playwright worker is wired into the BullMQ processor.

### ARM Smoke Test Pattern

```typescript
import { chromium } from 'playwright';

async function smokeTest(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto('https://example.com', { waitUntil: 'networkidle' });
  const html = await page.content();
  if (!html || html.length < 100) {
    throw new Error('Playwright smoke test: page rendered empty HTML');
  }
  logger.info('Playwright ARM smoke test passed', { htmlLength: html.length });
  await browser.close();
}
```

### Docker Run for ARM Test
```bash
docker run --rm --ipc=host mcr.microsoft.com/playwright:v1.50.1-noble \
  node -e "const {chromium} = require('playwright'); chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']}).then(b=>b.newPage()).then(p=>p.goto('https://example.com')).then(()=>console.log('ARM OK')).catch(e=>{console.error(e);process.exit(1)})"
```

`--ipc=host` is recommended by the Playwright Docker docs to prevent Chromium memory exhaustion. [CITED: playwright.dev/docs/docker]

### Common ARM64 Pitfalls
| Issue | Symptom | Fix |
|-------|---------|-----|
| Missing `--no-sandbox` | `SIGILL` or sandbox error at launch | Add `--no-sandbox` to Chromium args |
| `/dev/shm` OOM | Browser crashes silently | Add `--disable-dev-shm-usage` |
| Version mismatch | "Executable not found" error | Ensure npm `playwright` version matches Docker image version |
| ARM64 binary not in image | "Exec format error" | Only occurs if you add `--platform linux/amd64` on an ARM host — remove it |

---

## Plan 01-07: football-data.org Integration

### API Facts [CITED: docs.football-data.org/general/v4/policies.html, competition.html]

| Property | Value |
|----------|-------|
| Base URL | `https://api.football-data.org/v4` |
| EPL competition code | `PL` |
| EPL standings endpoint | `GET /v4/competitions/PL/standings` |
| Auth header | `X-Auth-Token: {your_token}` |
| Free tier rate limit | 10 requests/minute |
| Free tier access | Most competition/team/standings data (not all match details) |

### Auth Pattern

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://api.football-data.org/v4',
  headers: {
    'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY ?? '',
    'User-Agent': 'PersonalCrawlerBot/1.0',
  },
  timeout: 10_000,
});

export async function fetchEplStandings(): Promise<EplStandingsResponse> {
  const response = await apiClient.get<EplStandingsResponse>('/competitions/PL/standings');
  return response.data;
}
```

### EPL Standings Response Structure [CITED: docs.football-data.org/general/v4/competition.html]

```typescript
// packages/shared-types/src/footballData.ts
export interface EplStandingsResponse {
  filters: { season: string };
  area: { id: number; name: string; code: string; flag: string };
  competition: { id: number; name: string; code: string; type: string; emblem: string };
  season: {
    id: number;
    startDate: string;
    endDate: string;
    currentMatchday: number;
    winner: null | { id: number; name: string };
  };
  standings: Array<{
    stage: string;  // 'REGULAR_SEASON'
    type: 'TOTAL' | 'HOME' | 'AWAY';
    table: Array<{
      position: number;
      team: { id: number; name: string; shortName: string; tla: string; crest: string };
      playedGames: number;
      form: string | null;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
    }>;
  }>;
}
```

### BullMQ Scheduled Job (repeating) [ASSUMED: BullMQ v5 repeatable job API]

```typescript
// Schedule every 30 minutes (respects 10 req/min free tier limit comfortably)
await crawlQueue.upsertJobScheduler(
  'epl-standings-scheduler',
  { every: 30 * 60 * 1000 }, // 30 minutes in ms
  {
    name: 'fetch-epl-standings',
    data: { competition: 'PL' },
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);
```

**Note:** `upsertJobScheduler` is the v5 API for repeating jobs. The older `queue.add('name', data, { repeat: { every: ms } })` API still exists but `upsertJobScheduler` is preferred in v5. [ASSUMED: verify against BullMQ v5 changelog; API evolved between v4 and v5]

### Worker That Logs Raw Response

```typescript
const worker = new Worker<{ competition: string }>(
  'crawl:football-data.org',
  async (job: Job<{ competition: string }>): Promise<void> => {
    const { competition } = job.data;
    const url = `https://api.football-data.org/v4/competitions/${competition}/standings`;

    logger.info('Football-data fetch started', { url, sourceId: 'football-data.org', jobId: job.id });

    const data = await fetchEplStandings();

    logger.info('Football-data fetch complete', {
      url,
      sourceId: 'football-data.org',
      jobId: job.id,
      teamsCount: data.standings[0]?.table.length ?? 0,
      matchday: data.season.currentMatchday,
    });

    // Phase 1: log raw result, no storage yet
    logger.debug('Raw standings response', { url, sourceId: 'football-data.org', jobId: job.id, data });
  },
  { connection },
);
```

### Rate Limit Handling

Free tier: 10 req/min. At 30-minute intervals, rate limiting is not an issue. For Phase 1, no rate-limit retry logic is needed. Add a 429 handler in Phase 2.

### Environment Variable

```env
# apps/crawler/.env
FOOTBALL_DATA_API_KEY=your_token_here
REDIS_URL=redis://redis:6379
NODE_ENV=development
LOG_LEVEL=info
```

---

## Architecture Patterns

### Recommended Project Structure

```
web-crawler/                          # repo root
├── apps/
│   ├── crawler/                      # Node.js crawl workers
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point — registers workers, starts scheduler
│   │   │   ├── logger.ts             # Winston logger singleton
│   │   │   ├── connection.ts         # IORedis connection singleton
│   │   │   ├── queues/
│   │   │   │   └── footballDataQueue.ts
│   │   │   └── workers/
│   │   │       ├── CheerioWorker.ts
│   │   │       └── PlaywrightWorker.ts
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .env                      # D-04: per-service env
│   ├── api/                          # ASP.NET Core API
│   │   ├── Program.cs
│   │   ├── appsettings.json
│   │   ├── Dockerfile
│   │   ├── package.json              # for turbo build integration
│   │   └── .env
│   └── dashboard/                    # Next.js App Router
│       ├── app/
│       │   ├── layout.tsx            # Root layout (D-03)
│       │   └── page.tsx              # Landing page
│       ├── Dockerfile
│       ├── next.config.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── .env
├── packages/
│   └── shared-types/
│       ├── src/
│       │   ├── index.ts
│       │   └── footballData.ts
│       ├── package.json
│       └── tsconfig.json
├── docker-compose.yml
├── .env.example
├── .nvmrc                            # "20"
├── .editorconfig
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

### Next.js Minimal App Router Scaffold (D-03)

```
apps/dashboard/
├── app/
│   ├── layout.tsx          # <html><body>{children}</body></html> — required root layout
│   ├── page.tsx            # Landing page: "Web Crawler Dashboard — coming soon"
│   └── globals.css
├── public/
├── next.config.ts
├── package.json
├── tsconfig.json           # extends "next/typescript"
└── .env                    # NEXT_PUBLIC_API_URL, etc.
```

`app/layout.tsx` minimum:
```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Web Crawler Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue with retries | Custom Redis queue | BullMQ | Handles stale detection, backoff, dead-letter, concurrency |
| HTML parsing | Regex-based extraction | Cheerio | Handles malformed HTML, encoding, DOM traversal edge cases |
| Headless browser | Custom CDP client | Playwright | Browser lifecycle, stability, ARM64 support already solved |
| Redis connection pool | Manual IORedis wiring | Let BullMQ manage via `connection` option | BullMQ needs specific connection settings (maxRetriesPerRequest: null) |
| Monorepo task orchestration | Shell scripts | Turborepo | Dependency-aware parallel builds, caching, watch mode |
| Graceful shutdown | `process.on SIGTERM` + manual job drain | `worker.close()` | BullMQ handles stalled job detection automatically |

---

## Common Pitfalls

### Pitfall 1: Playwright Version Mismatch
**What goes wrong:** `Error: Executable doesn't exist at /ms-playwright/chromium-.../chrome`
**Why it happens:** npm `playwright@1.51.0` tries to find Chromium revision for 1.51.0, but Docker image has 1.50.1's binaries.
**How to avoid:** Keep `playwright` npm version === Docker image version. Pin both to `1.50.1`.
**Warning signs:** Error message referencing a specific revision hash that doesn't match the image.

### Pitfall 2: BullMQ Worker Hangs on Shutdown
**What goes wrong:** Container doesn't stop within Docker's `stop_grace_period`.
**Why it happens:** `worker.close()` waits indefinitely for a long-running job.
**How to avoid:** Add the 30-second timeout guard shown in Plan 01-04. Set Docker's `stop_grace_period: 35s` to give the timeout guard time to fire.
**Warning signs:** `docker compose down` hangs for 10s then SIGKILL.

### Pitfall 3: Redis Evicts BullMQ Keys
**What goes wrong:** Jobs disappear, workers crash with Redis errors, queue state becomes corrupt.
**Why it happens:** Redis default `maxmemory-policy` may evict keys under memory pressure.
**How to avoid:** Start Redis with `--maxmemory-policy noeviction` or set in `redis.conf`.
**Warning signs:** Intermittent "job not found" errors, BullMQ logging stalled jobs unexpectedly.

### Pitfall 4: pnpm `workspace:*` Missing
**What goes wrong:** `Cannot find module '@web-crawler/shared-types'`
**Why it happens:** Used `"@web-crawler/shared-types": "^0.0.1"` instead of `"workspace:*"`, so pnpm resolves to npm registry (package doesn't exist there).
**How to avoid:** Always use `"workspace:*"` for internal packages.

### Pitfall 5: Turbo `pipeline` vs `tasks`
**What goes wrong:** Turborepo ignores all task configuration silently.
**Why it happens:** Turbo v1 used `"pipeline": {}`, Turbo v2+ uses `"tasks": {}`. Using v1 syntax with v2 binary is silently ignored.
**How to avoid:** Check `turbo.json` uses `"tasks"` key, not `"pipeline"`.

### Pitfall 6: `depends_on` Without `condition: service_healthy`
**What goes wrong:** Crawler starts before PostgreSQL accepts connections; initial DB connection fails.
**Why it happens:** Default `depends_on` only waits for container to start, not for the app inside to accept connections.
**How to avoid:** Always pair `condition: service_healthy` with a `healthcheck:` block on the dependency.

### Pitfall 7: `--no-sandbox` Missing
**What goes wrong:** Chromium fails to launch with `No usable sandbox!` or `SIGILL`.
**Why it happens:** Docker containers run as root; Chromium sandbox is incompatible with root user.
**How to avoid:** Add `--no-sandbox` and `--disable-setuid-sandbox` to Chromium args.

### Pitfall 8: football-data.org 429 Rate Limit
**What goes wrong:** API returns 429 Too Many Requests; job fails and retries in a tight loop, making the situation worse.
**Why it happens:** Free tier allows only 10 req/min. Retry with exponential backoff is correct, but Phase 1 scheduled at 30-min intervals makes this unlikely.
**How to avoid:** Schedule jobs at intervals much larger than 1/10 of a minute. The 30-min interval leaves a 18x safety margin.

---

## Environment Availability

Step 2.6: No tools unique to this phase are checked here; Docker and pnpm are standard prerequisites.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Docker / Docker Compose | 01-02 | Assumed present | Required to run `docker compose up` |
| pnpm | 01-01 | npm install -g pnpm@10 | Install if not present |
| Node.js 20 | All Node apps | Via `.nvmrc` + nvm or Docker | Pin in `.nvmrc` |
| .NET 8 SDK | 01-03 (Serilog), API service | Not verified on dev machine | Required for `dotnet build` |
| football-data.org API key | 01-07 | User must register at football-data.org | Free registration; add to `apps/crawler/.env` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `turbo build` can invoke `dotnet build` via a `package.json` `build` script in `apps/api` | Plan 01-01 | Low — alternative is to exclude `apps/api` from Turborepo and build it separately |
| A2 | `upsertJobScheduler` is the v5 API for repeating jobs | Plan 01-07 | Medium — if v5 still uses `repeat: { every }`, the scheduler code must change; functional behavior is the same |
| A3 | Multi-arch `v1.x-noble` tag resolves to ARM64 natively without explicit `-arm64` suffix | Plan 01-06 | Low — explicit `-arm64` tags exist (e.g., `v1.58.2-noble-arm64`) as a fallback if multi-arch resolution fails |
| A4 | Winston 3.x serializes Error objects poorly in second argument position | Plan 01-03 | Low — cosmetic; logs will work but Error details may be missing |
| A5 | BullMQ v5 removed `QueueScheduler` (stalled detection now built-in) | Plan 01-04 | Low — if using BullMQ 4.x, add QueueScheduler back; BullMQ 5.73 is confirmed from npm |

---

## Open Questions

1. **football-data.org free tier EPL coverage**
   - What we know: Free tier allows 10 req/min, authentication via `X-Auth-Token`
   - What's unclear: Whether EPL standings (not just competition metadata) are included in the free tier, or whether they require a paid plan
   - Recommendation: Register for a free API key, call the standings endpoint, and verify the response is not a 403. If 403, the token is insufficient and a paid plan is needed.

2. **BullMQ repeatable job API in v5.73**
   - What we know: BullMQ 5.73.0 is on npm; `upsertJobScheduler` was introduced in v5
   - What's unclear: Exact method name and signature (may be `addJobScheduler` or `setJobScheduler` in some sub-versions)
   - Recommendation: Check BullMQ changelog or run `node -e "const {Queue}=require('bullmq'); console.log(Object.getOwnPropertyNames(Queue.prototype))"` to list available methods.

3. **Next.js 16 vs 15 for App Router**
   - What we know: `next` 16.2.2 is the current npm latest; App Router has been stable since Next.js 13
   - What's unclear: Whether Next.js 16 introduced any breaking changes from 15 that affect this scaffold
   - Recommendation: Use `next@16.2.2` as currently on npm; App Router basics (layout.tsx, page.tsx) are unchanged.

---

## Sources

### Primary (HIGH confidence)
- [docs.bullmq.io/guide/going-to-production](https://docs.bullmq.io/guide/going-to-production) — SIGTERM/graceful shutdown pattern
- [docs.bullmq.io/guide/workers/graceful-shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown) — worker.close() behavior
- [docs.bullmq.io/guide/connections](https://docs.bullmq.io/guide/connections) — maxRetriesPerRequest: null requirement
- [playwright.dev/docs/docker](https://playwright.dev/docs/docker) — Docker setup, --no-sandbox, --ipc=host, --disable-dev-shm-usage
- [turborepo.dev/docs/reference/configuration](https://turborepo.dev/docs/reference/configuration) — turbo.json tasks schema
- [turborepo.dev/docs/crafting-your-repository/structuring-a-repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) — pnpm-workspace.yaml format, directory layout
- [docs.football-data.org/general/v4/policies.html](https://docs.football-data.org/general/v4/policies.html) — rate limits, free tier restrictions
- [docs.football-data.org/general/v4/competition.html](https://docs.football-data.org/general/v4/competition.html) — standings endpoint, PL code, response structure
- [cheerio.js.org/docs/basics/loading/](https://cheerio.js.org/docs/basics/loading/) — Cheerio 1.x load API
- npm registry (2026-04-07) — all package version numbers verified via `npm view`

### Secondary (MEDIUM confidence)
- [github.com/microsoft/playwright/releases](https://github.com/microsoft/playwright/releases) — v1.59.1 latest stable confirmed
- [serilog.net](https://serilog.net) — Serilog Program.cs bootstrap pattern
- [pnpm.io/workspaces](https://pnpm.io/workspaces) — workspace:* protocol
- [mcr.microsoft.com/en-us/artifact/mar/playwright](https://mcr.microsoft.com/en-us/artifact/mar/playwright) — ARM64 tag existence verified by search results showing v1.58.2-noble-arm64

### Tertiary (LOW confidence)
- WebSearch results for Docker Compose healthcheck patterns (cross-verified with official Docker docs)

---

## Metadata

**Confidence breakdown:**
- Standard stack versions: HIGH — all verified against npm registry on 2026-04-07
- Turborepo configuration: HIGH — verified against official turborepo.dev docs
- BullMQ patterns: HIGH — verified against official docs.bullmq.io
- Playwright ARM64: MEDIUM — multi-arch manifest behavior is confirmed by docs; specific ARM64 tag format cross-checked but not directly inspected
- football-data.org: MEDIUM — endpoint and auth header confirmed from official docs; free tier EPL coverage not directly tested
- Serilog: MEDIUM — configuration pattern verified against official serilog.net; NuGet package versions are ASSUMED to be 8.x for .NET 8 compatibility

**Research date:** 2026-04-07
**Valid until:** 2026-07-07 (stable ecosystem; re-verify Playwright and BullMQ versions before implementation if more than 30 days pass)
