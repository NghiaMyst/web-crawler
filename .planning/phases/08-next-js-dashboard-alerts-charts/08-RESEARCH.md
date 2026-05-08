# Phase 8: Next.js Dashboard — Alerts & Charts - Research

**Researched:** 2026-05-05
**Domain:** Next.js 16 / React 19 dashboard — alert rule CRUD, notification history, Recharts-via-Shadcn charts, .NET Minimal API stats endpoint
**Confidence:** HIGH

---

## Summary

Phase 8 adds three new dashboard pages (alert rules, notification history, charts) and one new .NET API endpoint. All three pages follow the patterns established in Phase 7 — Server Actions returning `ActionResult<T>`, `useOptimistic` + `baseSources` dual-state, React Hook Form + Zod modal, Shadcn/ui component composition. No new frontend framework is introduced; charts are delivered through Shadcn Charts (Recharts wrappers), which installs via the same `pnpm dlx shadcn add` CLI used for all other UI components.

The key new complexity in this phase is the discriminated-union Zod schema for alert rule conditions (three condition shapes: `new_item`, `field_changed`, `threshold`), and the aggregation query in the .NET API that groups `data_entries` by `source_id` and calendar day. The frontend chart integration is low-risk: Recharts is a mature library (v3.8.1 current) and Shadcn Charts generates typed wrapper components that consume standard Recharts primitives.

The .NET side adds two things: a PUT handler to `AlertRulesEndpoints.cs` (directly mirrors the existing PUT pattern in `SourcesEndpoints.cs`) and a new `/api/stats/volume` route with EF Core GroupBy aggregation. Both fit into existing patterns without new NuGet packages.

**Primary recommendation:** Copy the SourcesClient/SourceModal/Server-Actions pattern verbatim for alert rules. Add Shadcn chart component via CLI before implementing the charts page. Add the .NET stats endpoint in plan 08-04 and the PUT handler in plan 08-01 so that the API is ready before the UI tries to call it.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Chart library):** Use Shadcn Charts (Recharts-based wrappers). Installed via `pnpm dlx shadcn add chart`. Consistent with existing Shadcn component system (zinc/neutral color palette, same CSS variable theming), Recharts under the hood so all Recharts primitives are available if needed.
- **D-02 (Alert condition form design):** Type selector + conditional field reveal inside the alert rule modal.
  - Dropdown for `type`: `new_item` | `field_changed` | `threshold`
  - `new_item` → no extra fields
  - `field_changed` → reveals "Field path" text input (e.g., `patch_version`)
  - `threshold` → reveals "Field path" + "Threshold value" numeric input
  - Follows the React Hook Form + Zod pattern from SourceModal — `watch("conditionType")` drives conditional field rendering
  - Zod schema uses discriminated union matching the 3 condition shapes
- **D-03 (Alert rule editing):** Add PUT endpoint to the .NET API (`PUT /api/alert-rules/{id}`) in `apps/api/Endpoints/AlertRulesEndpoints.cs`. Pre-populates the form on edit, clean REST, consistent with Sources CRUD pattern.
- **D-04 (Chart date range):** Dropdown selector with preset options: `7d` | `30d` | `90d`. Client-side `useState` for selected range. The `GET /api/stats/volume?groupBy=day&range={range}` endpoint accepts the range param. Default to `7d`.

### Claude's Discretion

- Exact Shadcn Chart component variant (ChartLine vs ChartBar) and color assignment per source
- Whether to use a single combined page or separate routes for line chart vs bar chart
- Notification history page — exact column layout beyond status/channel/message/timestamp
- Alert rule `messageTpl` field — include in form or omit for v1 simplicity
- NavLinks additions (which icons for Alerts, Notifications, Charts from lucide-react)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-02 | Charts showing entry volume over time and per-source trends | Section: Chart Architecture — Shadcn Charts install, VolumeDataPoint shape, stats endpoint design |
| DASH-05 | Alert rule management page (CRUD) | Section: Alert Rule CRUD — PUT endpoint, discriminated-union Zod schema, RHF watch pattern |
| DASH-06 | Notification history page | Section: Notification History — NotificationLog entity shape, filter-by-source pattern |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new installs for CRUD pages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | 7.74.0 | Form state + validation | Established in Phase 7; `watch()` drives conditional rendering [VERIFIED: apps/dashboard/package.json] |
| zod | 4.3.6 | Schema validation (client + server) | Established in Phase 7; discriminated union `z.discriminatedUnion()` available [VERIFIED: apps/dashboard/package.json] |
| @hookform/resolvers | 5.2.2 | zodResolver for RHF | Established in Phase 7 [VERIFIED: apps/dashboard/package.json] |
| shadcn@4.6.0 (CLI) | 4.6.0 | Generates chart component source via `shadcn add chart` | Already used for all UI components; chart is just another registry component [VERIFIED: npm view shadcn version = 4.6.0] |
| lucide-react | ^1.14.0 | Icons for new nav items | Bundled by shadcn init, already present [VERIFIED: apps/dashboard/package.json] |

