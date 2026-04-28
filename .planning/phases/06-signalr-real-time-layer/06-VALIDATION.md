---
phase: 6
slug: signalr-real-time-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | xUnit (existing) |
| **Config file** | apps/api/WebCrawler.Api.Tests/ |
| **Quick run command** | `dotnet test apps/api/WebCrawler.Api.Tests/ --no-build -q` |
| **Full suite command** | `dotnet test apps/api/ -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `dotnet test apps/api/WebCrawler.Api.Tests/ --no-build -q`
- **After every plan wave:** Run `dotnet test apps/api/ -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | API-10 | — | Hub only reachable at `/hubs/dashboard` | unit | `dotnet test --filter "SignalR"` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | API-10 | — | Broadcast fires after insert | unit | `dotnet test --filter "Broadcast"` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 3 | API-10 | — | Health endpoint reports hub connections | unit | `dotnet test --filter "Health"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/WebCrawler.Api.Tests/SignalR/DashboardHubTests.cs` — stubs for hub connection/disconnect, NewEntry event
- [ ] `apps/api/WebCrawler.Api.Tests/SignalR/BroadcastIntegrationTests.cs` — stubs for post-insert broadcast

*Existing `HealthEndpointTests.cs` covers hub connection count test if updated.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two browser tabs receive simultaneous push | API-10 | Requires live WebSocket client | Open two tabs to `/test-signalr.html`, trigger crawl, verify both update without refresh |
| Reconnect gap-fill within 30s | API-10 | Requires timed disconnect simulation | Disconnect one tab, trigger crawl, reconnect within 30s, verify entry appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
