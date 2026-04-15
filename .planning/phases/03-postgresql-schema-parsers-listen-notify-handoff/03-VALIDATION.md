---
phase: 3
slug: postgresql-schema-parsers-listen-notify-handoff
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | dotnet test (xUnit) for .NET; jest/ts-jest for Node.js |
| **Config file** | `apps/api/WebCrawlerApi.Tests/` (to be created Wave 0), `apps/crawler/jest.config.ts` |
| **Quick run command** | `dotnet test apps/api --no-build --filter "Category=Unit"` |
| **Full suite command** | `dotnet test apps/api && cd apps/crawler && pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `dotnet build apps/api` (compile gate)
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green + manual LISTEN/NOTIFY smoke test
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | STORE-04 | — | N/A | integration | `dotnet ef database update; psql -c "\dt"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | STORE-02 | — | N/A | integration | `psql -c "EXPLAIN ANALYZE SELECT * FROM data_entries WHERE payload @> '{}'::jsonb"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | PARSE-03 | — | N/A | integration | Manual: crawl job → check .NET logs for "NOTIFY received" within 1s | ❌ manual | ⬜ pending |
| 03-03-01 | 03 | 2 | PARSE-01 | — | N/A | unit | `dotnet test --filter "ParserResolver"` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | PARSE-02 | — | N/A | unit | `dotnet test --filter "KeyedServiceDispatch"` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | STORE-01 | — | N/A | integration | `psql -c "SELECT COUNT(*) FROM data_entries WHERE category='football'"` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | STORE-03 | — | N/A | unit | `dotnet test --filter "EntryKey"` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 3 | STORE-01 | — | N/A | integration | `psql -c "SELECT DISTINCT category FROM data_entries"` shows all 5 categories | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/WebCrawlerApi.Tests/WebCrawlerApi.Tests.csproj` — xUnit test project referencing main project
- [ ] `apps/api/WebCrawlerApi.Tests/Parsers/FootballParserTests.cs` — stub tests for Football + Genshin parsers (REQ STORE-01, STORE-03)
- [ ] `apps/api/WebCrawlerApi.Tests/Services/ParserResolverTests.cs` — stub tests for keyed service dispatch (REQ PARSE-01, PARSE-02)

*Wave 0 creates minimal stubs; full test bodies filled in during plan execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NOTIFY triggers .NET listener within 1s | PARSE-03 | Requires live PostgreSQL + running services | `docker compose up`, trigger crawl job, watch .NET logs for "NOTIFY received: crawler_events" |
| GIN index used for JSONB filter | STORE-02 | Requires live DB with data | `psql -c "EXPLAIN ANALYZE SELECT * FROM data_entries WHERE payload @> '{\"is_active\":true}'::jsonb"` — must show "Bitmap Index Scan on idx_data_entries_payload" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