### New Install Required — Charts

| Library | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| recharts | 3.8.1 (pulled as peer dep) | Underlying chart engine for Shadcn Charts | `pnpm dlx shadcn add chart` installs recharts as peer dep automatically [VERIFIED: npm view recharts version = 3.8.1] |

The `pnpm dlx shadcn add chart` command generates `components/ui/chart.tsx` (the Shadcn wrapper) and adds `recharts` to `package.json` dependencies. This is the same mechanism used in Phase 7 for all other UI components. [ASSUMED: shadcn CLI v4.6.0 chart registry behaviour — not verified via live CLI run in this session. Based on Shadcn documentation pattern and Phase 7 shadcn add behaviour.]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shadcn Charts (Recharts) | Chart.js / react-chartjs-2 | D-01 locked to Shadcn Charts — do not reconsider |
| Shadcn Charts (Recharts) | Visx / D3 | Same — locked |

**Installation (charts only — CRUD page dependencies already installed):**
```bash
pnpm dlx shadcn@4.6.0 add chart
```

---

## Architecture Patterns

### Recommended Project Structure for Phase 8

```
apps/dashboard/
├── app/
│   ├── alerts/
│   │   └── page.tsx             # Server component: fetches alert rules + sources list
│   ├── notifications/
│   │   └── page.tsx             # Server component: fetches notification logs
│   └── charts/
│       └── page.tsx             # Server component: fetches sources list for legend
├── actions/
│   └── alert-rule.actions.ts   # createAlertRuleAction, updateAlertRuleAction, deleteAlertRuleAction
├── components/
│   ├── alerts/
│   │   ├── AlertsClient.tsx     # useOptimistic orchestrator (mirrors SourcesClient)
│   │   ├── AlertsTable.tsx      # Table with condition summary column
│   │   ├── AlertRuleModal.tsx   # RHF+Zod modal; watch("conditionType") for conditional fields
│   │   ├── DeleteAlertDialog.tsx
│   │   └── AlertsEmptyState.tsx
│   ├── notifications/
│   │   ├── NotificationsClient.tsx  # Client component: filter state
│   │   └── NotificationsTable.tsx   # Table with status/channel/message/timestamp + source filter
│   ├── charts/
│   │   └── VolumeChart.tsx      # 'use client'; Shadcn LineChart; date range selector
│   └── layout/
│       └── NavLinks.tsx         # Add /alerts, /notifications, /charts entries
├── lib/
│   └── api.server.ts            # Add fetchAlertRules, createAlertRule, updateAlertRule,
│                                #   deleteAlertRule, fetchNotifications, fetchVolumeStats
└── types/
    └── api.ts                   # Add AlertRule, NotificationLog, VolumeDataPoint interfaces

apps/api/
└── Endpoints/
    ├── AlertRulesEndpoints.cs   # Add MapPut("/{id:guid}", UpdateAlertRule) + UpdateAlertRuleRequest
    └── StatsEndpoints.cs        # New: GET /api/stats/volume?groupBy=day&range={7d|30d|90d}
```

### Pattern 1: Alert Rule Modal — Discriminated Union Zod Schema + RHF watch

**What:** Three condition shapes encoded as a Zod discriminated union. `watch("conditionType")` renders conditional fields.

**When to use:** Any form where visible fields depend on a type selector.

**Key insight from Phase 7:** Use `z.number()` (not `z.coerce.number()`) in the **form schema** for numeric inputs, with `valueAsNumber: true` in `register()`. This preserves RHF type inference with Zod 4 + `@hookform/resolvers` 5.x. The server-side action schema may still use `z.coerce`. [VERIFIED: apps/dashboard/components/sources/SourceModal.tsx — established pattern]

