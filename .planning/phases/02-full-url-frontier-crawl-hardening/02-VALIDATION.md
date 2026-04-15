---
phase: 2
slug: full-url-frontier-crawl-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | CRAWL-04 | — | N/A | unit | `npx vitest run src/bloom.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | CRAWL-04 | — | N/A | unit | `npx vitest run src/bloom.test.ts` | ✅ | ⬜ pending |
| 2-02-01 | 02 | 1 | CRAWL-05 | — | N/A | unit | `npx vitest run src/politeness.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 1 | CRAWL-06 | — | N/A | unit | `npx vitest run src/robots.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 1 | CRAWL-07 | — | N/A | unit | `npx vitest run src/content-hash.test.ts` | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 1 | CRAWL-08, CRAWL-09 | — | N/A | unit | `npx vitest run src/retry.test.ts` | ❌ W0 | ⬜ pending |
| 2-06-01 | 06 | 1 | SRC-02, SRC-03, SRC-04, SRC-05 | — | N/A | integration | manual log check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/bloom.test.ts` — stubs for CRAWL-04
- [ ] `src/politeness.test.ts` — stubs for CRAWL-05
- [ ] `src/robots.test.ts` — stubs for CRAWL-06
- [ ] `src/content-hash.test.ts` — stubs for CRAWL-07
- [ ] `src/retry.test.ts` — stubs for CRAWL-08, CRAWL-09
- [ ] `vitest` install — no test framework exists yet

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All five sources produce raw crawl output in logs | SRC-02, SRC-03, SRC-04, SRC-05 | Live API calls required; no mocking | Run scheduler, trigger each worker, inspect stdout for raw response logs |
| HoYoWiki scraper produces output | SRC-02 | Endpoint uncertain; Cheerio fallback | Run GenshinWorker, confirm raw HTML or JSON logged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
