---
phase: 11
slug: search-foundation-content-depth-fixes-postgresql-fts-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | xUnit (.NET) + Jest/Vitest (dashboard) |
| **Config file** | `apps/api/WebCrawler.Api.Tests/WebCrawler.Api.Tests.csproj` |
| **Quick run command** | `cd apps/api && dotnet test --filter "Category!=Integration" --no-build` |
| **Full suite command** | `cd apps/api && dotnet test && cd ../../apps/dashboard && npm test -- --run` |
| **Estimated runtime** | ~30 seconds (unit), ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && dotnet test --filter "Category!=Integration" --no-build`
- **After every plan wave:** Run `cd apps/api && dotnet test && cd ../../apps/dashboard && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | Parser depth | — | Parsers produce non-empty text fields | unit | `dotnet test --filter "Parser"` | ⬜ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | FTS migration | — | Migration runs without error | integration | `dotnet ef database update` | ❌ manual | ⬜ pending |
| 11-03-01 | 03 | 2 | Search API `?q=` | — | Search returns filtered results | integration | `dotnet test --filter "Search"` | ⬜ W0 | ⬜ pending |
| 11-04-01 | 04 | 3 | Dashboard search UI | — | Search input renders, navigates on Enter | manual | `npm test -- --run` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/WebCrawler.Api.Tests/Parsers/ParserDepthTests.cs` — stubs verifying each parser produces non-empty key fields
- [ ] `apps/api/WebCrawler.Api.Tests/Endpoints/EntriesSearchTests.cs` — stubs for `?q=` filter behavior (marked Integration, skipped in unit runs)
- [ ] `apps/dashboard/__tests__/SearchInput.test.tsx` — stub for search input rendering and form navigation

*Note: FTS-specific integration tests require a real PostgreSQL connection — cannot use InMemory EF provider. Mark with `[Trait("Category", "Integration")]`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GIN index created on `search_vector` | FTS performance | DDL cannot be asserted in unit tests | `\d data_entries` in psql, confirm GIN index visible |
| trigger fires on INSERT | FTS population | Trigger behavior requires live DB | Insert a test row, query `search_vector` column is non-null |
| `ts_headline()` / client mark renders highlighted term | D-11 | HTML output requires browser render | Search for known term, verify `<mark>` wraps matched tokens in UI |
| Search preserves category/source filters | D-10 | URL param persistence requires browser interaction | Filter by category, then search — both params appear in URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
