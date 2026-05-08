# Phase 9: Real-Time Dashboard Integration - Research

**Researched:** 2026-05-06
**Domain:** SignalR JS client, React Context, Next.js 16 client components, Sonner toasts
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Global React Context Provider (`SignalRProvider`) wrapping `DashboardLayout`. Connection established once on layout mount, persists across all pages. Components read state via `useSignalRContext()` hook.
- **D-02:** `LiveEntriesWrapper` client component (`'use client'`) wrapping the entries section on `/entries` page. Maintains `liveEntries: DataEntry[]` state from `NewEntry` SignalR events. Renders live entries prepended above the server-fetched `EntriesTable` (RSC data). Cap at 200 total displayed rows — trim oldest when combined live + server count exceeds 200. Existing RSC pattern and `EntriesTable` component are unchanged.
- **D-03:** On `onreconnected`, call `GET /api/entries?since=<last_received_at>` to fetch missed rows and prepend them.
- **D-04:** Small colored dot placed next to "Web Crawler" brand text in both `Sidebar.tsx` (desktop) and `MobileNav.tsx` (mobile header). Three states: Connected → green dot; Reconnecting → yellow dot with CSS pulse animation; Disconnected → red dot. Dot reads connection state from `SignalRProvider` context.
- **D-05:** Install **Sonner** (shadcn-compatible toast library). Add `<Toaster />` to `DashboardLayout`. Two toast triggers: `onreconnected` → `toast.success("Reconnected — loaded N missed entries")`; `onclose` / permanent disconnect → `toast.error("Live updates disconnected")`.

### Claude's Discretion

- Exact Sonner toast position (top-right vs. bottom-right) and duration
- Auto-reconnect policy config passed to `HubConnectionBuilder` (retry intervals, max attempts)
- Whether `liveEntries` and server entries share a single merged array or render as two adjacent lists
- Exact CSS for the pulsing yellow dot animation

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-07 | Real-time data updates via SignalR (new entries appear without page refresh) | Plans 09-01/02/03 together close this: `useSignalR` hook establishes hub connection, `LiveEntriesWrapper` handles `NewEntry` events, `ConnectionDot` satisfies the status indicator requirement |
</phase_requirements>

---

## Summary

Phase 9 wires the existing SignalR hub at `/hubs/dashboard` (built in Phase 6) to the Next.js dashboard (built in Phases 7–8). Three implementation units: a `SignalRProvider` React context wrapping `DashboardLayout`, a `LiveEntriesWrapper` client component on the entries page, and a `ConnectionDot` status indicator in the nav bar.

The `@microsoft/signalr` JS client is currently at version 10.0.0 (npm-verified). The standard pattern is `HubConnectionBuilder.withUrl(...).withAutomaticReconnect([...]).build()` in a `useEffect`, with `onreconnecting` / `onreconnected` / `onclose` callbacks driving React state. The connection lives in a React context so any component in the tree can read `HubConnectionState` without prop-drilling.

`Sonner` 2.0.7 (npm-verified) is the established toast companion for shadcn/ui projects — install as a bare npm package, wrap with shadcn's `<Toaster />` component (installed via `pnpm dlx shadcn add sonner`). The `toast.success()` / `toast.error()` API maps directly to the D-05 requirement.

**Primary recommendation:** Build all three plans sequentially — SignalRProvider first (09-01), then LiveEntriesWrapper (09-02), then ConnectionDot (09-03). 09-02 and 09-03 both depend on the context from 09-01.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@microsoft/signalr` | 10.0.0 | SignalR JS client — hub connection, auto-reconnect, event subscriptions | Official Microsoft client for ASP.NET Core SignalR hubs; only supported client |
| `sonner` | 2.0.7 | Toast notifications | Declared in D-05; shadcn/ui's recommended toast library; replaces deprecated shadcn toast component |

**Version verification:** [VERIFIED: npm registry]
- `@microsoft/signalr` latest: 10.0.0 (confirmed via `npm view @microsoft/signalr version`)
- `sonner` latest: 2.0.7 (confirmed via `npm view sonner version`)

### Supporting (already installed — no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react` | ^19.0.0 | `createContext`, `useContext`, `useState`, `useEffect`, `useCallback` | All client component logic |
| `lucide-react` | ^1.14.0 | Icon for dot indicator (or pure CSS) | If using an icon for the status dot |