```typescript
// Source: apps/dashboard/lib/schemas/source.ts (established pattern) + Zod 4 docs
// Form schema in AlertRuleModal.tsx (local — not exported)
const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('new_item') }),
  z.object({ type: z.literal('field_changed'), fieldPath: z.string().min(1) }),
  z.object({ type: z.literal('threshold'), fieldPath: z.string().min(1), threshold: z.number() }),
]);

const alertRuleFormSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  channel: z.enum(['telegram', 'discord']),
  isActive: z.boolean(),
  condition: conditionSchema,
  // messageTpl: optional — Claude's Discretion whether to include
});

// In the form:
const conditionType = watch('condition.type');
// Conditionally render fieldPath input when conditionType !== 'new_item'
// Conditionally render threshold input when conditionType === 'threshold'
```

**Server-side action schema:** For the `Condition` JSON sent to the API, serialize the discriminated union object to JSON. The .NET API stores it as `JsonDocument`. The `CreateAlertRuleRequest.Condition` field accepts a `JsonElement?`. [VERIFIED: apps/api/Endpoints/AlertRulesEndpoints.cs lines 37-39]

### Pattern 2: Alert Rule Server Actions — ActionResult<T>

**What:** Identical pattern to `source.actions.ts` — Zod parse, API call, revalidatePath('/alerts').

**Example:**
```typescript
// Source: apps/dashboard/actions/source.actions.ts (established pattern)
'use server';
import { revalidatePath } from 'next/cache';
import type { AlertRule } from '@/types/api';

export async function createAlertRuleAction(input: unknown): Promise<ActionResult<AlertRule>> {
  const parsed = alertRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation failed.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const rule = await apiCreateAlertRule(parsed.data);
    revalidatePath('/alerts');
    return { ok: true, data: rule };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save rule.' };
  }
}
```

### Pattern 3: PUT Endpoint in .NET Minimal API

**What:** Mirror `SourcesEndpoints.MapPut` exactly. Partial update — only `name`, `channel`, `isActive`, and `condition` are mutable after creation.

```csharp
// Source: apps/api/Endpoints/SourcesEndpoints.cs lines 59-73 (established pattern)
group.MapPut("/{id:guid}", UpdateAlertRule);

internal static async Task<IResult> UpdateAlertRule(Guid id, UpdateAlertRuleRequest req, AppDbContext db)
{
    var rule = await db.AlertRules.FindAsync(id);
    if (rule is null) return Results.NotFound();

    if (req.Name is not null) rule.Name = req.Name;
    if (req.Channel is not null) rule.Channel = req.Channel;
    if (req.IsActive.HasValue) rule.IsActive = req.IsActive.Value;
    if (req.Condition.HasValue)
        rule.Condition = JsonDocument.Parse(req.Condition.Value.GetRawText());

    await db.SaveChangesAsync();
    return Results.Ok(rule);
}

public record UpdateAlertRuleRequest(string? Name, string? Channel, bool? IsActive, JsonElement? Condition);
```

**Fields immutable after creation:** `SourceId` (cannot re-assign a rule to a different source). This mirrors the Sources pattern where `name`, `category`, `parserKey`, `crawlerType` are immutable. [VERIFIED: apps/api/Data/Entities/AlertRule.cs — SourceId is the join key; changing it would break alert evaluations]

### Pattern 4: Stats Endpoint — EF Core GroupBy Aggregation

**What:** New `StatsEndpoints.cs` registered as `/api/stats`. The `GET /api/stats/volume` endpoint returns per-source, per-day entry counts for the requested range.

**Response shape:**
```json
[
  { "sourceId": "uuid", "sourceName": "genshin-events", "date": "2026-05-01", "count": 12 },
  { "sourceId": "uuid", "sourceName": "genshin-events", "date": "2026-05-02", "count": 8 }
]
```

**EF Core GroupBy pattern:**
```csharp
// Source: EF Core GroupBy docs pattern [ASSUMED: standard EF Core 8 GroupBy with DateOnly]
var cutoff = DateTimeOffset.UtcNow.AddDays(-rangeDays);

var rows = await db.DataEntries
    .AsNoTracking()
    .Where(e => e.CrawledAt >= cutoff)
    .GroupBy(e => new { e.SourceId, Date = e.CrawledAt.Date })
    .Select(g => new VolumeDataPoint
    {
        SourceId = g.Key.SourceId,
        Date = g.Key.Date,
        Count = g.Count()
    })
    .ToListAsync();
```

**Range parsing:** Accept `range` query param (`7d`, `30d`, `90d`). Default to 7 days if unparsed.

**Registration in Program.cs:**
```csharp
app.MapGroup("/api/stats").MapStatsEndpoints();
```

### Pattern 5: Shadcn Charts — LineChart for Volume Trend

