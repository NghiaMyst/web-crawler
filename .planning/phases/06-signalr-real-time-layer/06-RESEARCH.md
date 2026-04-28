# Phase 6: SignalR Real-Time Layer - Research

**Researched:** 2026-04-21
**Domain:** ASP.NET Core SignalR — server hub, IHubContext injection, JS client reconnect
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Hub Broadcast Scope:** Broadcast fires for EVERY new `data_entries` insert, regardless of whether an alert rule matches. The hub is a real-time data feed for the dashboard, not a filtered alert channel. Entries without alert rules must still appear live.

**D-02 — Trigger Point:** `CrawlerEventListener.HandleNotificationAsync` is the injection point. After `UpsertEntryAsync` completes, inject `IHubContext<DashboardHub>` (singleton, available after `AddSignalR()`) and call `Clients.All.SendAsync("NewEntry", entry)`. Broadcast fires before `NotificationDispatcher`.

**D-03 — Reconnect Gap Handling:** Client re-fetch via REST on reconnect. When the SignalR JS client fires `onreconnected`, it calls `GET /api/entries?since=<last_received_at>` and prepends missed rows. Server stays stateless — no buffering, no server-side gap tracking.

**D-04 — Test Client:** Static file at `apps/api/wwwroot/test-signalr.html`, served by .NET via `app.UseStaticFiles()`. Accessible at `http://localhost:5000/test-signalr.html`. Uses `@microsoft/signalr` from CDN (no npm/build step).

**D-05 — Dev-Only Scaffolding:** The test HTML page is not maintained long-term. Phase 9 builds the real SignalR client in Next.js.

**D-06 — Hub Connection Count:** Singleton `HubConnectionTracker` service (thread-safe int counter). `DashboardHub.OnConnectedAsync` increments; `OnDisconnectedAsync` decrements. `/health` response extended to include `"hub_connections": <count>`.

**D-07 — CORS Extension:** SignalR requires `AllowCredentials()` with explicit origins (not wildcard). Update existing CORS policy in `Program.cs` to add `.AllowCredentials()`. Do NOT change to wildcard.

### Claude's Discretion

- Exact JSON shape of the `NewEntry` event payload — use the same `DataEntryResponse` DTO pattern from Phase 5 D-08.
- Whether to add a `DashboardHub` folder or place `DashboardHub.cs` directly under `Services/`.
- Exact SignalR backplane choice — no backplane needed, single .NET process, in-memory hub.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-10 | SignalR hub `/hubs/dashboard` — real-time push on new entry | Hub class pattern, IHubContext injection from BackgroundService, CORS extension, JS client connect/receive, HubConnectionTracker for /health |

</phase_requirements>

---

## Summary

ASP.NET Core SignalR is fully included in the `Microsoft.AspNetCore.App` shared framework — no additional NuGet package is required for server-side hub code in a Web SDK project. The `DashboardHub` class inherits from `Hub`, overrides `OnConnectedAsync`/`OnDisconnectedAsync` for connection tracking, and is registered via `builder.Services.AddSignalR()` + `app.MapHub<DashboardHub>("/hubs/dashboard")`. `IHubContext<DashboardHub>` is a singleton registered automatically by `AddSignalR()` and can be injected directly into `CrawlerEventListener` constructor.

The CORS extension (D-07) is critical: SignalR's WebSocket upgrade requires `AllowCredentials()` paired with explicit origins — the current `Program.cs` CORS policy only needs `.AllowCredentials()` appended; no other changes. `UseCors()` must appear before `MapHub` in the middleware pipeline.

The test client (D-04) uses the `@microsoft/signalr` CDN JS library from `unpkg`. The `withAutomaticReconnect()` builder option on `HubConnectionBuilder` drives the reconnect state machine; the `onreconnected` callback is where the REST gap-fill call (D-03) executes. Static files are served by `app.UseStaticFiles()` which requires the `wwwroot/` folder to exist in the project.

