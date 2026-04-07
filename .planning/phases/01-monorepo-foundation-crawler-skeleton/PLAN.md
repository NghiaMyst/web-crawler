# Phase 1 Plan: Monorepo Foundation & Crawler Skeleton

**Phase:** 01-monorepo-foundation-crawler-skeleton
**Plans:** 7 (01-01 through 01-07)
**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, CRAWL-01, CRAWL-02, CRAWL-03, SRC-01

---

## Decision Coverage Matrix

| Decision | Plan | Task | Status | Notes |
|----------|------|------|--------|-------|
| D-01: `apps/` prefix layout | 01-01 | 1 | Full | All dirs under `apps/` and `packages/` |
| D-02: Playwright image `v1.50.1-noble` | 01-02 | 2 | Full | Exact tag pinned in Dockerfile |
| D-03: Real Next.js App Router scaffold | 01-01 | 3 | Full | `app/layout.tsx` + `app/page.tsx` |
| D-04: Per-service `.env` + `env_file:` | 01-02 | 1 | Full | Each service gets `.env`, Compose uses `env_file:` |

| Requirement | Plan | Task | Status |
|-------------|------|------|--------|
| INFRA-01 | 01-02 | 1 | Full |
| INFRA-02 | 01-02 | 1–2 | Full |
| INFRA-03 | 01-01 | 1 | Full |
| INFRA-04 | 01-01 | 1–2 | Full |
| INFRA-05 | 01-03 | 1–2 | Full |
| INFRA-06 | 01-04 | 2 | Full |
| CRAWL-01 | 01-04, 01-07 | 1–2 | Full |
| CRAWL-02 | 01-05 | 1–2 | Full |
| CRAWL-03 | 01-06 | 1–2 | Full |
| SRC-01 | 01-07 | 1–2 | Full |

---

## Threat Model

### Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Crawler → football-data.org API | Outbound HTTPS to external API; API key in request header |
| Crawler → Playwright | Browser navigates to external URLs; rendered HTML returned locally |
| `.env` files → Docker Compose | Secrets sourced from per-service `.env` files, not baked into images |
| Redis | Unauthenticated in local dev; BullMQ job data stored here |

### STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Information Disclosure | `apps/crawler/.env` | mitigate | Add `apps/**/.env` to `.gitignore` at repo root; provide `.env.example` with placeholder values only |
| T-01-02 | Information Disclosure | `FOOTBALL_DATA_API_KEY` | mitigate | Store only in `apps/crawler/.env` (gitignored); never hardcode in source; `.env.example` shows placeholder `your_token_here` |
| T-01-03 | Spoofing | football-data.org API | accept | HTTPS enforced by `axios` base URL; no client cert auth needed for personal use |
| T-01-04 | Denial of Service | BullMQ + Redis | mitigate | Redis started with `--maxmemory-policy noeviction` to prevent key eviction killing BullMQ queues |
| T-01-05 | Elevation of Privilege | Playwright in Docker | mitigate | `--no-sandbox` required due to root user in Docker; container is isolated; not exposed to network externally |
| T-01-06 | Information Disclosure | Docker image layers | accept | Dev-only setup; no production secrets baked into images; per D-04 secrets come from `env_file:` |
| T-01-07 | Tampering | `.env` files | accept | Local dev only; single developer; no multi-user threat surface in Phase 1 |

---

## Plan 01-01: Turborepo + pnpm Workspace Scaffold

**Goal:** Create the complete monorepo skeleton — root config files, all four workspace directories, TypeScript base config, and a working Next.js App Router scaffold — so that `turbo build` succeeds from a clean checkout.

**Requirements satisfied:** INFRA-03, INFRA-04

---

### Tasks

#### Task 1: Create root monorepo config files

**Files:**
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `.nvmrc`
- `.editorconfig`
- `.gitignore`

**Action:**

Create `package.json` at the repo root:
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

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `turbo.json` (use `tasks` key — Turborepo 2.x; NOT `pipeline`; schema URL must be `https://turborepo.dev/schema.json`):
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

Create `tsconfig.base.json`:
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

Create `.nvmrc` containing only:
```
20
```

Create `.editorconfig`:
```
root = true

[*]
indent_style = space
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.ts]
indent_size = 2

[*.json]
indent_size = 2

[*.yaml]
indent_size = 2

[*.cs]
indent_size = 4
```

Create `.gitignore`:
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
.next/
out/

# Environment files (never commit secrets)
apps/**/.env
.env
!.env.example
!apps/**/.env.example

# Turbo cache
.turbo/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.suo
*.user

# dotnet
apps/api/bin/
apps/api/obj/
```

**Verify:** `cat turbo.json | grep '"tasks"'` outputs the `tasks` key. `cat .gitignore | grep '\.env'` shows the gitignore rule. `node --version` is 20.x or higher.

**Done:** Root config files exist with correct content; `.env` files are gitignored; `turbo.json` uses `tasks` key with correct schema URL.

---

#### Task 2: Scaffold workspace packages with package.json files

**Files:**
- `apps/crawler/package.json`
- `apps/crawler/tsconfig.json`
- `apps/api/package.json`
- `apps/api/WebCrawlerApi.csproj`
- `apps/dashboard/package.json`
- `packages/shared-types/package.json`
- `packages/shared-types/tsconfig.json`
- `packages/shared-types/src/index.ts`

**Action:**

Create directory structure:
```bash
mkdir -p apps/crawler/src apps/api apps/dashboard packages/shared-types/src
```

Create `apps/crawler/package.json`:
```json
{
  "name": "@web-crawler/crawler",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "25.5.2",
    "tsx": "^4.19.3",
    "typescript": "6.0.2"
  }
}
```

Create `apps/crawler/tsconfig.json`:
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

Create `apps/crawler/src/index.ts` (entry point placeholder):
```typescript
// Crawler entry point — workers and schedulers registered here in later tasks
console.log('Crawler service starting...');
```

Create `apps/api/package.json` (for Turborepo integration with .NET):
```json
{
  "name": "@web-crawler/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "dotnet build --configuration Release",
    "type-check": "echo 'No TypeScript in .NET project'"
  }
}
```

Create `apps/api/Program.cs` (minimal .NET stub — full Serilog wiring in Plan 01-03):
```csharp
// Stub Program.cs — full implementation in Plan 01-03
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/health", () => "OK");
app.Run();
```

Create `apps/api/WebCrawlerApi.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

Create `packages/shared-types/package.json`:
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

Create `packages/shared-types/tsconfig.json`:
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

