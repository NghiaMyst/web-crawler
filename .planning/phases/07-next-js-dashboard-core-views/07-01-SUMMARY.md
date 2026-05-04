---
phase: 07-next-js-dashboard-core-views
plan: "01"
subsystem: dashboard-foundation
tags: [nextjs, tailwind, shadcn, api-client, zod, react-hook-form, typescript]
dependency_graph:
  requires: []
  provides:
    - Tailwind v4 compiled CSS via PostCSS
    - Shadcn/ui components in components/ui/
    - "@/lib/api.server.ts — server-side typed fetch with import 'server-only' guard"
    - "@/lib/api.client.ts — browser-safe typed fetch using NEXT_PUBLIC_API_URL"
    - "@/types/api.ts — TypeScript interfaces matching .NET API camelCase JSON shapes"
    - "@/lib/schemas/source.ts — Zod sourceSchema shared between form and Server Action"
  affects:
    - apps/dashboard — all downstream Phase 7 plans (07-02 layout, 07-03 entries, 07-04 sources, 07-05 jobs)
tech_stack:
  added:
    - tailwindcss@4.2.4
    - "@tailwindcss/postcss@4.2.4"
    - tailwind-merge@2.5.5
    - shadcn@4.5.0 (CLI — generates component source)
    - server-only@0.0.1
    - react-hook-form@7.74.0
    - zod@4.3.6
    - "@hookform/resolvers@5.2.2"
    - lucide-react (bundled by shadcn init)
    - class-variance-authority (bundled by shadcn init)
    - clsx (bundled by shadcn init)
    - tw-animate-css (bundled by shadcn init)
  patterns:
    - Tailwind v4 CSS-first configuration (no tailwind.config.js — all in globals.css @theme block)
    - Shadcn/ui copy-paste Radix primitives pattern (generated into components/ui/, regeneration-safe)
    - Next.js server-only import guard for private env var protection
    - Split API client pattern: api.server.ts (API_URL) / api.client.ts (NEXT_PUBLIC_API_URL)
    - Zod schema shared between client form validation and Server Action server-side validation