**Installation:**
```bash
# From apps/dashboard workspace root:
pnpm add @microsoft/signalr sonner
# Then install shadcn's Toaster wrapper (adds components/ui/sonner.tsx):
pnpm dlx shadcn add sonner
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/dashboard/
├── contexts/
│   └── signalr.context.tsx      # SignalRProvider + useSignalRContext hook
├── hooks/
│   └── use-signalr.ts           # (optional) bare HubConnection lifecycle hook
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.tsx  # Wrap children in <SignalRProvider>; add <Toaster />
│   │   ├── Sidebar.tsx          # Add <ConnectionDot /> next to "Web Crawler" span
│   │   └── MobileNav.tsx        # Add <ConnectionDot /> next to "Web Crawler" span
│   ├── entries/
│   │   └── live-entries-wrapper.tsx  # 'use client' — manages liveEntries state
│   └── connection/
│       └── connection-dot.tsx   # 'use client' — reads context, renders colored dot
└── __tests__/
    └── signalr-context.test.ts  # Unit tests for context shape + LiveEntriesWrapper cap logic
```

### Pattern 1: React Context Provider for HubConnection

**What:** A single `SignalRProvider` component manages the `HubConnection` lifecycle and exposes `{ state: HubConnectionState, connection: HubConnection | null }` via context. All child components call `useSignalRContext()` — no prop-drilling, no duplicate connections.

**When to use:** Any time a single long-lived WebSocket connection must be shared across disconnected components (nav indicator + entries wrapper are on different parts of the tree).

**Key constraint:** `DashboardLayout.tsx` is currently a server component (no `'use client'`). `SignalRProvider` must be `'use client'`. The pattern is: keep `DashboardLayout.tsx` as server component, but wrap its `children` (or `<main>`) with `<SignalRProvider>` — the server component can render a client component as a child without issue in Next.js App Router. [VERIFIED: Next.js App Router docs — server components can pass children to client components]

**Example:**
```typescript
// Source: [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr]
// contexts/signalr.context.tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';

interface SignalRContextValue {
  connection: HubConnection | null;
  state: HubConnectionState;
}

const SignalRContext = createContext<SignalRContextValue>({
  connection: null,
  state: HubConnectionState.Disconnected,
});

export function SignalRProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HubConnectionState>(
    HubConnectionState.Disconnected
  );
  const connectionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    const hubUrl = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/hubs/dashboard`;
    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect([0, 2000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    connectionRef.current = conn;

    conn.onreconnecting(() => setState(HubConnectionState.Reconnecting));
    conn.onreconnected(() => setState(HubConnectionState.Connected));
    conn.onclose(() => setState(HubConnectionState.Disconnected));

    conn.start()
      .then(() => setState(HubConnectionState.Connected))
      .catch(() => setState(HubConnectionState.Disconnected));

    return () => {
      conn.stop();
    };
  }, []);

  return (
    <SignalRContext.Provider value={{ connection: connectionRef.current, state }}>
      {children}
    </SignalRContext.Provider>
  );
}

export function useSignalRContext(): SignalRContextValue {
  return useContext(SignalRContext);
}
```

**Critical note:** `connectionRef.current` is set before the `conn.start()` call, so child components can subscribe to events through the context connection object. However, state-driven renders (via `setState`) are what trigger re-renders — the ref holds the stable instance.

### Pattern 2: LiveEntriesWrapper — event subscription + row cap

**What:** Client component subscribing to `NewEntry` events on the hub connection. Prepends received `DataEntry` objects to local state. Enforces 200-row cap on combined (live + server) display.

**When to use:** Any page that needs to receive server-pushed data and merge it with server-rendered baseline data.

**Example:**
```typescript
// Source: [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnection]
// components/entries/live-entries-wrapper.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSignalRContext } from '@/contexts/signalr.context';
import { EntriesTable } from './entries-table';
import type { DataEntry } from '@/types/api';
import { fetchEntriesClient } from '@/lib/api.client';

const ROW_CAP = 200;

interface LiveEntriesWrapperProps {
  serverEntries: DataEntry[];
}