Create `packages/shared-types/src/index.ts`:
```typescript
// Shared type exports — add domain types here as they are defined
export * from './footballData';
```

Create `packages/shared-types/src/footballData.ts` with the EPL standings type (per Plan 01-07):
```typescript
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
    stage: string;
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

**Verify:** `ls apps/` shows `crawler api dashboard`. `ls packages/` shows `shared-types`. `cat apps/crawler/tsconfig.json | grep extends` shows `../../tsconfig.base.json`.

**Done:** All four workspace packages exist with correct `package.json` files. Internal package uses `@web-crawler/` namespace. `.NET` project has stub `Program.cs` and `.csproj`.

---

#### Task 3: Scaffold Next.js App Router dashboard (D-03)

**Files:**
- `apps/dashboard/package.json`
- `apps/dashboard/tsconfig.json`
- `apps/dashboard/next.config.ts`
- `apps/dashboard/app/layout.tsx`
- `apps/dashboard/app/page.tsx`
- `apps/dashboard/app/globals.css`

**Action:**

Create `apps/dashboard/package.json`:
```json
{
  "name": "@web-crawler/dashboard",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "16.2.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "25.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "6.0.2"
  }
}
```

Create `apps/dashboard/tsconfig.json` (Next.js extends its own tsconfig, adds strict per CONVENTIONS.md):
```json
{
  "extends": "next/typescript",
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/dashboard/next.config.ts`:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Phase 1: minimal config — extend in later phases
};

export default nextConfig;
```

Create `apps/dashboard/app/layout.tsx` (root layout — required for App Router):
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Web Crawler Dashboard',
  description: 'Data aggregation monitoring dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/dashboard/app/page.tsx` (landing page):
```tsx
export default function HomePage(): React.JSX.Element {
  return (
    <main>
      <h1>Web Crawler Dashboard</h1>
      <p>Phase 1: Scaffold complete. Data views coming in Phase 7.</p>
    </main>
  );
}
```

Create `apps/dashboard/app/globals.css`:
```css
/* Global styles — extend in Phase 7 when Tailwind is added */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
}
```

**Verify:** `ls apps/dashboard/app/` shows `layout.tsx page.tsx globals.css`. `cat apps/dashboard/app/layout.tsx | grep RootLayout` confirms the component is present.

**Done:** Next.js App Router scaffold has a real `app/` directory with root layout and landing page, per D-03. No stub — this is a real Next.js project structure.

---

### Verification

Run from repo root after `pnpm install`:
```bash
# Confirm workspace packages are linked
pnpm list --filter @web-crawler/crawler
pnpm list --filter @web-crawler/shared-types

# Confirm TypeScript compiles shared-types
pnpm --filter @web-crawler/shared-types build

# Confirm turbo recognizes all tasks (dry run)
npx turbo build --dry-run
```

`turbo build --dry-run` must show all four packages in the task graph with no errors.

---

## Plan 01-02: Docker Compose Local Dev Stack

**Goal:** Wire all five services (postgres, redis, crawler, api, dashboard) into `docker-compose.yml` with proper health checks, `condition: service_healthy` dependencies, ARM64-compatible images, and per-service `env_file:` directives so `docker compose up` starts everything cleanly.

**Requirements satisfied:** INFRA-01, INFRA-02

---

### Tasks

#### Task 1: Create docker-compose.yml with health checks and env_file directives (D-04)

**Files:**
- `docker-compose.yml`
- `.env.example`
- `apps/crawler/.env.example`
- `apps/api/.env.example`
- `apps/dashboard/.env.example`

**Action:**

Create `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: webcrawler
      POSTGRES_USER: crawler
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
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
    # noeviction is REQUIRED for BullMQ — prevents Redis from evicting queue keys
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
    healthcheck:
      test: ["CMD", "node", "-e", "process.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: on-failure

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
    healthcheck:
      test: ["CMD", "sh", "-c", "exit 0"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    ports:
      - "5000:5000"
    restart: on-failure

  dashboard:
    build:
      context: ./apps/dashboard
      dockerfile: Dockerfile
    env_file:
      - ./apps/dashboard/.env
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    ports:
      - "3000:3000"
    restart: on-failure

volumes:
  postgres_data:
```

Create root `.env.example`:
```env
# Root .env.example — document all variables needed across services
# Copy per-service .env.example files to .env in each apps/ directory

# PostgreSQL (used by postgres service in docker-compose.yml)
POSTGRES_PASSWORD=changeme

# See apps/crawler/.env.example for crawler-specific vars
# See apps/api/.env.example for API-specific vars
# See apps/dashboard/.env.example for dashboard-specific vars
```

Create `apps/crawler/.env.example`:
```env
# Crawler environment variables
# Copy this file to apps/crawler/.env and fill in values

NODE_ENV=development
LOG_LEVEL=info
REDIS_URL=redis://redis:6379
DATABASE_URL=postgresql://crawler:changeme@postgres:5432/webcrawler
FOOTBALL_DATA_API_KEY=your_token_here
```

Create `apps/api/.env.example`:
```env
# API environment variables
# Copy this file to apps/api/.env and fill in values

ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://+:5000
ConnectionStrings__DefaultConnection=Host=postgres;Port=5432;Database=webcrawler;Username=crawler;Password=changeme
REDIS_URL=redis://redis:6379
```

Create `apps/dashboard/.env.example`:
```env
# Dashboard environment variables
# Copy this file to apps/dashboard/.env and fill in values

NEXT_PUBLIC_API_URL=http://localhost:5000
NODE_ENV=development
```

Also create the actual `.env` files for local development (these are gitignored per `.gitignore`):
- Copy `apps/crawler/.env.example` to `apps/crawler/.env`
- Copy `apps/api/.env.example` to `apps/api/.env`
- Copy `apps/dashboard/.env.example` to `apps/dashboard/.env`

```bash
cp apps/crawler/.env.example apps/crawler/.env
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
```

**Verify:** `docker compose config` (without `up`) parses without errors. `cat docker-compose.yml | grep 'condition: service_healthy'` shows at least two occurrences. `cat docker-compose.yml | grep env_file` shows three occurrences (crawler, api, dashboard).

**Done:** `docker-compose.yml` is valid. All five services declared. `postgres` and `redis` have `healthcheck:` blocks. `crawler` and `api` depend on both with `condition: service_healthy`. Each app service uses `env_file:`. `.env.example` files document all required variables.

---

#### Task 2: Create per-service Dockerfiles (per D-02)

**Files:**
- `apps/crawler/Dockerfile`
- `apps/api/Dockerfile`
- `apps/dashboard/Dockerfile`

**Action:**

Create `apps/crawler/Dockerfile` (D-02: use `mcr.microsoft.com/playwright:v1.50.1-noble` as base — multi-arch, ARM64 compatible, Chromium pre-installed):
```dockerfile
# D-02: Playwright official image — multi-arch manifest (resolves ARM64 on Apple Silicon / Oracle Cloud)
# Chromium is pre-installed. Node.js must be installed separately.
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Install Node.js 20 (Playwright noble image is Ubuntu 24.04, not Alpine)
RUN apt-get update && apt-get install -y curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10.33.0

# Copy workspace root files needed for pnpm install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/crawler/package.json ./apps/crawler/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter @web-crawler/crawler...

# Copy compiled output
COPY apps/crawler/dist/ ./apps/crawler/dist/
COPY packages/shared-types/dist/ ./packages/shared-types/dist/

WORKDIR /app/apps/crawler

CMD ["node", "dist/index.js"]
```

Create `apps/api/Dockerfile` (ASP.NET Core 8, multi-arch image):
```dockerfile
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY apps/api/*.csproj ./
RUN dotnet restore

COPY apps/api/ ./
RUN dotnet build --configuration Release --no-restore
RUN dotnet publish --configuration Release --no-build --output /app/publish

# Runtime stage — multi-arch (ARM64 compatible)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000

ENTRYPOINT ["dotnet", "WebCrawlerApi.dll"]
```

Create `apps/dashboard/Dockerfile` (Next.js, multi-arch node:20-alpine):
```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@10.33.0

# Copy workspace root config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/dashboard/package.json ./apps/dashboard/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @web-crawler/dashboard...

# Copy source
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/dashboard/ ./apps/dashboard/

# Build shared types first, then dashboard
RUN pnpm --filter @web-crawler/shared-types build
RUN pnpm --filter @web-crawler/dashboard build

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "apps/dashboard/server.js"]
```

Note: The dashboard Dockerfile uses Next.js standalone output. Add `output: 'standalone'` to `apps/dashboard/next.config.ts`:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

**Verify:** `docker build -t crawler-test ./apps/crawler` succeeds (requires built `dist/` first). `docker inspect mcr.microsoft.com/playwright:v1.50.1-noble | grep Architecture` confirms multi-arch after pull. `docker compose build` completes without errors.

**Done:** Three Dockerfiles exist. Crawler uses `mcr.microsoft.com/playwright:v1.50.1-noble` per D-02. API uses `mcr.microsoft.com/dotnet/aspnet:8.0` (multi-arch). Dashboard uses `node:20-alpine` (multi-arch). All satisfy INFRA-02.

---

### Verification

```bash
# Parse and validate the compose file
docker compose config

# Start only infrastructure services to validate health checks
docker compose up postgres redis -d

# Wait for health checks to pass (allow 30s)
sleep 30
docker compose ps
# postgres and redis must show "healthy" status

# Full stack (after Dockerfiles are built)
docker compose up --build -d
docker compose ps
# All five services must be running or starting
```

`docker compose ps` must show `postgres` and `redis` as `(healthy)` within 30 seconds of starting.

---

## Plan 01-03: Structured Logging Setup

**Goal:** Install and configure `winston` in `apps/crawler` with JSON-in-production / pretty-print-in-development behavior, context fields `{ url, sourceId, jobId }`, and a stub .NET `apps/api` bootstrapped with Serilog JSON console logging.

**Requirements satisfied:** INFRA-05

---

### Tasks

#### Task 1: Configure winston in apps/crawler

**Files:**
- `apps/crawler/src/logger.ts`
- `apps/crawler/package.json` (updated with winston dependency)

**Action:**

Add `winston` dependency to `apps/crawler`:
```bash
pnpm add winston@3.19.0 --filter @web-crawler/crawler
```

This updates `apps/crawler/package.json` `dependencies` to include `"winston": "3.19.0"`.

Create `apps/crawler/src/logger.ts`:
```typescript
import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

// Production: JSON format for log aggregation
// Development: colored, human-readable pretty-print
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: isDev
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp as string} [${level}] ${message as string}${metaStr}`;
        }),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
  defaultMeta: { service: 'crawler' },
  transports: [new winston.transports.Console()],
});

