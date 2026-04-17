# Phase 5: .NET REST API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 05-net-rest-api
**Areas discussed:** API style, Cursor pagination design, Job retry mechanics, DTO vs entity serialization

---

## API Style

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal API — route extensions | Keep minimal API, split into extension files (SourcesEndpoints.cs, EntriesEndpoints.cs, etc.). Consistent with existing /health pattern. | ✓ |
| Controllers | Traditional [ApiController] + [Route] classes. More familiar, easier attribute application. | |
| Minimal API — all in Program.cs | All routes directly in Program.cs. Simplest but noisy at 11+ endpoints. | |

**User's choice:** Minimal API with route extension files
**Notes:** None

| Follow-up: MapGroup | Description | Selected |
|---------------------|-------------|----------|
| Yes, use MapGroup | app.MapGroup("/api/sources").MapSourcesEndpoints() — DRY prefix, clean extension method signature. | ✓ |
| No, specify full paths | Each endpoint specifies its full path explicitly. | |

**User's choice:** Yes, use MapGroup

---

## Cursor Pagination Design

| Option | Description | Selected |
|--------|-------------|----------|
| Opaque base64 (crawled_at + id) | Cursor encodes (crawled_at DESC, id DESC) as base64 JSON. Stable across inserts, handles ties. | ✓ |
| ID-only keyset | Cursor is base64(last_id). Simpler but insertion-order only. | |
| Offset pagination | ?page=2&limit=20. Simple but degrades on large datasets. | |

**User's choice:** Opaque base64 (crawled_at + id) keyset pagination

| Follow-up: Page size | Description | Selected |
|---------------------|-------------|----------|
| Default 20, max 100 | ?limit defaults to 20, capped at 100. Aligns with success criteria. | ✓ |
| Fixed 20, no override | Always 20. Simpler. | |
| Default 50, max 200 | Larger pages. | |

**User's choice:** Default 20, max 100

---

## Job Retry Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Update DB + publish Redis signal | Set status='pending', attempt_count=0 in DB, then PUBLISH retry-job {job_id} on Redis Pub/Sub. Node.js subscribes and enqueues immediately. | ✓ |
| Update DB only, Node.js polls | Set status='pending' only. Node.js poller picks it up every few seconds. | |
| Write directly to BullMQ Redis key | .NET constructs BullMQ Redis data structure directly. Brittle. | |

**User's choice:** Update DB + publish Redis Pub/Sub signal

| Follow-up: attempt_count reset | Description | Selected |
|-------------------------------|-------------|----------|
| Reset to 0 | Manual retry is a fresh start — full 3-attempt budget. | ✓ |
| Preserve attempt_count | Keeps lifetime history. May fail immediately if already at max. | |

**User's choice:** Reset attempt_count to 0

---

## DTO vs Entity Serialization

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal DTOs for complex cases | Return entities directly for simple CRUD. Use DataEntryResponse DTO only for DataEntry to handle JSONB and circular refs. | ✓ |
| Full DTOs for everything | Separate record types for every resource. Clean separation but more code. | |
| Entities directly everywhere | Return entities as-is everywhere. Risk: circular navigation properties. | |

**User's choice:** Minimal DTOs — entities for Sources/AlertRules/Jobs, DTO for DataEntry

| Follow-up: JSONB serialization | Description | Selected |
|-------------------------------|-------------|----------|
| Raw JsonElement passthrough | Serialize Payload/Condition as raw inline JSON. Client gets {"payload": {...}} not escaped string. | ✓ |
| Escaped string | Serialize JSONB as JSON string. Requires client-side double-parse. | |

**User's choice:** Raw JsonElement passthrough

---

## Claude's Discretion

- Swagger/OpenAPI setup
- Error response shape (ProblemDetails vs custom)
- Input validation approach
- Exact EF Core query structure for filters

## Deferred Ideas

None.
