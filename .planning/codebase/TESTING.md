# TESTING
_Last updated: 2026-04-06_

## Current State

**No tests exist yet.** The project is pre-implementation — only planning documents are present. This document describes the intended testing strategy based on the architecture and roadmap.

---

## Recommended Test Frameworks

| Service | Framework | Why |
|---|---|---|
| `crawler/` (Node.js/TypeScript) | [Vitest](https://vitest.dev/) | Fast, native ESM, Jest-compatible API |
| `api/` (.NET ASP.NET Core) | xUnit + FluentAssertions | Standard .NET ecosystem choice |
| `dashboard/` (Next.js) | Vitest + React Testing Library | Component and hook testing |
| E2E | Playwright (reuse existing dep) | Browser automation already in the stack |

---

## Test Organization

### crawler/ (Node.js)
```
crawler/
  src/
    parsers/
      genshin.parser.ts
      genshin.parser.test.ts   ← co-locate unit tests
    bloom/
      bloom-filter.test.ts
    robots/
      robots-cache.test.ts
  tests/
    integration/               ← tests requiring Redis/DB
      queue.integration.test.ts
      dedup.integration.test.ts
```

### api/ (.NET)
```
api/
  WebCrawlerApi/
  WebCrawlerApi.Tests/
    Unit/
      Parsers/
        GenshinEventParserTests.cs
        FootballResultParserTests.cs
      Services/
        AlertRuleEvaluatorTests.cs
        DiffEngineTests.cs
    Integration/
      ApiEndpointTests.cs      ← WebApplicationFactory
```

### dashboard/ (Next.js)
```
dashboard/
  src/
    components/
      DataTable.test.tsx
      ChartWidget.test.tsx
```

---

## Priority Test Coverage

These components have the highest value-to-effort ratio for testing:

1. **Content Parsers** — Each domain parser (Genshin, Football, Anime) is pure input→output transformation. Easy to unit test with fixture HTML files.
2. **URL Deduplication (Bloom Filter)** — Probabilistic behavior should be verified: no false negatives, acceptable false positive rate.
3. **Content Hash / Dedup** — Test that identical content skips storage and notification.
4. **Alert Rule Evaluator** — The condition evaluation logic (`new_item`, `changed`, `match_finished`) is business-critical and config-driven.
5. **Diff Engine** — Verify that structural diffs in parsed JSONB data are correctly detected.
6. **robots.txt Compliance** — Test that disallowed paths are blocked, allowed paths pass.

---

## How to Run (Planned)

```bash
# crawler/ unit tests
cd crawler && npx vitest run

# crawler/ watch mode
cd crawler && npx vitest

# api/ tests
cd api && dotnet test

# dashboard/ tests
cd dashboard && npx vitest run

# E2E (requires running stack)
npx playwright test
```

---

## Integration Test Strategy

Integration tests require:
- PostgreSQL (use Docker Compose test profile or testcontainers)
- Redis (use Docker Compose or testcontainers)

For .NET: use `WebApplicationFactory<Program>` with a test PostgreSQL container.
For Node.js: use `@testcontainers/postgresql` and `@testcontainers/redis` if needed.

---

## What NOT to Test

- Third-party library behavior (BullMQ, Playwright, Cheerio internals)
- External sites (mocked or fixture HTML only — never live crawl in tests)
- Docker/infrastructure config

---

## Coverage Targets (Phase 1–2)

| Area | Target |
|---|---|
| Domain parsers | 90%+ (pure functions, easy to cover) |
| Dedup logic | 85%+ |
| Alert rule evaluator | 85%+ |
| API endpoints | Integration test per endpoint |
| Dashboard components | Key data-display components only |
