# Phase 9: Real-Time Dashboard Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 09-real-time-dashboard-integration
**Areas discussed:** Connection scope, Live entries architecture, Connection status indicator, Reconnect toast

---

## Connection scope

| Option | Description | Selected |
|--------|-------------|----------|
| Global Provider | React Context wrapping DashboardLayout — connection persists across all pages. Required for nav bar indicator (SC-3) to always show state. | ✓ |
| Entries page only | useSignalR hook mounted only on /entries. Simpler scope, but nav bar indicator can only show status when on that page. | |

**User's choice:** Global Provider (Recommended)
**Notes:** Selected the recommended option; global scope is the right call given SC-3 requires the nav bar indicator to be always visible.

---

## Live entries architecture

| Option | Description | Selected |
|--------|-------------|----------|
| LiveEntriesWrapper client component | 'use client' wrapper around EntriesTable. Holds liveEntries state from SignalR events, renders prepended above server-fetched entries. RSC pattern preserved. | ✓ |
| Full EntriesClient conversion | Convert entries section to client-side-only (like SourcesClient). Fetches initial data via API client-side, merges SignalR events. Loses RSC benefits. | |

**User's choice:** LiveEntriesWrapper client component (Recommended)
**Notes:** Preserves the RSC initial load and server caching; minimal disruption to existing structure.

---

## Connection status indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar header + MobileNav header | Colored dot next to "Web Crawler" brand text in both Sidebar.tsx and MobileNav.tsx. Consistent across breakpoints. | ✓ |
| Bottom of sidebar only | Status bar pinned to sidebar bottom. Shows icon + text label. Desktop only — not visible on mobile. | |

**User's choice:** Sidebar header + MobileNav header (Recommended)
**Notes:** Green dot (Connected), yellow pulsing dot (Reconnecting), red dot (Disconnected). Both desktop sidebar and mobile nav header updated.

---

## Reconnect toast

| Option | Description | Selected |
|--------|-------------|----------|
| Add Sonner + informative message | Install Sonner (shadcn-compatible). Toast on reconnect: "Reconnected — loaded N missed entries". Toast on disconnect: "Live updates disconnected". | ✓ |
| Status indicator only, no toast | Skip toast entirely. Dot state change is the only reconnect signal. No new dependency. | |

**User's choice:** Add Sonner toast + informative message (Recommended)
**Notes:** Sonner is the standard shadcn/ui companion. Informative message with missed entry count is preferred over a generic "Reconnected".

---

## Claude's Discretion

- Exact Sonner toast position and duration
- Auto-reconnect policy config (retry intervals, max attempts) passed to `HubConnectionBuilder`
- Whether `liveEntries` and server entries share a single merged array or render as two adjacent lists
- Exact CSS for the pulsing yellow dot animation

## Deferred Ideas

None — discussion stayed within phase scope.