// Usage: always include context fields { url, sourceId, jobId }
// Example: logger.info('Crawl job started', { url, sourceId, jobId });
// Do NOT pass Error objects directly — they serialize poorly in winston.
// Use: logger.error('Job failed', { url, sourceId, jobId, err: err.message, stack: err.stack });
```

Update `apps/crawler/src/index.ts` to import and use the logger:
```typescript
import { logger } from './logger.js';

logger.info('Crawler service starting', { service: 'crawler', version: '0.0.1' });
```

Add `@types/node` dev dependency needed for `process.env`:
```bash
pnpm add -D @types/node@25.5.2 --filter @web-crawler/crawler
```

**Verify:**
```bash
cd apps/crawler
NODE_ENV=development node -e "
const { logger } = require('./dist/logger.js');
logger.info('Test log', { url: 'https://example.com', sourceId: 'test', jobId: '123' });
"
```
Output must include colored timestamp + `[info]` + message + context JSON.

```bash
NODE_ENV=production node -e "
const { logger } = require('./dist/logger.js');
logger.info('Test log', { url: 'https://example.com', sourceId: 'test', jobId: '123' });
"
```
Output must be a single-line JSON object with `level`, `message`, `timestamp`, `service`, `url`, `sourceId`, `jobId` fields.

**Done:** `apps/crawler/src/logger.ts` exports a `logger` singleton. Development prints colored text. Production prints JSON. Both always include context fields.

---

#### Task 2: Bootstrap apps/api with Serilog JSON logging

**Files:**
- `apps/api/Program.cs` (updated)
- `apps/api/appsettings.json`
- `apps/api/appsettings.Development.json`
- `apps/api/WebCrawlerApi.csproj` (updated with Serilog packages)

**Action:**

Update `apps/api/WebCrawlerApi.csproj` to add Serilog NuGet packages:
```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Serilog.AspNetCore" Version="8.*" />
    <PackageReference Include="Serilog.Sinks.Console" Version="6.*" />
    <PackageReference Include="Serilog.Settings.Configuration" Version="8.*" />
  </ItemGroup>
</Project>
```

Replace `apps/api/Program.cs`:
```csharp
using Serilog;