export function LiveEntriesWrapper({ serverEntries }: LiveEntriesWrapperProps) {
  const { connection } = useSignalRContext();
  const [liveEntries, setLiveEntries] = useState<DataEntry[]>([]);
  const lastReceivedAt = useRef<string | null>(null);

  // Subscribe to NewEntry events
  useEffect(() => {
    if (!connection) return;

    const handler = (entry: DataEntry) => {
      lastReceivedAt.current = entry.crawledAt;
      setLiveEntries((prev) => {
        const combined = [entry, ...prev];
        const totalRows = combined.length + serverEntries.length;
        if (totalRows > ROW_CAP) {
          return combined.slice(0, ROW_CAP - serverEntries.length);
        }
        return combined;
      });
    };

    connection.on('NewEntry', handler);
    return () => connection.off('NewEntry', handler);
  }, [connection, serverEntries.length]);

  // Gap recovery on reconnect
  useEffect(() => {
    if (!connection) return;

    const handleReconnected = async () => {
      if (!lastReceivedAt.current) return;
      try {
        const result = await fetchEntriesClient({ since: lastReceivedAt.current, limit: 50 });
        if (result.items.length > 0) {
          setLiveEntries((prev) => [...result.items, ...prev].slice(0, ROW_CAP));
        }
      } catch {
        // gap recovery is best-effort; failure is non-fatal
      }
    };

    connection.onreconnected(handleReconnected);
  }, [connection]);

  const allEntries = [...liveEntries, ...serverEntries].slice(0, ROW_CAP);

  return <EntriesTable entries={allEntries} />;
}
```

**Note:** The `since` filter param needs to be added to `fetchEntriesClient` in `api.client.ts` and to the `EntryFilters` type. The API endpoint `GET /api/entries?since=<iso>` was established in Phase 6 D-03.

### Pattern 3: ConnectionDot — HubConnectionState to visual indicator

**What:** A tiny `'use client'` component that reads `state` from context and renders a colored circle with optional pulse animation.

**Key insight:** `Sidebar.tsx` is currently a server component (no `'use client'`). `ConnectionDot` is a client component. Server components can render client components — simply import `ConnectionDot` inside `Sidebar.tsx` and Next.js will correctly split the bundle. `Sidebar.tsx` does NOT need `'use client'` added.

**Example:**
```typescript
// components/connection/connection-dot.tsx
'use client';

import { HubConnectionState } from '@microsoft/signalr';
import { useSignalRContext } from '@/contexts/signalr.context';

const stateConfig: Record<string, { color: string; pulse: boolean; label: string }> = {
  [HubConnectionState.Connected]:    { color: 'bg-green-500', pulse: false, label: 'Connected' },
  [HubConnectionState.Reconnecting]: { color: 'bg-yellow-400', pulse: true,  label: 'Reconnecting' },
  [HubConnectionState.Disconnected]: { color: 'bg-red-500',   pulse: false, label: 'Disconnected' },
};