**What:** `pnpm dlx shadcn add chart` generates `components/ui/chart.tsx` with `ChartContainer`, `ChartTooltip`, `ChartLegend`, and `ChartConfig` type. Wrap standard Recharts `<LineChart>`, `<Line>`, `<XAxis>`, `<YAxis>` primitives inside `<ChartContainer>`.

**Key integration points:**
- `ChartContainer` accepts a `config` prop (`ChartConfig`) that maps data keys to display labels and CSS variable colors
- CSS variables like `--color-source-name` are auto-injected for each source key in config
- `XAxis dataKey="date"` — use the `date` string directly (ISO date string rendered as-is or formatted via `tickFormatter`)
- Each source gets its own `<Line>` with `dataKey={sourceId}` — requires data to be pivoted from the API shape (per-row) to per-date objects with source counts as keys

**Data transformation required:** The stats endpoint returns long-format rows. The frontend must pivot to wide format for Recharts multi-line chart:

```typescript
// Input (from API): [{ sourceId, sourceName, date, count }, ...]
// Output (for Recharts): [{ date: '2026-05-01', 'genshin-events': 12, 'football': 5 }, ...]
function pivotVolumeData(rows: VolumeDataPoint[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!map.has(row.date)) map.set(row.date, { date: row.date });
    map.get(row.date)![row.sourceName] = row.count;
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}
```

[ASSUMED: Shadcn Charts v4.6.0 ChartContainer API — based on Shadcn docs pattern. Should be verified when implementing.]

### Pattern 6: Notification History — Read-Only Table with Source Filter

**What:** No mutations — just a server component that fetches logs and passes to a client component that handles the source filter dropdown.

**Filter approach:** URL search params (`?sourceId=uuid`) handled via Next.js `useSearchParams` + `useRouter.push` on the client, matching the entries page pattern from Phase 7. The server action fetches logs with optional `?alertRuleId=uuid` or `?sourceId=uuid` filter — requires the .NET API to support this query param.

**Note:** The existing `GET /api/alert-rules` returns alert rules but not their notification logs. A separate `GET /api/notifications` endpoint is needed. This endpoint does not exist yet — it must be added in plan 08-02. [VERIFIED: apps/api/Program.cs — no notifications route registered; apps/api/Data/AppDbContext.cs — NotificationLogs DbSet exists]

**Response shape from NotificationLog entity:**
```typescript
// Mirrors apps/api/Data/Entities/NotificationLog.cs
interface NotificationLog {
  id: string;
  alertRuleId: string;
  dataEntryId: string | null;
  channel: string;       // 'telegram' | 'discord'
  message: string;
  status: string;        // 'sent' | 'failed'
  sentAt: string;        // ISO 8601
}
```
[VERIFIED: apps/api/Data/Entities/NotificationLog.cs]

To support filter-by-source, the notification logs endpoint either:
- Accepts `sourceId` query param and joins through AlertRule → Source, OR
- Returns logs with `sourceName` denormalized

The join approach is cleaner and avoids duplicating source name into the log table. The endpoint should accept optional `?sourceId=guid` and join: `db.NotificationLogs.Include(n => n.AlertRule).Where(n => n.AlertRule.SourceId == sourceId)`.

### Anti-Patterns to Avoid

- **z.coerce.number() in RHF form schemas:** Breaks Zod 4 + `@hookform/resolvers` 5.x type inference. Use `z.number()` with `valueAsNumber: true` in `register()`. [VERIFIED: apps/dashboard/components/sources/SourceModal.tsx and 07-04-SUMMARY.md]
- **Throwing exceptions from Server Actions:** Always return `ActionResult<T>` discriminated union. Never `throw` to the client. [VERIFIED: apps/dashboard/actions/source.actions.ts]
- **Pivoting chart data inside the API:** The stats endpoint returns long-format data. The pivot to wide format (one object per date, source keys as properties) happens in the frontend component, not the API. Keeping the API simple makes it reusable.
- **Shadcn Chart without `ChartContainer`:** Recharts charts must be wrapped in `ChartContainer` to receive CSS variable color injection. Omitting it breaks theming. [ASSUMED: Shadcn Charts docs pattern]
- **Using `extends: "next/typescript"` in tsconfig.json:** Known Turbopack incompatibility from Phase 7. Already fixed — do not re-introduce. [VERIFIED: 07-01-SUMMARY.md]
- **Sending raw `condition` string to .NET API:** The `CreateAlertRuleRequest.Condition` field expects `JsonElement?`. Serialize the condition object with `JSON.parse` on the backend side — pass a proper JSON object from the frontend, not a pre-serialized string. [VERIFIED: apps/api/Endpoints/AlertRulesEndpoints.cs line 37]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas chart | Recharts (via Shadcn Charts) | Axis scaling, tooltip, legend, responsive container, multi-series — all built-in |
| Form validation with conditional fields | Manual if/else validation | Zod discriminated union + RHF watch | Type-safe, co-located, handles dynamic field reveal cleanly |
| Optimistic UI for alert rule CRUD | Custom pending state management | `useOptimistic` + `baseSources` dual-state pattern | Same pattern as SourcesClient — already battle-tested in Phase 7 |
| Data pivot for multi-line Recharts | Complex recursive pivot | Simple `Map` accumulator (see Pattern 5) | 10-line pure function is sufficient; no library needed |
| Toast on error rollback | External toast library | Inline fixed-position `div role="alert"` | Matches Phase 7 pattern; no new dependency |