// Bootstrap logger for startup errors (before host is built)
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Wire Serilog — reads config from appsettings.json Serilog section
    // Business code uses ILogger<T> from Microsoft.Extensions.Logging, NOT Serilog directly
    builder.Host.UseSerilog((context, services, configuration) =>
        configuration
            .ReadFrom.Configuration(context.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext());

    var app = builder.Build();

    // Log every HTTP request with timing
    app.UseSerilogRequestLogging();

    app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "api" }));

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application startup failed");
    throw;
}
finally
{
    Log.CloseAndFlush();
}
```

Create `apps/api/appsettings.json`:
```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Microsoft.Hosting.Lifetime": "Information",
        "System": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "Console",
        "Args": {
          "formatter": "Serilog.Formatting.Json.JsonFormatter, Serilog"
        }
      }
    ],
    "Enrich": ["FromLogContext"]
  },
  "AllowedHosts": "*"
}
```

Create `apps/api/appsettings.Development.json` (pretty output in dev — overrides production JSON format):
```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Debug",
      "Override": {
        "Microsoft": "Information",
        "System": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "Console"
      }
    ]
  }
}
```

Run `dotnet restore` from `apps/api/` to pull Serilog packages:
```bash
cd apps/api && dotnet restore
```

**Verify:**
```bash
cd apps/api
dotnet build --configuration Release
```
Build must succeed with no errors. Then:
```bash
ASPNETCORE_ENVIRONMENT=Production dotnet run &
sleep 3
curl -s http://localhost:5000/health
```
Response must be `{"status":"ok","service":"api"}`. Console output must be JSON-formatted log lines.

**Done:** `apps/api` compiles with Serilog. JSON console logging active in Production environment. Development environment uses readable format. `/health` endpoint returns OK. Business code injects `ILogger<T>` from Microsoft.Extensions.Logging.

---

### Verification

```bash
# Node.js logger
cd apps/crawler
pnpm build
NODE_ENV=development node dist/index.js
# Expected: colored log line with timestamp
NODE_ENV=production node dist/index.js
# Expected: single-line JSON log

# .NET logger
cd apps/api
dotnet build
ASPNETCORE_ENVIRONMENT=Production dotnet run &
curl http://localhost:5000/health
# Expected: {"status":"ok","service":"api"}
```

---

## Plan 01-04: BullMQ Queue Bootstrap

**Goal:** Install BullMQ and IORedis in `apps/crawler`, create the `crawl:default` queue with a shared IORedis connection, implement a worker process and job producer, and wire SIGTERM graceful shutdown with a 30-second timeout guard.

**Requirements satisfied:** INFRA-06, CRAWL-01

---

### Tasks

#### Task 1: Create shared connection, queue, and producer

**Files:**
- `apps/crawler/src/connection.ts`
- `apps/crawler/src/queues/crawlQueue.ts`
- `apps/crawler/src/producers/crawlProducer.ts`
- `apps/crawler/package.json` (updated with bullmq + ioredis)

**Action:**

Install dependencies:
```bash
pnpm add bullmq@5.73.0 ioredis@5.10.1 --filter @web-crawler/crawler
```

Create `apps/crawler/src/connection.ts`:
```typescript
import IORedis from 'ioredis';

// maxRetriesPerRequest: null is REQUIRED for BullMQ Worker blocking connections.
// Without it, Workers throw errors on BLPOP and similar blocking commands.
export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

connection.on('error', (err: Error) => {
  // Log to stderr before logger is initialized
  console.error('[connection] Redis connection error:', err.message);
});
```

Create `apps/crawler/src/queues/crawlQueue.ts`:
```typescript
import { Queue } from 'bullmq';
import { connection } from '../connection.js';

// Named queue per CONVENTIONS.md: 'crawl:{domain}'
// 'crawl:default' is the general-purpose queue for Phase 1
export const crawlQueue = new Queue('crawl:default', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s initial delay, then 10s, 20s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
```

Create `apps/crawler/src/producers/crawlProducer.ts`:
```typescript
import { crawlQueue } from '../queues/crawlQueue.js';
import { logger } from '../logger.js';

export interface CrawlJobData {
  url: string;
  sourceId: string;
  strategy: 'cheerio' | 'playwright' | 'api';
}

export async function enqueueCrawlJob(data: CrawlJobData): Promise<void> {
  const job = await crawlQueue.add('crawl', data);
  logger.info('Crawl job enqueued', {
    url: data.url,
    sourceId: data.sourceId,
    jobId: job.id,
  });
}
```

**Verify:**
```bash
cd apps/crawler && pnpm build
# No TypeScript errors. dist/connection.js, dist/queues/crawlQueue.js,
# dist/producers/crawlProducer.js must exist in dist/
ls dist/connection.js dist/queues/crawlQueue.js dist/producers/crawlProducer.js
```

**Done:** IORedis connection singleton with `maxRetriesPerRequest: null`. `crawl:default` queue created with 3-attempt exponential backoff. Producer function exports `enqueueCrawlJob`. All TypeScript strict-mode compliant.

---

#### Task 2: Create crawl worker with SIGTERM graceful shutdown (INFRA-06)

**Files:**
- `apps/crawler/src/workers/crawlWorker.ts`
- `apps/crawler/src/index.ts` (updated to start worker)

**Action:**

Create `apps/crawler/src/workers/crawlWorker.ts`:
```typescript
import { Worker, Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import type { CrawlJobData } from '../producers/crawlProducer.js';

export function createCrawlWorker(): Worker<CrawlJobData> {
  const worker = new Worker<CrawlJobData>(
    'crawl:default',
    async (job: Job<CrawlJobData>): Promise<void> => {
      const { url, sourceId, strategy } = job.data;
      logger.info('Crawl job started', { url, sourceId, jobId: job.id, strategy });

      // Phase 1: placeholder — Cheerio and Playwright processors wired in Plans 01-05/01-06
      // This worker validates the BullMQ pipeline end-to-end
      logger.info('Crawl job completed (stub)', { url, sourceId, jobId: job.id });
    },
    {
      connection,
      concurrency: 1, // serial per queue — expand in Phase 2
    },
  );

  worker.on('completed', (job: Job<CrawlJobData>) => {
    logger.info('Job completed', { jobId: job.id, name: job.name });
  });

  worker.on('failed', (job: Job<CrawlJobData> | undefined, err: Error) => {
    logger.error('Job failed', { jobId: job?.id, err: err.message, stack: err.stack });
  });

  return worker;
}

// SIGTERM graceful shutdown — INFRA-06
// worker.close() marks worker as closing (no new jobs picked up), then waits for
// the current in-flight job to complete or fail before resolving.
export async function setupGracefulShutdown(worker: Worker): Promise<void> {
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    // 30-second hard timeout guard (D-INFRA-06 requirement)
    // .unref() prevents the timer from blocking Node.js event loop exit
    const timeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout (30s) reached, forcing exit');
      process.exit(1);
    }, 30_000);
    timeout.unref();

    // Waits for current in-flight job to finish
    await worker.close();
    clearTimeout(timeout);

    await connection.quit();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
}
```

Update `apps/crawler/src/index.ts`:
```typescript
import { logger } from './logger.js';
import { createCrawlWorker, setupGracefulShutdown } from './workers/crawlWorker.js';

