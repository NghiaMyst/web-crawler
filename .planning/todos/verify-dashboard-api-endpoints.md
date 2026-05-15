---
name: verify-dashboard-api-endpoints
description: Fix incorrect POST /api/jobs endpoint references in MANUAL-UAT.md and verify all dashboard→API endpoint compatibility
metadata:
  type: todo
  area: docs
  priority: high
  status: pending
  created: 2026-05-15
---

## Task

Verify all dashboard API calls against actual .NET API endpoints, and update `docs/MANUAL-UAT.md` to fix incorrect endpoint references.

## Findings

### Dashboard API calls — all COMPATIBLE ✅

Reviewed `apps/dashboard/lib/api.server.ts` and `apps/dashboard/lib/api.client.ts` against all endpoint files in `apps/api/Endpoints/`. Every call matches:

| Dashboard call | API endpoint | Status |
|---|---|---|
| `GET /api/entries` | `EntriesEndpoints.GetEntries` | ✅ |
| `GET /api/sources` | `SourcesEndpoints.GetAllSources` | ✅ |
| `POST /api/sources` | `SourcesEndpoints.CreateSource` | ✅ |
| `PUT /api/sources/{id}` | `SourcesEndpoints.UpdateSource` | ✅ |
| `DELETE /api/sources/{id}` | `SourcesEndpoints.DeleteSource` | ✅ |
| `GET /api/jobs` | `JobsEndpoints.GetJobs` | ✅ |
| `POST /api/jobs/{id}/retry` | `JobsEndpoints.RetryJob` | ✅ |
| `GET /api/alert-rules` | `AlertRulesEndpoints.GetAlertRules` | ✅ |
| `POST /api/alert-rules` | `AlertRulesEndpoints.CreateAlertRule` | ✅ |
| `PUT /api/alert-rules/{id}` | `AlertRulesEndpoints.UpdateAlertRule` | ✅ |
| `DELETE /api/alert-rules/{id}` | `AlertRulesEndpoints.DeleteAlertRule` | ✅ |
| `GET /api/notifications` | `NotificationsEndpoints.GetNotifications` | ✅ |
| `GET /api/stats/volume` | `StatsEndpoints.GetVolume` | ✅ |

### MANUAL-UAT.md — BROKEN endpoint reference ❌

`docs/MANUAL-UAT.md` uses `POST /api/jobs` in two tests to manually trigger a crawl:

**Test 08-SC2** (line ~88):
```bash
curl -X POST http://localhost:5000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"sourceId": "<SOURCE_ID>"}'
```

**Test 09-SC1** (line ~174):
```bash
curl -X POST http://localhost:5000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"sourceId": "<PASTE_ID_HERE>"}'
```

**Problem**: `POST /api/jobs` does NOT exist. `JobsEndpoints.cs` only registers:
- `GET /` — list jobs
- `POST /{id:guid}/retry` — retry a failed job

There is no "create job" / "trigger crawl" endpoint. Crawls are driven by the Node.js crawler's internal scheduler, not by an API call.

## What Needs To Change in MANUAL-UAT.md

Replace the incorrect `POST /api/jobs` instructions with the correct approach to trigger a crawl:

**Option A** — Wait for the scheduler:
> "Wait for the next scheduled crawl (each source runs on its `crawlInterval`). Check `GET /api/jobs?status=done` to confirm a recent job completed."

**Option B** — Restart the crawler container (forces it to re-queue pending sources):
```bash
docker compose restart crawler
```

**Option C** — If a `POST /api/jobs` trigger endpoint is desired for testing convenience, add it to `JobsEndpoints.cs` (separate todo: api endpoint to manually trigger a crawl).

**Recommended**: Use Option A (scheduler-based) with a note to reduce `crawlInterval` temporarily, OR add Option B as a workaround. Update both affected test blocks in MANUAL-UAT.md.

## Files to Change

- `docs/MANUAL-UAT.md` — Fix Test 08-SC2 (line ~88) and Test 09-SC1 (line ~174)
  - Remove the `curl -X POST http://localhost:5000/api/jobs` command blocks
  - Replace with correct crawl-trigger instructions

## Acceptance Criteria

- `docs/MANUAL-UAT.md` has no references to non-existent `POST /api/jobs` endpoint
- Both affected tests explain how to actually trigger a crawl for the test
- Sign-off checklist table is updated if any test IDs change