**Primary recommendation:** No new NuGet packages needed on the server side. Add `AddSignalR()`, register singleton `HubConnectionTracker`, add `UseStaticFiles()`, add `MapHub`, extend CORS, inject `IHubContext<DashboardHub>` into `CrawlerEventListener` constructor, create `wwwroot/test-signalr.html` with CDN JS client.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Microsoft.AspNetCore.SignalR | Included in `Microsoft.AspNetCore.App` shared framework | Server hub, IHubContext, OnConnected/OnDisconnected lifecycle | Built into ASP.NET Core SDK — no explicit package reference needed for Web SDK projects |
| @microsoft/signalr (JS) | Latest via CDN (unpkg) | Browser JS client — connects to hub, handles reconnect | Official Microsoft client; CDN approach avoids npm build step per D-04 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Microsoft.AspNetCore.SignalR.Client | Not needed | .NET client library | Only required if .NET process is a SignalR *client* — not needed here |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory hub (no backplane) | Azure SignalR Service / Redis backplane | In-memory is correct for single-process; backplane only needed for multi-server scale-out (v2 concern) |
| CDN JS client | npm install + build | CDN is simpler for a dev-only test page; Phase 9 dashboard uses npm |

### Server-Side: No Additional NuGet Required

[VERIFIED: learn.microsoft.com/aspnet/core/signalr/hubs] "ASP.NET Core SignalR server-side assemblies are now installed with the .NET Core SDK." The `WebCrawlerApi.csproj` uses `Microsoft.NET.Sdk.Web` which pulls in `Microsoft.AspNetCore.App` shared framework — SignalR server is already present.

### JS CDN URL (for test-signalr.html)

[CITED: learn.microsoft.com/aspnet/core/signalr/javascript-client]
```html
<!-- unpkg — always latest -->
<script src="https://unpkg.com/@microsoft/signalr/dist/browser/signalr.js"></script>

<!-- cdnjs — pin to a version for reproducibility (recommended for test page) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js"></script>
```

Use the cdnjs pinned URL for the test page to avoid surprises from unpkg `latest` redirects.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/api/
├── Hubs/
│   └── DashboardHub.cs        # Hub class — inherits Hub, overrides OnConnected/OnDisconnected
├── Services/
│   ├── CrawlerEventListener.cs  # MODIFIED: inject IHubContext<DashboardHub>, call after upsert
│   └── HubConnectionTracker.cs  # NEW: singleton thread-safe counter
├── Endpoints/
│   └── HealthCheck.cs           # MODIFIED: add hub_connections field
├── wwwroot/
│   └── test-signalr.html        # NEW: static test client
└── Program.cs                   # MODIFIED: AddSignalR, AddSingleton<HubConnectionTracker>,
                                 #           UseStaticFiles, MapHub, AllowCredentials
```

**Hub placement:** Put `DashboardHub.cs` under `Hubs/` — standard ASP.NET Core convention and keeps `Services/` for background service logic.

### Pattern 1: Hub Class with Connection Tracking

**What:** Hub class inherits `Hub`, overrides connection lifecycle methods to increment/decrement a singleton counter.
**When to use:** Every hub that needs connection count visibility (SC-3).

```csharp
// Source: learn.microsoft.com/aspnet/core/signalr/hubs
using Microsoft.AspNetCore.SignalR;

namespace WebCrawlerApi.Hubs;

public class DashboardHub(HubConnectionTracker tracker) : Hub
{
    public override async Task OnConnectedAsync()
    {
        tracker.Increment();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        tracker.Decrement();
        await base.OnDisconnectedAsync(exception);
    }
}
```

### Pattern 2: HubConnectionTracker Singleton

**What:** Thread-safe connection counter using `Interlocked` — no lock needed for simple increment/decrement.
**When to use:** When /health must expose live connection count.

```csharp
namespace WebCrawlerApi.Services;

public class HubConnectionTracker
{
    private int _count;
    public void Increment() => Interlocked.Increment(ref _count);
    public void Decrement() => Interlocked.Decrement(ref _count);
    public int Count => Volatile.Read(ref _count);
}
```

### Pattern 3: IHubContext Injection into BackgroundService

**What:** `IHubContext<THub>` is a singleton — inject directly into `CrawlerEventListener` constructor (already receives singletons: `IConnectionMultiplexer`, `IConfiguration`).
**When to use:** Any non-hub class that needs to push to clients.

```csharp
// Source: learn.microsoft.com/aspnet/core/signalr/hubs
// IHubContext<DashboardHub> added to existing constructor
public class CrawlerEventListener(
    IServiceScopeFactory scopeFactory,
    IConnectionMultiplexer redis,
    IConfiguration configuration,
    IHubContext<DashboardHub> hubContext,   // <-- add this
    ILogger<CrawlerEventListener> logger) : BackgroundService
{
    // In HandleNotificationAsync, after UpsertEntryAsync:
    // await hubContext.Clients.All.SendAsync("NewEntry", dataEntryResponse, ct);
}
```

**Critical:** Hub instances are transient — never inject `DashboardHub` directly. Always use `IHubContext<DashboardHub>`.

### Pattern 4: Broadcast Call with DataEntryResponse DTO

**What:** After UpsertEntryAsync, re-read the upserted entry and broadcast as `DataEntryResponse`.
**When to use:** Per D-01 and D-02 — every insert triggers a broadcast.

```csharp
// After UpsertEntryAsync completes and before EvaluateAndNotifyAsync:
var upsertedEntry = await db.DataEntries
    .AsNoTracking()
    .FirstOrDefaultAsync(e => e.SourceId == sourceId && e.EntryKey == entry.EntryKey, ct);