logger.info('Crawler service starting', { service: 'crawler' });

const worker = createCrawlWorker();
await setupGracefulShutdown(worker);

logger.info('Crawler service ready — worker listening on crawl:default queue');
```

Note: `index.ts` uses top-level `await` which requires `"module": "Node16"` in `tsconfig.json` (already set in `tsconfig.base.json`) and `"type": "module"` in `package.json`. Add `"type": "module"` to `apps/crawler/package.json`.

**Verify:**

Manual test with a running Redis instance:
```bash
# Terminal 1: start worker
cd apps/crawler && pnpm build && node dist/index.js

# Terminal 2: send SIGTERM
kill -SIGTERM $(pgrep -f 'node dist/index.js')
```
Terminal 1 must log: `Received SIGTERM, initiating graceful shutdown...` then `Worker shut down cleanly`. Process must exit with code 0.

**Done:** `crawlWorker.ts` creates a BullMQ Worker on `crawl:default`. SIGTERM handler calls `worker.close()` and waits. 30-second timeout guard uses `setTimeout(...).unref()`. Process exits cleanly.

---

### Verification

```bash
# Build
cd apps/crawler && pnpm build

# Start with Redis running
REDIS_URL=redis://localhost:6379 node dist/index.js &
PID=$!

# Confirm worker started
sleep 2
kill -SIGTERM $PID

# Check exit code
wait $PID
echo "Exit code: $?"
# Must be 0
```

Log output must show:
- `Crawler service starting`
- `Crawler service ready — worker listening on crawl:default queue`
- `Received SIGTERM, initiating graceful shutdown...`
- `Worker shut down cleanly`

---

## Plan 01-05: Cheerio Crawl Worker

**Goal:** Install Cheerio and Axios in `apps/crawler`, create a `CheerioWorker` that fetches a URL with `User-Agent: PersonalCrawlerBot/1.0`, parses the HTML with Cheerio, logs a structured result including `titleText` and `bodyLength`, and register it as a BullMQ processor.

**Requirements satisfied:** CRAWL-02

---

### Tasks

#### Task 1: Install dependencies and create CheerioWorker module

**Files:**
- `apps/crawler/src/workers/CheerioWorker.ts`
- `apps/crawler/package.json` (updated with cheerio + axios)

**Action:**

Install dependencies (cheerio 1.x ships its own types; no `@types/cheerio` needed):
```bash
pnpm add cheerio@1.0.0 axios@1.14.0 --filter @web-crawler/crawler
```

Create `apps/crawler/src/workers/CheerioWorker.ts`:
```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../logger.js';

export interface CheerioResult {
  url: string;
  titleText: string;
  bodyLength: number;
  rawHtml: string;
}

// cheerioFetch — HTTP GET + Cheerio parse
// Always sets User-Agent per CONVENTIONS.md
export async function cheerioFetch(
  url: string,
  sourceId: string,
  jobId: string,
): Promise<CheerioResult> {
  const response = await axios.get<string>(url, {
    headers: {
      'User-Agent': 'PersonalCrawlerBot/1.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
    timeout: 15_000,
    responseType: 'text',
  });

  const $ = cheerio.load(response.data);
  const titleText = $('title').text().trim();
  const bodyLength = response.data.length;

  logger.info('Cheerio crawl result', { url, sourceId, jobId, titleText, bodyLength });

  return { url, titleText, bodyLength, rawHtml: response.data };
}
```

**Verify:**
```bash
cd apps/crawler && pnpm build
# Must compile without errors
ls dist/workers/CheerioWorker.js
```

Quick smoke test (requires internet access):
```bash
node -e "
import { cheerioFetch } from './dist/workers/CheerioWorker.js';
const result = await cheerioFetch('https://example.com', 'test-source', 'test-job-001');
console.log('title:', result.titleText);
console.log('bodyLength:', result.bodyLength);
if (result.bodyLength < 100) throw new Error('Body too short');
console.log('PASS');
" --input-type=module
```

**Done:** `CheerioWorker.ts` exports `cheerioFetch`. Sets `User-Agent: PersonalCrawlerBot/1.0`. Logs `{ url, sourceId, jobId, titleText, bodyLength }` via logger.

---

#### Task 2: Register CheerioWorker as a BullMQ processor

**Files:**
- `apps/crawler/src/workers/crawlWorker.ts` (updated to dispatch by strategy)
- `apps/crawler/src/index.ts` (updated if needed)

**Action:**

Update `apps/crawler/src/workers/crawlWorker.ts` to dispatch to `cheerioFetch` when `strategy === 'cheerio'`:
```typescript
import { Worker, Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import { cheerioFetch } from './CheerioWorker.js';
import type { CrawlJobData } from '../producers/crawlProducer.js';

export function createCrawlWorker(): Worker<CrawlJobData> {
  const worker = new Worker<CrawlJobData>(
    'crawl:default',
    async (job: Job<CrawlJobData>): Promise<void> => {
      const { url, sourceId, strategy } = job.data;
      logger.info('Crawl job started', { url, sourceId, jobId: job.id, strategy });

      if (strategy === 'cheerio') {
        await cheerioFetch(url, sourceId, job.id ?? 'unknown');
      } else if (strategy === 'playwright') {
        // Wired in Plan 01-06
        logger.warn('Playwright strategy not yet implemented', { url, sourceId, jobId: job.id });
      } else if (strategy === 'api') {
        // Wired in Plan 01-07 (football-data.org uses direct API call)
        logger.warn('API strategy not yet implemented', { url, sourceId, jobId: job.id });
      } else {
        throw new Error(`Unknown crawl strategy: ${String(strategy)}`);
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job: Job<CrawlJobData>) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<CrawlJobData> | undefined, err: Error) => {
    logger.error('Job failed', { jobId: job?.id, err: err.message, stack: err.stack });
  });

  return worker;
}

export async function setupGracefulShutdown(worker: Worker): Promise<void> {
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    const timeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout (30s) reached, forcing exit');
      process.exit(1);
    }, 30_000);
    timeout.unref();
    await worker.close();
    clearTimeout(timeout);
    await connection.quit();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
}
```

**Verify:**

End-to-end test with Redis running:
```bash
# Terminal 1: start worker
cd apps/crawler && node dist/index.js