key_files:
  created:
    - apps/dashboard/postcss.config.mjs
    - apps/dashboard/components.json
    - apps/dashboard/next-env.d.ts
    - apps/dashboard/lib/utils.ts
    - apps/dashboard/lib/api.server.ts
    - apps/dashboard/lib/api.client.ts
    - apps/dashboard/lib/schemas/source.ts
    - apps/dashboard/types/api.ts
    - apps/dashboard/components/ui/button.tsx
    - apps/dashboard/components/ui/dialog.tsx
    - apps/dashboard/components/ui/table.tsx
    - apps/dashboard/components/ui/select.tsx
    - apps/dashboard/components/ui/badge.tsx
    - apps/dashboard/components/ui/input.tsx
    - apps/dashboard/components/ui/label.tsx
    - apps/dashboard/components/ui/sheet.tsx
    - apps/dashboard/components/ui/skeleton.tsx
  modified:
    - apps/dashboard/package.json (added tailwindcss, @tailwindcss/postcss, server-only, react-hook-form, zod, @hookform/resolvers and shadcn-bundled deps)
    - apps/dashboard/tsconfig.json (removed next/typescript extends — Turbopack incompatible; inlined Next.js TS settings; added @/* path alias + baseUrl)
    - apps/dashboard/app/globals.css (added @import "tailwindcss", @import "tw-animate-css", @import "shadcn/tailwind.css", @theme inline CSS variables, :root/:dark blocks; preserved box-sizing + body rules)
    - apps/dashboard/app/layout.tsx (shadcn init added Geist font import and cn() className)
    - apps/dashboard/.env.example (added API_URL=http://localhost:5000)
decisions:
  - "Removed extends: 'next/typescript' from tsconfig.json — Turbopack cannot resolve this package subpath and fails with 'doesn't resolve correctly' build error. Inlined equivalent TypeScript settings (target, lib, module, moduleResolution: bundler, jsx, etc.) directly. Next.js auto-adjusts jsx to react-jsx and adds .next/dev/types to include on first build."
  - "shadcn init --defaults used (Nova preset, Radix library) — no --base-color flag exists in shadcn@4.5.0; the Nova preset uses zinc-equivalent neutral oklch colors matching design intent"
  - ".env is gitignored (correct security behavior) — only .env.example committed; .env created locally for development"
  - "All shadcn components generated from registry via pnpm dlx shadcn@4.5.0 add — not manually authored; regeneration-safe"
metrics:
  duration_minutes: 25
  completed_date: "2026-05-04"
  tasks_completed: 3
  files_created: 19
  files_modified: 5
---

# Phase 07 Plan 01: Dashboard Foundation (Tailwind + Shadcn + API Clients) Summary

Bootstrap the Next.js dashboard with Tailwind CSS v4, Shadcn/ui components, typed API client modules (server/client split), TypeScript interfaces matching the .NET API, and a shared Zod schema for source form validation.

## What Was Built

### Versions Installed

| Package | Version |
|---------|---------|
| tailwindcss | 4.2.4 |
| @tailwindcss/postcss | 4.2.4 |
| tailwind-merge | 2.5.5 |
| shadcn CLI | 4.5.0 |
| server-only | 0.0.1 |
| react-hook-form | 7.74.0 |
| zod | 4.3.6 |
| @hookform/resolvers | 5.2.2 |
| lucide-react | ^1.14.0 (bundled by shadcn) |
| class-variance-authority | ^0.7.1 (bundled by shadcn) |

### Path Alias

`@/*` maps to `./*` (dashboard root) — configured in `compilerOptions.paths` in `tsconfig.json`. All imports use `@/components/ui/...`, `@/lib/...`, `@/types/...`.

### Shadcn Components Generated (9 files in `components/ui/`)

button, dialog, table, select, badge, input, label, sheet, skeleton

### API Endpoint Shape Confirmation

The `.NET` API response shapes (used for TypeScript interface definitions) were verified directly from source files:

- `/api/entries`: `{ items: DataEntry[], nextCursor: string | null }` — confirmed from `EntriesEndpoints.cs` cursor pagination implementation. Query params: `category`, `sourceId` (Guid), `from`/`to` (ISO 8601), `cursor` (base64), `limit`.
- `/api/sources`: Source entity with camelCase fields via `JsonNamingPolicy.CamelCase` in Program.cs. Key fields: `crawlInterval` (not `crawl_interval`), `isActive`, `createdAt`, `updatedAt`.
- `/api/jobs`: CrawlJob entity; `POST /api/jobs/{id}/retry` returns `{ jobId, status: "pending" }`.

Note: API must be running at `http://localhost:5000` for runtime data fetching. Build-time verification via TypeScript only — no live API call was made during this plan.

### Files Created

19 files created across `components/ui/`, `lib/`, `types/`, and config files at dashboard root.

### Key Locations

- `apps/dashboard/lib/api.server.ts` — server-only typed fetch; `import 'server-only'` guard prevents client bundle inclusion (T-07-01 mitigation)
- `apps/dashboard/lib/api.client.ts` — browser-safe fetch using `NEXT_PUBLIC_API_URL` only (T-07-02 mitigation)
- `apps/dashboard/lib/schemas/source.ts` — Zod schema for source create/edit form (T-07-03 mitigation base)
- `apps/dashboard/types/api.ts` — TypeScript interfaces for Source, CrawlJob, DataEntry, PaginatedEntries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `extends: "next/typescript"` from tsconfig.json**

- **Found during:** Task 1 — first build attempt
- **Issue:** Turbopack (used by `next build` in Next.js 16) cannot resolve `next/typescript` as a tsconfig `extends` path. The `next/typescript` value is a package subpath export, but the `next` package has no exports map — Turbopack's tsconfig parser fails with "extends: 'next/typescript' doesn't resolve correctly". The regular `tsc` compiler would resolve it, but Turbopack uses a different resolution mechanism.
- **Fix:** Inlined the equivalent TypeScript compiler options that `next/typescript` provides: `target: ES2017`, `lib: [dom, dom.iterable, esnext]`, `allowJs`, `skipLibCheck`, `esModuleInterop`, `module: esnext`, `moduleResolution: bundler`, `resolveJsonModule`, `isolatedModules`, `jsx: preserve`, `incremental`, `plugins: [next]`. Next.js auto-adjusted `jsx` to `react-jsx` on first build run.
- **Files modified:** `apps/dashboard/tsconfig.json`
- **Commit:** 2902481

**2. [Rule 3 - Blocking] shadcn init requires path alias and Tailwind v4 CSS import before running**

- **Found during:** Task 1 — shadcn init failed with "No Tailwind CSS configuration found" and "No import alias found"
- **Issue:** shadcn CLI v4.5.0 validates (1) Tailwind v4 is importable via `@import "tailwindcss"` in globals.css and (2) `@/*` path alias exists in tsconfig.json before proceeding. Neither existed in the base Next.js scaffold.
- **Fix:** Applied both prerequisites before running shadcn init: updated globals.css with `@import "tailwindcss"`, updated tsconfig.json with `baseUrl: "."` and `paths: {"@/*": ["./*"]}`.
- **Files modified:** `apps/dashboard/app/globals.css`, `apps/dashboard/tsconfig.json`
- **Commit:** Part of 2902481

**3. [Rule 1 - Bug] `--base-color` flag does not exist in shadcn@4.5.0**

- **Found during:** Task 1 — shadcn init with `--base-color zinc` flag
- **Issue:** The plan specified `pnpm dlx shadcn@4.5.0 init --yes --base-color zinc --css-variables` but shadcn@4.5.0 has no `--base-color` flag (unknown option error). The v4 CLI uses `--defaults` to select the Nova preset.
- **Fix:** Used `--defaults` flag instead. The Nova preset uses neutral/zinc-equivalent oklch colors that match the design intent.
- **Files modified:** No extra files — same output produced
- **Commit:** Part of 2902481

**4. [Rule 3 - Blocking] worktree has separate filesystem, all initial work went to wrong directory**

- **Found during:** Task 1 — initial pnpm installs ran in `D:/project/mcp/web-crawler/apps/dashboard` (main repo) instead of the worktree path
- **Issue:** The git worktree at `D:/project/mcp/web-crawler/.claude/worktrees/agent-a515f90f5f5a07f15/` is a separate checkout. Running pnpm commands with `cd D:/project/mcp/web-crawler/apps/dashboard` modified the main repo, not the worktree branch.
- **Fix:** Identified worktree path, ran `pnpm install` in worktree, repeated all installation steps from the correct directory `D:/project/mcp/web-crawler/.claude/worktrees/agent-a515f90f5f5a07f15/apps/dashboard`.
- **Files modified:** All worktree files
- **Commit:** All three task commits are in the correct worktree branch

## Known Stubs

None — this plan creates infrastructure only (config, API clients, types, schema). No UI components with data sources were created. All downstream plans (07-02 through 07-05) will wire the actual data.

## Threat Flags

No new threat surface beyond what was modeled in the plan's threat register. The `import 'server-only'` guard (T-07-01), NEXT_PUBLIC separation (T-07-02), and Zod schema foundation (T-07-03) were all implemented as planned.

## Self-Check: PASSED

All 16 expected files confirmed present on disk. All 3 task commits confirmed in git log.

| Check | Result |
|-------|--------|
| postcss.config.mjs | FOUND |
| components.json | FOUND |
| lib/utils.ts | FOUND |
| lib/api.server.ts | FOUND |
| lib/api.client.ts | FOUND |
| lib/schemas/source.ts | FOUND |
| types/api.ts | FOUND |
| components/ui/* (9 files) | FOUND |
| Commit 2902481 (Task 1) | FOUND |
| Commit 93c0307 (Task 2) | FOUND |
| Commit e91621e (Task 3) | FOUND |