**Key insight:** All frontend complexity in this phase is solved by extending existing Phase 7 patterns. The chart data transformation is a simple pivot that does not require a separate utility library.

---

## Common Pitfalls

### Pitfall 1: `condition` field not serialized correctly when calling the .NET API

**What goes wrong:** The alert rule condition is a nested object. If the frontend sends `{ condition: { type: 'threshold', fieldPath: 'price', threshold: 100 } }` as a JSON body, the .NET `CreateAlertRuleRequest.Condition: JsonElement?` can receive it — but the TypeScript `fetch` call must serialize the entire request body with `JSON.stringify()`, not serialize the condition separately. Double-stringifying (`JSON.stringify(JSON.stringify(condition))`) produces a JSON string value instead of a JSON object, which is invalid for a `JsonElement?` field.

**How to avoid:** Pass the condition as a plain object in the request body. `JSON.stringify(body)` handles the nesting correctly. [VERIFIED: apps/dashboard/lib/api.server.ts — `body: JSON.stringify(body)` pattern established]

### Pitfall 2: Recharts `<ResponsiveContainer>` requires a fixed-height parent

**What goes wrong:** Recharts `<ResponsiveContainer width="100%" height="100%">` needs a parent with a non-zero explicit height. Without it, the chart renders with 0px height (invisible). Common in Next.js + Tailwind because `div` elements have no default height.

**How to avoid:** Wrap in a `div` with explicit height class: `<div className="h-64">` or `<div style={{ height: 300 }}>`. Shadcn `<ChartContainer>` handles this if you pass a `className` with a height. [ASSUMED: standard Recharts + Shadcn Charts behavior — widely documented community pattern]

### Pitfall 3: EF Core GroupBy with `DateTimeOffset.Date` may not translate to SQL on all providers

**What goes wrong:** `e.CrawledAt.Date` (a `DateTime` property of a `DateTimeOffset`) may not translate cleanly to SQL with some EF Core providers. Npgsql (PostgreSQL) supports `DATE_TRUNC('day', ...)` but the EF Core translation depends on the Npgsql EF Core provider version.

**How to avoid:** Use `EF.Functions.DateDiffDay` or cast to `DateOnly` — or use a raw SQL query with `DATE_TRUNC` for this aggregation. Alternatively, group by `e.CrawledAt.Date.ToString("yyyy-MM-dd")` and test with `dotnet ef database update` before the dashboard plan runs. A safe approach:

```csharp
// Safe Npgsql-compatible approach [ASSUMED: Npgsql EF Core provider behavior]
.GroupBy(e => new {
    e.SourceId,
    Day = e.CrawledAt.Date  // Npgsql translates DateTimeOffset.Date to ::date cast
})
```

If translation fails, fall back to `FromSqlRaw` with PostgreSQL `DATE_TRUNC`.

**Warning signs:** EF Core throws `InvalidOperationException: The LINQ expression could not be translated` at runtime when calling the stats endpoint.

### Pitfall 4: Alert rule condition summary display in the table

**What goes wrong:** The `Condition` field is stored as `JsonDocument` on the server and returned as a raw JSON object to the dashboard. The table needs to display a human-readable summary (e.g., "New item", "Field changed: patch_version", "Threshold: price > 100"). Trying to render `JSON.stringify(rule.condition)` gives a machine-readable blob that is unreadable.

**How to avoid:** Add a `formatCondition(condition: AlertRuleCondition): string` pure function in a `lib/alert-rules.ts` utility file. Switch on `condition.type`. [ASSUMED: standard UI text formatting approach]

### Pitfall 5: `GET /api/notifications` endpoint missing from .NET API