# Terminal 2: enqueue a Cheerio job
node -e "
import { crawlQueue } from './dist/queues/crawlQueue.js';
await crawlQueue.add('crawl', {
  url: 'https://example.com',
  sourceId: 'test-cheerio',
  strategy: 'cheerio'
});
console.log('Job enqueued');
process.exit(0);
" --input-type=module
```

Terminal 1 must log:
- `Crawl job started` with `strategy: cheerio`
- `Cheerio crawl result` with `titleText: "Example Domain"` and `bodyLength > 1000`
- `Job completed`

**Done:** `crawlWorker.ts` dispatches `strategy: 'cheerio'` jobs to `cheerioFetch`. Structured log with `titleText` and `bodyLength` visible in output. BullMQ marks job as completed.

---

### Verification

```bash
cd apps/crawler && pnpm build

# Integration test — requires Redis on localhost:6379
REDIS_URL=redis://localhost:6379 node dist/index.js &

node --input-type=module -e "
import { crawlQueue } from './dist/queues/crawlQueue.js';
const job = await crawlQueue.add('crawl', {
  url: 'https://example.com',
  sourceId: 'integration-test',
  strategy: 'cheerio'
});
console.log('Enqueued job:', job.id);
setTimeout(() => process.exit(0), 5000);
"
```

Logs must show `Cheerio crawl result` with `titleText: "Example Domain"`.

---

## Plan 01-06: Playwright Crawl Worker

**Goal:** Install Playwright in `apps/crawler`, create a `BrowserPool` class (max 3 instances) with correct Docker launch args (`--no-sandbox`, `--disable-dev-shm-usage`), implement a `playwrightFetch` function, run a smoke test that navigates to `https://example.com` and logs `htmlLength`, and register as a BullMQ processor strategy.

**Requirements satisfied:** CRAWL-03, INFRA-02

---

### Tasks

#### Task 1: Install Playwright and create BrowserPool

**Files:**
- `apps/crawler/src/workers/BrowserPool.ts`
- `apps/crawler/package.json` (updated with playwright)

**Action:**

Install Playwright — version must match Docker image `v1.50.1-noble` (per D-02):
```bash
pnpm add playwright@1.50.1 --filter @web-crawler/crawler
```

Create `apps/crawler/src/workers/BrowserPool.ts`:
```typescript
import { chromium, type Browser } from 'playwright';
import { logger } from '../logger.js';

const MAX_BROWSERS = 3; // CRAWL-03: max 3 browser instances

// DOCKER CRITICAL ARGS (from playwright.dev/docs/docker):
// --no-sandbox: required when running as root in Docker containers
// --disable-dev-shm-usage: Docker limits /dev/shm to 64MB; redirect to /tmp
// --disable-gpu: not needed in headless, reduces overhead
const DOCKER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

export class BrowserPool {
  private browsers: Browser[] = [];
  private available: Browser[] = [];
  private waitQueue: Array<(browser: Browser) => void> = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing browser pool', { maxBrowsers: MAX_BROWSERS });

    for (let i = 0; i < MAX_BROWSERS; i++) {
      const browser = await chromium.launch({
        headless: true,
        args: DOCKER_LAUNCH_ARGS,
      });
      this.browsers.push(browser);
      this.available.push(browser);
    }

    this.initialized = true;
    logger.info('Browser pool ready', { count: MAX_BROWSERS });
  }

  async acquire(): Promise<Browser> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }

    // Wait for a browser to be released
    return new Promise<Browser>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(browser: Browser): void {
    const next = this.waitQueue.shift();
    if (next !== undefined) {
      next(browser);
    } else {
      this.available.push(browser);
    }
  }

  async closeAll(): Promise<void> {
    logger.info('Closing browser pool');
    await Promise.all(this.browsers.map((b) => b.close()));
    this.browsers = [];
    this.available = [];
    this.initialized = false;
  }
}

// Singleton pool shared across all Playwright workers
export const browserPool = new BrowserPool();
```

**Verify:**
```bash
cd apps/crawler && pnpm build
ls dist/workers/BrowserPool.js
```

**Done:** `BrowserPool.ts` compiled. Pool manages max 3 Chromium instances. Launch args include `--no-sandbox` and `--disable-dev-shm-usage`. Singleton `browserPool` exported for shared use.

---

#### Task 2: Implement playwrightFetch and ARM smoke test

**Files:**
- `apps/crawler/src/workers/PlaywrightWorker.ts`
- `apps/crawler/src/workers/crawlWorker.ts` (updated to dispatch playwright strategy)

**Action:**

Create `apps/crawler/src/workers/PlaywrightWorker.ts`:
```typescript
import { logger } from '../logger.js';
import { browserPool } from './BrowserPool.js';

export interface PlaywrightResult {
  url: string;
  htmlLength: number;
  html: string;
}

export async function playwrightFetch(
  url: string,
  sourceId: string,
  jobId: string,
): Promise<PlaywrightResult> {
  const browser = await browserPool.acquire();

  try {
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      const html = await page.content();

      if (!html || html.length < 100) {
        throw new Error(`Playwright fetched empty or near-empty HTML from ${url}`);
      }

      logger.info('Playwright crawl result', { url, sourceId, jobId, htmlLength: html.length });

      return { url, htmlLength: html.length, html };
    } finally {
      await page.close();
    }
  } finally {
    browserPool.release(browser);
  }
}

// ARM smoke test — runs once at startup to confirm Playwright works in Docker on ARM64
// Logs result and throws if page renders empty HTML
export async function runPlaywrightSmokeTest(): Promise<void> {
  logger.info('Running Playwright ARM smoke test...');

  await browserPool.initialize();

  const result = await playwrightFetch(
    'https://example.com',
    'smoke-test',
    'smoke-test-001',
  );

  if (result.htmlLength < 100) {
    throw new Error(`Playwright smoke test FAILED: htmlLength=${result.htmlLength}`);
  }

  logger.info('Playwright ARM smoke test PASSED', { htmlLength: result.htmlLength });
}
```

Update `apps/crawler/src/workers/crawlWorker.ts` to initialize the browser pool and dispatch playwright strategy. Add to the top of the `createCrawlWorker` function and inside the `if/else` strategy block:

