---
phase: 06-signalr-real-time-layer
reviewed: 2026-04-28T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - apps/api.Tests/Endpoints/HealthEndpointTests.cs
  - apps/api.Tests/Hubs/DashboardHubTests.cs
  - apps/api.Tests/Services/CrawlerEventListenerBroadcastTests.cs
  - apps/api.Tests/Services/HubConnectionTrackerTests.cs
  - apps/api/Endpoints/HealthCheck.cs
  - apps/api/Hubs/DashboardHub.cs
  - apps/api/Program.cs
  - apps/api/Services/CrawlerEventListener.cs
  - apps/api/Services/HubConnectionTracker.cs
  - apps/api/wwwroot/test-signalr.html
findings:
  critical: 2
  warning: 2
  info: 2
  total: 6
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

The SignalR real-time layer wires up correctly at the architectural level: `HubConnectionTracker` is properly singleton-scoped and uses `Interlocked`/`Volatile` for thread safety, `DashboardHub` delegates cleanly to the tracker, `HealthCheck` exposes the count as an informational field, and `CrawlerEventListener` broadcasts via `IHubContext` with appropriate error isolation. Test coverage is well-structured.

Two critical issues were found: a scoped `IServiceScope` is created but never disposed inside `EvaluateAndNotifyAsync`, and the `CancellationToken` passed to `ExecuteSqlRawAsync` lands in the wrong position — it is silently treated as a SQL parameter rather than forwarded to the database driver. Two warnings address an XSS-risk `innerHTML` assignment in the dev HTML client and an undisposed `JsonDocument`. Two info items note a debug-only static CDN reference and the unguarded negative count in `HubConnectionTracker`.

---

## Critical Issues

### CR-01: `IServiceScope` created inside `EvaluateAndNotifyAsync` is never disposed

**File:** `apps/api/Services/CrawlerEventListener.cs:173`

**Issue:** A new `IServiceScope` is obtained from `scopeFactory.CreateScope()` and its `ServiceProvider` is immediately used to resolve `NotificationDispatcher`, but the scope is never assigned to a `using` variable. The scope — and all scoped services it owns (including `AppDbContext`, HTTP clients, etc.) — leaks for every notification processed. Under sustained load this causes connection pool exhaustion and memory growth.

**Fix:**
```csharp
// Replace lines 173-179 with a using declaration
using var dispatchScope = scopeFactory.CreateScope();
var dispatcher = dispatchScope.ServiceProvider
    .GetRequiredService<NotificationDispatcher>();

var dispatchPayload = JsonDocument.Parse(newPayloadJson);
await dispatcher.DispatchAsync(db, sourceId, upserted.Id, diff, dispatchPayload, ct);
```

---

### CR-02: `CancellationToken` passed in wrong position to `ExecuteSqlRawAsync` — silently ignored

**File:** `apps/api/Services/CrawlerEventListener.cs:197-207`

**Issue:** `ExecuteSqlRawAsync` has two relevant overloads:
- `ExecuteSqlRawAsync(string sql, params object[] parameters)` — no cancellation
- `ExecuteSqlRawAsync(string sql, CancellationToken cancellationToken, params object[] parameters)` — token comes **before** `params`

Because `ct` is placed as the last argument after `entry.SourceId, jobId, entry.Category, entry.EntryKey, JsonSerializer.Serialize(entry.Payload)`, the compiler resolves to the `params object[]` overload and boxes `ct` as an extra positional parameter `{5}`. The SQL template has no `{5}` placeholder, so EF Core silently discards it. The underlying `NpgsqlCommand` is created without a cancellation token, meaning host shutdown cannot cancel in-flight UPSERT operations.

**Fix:**
```csharp
await db.Database.ExecuteSqlRawAsync("""
    INSERT INTO data_entries (id, source_id, job_id, category, entry_key, payload, crawled_at)
    VALUES (gen_random_uuid(), {0}::uuid, {1}::uuid, {2}, {3}, {4}::jsonb, NOW())
    ON CONFLICT (source_id, entry_key)
    DO UPDATE SET
        payload = EXCLUDED.payload,
        job_id = EXCLUDED.job_id,
        crawled_at = NOW()
    """,
    ct,                                          // <-- token BEFORE params
    entry.SourceId, jobId, entry.Category, entry.EntryKey,
    JsonSerializer.Serialize(entry.Payload));
```