**What goes wrong:** The `NotificationLogs` DbSet exists in `AppDbContext` but there is no HTTP endpoint registered for it in `Program.cs`. The notification history page (plan 08-02) will fail with a 404 at runtime if the endpoint is not added.

**How to avoid:** Plan 08-02 must add `GET /api/notifications` to the .NET API before (or alongside) implementing the dashboard page. The endpoint accepts optional `?sourceId=guid` filter. [VERIFIED: apps/api/Program.cs — no notifications route registered]

---

## Code Examples

### Alert Rule TypeScript Interface (to add to types/api.ts)

```typescript
// Source: apps/api/Data/Entities/AlertRule.cs + AlertRulesEndpoints.cs [VERIFIED]
export type AlertConditionType = 'new_item' | 'field_changed' | 'threshold';

export type AlertCondition =
  | { type: 'new_item' }
  | { type: 'field_changed'; fieldPath: string }
  | { type: 'threshold'; fieldPath: string; threshold: number };

export interface AlertRule {
  id: string;
  sourceId: string;
  name: string;
  condition: AlertCondition;
  messageTpl: string;
  channel: string;        // 'telegram' | 'discord'
  isActive: boolean;
  createdAt: string;
}

export interface CreateAlertRuleRequest {
  sourceId: string;
  name: string;
  condition: AlertCondition;
  messageTpl?: string;
  channel: string;
  isActive?: boolean;
}

export interface UpdateAlertRuleRequest {
  name?: string;
  channel?: string;
  isActive?: boolean;
  condition?: AlertCondition;
}
```

### NotificationLog TypeScript Interface (to add to types/api.ts)

```typescript
// Source: apps/api/Data/Entities/NotificationLog.cs [VERIFIED]
export interface NotificationLog {
  id: string;
  alertRuleId: string;
  dataEntryId: string | null;
  channel: string;
  message: string;
  status: 'sent' | 'failed';
  sentAt: string;
}
```

### VolumeDataPoint TypeScript Interface (to add to types/api.ts)

```typescript
// Source: D-04 decision — stats endpoint shape [VERIFIED: CONTEXT.md]
export interface VolumeDataPoint {
  sourceId: string;
  sourceName: string;
  date: string;   // 'YYYY-MM-DD'
  count: number;
}
```

### api.server.ts additions

```typescript
// Source: apps/dashboard/lib/api.server.ts (established request pattern) [VERIFIED]
import type { AlertRule, CreateAlertRuleRequest, UpdateAlertRuleRequest,
              NotificationLog, VolumeDataPoint } from '@/types/api';

export async function fetchAlertRules(): Promise<AlertRule[]> {
  return request<AlertRule[]>('/api/alert-rules');
}

export async function createAlertRule(body: CreateAlertRuleRequest): Promise<AlertRule> {
  return request<AlertRule>('/api/alert-rules', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateAlertRule(id: string, body: UpdateAlertRuleRequest): Promise<AlertRule> {
  return request<AlertRule>(`/api/alert-rules/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteAlertRule(id: string): Promise<void> {
  await request<void>(`/api/alert-rules/${id}`, { method: 'DELETE' });
}

export async function fetchNotifications(sourceId?: string): Promise<NotificationLog[]> {
  const qs = sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : '';
  return request<NotificationLog[]>(`/api/notifications${qs}`);
}

export async function fetchVolumeStats(range: '7d' | '30d' | '90d'): Promise<VolumeDataPoint[]> {
  return request<VolumeDataPoint[]>(`/api/stats/volume?groupBy=day&range=${range}`);
}
```

### NavLinks addition

```typescript
// Source: apps/dashboard/components/layout/NavLinks.tsx [VERIFIED]
// Add to NAV_ITEMS array — icon choices are Claude's Discretion
import { Database, Settings2, ListTodo, Bell, History, BarChart2 } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/entries',       label: 'Entries',       Icon: Database },
  { href: '/sources',       label: 'Sources',       Icon: Settings2 },
  { href: '/jobs',          label: 'Jobs',          Icon: ListTodo },
  { href: '/alerts',        label: 'Alerts',        Icon: Bell },
  { href: '/notifications', label: 'Notifications', Icon: History },
  { href: '/charts',        label: 'Charts',        Icon: BarChart2 },
] as const;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js (class-based API) | Recharts (React-first, declarative) | Recharts ~2019 | Recharts composes as JSX; no canvas lifecycle management needed |
| Recharts v2 (commonjs) | Recharts v3.x (ESM-first) | 2024 | v3 introduced ESM exports; tree-shaking improved; import paths unchanged |
| Manual RHF conditional rendering | `watch()` + JSX conditional | React Hook Form v7 | `watch()` returns live form values; conditional field render is idiomatic |
| z.object with manual type union | z.discriminatedUnion() | Zod v3+ | Discriminated unions give accurate TypeScript types and better error messages |