export function ConnectionDot() {
  const { state } = useSignalRContext();
  const config = stateConfig[state] ?? stateConfig[HubConnectionState.Disconnected];
  return (
    <span
      role="status"
      aria-label={config.label}
      className={`inline-block w-2 h-2 rounded-full ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}
    />
  );
}
```

**Tailwind v4 note:** `animate-pulse` ships with Tailwind CSS core — no `tailwind.config.js` entry needed. The dot colors (`bg-green-500`, `bg-yellow-400`, `bg-red-500`) are also core utilities. No CSS variable additions required unless custom brand colors are wanted. [VERIFIED: Tailwind v4 CSS-first docs — core utilities available without config]

### Pattern 4: Sonner Integration

**What:** Install Sonner, add `<Toaster />` to `DashboardLayout`, call `toast.success()` / `toast.error()` from `SignalRProvider` on reconnect/disconnect events.

**Shadcn integration note:** `pnpm dlx shadcn add sonner` creates `components/ui/sonner.tsx` (a thin wrapper applying shadcn theme). Import `Toaster` from `@/components/ui/sonner`, not from `sonner` directly. Import `toast` from `'sonner'` (bare package) for imperative calls.

**Placement in DashboardLayout:** `DashboardLayout.tsx` is a server component. `<Toaster />` (from shadcn/ui) is a client component — again, server components can render client components directly. Add `<Toaster />` as a sibling alongside `<Sidebar />` and the main content div.

**Example toast calls (from inside SignalRProvider):**
```typescript
// Source: [CITED: ui.shadcn.com/docs/components/sonner]
import { toast } from 'sonner';

conn.onreconnected(async () => {
  setState(HubConnectionState.Connected);
  // After gap recovery:
  toast.success(`Reconnected — loaded ${missedCount} missed entries`);
});

conn.onclose(() => {
  setState(HubConnectionState.Disconnected);
  toast.error('Live updates disconnected');
});
```

**Position:** bottom-right is the convention for non-blocking notifications (doesn't overlap table header actions). Duration: default (4000ms for success, persists for error). These are Claude's discretion per D-05.

### Anti-Patterns to Avoid

- **Multiple HubConnection instances:** Creating the connection inside `LiveEntriesWrapper` or `ConnectionDot` directly would create duplicate WebSocket connections. Always use the single connection from `SignalRProvider` context.
- **`connection.on()` without cleanup:** Every `useEffect` that calls `connection.on(eventName, handler)` must return a cleanup calling `connection.off(eventName, handler)`. Forgetting cleanup causes duplicate event handlers on re-mount.
- **Registering `onreconnected` inside `connection.on()` cleanup cycle:** `onreconnected` handlers accumulate (no deduplication) — register them once in `SignalRProvider`, not in child components.
- **Passing handler reference to `connection.off()` as an arrow function literal:** `off()` requires the exact same `Function` instance. Assign the handler to a variable before registering, then pass the same variable to `off()`.
- **Using `'use client'` on `DashboardLayout.tsx` or `Sidebar.tsx`:** Unnecessary — server components can render client components without becoming client components themselves.
- **Calling `conn.start()` without try/catch:** Initial connection failure (API down) will produce an unhandled rejection. Always catch and set state to `Disconnected`.
- **Relying on `connection.state` (property) for React rendering:** `connection.state` is the SignalR internal property but doesn't trigger React re-renders. Use a separate `useState<HubConnectionState>` in the context provider.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnect logic | Custom retry loop with `setTimeout` | `withAutomaticReconnect([0, 2000, 10000, 30000])` | Handles exponential backoff, server negotiation, transport fallback (WebSocket → SSE → Long Polling) — complexity not worth duplicating |
| Toast notification system | Custom `useState` + CSS animation for toasts | `sonner` + shadcn wrapper | Handles positioning, stacking, accessibility, swipe-to-dismiss, animation — decided in D-05 |
| Connection state polling | `setInterval` calling `connection.state` | `onreconnecting` / `onreconnected` / `onclose` callbacks | Polling adds unnecessary load; callbacks are synchronous with state transitions |
| Message buffering during disconnect | Server-side message queue | `GET /api/entries?since=<ts>` on reconnect (D-03) | Server stays stateless; gap is bounded by reconnect window; decided in Phase 6 D-03 |

**Key insight:** The `@microsoft/signalr` client handles transport negotiation, keep-alive pings (default 15s), server timeout detection (default 30s), and reconnect scheduling. Zero custom infrastructure needed beyond `HubConnectionBuilder` configuration.

---

## Common Pitfalls

### Pitfall 1: Context value is stale when child subscribes

**What goes wrong:** `SignalRContext.Provider value={{ connection: connectionRef.current, state }}` — `connectionRef.current` is `null` on first render (before `useEffect` runs), so `LiveEntriesWrapper` gets `null` and skips subscribing.

**Why it happens:** React renders the provider synchronously; the `useEffect` runs after paint. The ref is `null` at first render.

**How to avoid:** In `LiveEntriesWrapper`'s `useEffect`, use `connection` from context as the dependency: `if (!connection) return;`. When `SignalRProvider`'s effect runs and sets `connectionRef.current`, re-render doesn't happen automatically because refs don't trigger renders. **Solution:** Store the connection in state (`useState<HubConnection | null>(null)`) in `SignalRProvider`, not a ref — this guarantees child components re-run their effects when the connection is set.

**Warning signs:** `NewEntry` events arriving but `liveEntries` never updating despite subscription code being present.

### Pitfall 2: `Sidebar.tsx` needs `'use client'` to use context — but that's wrong

**What goes wrong:** Developer adds `'use client'` to `Sidebar.tsx` to use `useSignalRContext()`, but realizes `Sidebar` doesn't need the context directly — only `ConnectionDot` does.

**Why it happens:** Misunderstanding of Next.js App Router composition model.

**How to avoid:** Create `ConnectionDot` as its own `'use client'` component. Import it in `Sidebar.tsx` (server component). Next.js App Router handles the client/server boundary correctly — server components can render client component children.

**Warning signs:** Unnecessary `'use client'` directives propagating up the tree, or hydration errors.

### Pitfall 3: `onreconnected` handlers accumulate

**What goes wrong:** If `LiveEntriesWrapper` calls `connection.onreconnected(handler)` inside a `useEffect`, each mount adds another handler. On re-mount (route changes + return), multiple gap-recovery fetches fire.

**Why it happens:** Unlike `connection.on()` which has a matching `connection.off()`, `onreconnected` has no removal API in `@microsoft/signalr` — each call adds an additional callback.

**How to avoid:** Register `onreconnected` only once — inside `SignalRProvider`'s `useEffect`. Pass reconnect data downward through context (e.g., an `onReconnectCallback` ref that `LiveEntriesWrapper` can set). Alternatively, emit a custom React context event from `SignalRProvider` using a callback registry pattern.

**Warning signs:** Multiple toast notifications on a single reconnect; gap recovery fetching the same data N times.

### Pitfall 4: Row cap calculation uses stale closure on `serverEntries.length`

**What goes wrong:** The `NewEntry` handler closes over `serverEntries.length` from the render cycle when the `useEffect` ran. If server entries change (user navigates away and back), the cap math is off.

**Why it happens:** `useEffect` dependencies — the handler is recreated only when `connection` or `serverEntries.length` changes.

**How to avoid:** Include `serverEntries.length` in the `useEffect` dependency array for the `NewEntry` subscription. Or use a ref to track server entry count.

**Warning signs:** Live entries cap enforced inconsistently after filter changes.

### Pitfall 5: `NEXT_PUBLIC_API_URL` not set → hub URL falls back to localhost in production

**What goes wrong:** Hub connects to `http://localhost:5000/hubs/dashboard` instead of the production API because `NEXT_PUBLIC_API_URL` is not set in Vercel env vars.

**Why it happens:** The same `NEXT_PUBLIC_API_URL` pattern used in `api.client.ts` must be replicated for the hub URL construction.

**How to avoid:** Use `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'` as the base URL in `HubConnectionBuilder.withUrl()`. Document in `.env.example` that `NEXT_PUBLIC_API_URL` is required for production. (Production proxy setup is Phase 10 scope.)

**Warning signs:** Connection indicator shows "Disconnected" immediately in staging/production.

### Pitfall 6: CORS failure on hub connection

**What goes wrong:** Browser rejects the SignalR negotiation request with CORS error.

**Why it happens:** Phase 6 D-07 established that SignalR requires `AllowCredentials()` with explicit origins — wildcard `*` is rejected when credentials are involved. The dashboard origin must be in the CORS allow list.

**How to avoid:** Verify the `.NET` API has `AllowCredentials()` + the dashboard origin in the CORS policy. For local dev, `http://localhost:3000` must be listed. This is a Phase 6 server concern — Phase 9 only needs to ensure the correct `withUrl()` options are passed (no custom credential options needed from the JS client side unless cookies are used).

**Warning signs:** Network tab shows 403 or CORS preflight failure on `/hubs/dashboard/negotiate`.

---

## Code Examples

### HubConnectionBuilder complete setup
```typescript
// Source: [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnectionbuilder]
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';

const connection = new HubConnectionBuilder()
  .withUrl(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/hubs/dashboard`)
  .withAutomaticReconnect([0, 2000, 10000, 30000])  // 4 attempts: 0s, 2s, 10s, 30s
  .configureLogging(LogLevel.Warning)
  .build();
```

### withAutomaticReconnect default behaviour
```typescript
// Source: [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnectionbuilder]
// Default (no argument): waits 0, 2, 10, 30 seconds — up to 4 attempts
.withAutomaticReconnect()

// Custom array: 5 attempts with custom delays
.withAutomaticReconnect([0, 1000, 5000, 10000, 30000])

// After all retries exhausted, onclose fires — no further automatic attempts
```

### HubConnectionState enum values
```typescript
// Source: [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnectionstate]
import { HubConnectionState } from '@microsoft/signalr';
// Values: Connected | Connecting | Disconnected | Disconnecting | Reconnecting
```

### Subscribing to hub events with cleanup
```typescript
// Source: [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnection]
useEffect(() => {
  if (!connection) return;

  const handler = (entry: DataEntry) => { /* ... */ };
  connection.on('NewEntry', handler);

  return () => {
    connection.off('NewEntry', handler);  // same function instance required
  };
}, [connection]);
```

### Sonner toast calls
```typescript
// Source: [CITED: ui.shadcn.com/docs/components/sonner]
import { toast } from 'sonner';

toast.success('Reconnected — loaded 5 missed entries');
toast.error('Live updates disconnected');
```

### Adding Toaster to DashboardLayout
```typescript
// Source: [CITED: ui.shadcn.com/docs/components/sonner]
// After: pnpm dlx shadcn add sonner  (creates components/ui/sonner.tsx)
import { Toaster } from '@/components/ui/sonner';

// Inside DashboardLayout JSX:
<>
  <Sidebar />
  <div className="flex-1 flex flex-col min-w-0">
    <MobileNav />
    <main className="flex-1 px-4 md:px-8 py-6 md:py-8">{children}</main>
  </div>
  <Toaster position="bottom-right" />
</>
```

---

## Integration Points Summary

All integration points identified from reading the actual source files:

| File | Change Required |
|------|----------------|
| `apps/dashboard/package.json` | Add `@microsoft/signalr` and `sonner` dependencies |
| `apps/dashboard/contexts/signalr.context.tsx` | **NEW FILE** — `SignalRProvider` + `useSignalRContext` |
| `apps/dashboard/components/connection/connection-dot.tsx` | **NEW FILE** — `ConnectionDot` client component |
| `apps/dashboard/components/entries/live-entries-wrapper.tsx` | **NEW FILE** — `LiveEntriesWrapper` client component |
| `apps/dashboard/components/layout/DashboardLayout.tsx` | Wrap children with `<SignalRProvider>`; add `<Toaster />` |
| `apps/dashboard/components/layout/Sidebar.tsx` | Import `<ConnectionDot />`, add next to "Web Crawler" span |
| `apps/dashboard/components/layout/MobileNav.tsx` | Import `<ConnectionDot />`, add next to "Web Crawler" span (already `'use client'`) |
| `apps/dashboard/app/entries/page.tsx` | Wrap `<EntriesTable>` in `<LiveEntriesWrapper serverEntries={result.items}>` inside `EntriesContent` |
| `apps/dashboard/lib/api.client.ts` | Add `fetchEntriesSince(since: string)` using existing `request<T>` helper |
| `apps/dashboard/types/api.ts` | Add `since?: string` to `EntryFilters` interface |
| `apps/dashboard/components/ui/sonner.tsx` | **NEW FILE (shadcn-generated)** — via `pnpm dlx shadcn add sonner` |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual WebSocket with `reconnectingIn` polling | `withAutomaticReconnect()` callbacks | @microsoft/signalr 3.x | No polling needed; library manages reconnect scheduling |
| shadcn/ui built-in `<Toast>` + `useToast()` hook | Sonner (`toast.success()` imperative API) | shadcn deprecated Toast in favour of Sonner | Simpler API, no reducer boilerplate, better animation |
| `connection.on()` in arbitrary components | Centralised `SignalRProvider` + context | React 16+ (Context) | Single connection, no duplicate WebSockets |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GET /api/entries?from=<iso>` endpoint accepts a `from` (DateTimeOffset) query param — VERIFIED by reading `apps/api/Endpoints/EntriesEndpoints.cs`. Phase 6 D-03 said `since`, but actual implementation uses `from`. Plan 09-02 corrected to use `?from=` accordingly. | Architecture Patterns (Pattern 2), Integration Points | RESOLVED — risk eliminated. Server uses `from` param (verified). |
| A2 | `Sidebar.tsx` (server component) can import `ConnectionDot` (client component) without needing `'use client'` itself | Architecture Patterns (Pattern 3) | This is standard Next.js App Router behaviour — low risk, but if project has non-standard RSC config it could fail with hydration errors |
| A3 | `tw-animate-css` (already installed, version ^1.4.0) provides `animate-pulse` class compatible with Tailwind v4 CSS-first setup | Common Pitfalls, Code Examples | If `animate-pulse` is unavailable, the yellow reconnecting dot won't pulse — fallback: add custom `@keyframes pulse` to `globals.css` |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions (RESOLVED)

1. **Does Phase 6 `GET /api/entries?since=` already exist with a `since` param?**
   - What we know: Phase 6 D-03 says "client calls `GET /api/entries?since=<last_received_at>`"; Phase 5 built the entries endpoint with date-range filter support
   - What's unclear: The actual Phase 6 implementation (server-side) may use `from`/`to` params rather than `since`, or the endpoint may not have been implemented yet
   - Recommendation: Before implementing 09-02 gap recovery, grep `apps/api/Endpoints/EntriesEndpoints.cs` for `since` param. If absent, add it in Wave 0 of 09-02 or treat as a Phase 6 completion task.
   - **RESOLVED:** The server endpoint uses `from` (DateTimeOffset), NOT `since`. Verified by reading `apps/api/Endpoints/EntriesEndpoints.cs`. The actual signature is `DateTimeOffset? from = null`. Gap recovery in Plan 09-02 must use `?from=<iso>` parameter, not `?since=`. The client function was renamed accordingly: `fetchEntriesSince` -> `fetchEntriesFrom` and the API call uses `?from=${since.toISOString()}`.

2. **Should `liveEntries` and `serverEntries` be merged into a single array or rendered as two adjacent `<EntriesTable>` instances?**
   - What we know: D-02 says "renders live entries prepended above the server-fetched `EntriesTable`" — this implies two separate renders (live list above, server table below)
   - What's unclear: "Prepended above" could mean merged into one table or two separate tables
   - Recommendation: Merge into a single `entries` array prop to `EntriesTable` — one table is cleaner UX, avoids duplicate column headers, and the 200-row cap is simpler to enforce on a merged array. This is Claude's discretion.
   - **RESOLVED:** Merged into a single entries array passed to `<EntriesTable>`. One table is cleaner UX, avoids duplicate headers, and the 200-row cap is simpler to enforce on a single merged array. `allEntries = [...liveEntries, ...serverEntries].slice(0, ROW_CAP)`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | Package install | ✓ | (monorepo already running) | — |
| `@microsoft/signalr` | 09-01 SignalR hook | ✗ (not yet installed) | — | None — must install |
| `sonner` | 09-03 toast | ✗ (not yet installed) | — | None — must install (decided D-05) |
| .NET API SignalR hub at `/hubs/dashboard` | All plans (dev testing) | [ASSUMED] | — | Cannot test real events without hub running |
| `NEXT_PUBLIC_API_URL` env var | Hub URL construction | [ASSUMED] already set for dev | — | Fallback to `http://localhost:5000` in code |

**Missing dependencies with no fallback:**
- `@microsoft/signalr` — must be installed in Wave 0 of 09-01
- `sonner` — must be installed + shadcn-wrapped in Wave 0 of 09-03

**Missing dependencies with fallback:**
- SignalR hub (Phase 6) running locally — cannot verify `NewEntry` events without it; Phase 9 unit tests should mock the connection so tests pass without a running server

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `apps/dashboard/vitest.config.ts` |
| Quick run command | `pnpm --filter @web-crawler/dashboard test` |
| Full suite command | `pnpm --filter @web-crawler/dashboard test` (all tests in `__tests__/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DASH-07 (SC-1) | New entry arrives in `liveEntries` state within 3s of `NewEntry` event | Unit (mock connection) | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ Wave 0 |
| DASH-07 (SC-2) | Auto-reconnect fires within 30s — library responsibility, not testable unit | Manual only | N/A — verified in success criteria manual check | N/A |
| DASH-07 (SC-3) | `ConnectionDot` renders correct color class for each `HubConnectionState` | Unit (mock context) | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ Wave 0 |
| DASH-07 (row cap) | `liveEntries` trimmed to ≤200 total rows when combined with server entries | Unit | `pnpm --filter @web-crawler/dashboard test -- signalr` | ❌ Wave 0 |

**Existing test pattern to follow** (from `__tests__/source-actions.test.ts`):
- `vi.mock('@microsoft/signalr', () => ({ HubConnectionBuilder: vi.fn(), HubConnectionState: { Connected: 'Connected', Reconnecting: 'Reconnecting', Disconnected: 'Disconnected' } }))` — mock the package before importing context
- Use `vi.fn()` for `connection.on`, `connection.off`, `connection.start`, `connection.stop`

### Sampling Rate

- **Per task commit:** `pnpm --filter @web-crawler/dashboard test`
- **Per wave merge:** `pnpm --filter @web-crawler/dashboard test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/dashboard/__tests__/signalr-context.test.ts` — covers DASH-07 (SC-1, SC-3, row cap)
- [ ] `apps/dashboard/__tests__/__mocks__/signalr.ts` — mock for `@microsoft/signalr` (similar to existing `server-only.ts` mock pattern)
- [ ] Install: `pnpm add @microsoft/signalr sonner` + `pnpm dlx shadcn add sonner`

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this project (single-user, out of scope per REQUIREMENTS.md) |
| V3 Session Management | No | SignalR connection is anonymous; no session tokens |
| V4 Access Control | No | Single-user personal project |
| V5 Input Validation | Yes (LOW risk) | `DataEntry` typed via `types/api.ts` — the `NewEntry` payload must be type-asserted safely before use; validate shape before `setLiveEntries` if untrusted |
| V6 Cryptography | No | No sensitive data — dashboard connection is unauthenticated by design |

### Known Threat Patterns for SignalR JS Client

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `NewEntry` payload causing JS errors | Tampering | Type-guard or `as DataEntry` with defensive field access; already typed via `types/api.ts` |
| Hub URL exposed via `NEXT_PUBLIC_API_URL` | Information Disclosure | Acceptable — API URL is public by design (dashboard accesses it from browser); no secrets in URL |
| CORS bypass via crafted origin | Elevation | Server-side concern (Phase 6 D-07 `AllowCredentials()` with explicit origins) — no client action needed |

---

## Sources

### Primary (HIGH confidence)
- [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnectionbuilder] — `withUrl`, `withAutomaticReconnect`, `build` API
- [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnection] — `on`, `off`, `onreconnecting`, `onreconnected`, `onclose`, `start`, `stop`, `state`
- [CITED: learn.microsoft.com/en-us/javascript/api/@microsoft/signalr/hubconnectionstate] — enum values: Connected, Connecting, Disconnected, Disconnecting, Reconnecting
- [CITED: ui.shadcn.com/docs/components/sonner] — `<Toaster />` placement, `toast.success()`, `toast.error()`, position prop
- [VERIFIED: npm registry] — `@microsoft/signalr` 10.0.0 current; `sonner` 2.0.7 current
- [VERIFIED: codebase] — `apps/dashboard/package.json`, `vitest.config.ts`, `types/api.ts`, `api.client.ts`, `DashboardLayout.tsx`, `Sidebar.tsx`, `MobileNav.tsx`, `entries-table.tsx`, `app/entries/page.tsx`, `__tests__/*.test.ts` patterns

### Secondary (MEDIUM confidence)
- [CITED: .planning/phases/06-signalr-real-time-layer/06-CONTEXT.md] — Hub URL `/hubs/dashboard`, event name `NewEntry`, payload shape `DataEntryResponse`, gap recovery via `GET /api/entries?since=`, CORS decisions
- [CITED: .planning/phases/09-real-time-dashboard-integration/09-CONTEXT.md] — All D-01 through D-05 locked decisions

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions npm-verified; official Microsoft docs confirm API
- Architecture: HIGH — all patterns derived from official docs + reading actual codebase files
- Pitfalls: HIGH — derived from known Next.js App Router + SignalR JS client behaviour documented officially
- Integration points: HIGH — derived from reading all listed source files directly

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable libraries; `@microsoft/signalr` and `sonner` are stable — 30-day window reasonable)
