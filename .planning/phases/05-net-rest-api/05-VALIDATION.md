---
phase: 5
slug: net-rest-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | xUnit (dotnet test) |
| **Config file** | `WebCrawler.Api.Tests/WebCrawler.Api.Tests.csproj` — Wave 0 creates |
| **Quick run command** | `dotnet test WebCrawler.Api.Tests/ --no-build -q` |
| **Full suite command** | `dotnet test WebCrawler.Api.Tests/ -v normal` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `dotnet test WebCrawler.Api.Tests/ --no-build -q`
- **After every plan wave:** Run `dotnet test WebCrawler.Api.Tests/ -v normal`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | API-01 | — | N/A | build | `dotnet build WebCrawler.Api/` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 0 | API-01 | — | N/A | build | `dotnet build WebCrawler.Api/` | ❌ W0 | ⬜ pending |
| 5-01-03 | 01 | 0 | API-01 | T-5-01 | CORS restricted to allowed origins | integration | `dotnet test --filter TestCategory=CORS` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | API-02 | — | N/A | unit | `dotnet test --filter TestCategory=Entries` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | API-02 | — | N/A | integration | `dotnet test --filter TestCategory=CursorPagination` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 1 | API-03,API-04 | T-5-02 | Input validation prevents injection | integration | `dotnet test --filter TestCategory=SourcesCRUD` | ❌ W0 | ⬜ pending |
| 5-04-01 | 04 | 2 | API-05,API-06 | T-5-03 | Job retry checks job ownership | integration | `dotnet test --filter TestCategory=Jobs` | ❌ W0 | ⬜ pending |
| 5-04-02 | 04 | 2 | API-07,API-08,API-09 | — | N/A | integration | `dotnet test --filter TestCategory=AlertRules` | ❌ W0 | ⬜ pending |
| 5-05-01 | 05 | 2 | API-11 | — | N/A | integration | `dotnet test --filter TestCategory=Health` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `WebCrawler.Api.Tests/WebCrawler.Api.Tests.csproj` — xUnit test project targeting `net8.0`
- [ ] `WebCrawler.Api.Tests/Fixtures/WebApplicationFactoryFixture.cs` — shared `WebApplicationFactory<Program>` fixture
- [ ] `WebCrawler.Api.Tests/EntriesEndpointTests.cs` — stubs for API-02 cursor pagination
- [ ] `WebCrawler.Api.Tests/SourcesEndpointTests.cs` — stubs for API-03, API-04 CRUD
- [ ] `WebCrawler.Api.Tests/JobsEndpointTests.cs` — stubs for API-05, API-06
- [ ] `WebCrawler.Api.Tests/AlertRulesEndpointTests.cs` — stubs for API-07, API-08, API-09
- [ ] `WebCrawler.Api.Tests/HealthEndpointTests.cs` — stubs for API-11

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BullMQ queue picks up retried job within 5 seconds | API-06 | Requires live Redis + running Node crawler worker | 1. Start crawler workers. 2. Find dead-letter job ID. 3. POST /api/jobs/{id}/retry. 4. Watch BullMQ dashboard or Redis key for status transition within 5s |
| Swagger UI accessible at /swagger | API-01 | UI rendering not covered by unit tests | Navigate to http://localhost:5000/swagger and verify all endpoints listed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