**Deprecated/outdated:**
- `z.coerce.number()` in client-side RHF form schemas: Broken type inference in Zod 4 + @hookform/resolvers 5.x. Use `z.number()` + `valueAsNumber: true`. [VERIFIED: 07-04-SUMMARY.md and SourceModal.tsx]

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield feature addition phase, not a rename/refactor/migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | `pnpm dlx shadcn add chart` | Assumed available (used in Phase 7) | N/A | — |
| recharts | Chart components | Not yet in package.json | Will be auto-added by `shadcn add chart` | — |
| .NET SDK | StatsEndpoints compilation | Used throughout project | Existing | — |
| PostgreSQL | stats aggregation query | Existing (project runtime) | Existing | — |

**Missing dependencies with no fallback:**
- `recharts` is not yet installed. The plan must include `pnpm dlx shadcn@4.6.0 add chart` as the first task of plan 08-03 (charts page). [VERIFIED: apps/dashboard/package.json — recharts absent]

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `apps/dashboard/vitest.config.ts` |
| Quick run command | `pnpm --filter @web-crawler/dashboard test` |
| Full suite command | `pnpm --filter @web-crawler/dashboard test && pnpm --filter @web-crawler/dashboard type-check` |

[VERIFIED: apps/dashboard/package.json, apps/dashboard/vitest.config.ts]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-05 | `createAlertRuleAction` returns `{ ok: false, fieldErrors }` when condition type is invalid | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "createAlertRuleAction"` | ❌ Wave 0 |
| DASH-05 | `updateAlertRuleAction` does not call API when Zod parse fails | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "updateAlertRuleAction"` | ❌ Wave 0 |
| DASH-05 | alertRule Zod schema rejects `threshold` condition with missing `fieldPath` | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "alertRuleSchema"` | ❌ Wave 0 |
| DASH-02 | `fetchVolumeStats` calls correct URL with range param | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "fetchVolumeStats"` | ❌ Wave 0 |
| DASH-06 | `fetchNotifications` calls correct URL with optional sourceId | unit | `pnpm --filter @web-crawler/dashboard test -- --grep "fetchNotifications"` | ❌ Wave 0 |
| DASH-02/05/06 | TypeScript build passes with zero errors | type-check | `pnpm --filter @web-crawler/dashboard type-check` | ✅ (command exists) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @web-crawler/dashboard test`
- **Per wave merge:** `pnpm --filter @web-crawler/dashboard test && pnpm --filter @web-crawler/dashboard type-check`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/dashboard/__tests__/alert-rule-actions.test.ts` — covers DASH-05 action validation path
- [ ] `apps/dashboard/__tests__/alert-rule-schema.test.ts` — covers DASH-05 Zod discriminated union validation
- [ ] `apps/dashboard/__tests__/api-stats.test.ts` — covers DASH-02 fetchVolumeStats URL construction
- [ ] Mock entries for new api.server.ts exports needed in `__tests__/__mocks__/` — the existing `source-actions.test.ts` mocks `@/lib/api.server` with `vi.mock`; the new test files must add `fetchAlertRules`, `createAlertRule`, `updateAlertRule`, `deleteAlertRule`, `fetchNotifications`, `fetchVolumeStats` to the mock factory

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in scope (personal project — REQUIREMENTS.md Out of Scope) |
| V3 Session Management | no | No session in scope |
| V4 Access Control | no | No multi-user access control in scope |
| V5 Input Validation | yes | Zod discriminated union on condition; server-side validation in .NET action handler |
| V6 Cryptography | no | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invalid condition JSON sent to .NET API | Tampering | Zod validates condition shape before API call; .NET stores as opaque `JsonDocument` (no SQL injection risk via JSONB storage with parameterized EF Core) |
| `process.env.API_URL` leaking to client bundle | Information Disclosure | `import 'server-only'` guard on `api.server.ts` — established in Phase 7 [VERIFIED: apps/dashboard/lib/api.server.ts] |
| XSS via `message` field in NotificationLog | XSS | React JSX auto-escapes text content; do not use `dangerouslySetInnerHTML` for message display |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pnpm dlx shadcn@4.6.0 add chart` installs `recharts` as a dependency and generates `components/ui/chart.tsx` with `ChartContainer` API | Standard Stack, Pattern 5 | Low: if CLI API changed, fallback is manual `pnpm add recharts` + hand-written chart wrapper |
| A2 | Shadcn Charts `ChartContainer` injects CSS variable colors and requires a parent with explicit height | Pitfall 2, Pattern 5 | Low: if API differs, only color/height wiring needs adjustment — Recharts primitives still work |
| A3 | EF Core 8 + Npgsql translates `DateTimeOffset.Date` grouping to PostgreSQL `::date` cast without error | Pattern 4, Pitfall 3 | Medium: if translation fails, fall back to `FromSqlRaw` with `DATE_TRUNC`. Plan 08-04 should include a runtime smoke test |
| A4 | `formatCondition` display helper is needed for table condition summary column | Common Pitfalls, Architecture | Low: if raw JSON is acceptable in the table, this helper can be omitted |

---

## Open Questions

1. **Should `messageTpl` be included in the AlertRuleModal form?**
   - What we know: The `AlertRule` entity has a `MessageTpl` field; the CONTEXT.md marks this as Claude's Discretion
   - What's unclear: Whether a user needs to set this in v1 or if an empty template is acceptable (the notification engine fills in defaults)
   - Recommendation: Omit for v1 simplicity — include an optional text area but leave it blank-able. If the notification engine requires a non-empty template to send, add a `.optional()` note in the Zod schema.

2. **Single charts page vs separate routes for line chart and bar chart?**
   - What we know: CONTEXT.md marks this as Claude's Discretion; success criteria require line chart with per-source labels
   - Recommendation: Single `/charts` page with a tab or section separator for volume (line) and per-source breakdown (bar/stacked). Simpler routing, fewer nav entries.

3. **Notification history filter — by source or by alert rule?**
   - What we know: Success criterion says "filterable by source"; NotificationLog has `alertRuleId` not `sourceId`
   - What's unclear: The filter-by-source JOIN path (NotificationLog → AlertRule → Source) adds query complexity
   - Recommendation: The `GET /api/notifications?sourceId=guid` endpoint does the join server-side. The dashboard dropdown populates from the existing `/api/sources` fetch (already available).

---

## Sources

### Primary (HIGH confidence)
- `apps/api/Data/Entities/AlertRule.cs` — AlertRule field list verified
- `apps/api/Data/Entities/NotificationLog.cs` — NotificationLog field list verified
- `apps/api/Endpoints/AlertRulesEndpoints.cs` — existing GET/POST/DELETE handlers; PUT is absent (confirmed)
- `apps/api/Endpoints/SourcesEndpoints.cs` — PUT pattern for UpdateAlertRule implementation
- `apps/api/Program.cs` — confirmed no `/api/notifications` or `/api/stats` route registered
- `apps/api/Data/AppDbContext.cs` — NotificationLogs DbSet exists; EF Core config verified
- `apps/dashboard/components/sources/SourceModal.tsx` — RHF+Zod discriminated field pattern, z.number() rule
- `apps/dashboard/actions/source.actions.ts` — ActionResult<T> pattern
- `apps/dashboard/components/sources/SourcesClient.tsx` — useOptimistic dual-state pattern
- `apps/dashboard/lib/api.server.ts` — request() helper, server-only guard
- `apps/dashboard/types/api.ts` — existing interfaces; extension points identified
- `apps/dashboard/components/layout/NavLinks.tsx` — current nav items; extension required
- `apps/dashboard/vitest.config.ts` — Vitest config, alias setup for mocks
- `apps/dashboard/package.json` — dependency versions confirmed
- npm registry — recharts@3.8.1, shadcn@4.6.0 confirmed current

### Secondary (MEDIUM confidence)
- Phase 7 SUMMARY files (07-01, 07-04) — established patterns, known deviations

### Tertiary (LOW confidence)
- Shadcn Charts CLI behavior (A1) — not verified via live `shadcn add chart` run; based on Phase 7 shadcn add pattern
- EF Core GroupBy DateTimeOffset.Date Npgsql translation (A3) — not verified against running DB

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against package.json and npm registry
- Architecture patterns: HIGH — all patterns directly derived from verified Phase 7 source files
- .NET API additions: HIGH — PUT pattern directly mirrors verified SourcesEndpoints.cs
- Shadcn Charts integration: MEDIUM — CLI behavior and ChartContainer API are assumed from Shadcn documentation pattern; recharts primitives are HIGH
- EF Core GroupBy stats query: MEDIUM — standard pattern but Npgsql translation not live-tested

**Research date:** 2026-05-05
**Valid until:** 2026-06-04 (30 days — stack is stable; recharts and shadcn move slowly)