if (upsertedEntry is not null)
{
    var dto = new DataEntryResponse(
        upsertedEntry.Id,
        upsertedEntry.SourceId,
        upsertedEntry.Category,
        upsertedEntry.EntryKey,
        upsertedEntry.Payload.RootElement.Clone(),
        upsertedEntry.CrawledAt);

    await hubContext.Clients.All.SendAsync("NewEntry", dto, ct);
}
```

**Note:** `UpsertEntryAsync` currently re-reads the entry for `EvaluateAndNotifyAsync` (line ~130 in current file). The broadcast can reuse that same `upserted` variable — avoids a second DB read.

### Pattern 5: Program.cs Changes

```csharp
// After existing Redis singleton registration, before app.Build():
builder.Services.AddSignalR();
builder.Services.AddSingleton<HubConnectionTracker>();

// CORS: add AllowCredentials() to existing policy
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(
                Environment.GetEnvironmentVariable("CORS_ORIGINS")?.Split(',')
                    ?? new[] { "http://localhost:3000" })
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());   // <-- add this line
});

// After app.Build(), before app.Run():
app.UseStaticFiles();   // serves wwwroot/test-signalr.html
// app.UseCors() already present — must be before MapHub
app.MapHub<DashboardHub>("/hubs/dashboard");
```

### Pattern 6: /health Extension

```csharp
// Source: existing HealthCheck.cs pattern — extend CheckHealth signature
public static async Task<IResult> CheckHealth(
    Func<Task> pgProbe,
    Func<Task> redisProbe,
    int hubConnections)   // <-- new param
{
    // ... existing probes ...
    var body = new {
        status = overall,
        postgres = pgStatus,
        redis = redisStatus,
        hub_connections = hubConnections   // <-- new field
    };
    // ...
}

// In Program.cs:
app.MapGet("/health", async (AppDbContext db, IConnectionMultiplexer redis,
    HubConnectionTracker tracker) =>
    await HealthCheck.CheckHealth(
        () => db.Database.ExecuteSqlRawAsync("SELECT 1"),
        async () => { await redis.GetDatabase().PingAsync(); },
        tracker.Count));