```typescript
// Add import at top of crawlWorker.ts:
import { playwrightFetch } from './PlaywrightWorker.js';
import { browserPool } from './BrowserPool.js';

// Inside the worker processor, add playwright branch:
} else if (strategy === 'playwright') {
  await playwrightFetch(url, sourceId, job.id ?? 'unknown');
}
```

Update `apps/crawler/src/index.ts` to initialize the browser pool at startup and run the smoke test:
```typescript
import { logger } from './logger.js';
import { createCrawlWorker, setupGracefulShutdown } from './workers/crawlWorker.js';
import { browserPool } from './workers/BrowserPool.js';
import { runPlaywrightSmokeTest } from './workers/PlaywrightWorker.js';

logger.info('Crawler service starting', { service: 'crawler' });

// Initialize browser pool before accepting jobs
await browserPool.initialize();

// ARM validation: confirm Playwright works in this environment
await runPlaywrightSmokeTest();

const worker = createCrawlWorker();
await setupGracefulShutdown(worker);

logger.info('Crawler service ready — worker listening on crawl:default queue');
```

Also update `setupGracefulShutdown` in `crawlWorker.ts` to close the browser pool on shutdown:
```typescript
// Add inside gracefulShutdown() before worker.close():
import { browserPool } from './BrowserPool.js';

// Inside gracefulShutdown:
await browserPool.closeAll();
await worker.close();
```

**Verify:**

Run inside Docker (ARM validation):
```bash
# Build the crawler image (requires dist/ to be built first)
cd apps/crawler && pnpm build
docker compose build crawler

# Run smoke test inside Docker container
docker compose run --rm crawler node -e "
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
});
const page = await browser.newPage();
await page.goto('https://example.com', { waitUntil: 'networkidle' });
const html = await page.content();
console.log('htmlLength:', html.length);
if (html.length < 100) throw new Error('Empty HTML');
console.log('ARM smoke test PASSED');
await browser.close();
" --input-type=module
```

Output must show `htmlLength: <number > 100>` and `ARM smoke test PASSED` without sandbox errors.

**Done:** `PlaywrightWorker.ts` exports `playwrightFetch` and `runPlaywrightSmokeTest`. Browser pool used correctly with acquire/release. Smoke test navigates to `https://example.com`, asserts `html.length > 0`, logs `{ url, htmlLength }`. `crawlWorker.ts` dispatches `strategy: 'playwright'` to `playwrightFetch`.

---

### Verification

```bash
# Build and run inside Docker to validate ARM64 compatibility
cd apps/crawler && pnpm build
docker compose build crawler

# Confirm smoke test passes inside Docker container
docker compose run --rm crawler node dist/index.js
# Look for: "Playwright ARM smoke test PASSED" with htmlLength value
# Must NOT see: "SIGILL", "Exec format error", sandbox errors
```

---

## Plan 01-07: football-data.org Integration

**Goal:** Create a `footballDataQueue` (named `crawl:football-data.org`), implement a `FootballDataWorker` that calls `GET /v4/competitions/PL/standings` with `X-Auth-Token` header, logs the raw standings response as structured JSON, and schedule it as a BullMQ repeatable job at 30-minute intervals using `upsertJobScheduler`.

**Requirements satisfied:** SRC-01, CRAWL-01

---

### Tasks

#### Task 1: Create football-data.org API client and queue

**Files:**
- `apps/crawler/src/queues/footballDataQueue.ts`
- `apps/crawler/src/workers/FootballDataWorker.ts`
- `apps/crawler/.env.example` (updated — already has FOOTBALL_DATA_API_KEY)

**Action:**

Axios is already installed from Plan 01-05. No new dependencies needed.

Create `apps/crawler/src/queues/footballDataQueue.ts`:
```typescript
import { Queue } from 'bullmq';
import { connection } from '../connection.js';

// Named queue per CONVENTIONS.md: 'crawl:{domain}'
export const footballDataQueue = new Queue('crawl:football-data.org', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
```

Create `apps/crawler/src/workers/FootballDataWorker.ts`:
```typescript
import axios from 'axios';
import { Worker, type Job } from 'bullmq';
import { connection } from '../connection.js';
import { logger } from '../logger.js';
import type { EplStandingsResponse } from '@web-crawler/shared-types';

const SOURCE_ID = 'football-data.org';

// API client — auth header required on every request
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

export interface FootballDataJobData {
  competition: string; // 'PL' for Premier League
}

export function createFootballDataWorker(): Worker<FootballDataJobData> {
  const worker = new Worker<FootballDataJobData>(
    'crawl:football-data.org',
    async (job: Job<FootballDataJobData>): Promise<void> => {
      const { competition } = job.data;
      const url = `https://api.football-data.org/v4/competitions/${competition}/standings`;

      logger.info('Football-data fetch started', { url, sourceId: SOURCE_ID, jobId: job.id });

      try {
        const data = await fetchEplStandings();

        // Phase 1: log raw response — no storage yet (storage in Phase 3)
        logger.info('football-data.org raw response', {
          url,
          sourceId: SOURCE_ID,
          jobId: job.id,
          competition: data.competition.name,
          season: data.season,
          standings: data.standings,
        });

        logger.info('Football-data fetch complete', {
          url,
          sourceId: SOURCE_ID,
          jobId: job.id,
          matchday: data.season.currentMatchday,
          teamsCount: data.standings[0]?.table.length ?? 0,
        });
      } catch (err) {
        const error = err as Error;
        logger.error('Football-data fetch failed', {
          url,
          sourceId: SOURCE_ID,
          jobId: job.id,
          err: error.message,
          stack: error.stack,
        });
        throw err; // Re-throw so BullMQ records the failure and applies retry
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job: Job<FootballDataJobData>) => {
    logger.info('Football-data job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job<FootballDataJobData> | undefined, err: Error) => {
    logger.error('Football-data job failed', { jobId: job?.id, err: err.message });
  });

  return worker;
}
```

Confirm `apps/crawler/.env.example` includes (already added in Plan 01-02, verify it's present):
```env
FOOTBALL_DATA_API_KEY=your_token_here
```

**Verify:**
```bash
cd apps/crawler && pnpm build
ls dist/queues/footballDataQueue.js dist/workers/FootballDataWorker.js
```
Both files must exist. TypeScript compilation must succeed with no errors.

**Done:** `footballDataQueue` created with correct name `crawl:football-data.org`. `FootballDataWorker` calls `/v4/competitions/PL/standings` with `X-Auth-Token` header and `User-Agent: PersonalCrawlerBot/1.0`. Logs `{ competition, season, standings }` raw response.

---

#### Task 2: Schedule the repeatable job at 30-minute intervals and wire into index.ts

**Files:**
- `apps/crawler/src/index.ts` (final version — wires all workers and schedulers)

**Action:**

Update `apps/crawler/src/workers/crawlWorker.ts` to accept an optional `additionalCleanup` callback in `setupGracefulShutdown`. The ordering MUST be: `worker.close()` first (drains in-flight jobs), then `additionalCleanup()` (closes browser pool and football worker), then `connection.quit()`:

```typescript
// In crawlWorker.ts — updated setupGracefulShutdown signature:
export async function setupGracefulShutdown(
  worker: Worker,
  additionalCleanup?: () => Promise<void>,
): Promise<void> {
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    const timeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout (30s) reached, forcing exit');
      process.exit(1);
    }, 30_000);
    timeout.unref();

    // ORDERING CRITICAL: close worker first to drain in-flight jobs,
    // THEN run additionalCleanup (closes browser pool / other workers),
    // THEN quit the Redis connection.
    await worker.close();

    if (additionalCleanup) {
      await additionalCleanup();
    }

    clearTimeout(timeout);
    await connection.quit();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
}
```

Update `apps/crawler/src/index.ts` to be the complete final entry point — use the `additionalCleanup` parameter to close the football worker and browser pool after the crawl worker drains:

```typescript
import { logger } from './logger.js';
import { createCrawlWorker, setupGracefulShutdown } from './workers/crawlWorker.js';
import { browserPool } from './workers/BrowserPool.js';
import { runPlaywrightSmokeTest } from './workers/PlaywrightWorker.js';
import { footballDataQueue } from './queues/footballDataQueue.js';
import { createFootballDataWorker } from './workers/FootballDataWorker.js';

