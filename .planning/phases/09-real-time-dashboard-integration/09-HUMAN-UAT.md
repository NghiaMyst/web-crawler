---
status: partial
phase: 09-real-time-dashboard-integration
source: [09-VERIFICATION.md]
started: 2026-05-07T09:15:00Z
updated: 2026-05-07T09:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live entry push (SC-1)
expected: Trigger a crawl while dashboard is open; new entry appears at top of the data table within ~3 seconds without page refresh. The SignalR NewEntry event should prepend the entry above server-fetched rows.
result: [pending]

### 2. Reconnect and gap recovery (SC-2)
expected: Simulate a network disconnect (e.g., briefly stop the API or kill the hub). ConnectionDot should transition yellow (Reconnecting) then green (Connected) on restore. A toast should appear: "Reconnected — loaded N missed entries" (or "no missed entries" if none were crawled during the gap).
result: [pending]

### 3. Visual connection indicator rendering (SC-3)
expected: ConnectionDot renders in the Sidebar (desktop) and MobileNav (mobile) next to the "Web Crawler" brand text. Green dot when connected, yellow pulsing dot when reconnecting, red dot when disconnected. Verify `role="status"` and correct `aria-label` via browser DevTools accessibility tree.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
