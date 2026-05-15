---
phase: 08-next-js-dashboard-alerts-charts
plan: "02"
subsystem: dashboard + api
tags: [nextjs, dotnet, minimal-api, notification-log, read-only, url-filter]
dependency_graph:
  requires:
    - 08-01 (AlertRule types, fetchSources, NavLinks pattern)
  provides:
    - GET /api/notifications endpoint with optional ?sourceId filter
    - NotificationLog TypeScript type
    - fetchNotifications() helper in api.server.ts
    - /notifications page with source filter (URL params)
    - NotificationsClient, NotificationsTable, NotificationsEmptyState components
    - NavLinks updated with History icon + /notifications entry
key_files:
  created:
    - apps/api/Endpoints/NotificationsEndpoints.cs
    - apps/dashboard/app/notifications/page.tsx
    - apps/dashboard/components/notifications/NotificationsClient.tsx
    - apps/dashboard/components/notifications/NotificationsTable.tsx
    - apps/dashboard/components/notifications/NotificationsEmptyState.tsx
  modified:
    - apps/api/Program.cs (registered /api/notifications and /api/stats groups)
    - apps/dashboard/types/api.ts (NotificationLog, VolumeDataPoint types added)
    - apps/dashboard/lib/api.server.ts (fetchNotifications, fetchVolumeStats added)
    - apps/dashboard/components/layout/NavLinks.tsx (History + /notifications, BarChart2 + /charts added)
metrics:
  completed_date: "2026-05-14"
  tasks_completed: 1
  files_changed: 9
---

# Phase 08 Plan 02: Notification History Page Summary

## One-liner

Notification history page at `/notifications` with read-only table (Status/Channel/AlertRule/Message/SentAt) and source filter via URL params, backed by a new GET /api/notifications .NET endpoint.

## What Was Built

Added `NotificationsEndpoints.cs` to the .NET API with a `GET /api/notifications` handler that joins NotificationLog → AlertRule → Source, returns a flat DTO with alertRuleName and sourceName, and supports optional `?sourceId` query param for filtering. Registered under `/api/notifications` in Program.cs (along with /api/stats for plan 08-04).

On the frontend: `NotificationsClient` uses `useRouter.push` to manage the `?sourceId` URL param (server-side refetch on filter change, matching entries page pattern). `NotificationsTable` renders 5 columns with status/channel Badge components using the UI-SPEC color tokens. `NotificationsEmptyState` renders when no logs exist. NavLinks updated with `History` icon for `/notifications` and `BarChart2` icon for `/charts`.

TypeScript types `NotificationLog` and `VolumeDataPoint` added to `types/api.ts`. Import block in `api.server.ts` fixed to include both new types at the top.

## Verification Results

- `pnpm --filter @web-crawler/dashboard type-check` — 0 errors
- `pnpm --filter @web-crawler/dashboard build` — `/notifications` appears as ƒ (dynamic) route
- `dotnet build apps/api/WebCrawlerApi.csproj` — Build succeeded, 0 warnings, 0 errors

## Self-Check: PASSED