logger.info('Crawler service starting', { service: 'crawler' });

// Initialize Playwright browser pool
await browserPool.initialize();

// ARM validation: confirm Playwright works in this Docker environment
await runPlaywrightSmokeTest();

// Start general-purpose crawl worker (Cheerio + Playwright strategies)
const crawlWorker = createCrawlWorker();

// Start football-data.org dedicated worker
const footballWorker = createFootballDataWorker();

// Schedule football-data.org EPL standings fetch every 30 minutes
// upsertJobScheduler is the BullMQ v5 API for repeatable jobs.
// It upserts — safe to call on every startup; won't create duplicate schedules.
await footballDataQueue.upsertJobScheduler(
  'epl-standings-scheduler', // stable scheduler ID — deduplicates on restart
  { every: 30 * 60 * 1000 }, // 30 minutes in milliseconds
  {
    name: 'fetch-epl-standings',
    data: { competition: 'PL' },
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

logger.info('EPL standings scheduler registered', {
  scheduleId: 'epl-standings-scheduler',
  intervalMs: 30 * 60 * 1000,
});

// Graceful shutdown — single registration via setupGracefulShutdown.
// crawlWorker drains first, then additionalCleanup closes browser pool and footballWorker.
await setupGracefulShutdown(crawlWorker, async () => {
  await browserPool.closeAll();
  await footballWorker.close();
});

logger.info('Crawler service ready', {
  queues: ['crawl:default', 'crawl:football-data.org'],
  scheduler: 'epl-standings-scheduler',
});
```

**Verify:**

Integration test with a real Redis instance and a valid `FOOTBALL_DATA_API_KEY` in `apps/crawler/.env`:

```bash
cd apps/crawler && pnpm build

# Start the full crawler service
REDIS_URL=redis://localhost:6379 node dist/index.js
```

Expected log output sequence:
1. `Crawler service starting`
2. `Initializing browser pool` with `maxBrowsers: 3`
3. `Running Playwright ARM smoke test...`
4. `Playwright ARM smoke test PASSED` with `htmlLength`
5. `EPL standings scheduler registered`
6. `Crawler service ready` with queue names
7. Within 30 seconds (or immediately if first run): `Football-data fetch started`
8. `football-data.org raw response` containing standings data
9. `Football-data fetch complete` with `teamsCount: 20` (EPL has 20 teams)

**Done:** `footballDataQueue.upsertJobScheduler` registered with 30-minute interval. Football worker processes jobs and logs `competition`, `season`, `standings`. API key sourced from `process.env.FOOTBALL_DATA_API_KEY`. `FOOTBALL_DATA_API_KEY` in `.env.example` with placeholder value. Worker closes cleanly on SIGTERM.

---

### Verification

```bash
cd apps/crawler && pnpm build

# Set a real API key
echo "FOOTBALL_DATA_API_KEY=your_actual_key" >> apps/crawler/.env

# Run the full service
REDIS_URL=redis://localhost:6379 node dist/index.js

# In a second terminal, trigger an immediate job (bypasses 30-min schedule)
node --input-type=module -e "
import { footballDataQueue } from './dist/queues/footballDataQueue.js';
await footballDataQueue.add('fetch-epl-standings', { competition: 'PL' });
console.log('Job triggered');
process.exit(0);
"
```

Logs must show `football-data.org raw response` containing a `standings` array with EPL team objects. `teamsCount` must be 20.

---

## Phase Success Criteria Verification

After all 7 plans are executed, confirm all five phase success criteria:

### Criterion 1: `docker compose up` with healthy services
```bash
docker compose up -d
sleep 30
docker compose ps
# postgres: (healthy)
# redis: (healthy)
# crawler: running
# api: running
# dashboard: running
```

### Criterion 2: BullMQ job fetches EPL standings and logs structured JSON
```bash
docker compose logs crawler | grep 'football-data.org raw response'
# Must show JSON with competition, season, standings fields
```

### Criterion 3: Playwright smoke test on ARM renders non-empty HTML
```bash
docker compose logs crawler | grep 'Playwright ARM smoke test PASSED'
# Must show htmlLength > 100
```

### Criterion 4: `turbo build` from clean checkout
```bash
pnpm install
pnpm build  # runs turbo build across all packages
# Must succeed with exit code 0
```

### Criterion 5: SIGTERM drains current job before exit
```bash
# With crawler running and a job in flight:
docker compose kill -s SIGTERM crawler
docker compose logs crawler | tail -20
# Must show "Received SIGTERM, initiating graceful shutdown..."
# then "Worker shut down cleanly"
# Must NOT show "forcing exit" (that indicates timeout was hit)
```