```

### Pattern 7: JS Client in test-signalr.html (D-03 onreconnected gap-fill)

```javascript
// Source: learn.microsoft.com/aspnet/core/signalr/javascript-client
let lastReceivedAt = null;

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/dashboard")
    .withAutomaticReconnect([0, 2000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Register BEFORE start() per official best practice
connection.on("NewEntry", (entry) => {
    lastReceivedAt = entry.crawledAt;
    displayEntry(entry);
});

// D-03: on reconnect, fetch missed entries
connection.onreconnected(async (_connectionId) => {
    if (lastReceivedAt) {
        const res = await fetch(`/api/entries?from=${encodeURIComponent(lastReceivedAt)}`);
        const data = await res.json();
        data.items.forEach(e => prependEntry(e));
    }
});

async function start() {
    try {
        await connection.start();
        console.log("SignalR Connected");
    } catch (err) {
        console.error(err);
        setTimeout(start, 5000);
    }
}

connection.onclose(() => start());
start();
```

### Anti-Patterns to Avoid

- **Injecting `DashboardHub` directly:** Hub is transient — always use `IHubContext<DashboardHub>`.
- **Wildcard CORS with AllowCredentials:** `policy.AllowAnyOrigin().AllowCredentials()` throws at startup with a clear error. Explicit origins required.
- **MapHub before UseCors:** SignalR connections will fail CORS. Order matters: `UseCors()` then `MapHub()`.
- **Missing `await` on SendAsync inside hub:** Hub may be disposed before send completes; always `await`.
- **Storing state on the Hub class:** Hub instances are created per-call. State must live on singletons (e.g., `HubConnectionTracker`).
- **Calling `RemoveFromGroupAsync` in OnDisconnectedAsync:** Not required — SignalR handles group cleanup automatically.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket connection management | Custom WebSocket upgrade + frame parser | `AddSignalR()` + `MapHub` | SignalR handles transport negotiation (WebSocket, SSE, long-poll fallback), ping/keep-alive, serialization |
| Reconnect logic with backoff | setTimeout loop with custom delays | `.withAutomaticReconnect([0, 2000, 10000, 30000])` | Official client handles state machine (Reconnecting → Connected → Disconnected) with proper event callbacks |
| Thread-safe counter | `lock` + int field | `Interlocked.Increment/Decrement` + `Volatile.Read` | Lock-free, correct for simple monotonic counter |
| Hub message serialization | Custom JSON converter on SendAsync | Pass DTO directly — SignalR uses the app's configured `JsonNamingPolicy.CamelCase` | Options set in `ConfigureHttpJsonOptions` apply to SignalR JSON serialization in .NET 8 |

**Key insight:** SignalR's value is the transport abstraction — never build custom WebSocket handling alongside it.

---

## Common Pitfalls

### Pitfall 1: CORS wildcard + AllowCredentials crash

**What goes wrong:** `policy.AllowAnyOrigin().AllowCredentials()` throws `InvalidOperationException` at app startup with message about wildcard origin being incompatible with credentials.
**Why it happens:** CORS spec forbids credentials with `*` origin. ASP.NET Core enforces this at configuration time.
**How to avoid:** Always pair `AllowCredentials()` with `WithOrigins(...)` specifying explicit origins. Current `Program.cs` CORS already uses `WithOrigins(...)` — just add `.AllowCredentials()`.
**Warning signs:** App fails to start with InvalidOperationException mentioning "credentials" and "wildcard".

### Pitfall 2: UseCors must precede MapHub

**What goes wrong:** SignalR WebSocket upgrade requests fail CORS check, browser console shows CORS error, connection immediately fails.
**Why it happens:** Middleware order — CORS headers must be added before the hub route handler processes the request.
**How to avoid:** Confirm `app.UseCors()` is already in `Program.cs` before adding `app.MapHub`. Current `Program.cs` has `app.UseCors()` at line 96 — `MapHub` must go after.
**Warning signs:** Browser console: "Access to XMLHttpRequest/fetch blocked by CORS policy" on the negotiate request.

### Pitfall 3: Hub class is transient — IHubContext is the correct singleton

**What goes wrong:** Trying to inject `DashboardHub` into `CrawlerEventListener` DI constructor — hub is not registered as a singleton and cannot be resolved that way.
**Why it happens:** Hub instances are created per-connection, not per-request or as singletons.
**How to avoid:** Inject `IHubContext<DashboardHub>` — this IS a singleton registered by `AddSignalR()`.
**Warning signs:** DI resolution exception at startup about `DashboardHub` not being registered.

### Pitfall 4: wwwroot folder must exist on disk

**What goes wrong:** `app.UseStaticFiles()` does not throw if `wwwroot/` is absent, but requests to `test-signalr.html` return 404.
**Why it happens:** `UseStaticFiles()` serves from `wwwroot/` by convention; if folder doesn't exist, no files are served.
**How to avoid:** Create `apps/api/wwwroot/` directory and place `test-signalr.html` inside it.
**Warning signs:** 404 when loading `http://localhost:5000/test-signalr.html`.

### Pitfall 5: SendAsync fire-and-forget in BackgroundService

**What goes wrong:** Calling `_ = hubContext.Clients.All.SendAsync(...)` without await in a loop — if the task faults, the exception is silently swallowed and the broadcast is lost.
**Why it happens:** Same fire-and-forget pattern used for `HandleNotificationAsync` is NOT appropriate for the hub broadcast within that handler.
**How to avoid:** Inside `HandleNotificationAsync`, `await` the `SendAsync` call. The outer fire-and-forget (`_ = HandleNotificationAsync(...)`) is fine — it's at the PostgreSQL notification dispatch level.
**Warning signs:** No errors logged but clients never receive events.

### Pitfall 6: DataEntryResponse Payload double-serialization

**What goes wrong:** `JsonDocument.RootElement` without `.Clone()` is disposed when its owning `JsonDocument` is disposed — SignalR serializes the payload asynchronously, potentially after disposal.
**Why it happens:** `JsonDocument` is disposable; the element reference becomes invalid after disposal.
**How to avoid:** Use `upsertedEntry.Payload.RootElement.Clone()` when constructing `DataEntryResponse` for the hub broadcast — same pattern as in `EntriesEndpoints.cs` line 76.
**Warning signs:** `ObjectDisposedException` or garbled JSON in the broadcast payload.

### Pitfall 7: JS client `on()` must be registered before `start()`

**What goes wrong:** If `connection.start()` is called before `connection.on("NewEntry", ...)`, messages that arrive immediately after connection are missed.
**Why it happens:** SignalR can begin receiving messages as soon as the connection is established.
**How to avoid:** Register all `connection.on(...)` handlers before calling `connection.start()`. Official docs: "As a best practice, call the start method on the HubConnection after on."
**Warning signs:** Occasional missed first events, especially under fast crawl conditions.

---

## Code Examples

### Hub Registration in Program.cs

```csharp
// Source: learn.microsoft.com/aspnet/core/signalr/hubs
// Add BEFORE app.Build()
builder.Services.AddSignalR();
builder.Services.AddSingleton<HubConnectionTracker>();

// Add AFTER app.Build(), order matters:
// 1. UseStaticFiles (for wwwroot/)
// 2. UseCors (already present)
// 3. MapHub (after UseCors)
app.UseStaticFiles();
// app.UseCors() — already in Program.cs, no change
app.MapHub<DashboardHub>("/hubs/dashboard");
```

### IHubContext Broadcast (in CrawlerEventListener)

```csharp
// Source: learn.microsoft.com/aspnet/core/signalr/hubs — IHubContext section
// After the upserted entry is re-read (reuse the existing 'upserted' variable from EvaluateAndNotifyAsync):
if (upserted is not null)
{
    var dto = new DataEntryResponse(
        upserted.Id, upserted.SourceId, upserted.Category,
        upserted.EntryKey, upserted.Payload.RootElement.Clone(), upserted.CrawledAt);
    await _hubContext.Clients.All.SendAsync("NewEntry", dto, ct);
}
```

### Minimal test-signalr.html Structure

```html
<!DOCTYPE html>
<html>
<head><title>SignalR Test</title></head>
<body>
  <h2>SignalR Dashboard Feed</h2>
  <ul id="entries"></ul>
  <!-- Source: cdnjs.cloudflare.com/ajax/libs/microsoft-signalr -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js"></script>
  <script>
    let lastReceivedAt = null;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("/hubs/dashboard")
      .withAutomaticReconnect([0, 2000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Register handlers BEFORE start()
    connection.on("NewEntry", (entry) => {
      lastReceivedAt = entry.crawledAt;
      const li = document.createElement("li");
      li.textContent = JSON.stringify(entry);
      document.getElementById("entries").prepend(li);
    });

    // D-03: gap-fill on reconnect
    connection.onreconnected(async () => {
      if (!lastReceivedAt) return;
      try {
        const res = await fetch(`/api/entries?from=${encodeURIComponent(lastReceivedAt)}&limit=100`);
        const data = await res.json();
        (data.items || []).forEach(e => {
          const li = document.createElement("li");
          li.textContent = "[BACKFILL] " + JSON.stringify(e);
          document.getElementById("entries").prepend(li);
        });
      } catch (err) { console.error("Gap-fill failed:", err); }
    });

    async function start() {
      try {
        await connection.start();
        console.log("SignalR Connected");
      } catch (err) {
        console.error(err);
        setTimeout(start, 5000);
      }
    }
    connection.onclose(() => start());
    start();
  </script>
</body>
</html>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `Microsoft.AspNetCore.SignalR` NuGet package | Included in `Microsoft.AspNetCore.App` shared framework | .NET Core 3.0+ | No explicit package reference needed in Web SDK projects |
| Manual reconnect with setTimeout loop | `.withAutomaticReconnect()` on HubConnectionBuilder | SignalR 3.x+ | Built-in reconnect state machine with proper callbacks |
| `Startup.cs` class with `Configure`/`ConfigureServices` | `Program.cs` minimal hosting with `WebApplication.CreateBuilder` | .NET 6+ | `app.MapHub<T>()` called directly on `WebApplication` |

**Deprecated/outdated:**
- `@aspnet/signalr` npm package: replaced by `@microsoft/signalr` — use `@microsoft/signalr` only.
- `endpoints.MapHub<T>()` inside `app.UseEndpoints(...)`: replaced by `app.MapHub<T>()` directly.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The existing `GET /api/entries?from=` filter (DateTimeOffset `from` param in `EntriesEndpoints.cs`) covers the reconnect gap-fill query in D-03 | Architecture Patterns, Pattern 7 | Gap-fill fetch returns wrong data; workaround: use `?since=` or ensure `from` filter is wired correctly |
| A2 | SignalR JSON serialization in .NET 8 respects the global `ConfigureHttpJsonOptions` camelCase policy | Don't Hand-Roll | Payload fields arrive at JS client in PascalCase; fix: add explicit SignalR JSON options |

**A1 note:** Inspecting `EntriesEndpoints.cs` confirms `from` parameter exists (line 24–25). The test HTML uses `?from=<timestamp>` which maps to the `DateTimeOffset? from` parameter.

**A2 note:** In .NET 8, `AddSignalR()` uses `System.Text.Json` by default. The global `ConfigureHttpJsonOptions` settings (camelCase, IgnoreCycles) apply to SignalR serialization via the shared `JsonSerializerOptions`. This is consistent behavior in .NET 7+ but is worth verifying during implementation.

---

## Open Questions

1. **Broadcast call placement — reuse existing DB read or add new one?**
   - What we know: `EvaluateAndNotifyAsync` already re-reads the upserted entry (line ~130 in `CrawlerEventListener.cs`). The hub broadcast needs the same data.
   - What's unclear: Whether to call `SendAsync` inside `EvaluateAndNotifyAsync` (sharing the `upserted` read) or after it in `HandleNotificationAsync` (requiring a second read or passing the DTO out).
   - Recommendation: Pass the broadcast call into `HandleNotificationAsync` body after `EvaluateAndNotifyAsync` returns; reuse the `upserted` variable by returning it from `EvaluateAndNotifyAsync` or by restructuring the broadcast to happen at the `foreach` loop level. Plan 06-02 implementer must decide exact restructuring.

2. **HealthCheck.cs test: existing `HealthEndpointTests` will need updating**
   - What we know: `HealthCheck.CheckHealth` currently takes 2 `Func<Task>` parameters. Adding `hub_connections` changes the signature.
   - What's unclear: Whether to add `int hubConnections` as a 3rd parameter (breaks existing 4 tests) or inject `HubConnectionTracker` into the method.
   - Recommendation: Add `int hubConnections = 0` as optional parameter with default — existing tests pass unmodified, new test verifies the field.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| .NET SDK | SignalR server, `dotnet test` | Yes | 10.0.104 | — |
| xunit + Moq | Unit tests in `apps/api.Tests/` | Yes | In `.csproj` | — |
| Browser | SC-1 two-tab test, SC-2 reconnect test | Yes (assumed dev machine) | Any modern | — |

**Note:** .NET 10 SDK is installed (confirmed via `dotnet --version`). Project targets `net8.0` — compatible. SignalR server assemblies are part of the ASP.NET Core shared framework bundled with .NET SDK.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | xunit 2.5.3 + Moq 4.20.72 |
| Config file | None — convention-based discovery |
| Quick run command | `dotnet test apps/api.Tests/ --no-build -x` |
| Full suite command | `dotnet test apps/api.Tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-10 | `HubConnectionTracker` increments/decrements correctly | unit | `dotnet test apps/api.Tests/ --filter "HubConnectionTracker" -x` | No — Wave 0 |
| API-10 | `/health` response includes `hub_connections` field | unit | `dotnet test apps/api.Tests/ --filter "HealthEndpoint" -x` | Yes — extend existing |
| API-10 | `DashboardHub.OnConnectedAsync` increments tracker | unit (mock) | `dotnet test apps/api.Tests/ --filter "DashboardHub" -x` | No — Wave 0 |
| API-10 | Broadcast after upsert — `IHubContext.SendAsync` called once per entry | unit (mock IHubContext) | `dotnet test apps/api.Tests/ --filter "CrawlerEventListener" -x` | No — Wave 0 |
| API-10 (SC-1, SC-2, SC-3) | Two-tab display, reconnect gap-fill, hub_connections count | manual/browser | N/A — browser test against running server | No |

### Sampling Rate

- **Per task commit:** `dotnet test apps/api.Tests/ --no-build -x`
- **Per wave merge:** `dotnet test apps/api.Tests/`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api.Tests/Hubs/DashboardHubTests.cs` — covers OnConnectedAsync/OnDisconnectedAsync tracker calls
- [ ] `apps/api.Tests/Services/HubConnectionTrackerTests.cs` — covers thread-safe increment/decrement
- [ ] `apps/api.Tests/Services/CrawlerEventListenerBroadcastTests.cs` — covers SendAsync called after upsert (mock IHubContext)
- [ ] Update `apps/api.Tests/Endpoints/HealthEndpointTests.cs` — extend `CheckHealth` call to include `hub_connections` param

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in scope (personal project, single user per REQUIREMENTS.md) |
| V3 Session Management | No | SignalR connections are not session-bearing in this design |
| V4 Access Control | No | Hub has no authorization policy — public access within CORS origins |
| V5 Input Validation | Yes (low) | No client-to-server hub methods in this phase — broadcast is server-to-client only; no user input accepted by hub |
| V6 Cryptography | No | No crypto operations added |

### Known Threat Patterns for ASP.NET Core SignalR

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CORS misconfiguration (wildcard + credentials) | Tampering/CSRF | Use explicit `WithOrigins(...)` + `AllowCredentials()` — never wildcard with credentials (D-07 already mandates this) |
| Hub endpoint enumeration | Information Disclosure | No sensitive data in hub URL itself; hub broadcasts `DataEntryResponse` which is already public API data |
| Broadcast to ALL clients (no auth filter) | Information Disclosure | Acceptable — personal project, no multi-user concern per REQUIREMENTS.md Out-of-Scope |
| Connection flood (many clients) | Denial of Service | In-memory hub scales to 1000s of connections on a single node; not a concern at this scale |

---

## Sources

### Primary (HIGH confidence)

- [learn.microsoft.com/aspnet/core/signalr/hubs?view=aspnetcore-8.0](https://learn.microsoft.com/en-us/aspnet/core/signalr/hubs?view=aspnetcore-8.0) — Hub class creation, IHubContext, OnConnected/OnDisconnected overrides, Clients.All.SendAsync, AddSignalR registration
- [learn.microsoft.com/aspnet/core/signalr/javascript-client?view=aspnetcore-8.0](https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-8.0) — CDN URLs, HubConnectionBuilder, withAutomaticReconnect, onreconnected callback, connection.on() pattern
- [learn.microsoft.com/aspnet/core/tutorials/signalr?view=aspnetcore-8.0](https://learn.microsoft.com/en-us/aspnet/core/tutorials/signalr?view=aspnetcore-8.0) — End-to-end hub setup, UseStaticFiles + wwwroot, MapHub, CORS with AllowCredentials
- Codebase: `apps/api/Program.cs` — existing DI registrations, CORS policy, middleware order
- Codebase: `apps/api/Services/CrawlerEventListener.cs` — injection point, existing UpsertEntryAsync and EvaluateAndNotifyAsync flow
- Codebase: `apps/api/Endpoints/HealthCheck.cs` — existing signature to extend
- Codebase: `apps/api/Endpoints/EntriesEndpoints.cs` — DataEntryResponse construction pattern, `from` filter parameter
- Codebase: `apps/api/Models/Responses/DataEntryResponse.cs` — DTO shape for broadcast payload
- Codebase: `apps/api.Tests/WebCrawlerApi.Tests.csproj` — xunit 2.5.3, Moq 4.20.72, existing test infrastructure
- Codebase: `apps/api.Tests/Endpoints/HealthEndpointTests.cs` — existing test pattern to extend

### Secondary (MEDIUM confidence)

- NuGet registry search results — confirmed `Microsoft.AspNetCore.SignalR.Common` and `Client` packages exist as separate packages but are not needed for server-side-only use in Web SDK projects

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against official Microsoft docs and existing codebase; no NuGet package needed for server side
- Architecture patterns: HIGH — drawn directly from official docs + locked decisions in CONTEXT.md + existing code patterns in codebase
- Pitfalls: HIGH — CORS and middleware-order pitfalls verified from official docs; transient hub pitfall from official docs note
- JS client patterns: HIGH — verified from official javascript-client docs

**Research date:** 2026-04-21
**Valid until:** 2026-07-21 (stable framework — 90 days)
