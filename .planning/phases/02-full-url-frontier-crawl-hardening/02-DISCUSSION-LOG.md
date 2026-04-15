# Phase 2: Full URL Frontier & Crawl Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-08
**Phase:** 02-full-url-frontier-crawl-hardening
**Mode:** discuss

## Gray Areas Presented

| Area | Description | Status |
|------|-------------|--------|
| Politeness enforcement | Redis-timestamp vs per-domain BullMQ queue | User decided |
| Bloom Filter persistence | In-memory vs Redis-backed for Phase 2 | User decided |
| New source worker pattern | Dedicated worker vs generic crawlWorker routing | Deferred to Claude |
| Dead-letter without DB | BullMQ failed set vs Redis interim tracking | User decided |

## Decisions Made

### Politeness Enforcement
- **Original gray area:** Redis-timestamp tracking vs per-domain BullMQ queue with rate limiter
- **User decision:** Redis
- **Captured as:** D-01 — Redis-based timestamp per domain, no queue proliferation

### Bloom Filter Persistence
- **Original gray area:** In-memory (lost on restart) vs Redis-serialized (survives restart)
- **User decision:** In-memory is enough for Phase 2
- **Captured as:** D-02 — In-memory Bloom Filter; Redis persistence deferred to Phase 10 (DEPLOY-05)

### New Source Worker Pattern
- **Original gray area:** Dedicated worker per source vs generic crawlWorker routing
- **User decision:** Claude's discretion
- **Auto-resolved:** Dedicated worker per source (FootballDataWorker pattern) — consistent with Phase 1, clear ownership
- **Captured as:** D-07 — GenshinWorker, LoLWorker, AniListWorker, MangaDexWorker

### Dead-Letter Without DB
- **Original gray area:** BullMQ built-in failed set vs interim Redis state tracking
- **User decision:** No DB approach (BullMQ current approach is enough for now)
- **Captured as:** D-06 — BullMQ failed set sufficient; DB status='failed' deferred to Phase 3

## No Corrections Needed

All gray areas resolved in first pass — 2 user decisions, 1 Claude-resolved, 1 user confirmed no-change.
