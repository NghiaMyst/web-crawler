---
phase: 07
slug: next-js-dashboard-core-views
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | `apps/dashboard/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @web-crawler/dashboard test` |
| **Full suite command** | `pnpm --filter @web-crawler/dashboard test` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @web-crawler/dashboard test`
- **After every plan wave:** Run `pnpm --filter @web-crawler/dashboard test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-T1 | 01 | 1 | DASH-01, DASH-04 | — | Tailwind/Shadcn foundation builds without errors | build | `pnpm --filter @web-crawler/dashboard build` | ✅ | ✅ green |
| 07-01-T2 | 01 | 1 | DASH-04 | T-07-01, T-07-02 | `api.server.ts` has `import 'server-only'` guard; `api.client.ts` does NOT reference `API_URL` | unit | `pnpm --filter @web-crawler/dashboard test` | ✅ | ✅ green |
| 07-01-T3 | 01 | 1 | DASH-03 | T-07-03 | `sourceSchema` rejects invalid/missing fields; `sourceUpdateSchema` is scoped to mutable fields only | unit | `pnpm --filter @web-crawler/dashboard test` | ✅ | ✅ green |
| 07-02-T1 | 02 | 2 | DASH-01, DASH-03 | T-07-06, T-07-07 | Layout components compile; nav labels hardcoded (no XSS surface); error.tsx logs but never renders error object | build | `pnpm --filter @web-crawler/dashboard build` | ✅ | ✅ green |
| 07-02-T2 | 02 | 2 | DASH-01 | T-07-09 | Root redirect uses hardcoded `/entries` path (no open redirect) | build | `pnpm --filter @web-crawler/dashboard build` | ✅ | ✅ green |
| 07-03-T1 | 03 | 3 | DASH-01 | T-07-10, T-07-11 | EntriesTable renders payload as escaped text; searchParams flow to URLSearchParams (no XSS) | type-check | `pnpm --filter @web-crawler/dashboard type-check` | ✅ | ✅ green |
| 07-03-T2 | 03 | 3 | DASH-01 | T-07-13 | Load More appends rows (not replaces); filter URL updates reset cursor | build | `pnpm --filter @web-crawler/dashboard build` | ✅ | ✅ green |
| 07-04-T1 | 04 | 3 | DASH-03 | T-07-15 | `createSourceAction` returns `{ ok: false, fieldErrors }` on invalid input; API call never made | unit | `pnpm --filter @web-crawler/dashboard test` | ✅ | ✅ green |
| 07-04-T2 | 04 | 3 | DASH-03 | T-07-16, T-07-17, T-07-19 | SourcesTable renders URLs as text (no href); delete rollback restores baseSources on error | build | `pnpm --filter @web-crawler/dashboard build` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 was generated retroactively (State B — no prior VALIDATION.md). All files created in commit `e35d86e`:

- [x] `apps/dashboard/vitest.config.ts` — vitest with node env, `@/*` alias, mocks for `server-only` and `next/cache`
- [x] `apps/dashboard/__tests__/__mocks__/server-only.ts` — no-op stub
- [x] `apps/dashboard/__tests__/__mocks__/next-cache.ts` — no-op stub for `revalidatePath`
- [x] `apps/dashboard/__tests__/api-safety.test.ts` — Gaps 1–2 (T-07-01, T-07-02)
- [x] `apps/dashboard/__tests__/source-schema.test.ts` — Gaps 3–6 (T-07-03, DASH-03)
- [x] `apps/dashboard/__tests__/source-actions.test.ts` — Gap 7 (T-07-15)
- [x] `vitest` added to `devDependencies` in `apps/dashboard/package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar 240px width visible on desktop | DASH-01 | CSS layout — requires browser rendering | Open dashboard at ≥768px viewport, inspect sidebar width |
| Mobile hamburger Sheet drawer opens/closes | DASH-01 | Requires touch/click interaction in browser | Resize to <768px, click hamburger, verify Sheet opens; click nav link, verify Sheet closes |
| Active nav link highlighted (zinc-900 bg) | DASH-01 | Requires runtime URL + CSS application | Navigate to /entries, /sources — verify highlighted link per UI-SPEC |
| Load More appends rows without page reload | DASH-01 | Requires live API + browser interaction | With API running, scroll to bottom of /entries, click "Load 20 more", verify rows append |
| Optimistic delete disappears immediately | DASH-03 | Requires useOptimistic runtime behavior | Click delete on a source, confirm — row should vanish before API responds |
| Edit modal disables immutable fields | DASH-03 | Requires browser form interaction | Click edit on a source — verify name/category/parserKey/crawlerType inputs are disabled |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 test coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all 7 MISSING gaps
- [x] No watch-mode flags (using `vitest run`, not `vitest`)
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-04

---

## Validation Audit 2026-05-04

| Metric | Count |
|--------|-------|
| Gaps found | 7 |
| Resolved (automated) | 7 |
| Escalated to manual | 0 |
| Test files created | 3 |
| Total test cases | 21 |
