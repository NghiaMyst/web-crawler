---
phase: 9
slug: real-time-dashboard-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `apps/dashboard/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @web-crawler/dashboard test` |
| **Full suite command** | `pnpm --filter @web-crawler/dashboard test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @web-crawler/dashboard test`
- **After every plan wave:** Run `pnpm --filter @web-crawler/dashboard test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | DASH-07 | — | SignalRProvider stores connection in useState (not ref) to avoid stale context | unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | DASH-07 | — | onreconnecting/onreconnected/onclose callbacks drive state updates | unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 2 | DASH-07 (SC-1) | — | New entry arrives in liveEntries state from NewEntry event | unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 2 | DASH-07 (row cap) | — | liveEntries trimmed to ≤200 total rows when combined with server entries | unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ W0 | ⬜ pending |
| 9-02-03 | 02 | 2 | DASH-07 | — | fetchEntriesSince called on reconnect with correct since timestamp | unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 3 | DASH-07 (SC-3) | — | ConnectionDot renders correct color class for each HubConnectionState | unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ W0 | ⬜ pending |
| 9-03-02 | 03 | 3 | DASH-07 (SC-2) | — | Auto-reconnect fires within 30s — library responsibility | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/dashboard/__tests__/signalr-context.test.ts` — stubs for DASH-07 (SC-1, SC-3, row cap, reconnect gap)
- [ ] `apps/dashboard/__tests__/__mocks__/signalr.ts` — mock for `@microsoft/signalr` (pattern: `vi.mock('@microsoft/signalr', () => ({ HubConnectionBuilder: vi.fn(), HubConnectionState: { Connected: 'Connected', Reconnecting: 'Reconnecting', Disconnected: 'Disconnected' } }))`)

*Install dependencies are not Wave 0 test stubs — they are task actions in Plan 09-01.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auto-reconnect fires within 30s after simulated disconnect | DASH-07 (SC-2) | Library-level retry policy; timing cannot be reliably unit-tested | Close browser tab, reopen after 5s; verify connection status returns to "Connected" within 30s |
| New entry appears in data table within 3s of crawl trigger | DASH-07 (SC-1) | End-to-end timing requires live hub running | Trigger manual crawl from UI, observe entry appears at top of data table without refresh |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