---

## Warnings

### WR-01: `innerHTML` assignment with unsanitized server-sourced data in dev test client

**File:** `apps/api/wwwroot/test-signalr.html:55-58`

**Issue:** `renderEntry` builds markup using `entry.category`, `entry.entryKey`, and `JSON.stringify(entry.payload)` concatenated into `li.innerHTML`. If any crawler parser produces a category or entry key containing `<script>` or event-handler attributes — or if an attacker poisons the Redis key that feeds the parser — the HTML is injected verbatim into the DOM. Although this file is described as dev-only, it is served from `wwwroot` and accessible in any environment where `app.UseStaticFiles()` is active (including staging and production as deployed today).

**Fix:** Use `textContent` for each fragment or build elements programmatically:
```javascript
function renderEntry(entry, { backfill = false } = {}) {
  const li = document.createElement('li');
  if (backfill) li.className = 'backfill';

  const ts = entry.crawledAt ? new Date(entry.crawledAt).toISOString() : '(no ts)';
  const tsMeta = document.createElement('div');
  tsMeta.className = 'timestamp';
  tsMeta.textContent = (backfill ? '[BACKFILL] ' : '') + ts
    + ' · ' + (entry.category || '(no category)')
    + ' · key=' + (entry.entryKey || '');

  const payload = document.createElement('div');
  payload.textContent = JSON.stringify(entry.payload);

  li.append(tsMeta, payload);
  listEl.prepend(li);
}
```

---

### WR-02: `dispatchPayload` `JsonDocument` created inside `EvaluateAndNotifyAsync` is never disposed

**File:** `apps/api/Services/CrawlerEventListener.cs:177`

**Issue:** `JsonDocument dispatchPayload = JsonDocument.Parse(newPayloadJson)` allocates pooled memory. It is passed into `DispatchAsync` but ownership is unclear and there is no `using` or explicit `Dispose()` call at the call site. If `DispatchAsync` does not dispose it — or throws before doing so — the backing buffer is never returned to the pool.

**Fix:** Transfer ownership explicitly. If `DispatchAsync` should own and dispose it, document that contract. If the caller should own it, wrap in a `using`:
```csharp
using var dispatchPayload = JsonDocument.Parse(newPayloadJson);
await dispatcher.DispatchAsync(db, sourceId, upserted.Id, diff, dispatchPayload, ct);
```
Note that this fix is contingent on CR-01 being addressed first (scope must be disposed after `DispatchAsync` returns).

---

## Info

### IN-01: Dev-only HTML client served unconditionally — no environment guard

**File:** `apps/api/wwwroot/test-signalr.html:1`, `apps/api/Program.cs:103`

**Issue:** `app.UseStaticFiles()` is called unconditionally (line 103 of Program.cs), which means `test-signalr.html` is publicly reachable at `/test-signalr.html` in all environments including production. The file comments say "Phase 9 replaces this with the Next.js client," but until then it is an exposed surface. Combined with the XSS finding in WR-01, this warrants attention.

**Fix:** Either wrap `UseStaticFiles()` in an `IsDevelopment()` guard, or add a `<meta name="robots" content="noindex">` plus a server-side route that returns 404 in non-development environments for the specific file.

---

### IN-02: `HubConnectionTracker.Decrement` can produce a negative count with no floor guard

**File:** `apps/api/Services/HubConnectionTracker.cs:15`, `apps/api.Tests/Services/HubConnectionTrackerTests.cs:35-39`

**Issue:** `Interlocked.Decrement` is called without checking whether `_count` is already zero. The test `Decrement_GoesNegativeIfOverDecremented` explicitly asserts `-1` as the expected result, which confirms this is intentional. A negative `hub_connections` value in the `/health` response may confuse monitoring systems that treat it as an invalid reading.

**Fix:** Add a floor guard if a negative count is never semantically valid, or document in the class summary that callers must ensure balanced Increment/Decrement calls (which `DashboardHub` already does via `OnConnectedAsync`/`OnDisconnectedAsync`). If the guard is desired:
```csharp
public void Decrement()
{
    int current;
    do { current = Volatile.Read(ref _count); }
    while (current > 0 && Interlocked.CompareExchange(ref _count, current - 1, current) != current);
}
```

---

_Reviewed: 2026-04-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
