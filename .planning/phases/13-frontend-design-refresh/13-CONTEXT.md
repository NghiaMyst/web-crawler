# Phase 13: Frontend Design Refresh - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete and harden the Variant B visual redesign across the Next.js dashboard — formalizing design system tokens, polishing the data table, styling management page badges/buttons, applying chart palette, and adding Playwright visual QA snapshots.

**Already done (commit 944bc81):** Dark sidebar (`#1c1814`), coral primary (`#d8553a`), hero section with big search + category tiles on Entries page, PageHeader on all pages, CategoryBadge, CategoryFilterTiles, Plus Jakarta Sans + Inter fonts.

**This phase delivers:** Sidebar color tweak, design token formalization, comfortable data table, search highlight styling, empty states, chart page visual treatment, badge/button consistency across management pages, and Playwright screenshot snapshots.

Not in scope: new pages, new data sources, backend changes, dark mode, authentication.

</domain>

<decisions>
## Implementation Decisions

### Design Direction
- **D-01:** **Variant B confirmed** — Hero + tiles + dark sidebar + coral accent is the locked direction. No structural rethinking needed.
- **D-02:** **Sidebar color nudge** — Change sidebar background from `#1c1814` to a slightly lighter warm dark: `#252017` or `#2a2420`. Keep the warm-brown character, reduce heaviness.
- **D-03:** **Hero on Entries only** — The Variant B hero card (big search + category tiles) lives only on `/entries`. All other pages (`/charts`, `/alerts`, `/sources`, `/jobs`, `/notifications`) use the existing `PageHeader` component — no hero block.

### Data Table Polish
- **D-04:** **Comfortable row density** — Table rows should feel spacious (~48px height, more py padding). Easier to scan content in a personal monitoring dashboard.
- **D-05:** **Search highlight via `<mark>` tags** — When `?q=` is active, matched tokens get a styled `<mark>` tag with coral underline or subtle coral background tint. Extends the Phase 11 client-side mark-up, just styled consistently with the new palette.
- **D-06:** **Empty state: centered icon + message** — When no entries match (no data or no search match): a `lucide-react` icon (e.g., `Inbox` or `SearchX`) + short message line (e.g., "No entries found" / "No results for your search"). Consistent with Shadcn UI style.

### Charts Page
- **D-07:** **Full visual treatment** — Chart cards get consistent `border`/`shadow-sm` card styling. Chart line/bar colors updated to use coral (`#d8553a`) as the primary series color plus complementary palette from the existing `--chart-*` CSS variables (teal, amber, etc.). Replace default Recharts/Shadcn chart color defaults.

### Management Pages (Sources, Jobs, Alerts, Notifications)
- **D-08:** **Status badges + action buttons styled** — Consistent badge colors per status (`pending`/`running`/`done`/`failed` for jobs; `sent`/`failed` for notification logs; `Telegram`/`Discord` channel badges). Action buttons (Retry, Delete, Edit) use the coral primary palette consistently. No structural page changes — tables and card layout stay from prior phases.

### Modals
- **D-09:** **Palette consistency only** — Add Source, Edit Alert Rule, and Delete confirmation modals get inputs/labels/buttons updated to the new coral primary and typography. No structural changes to modal layout.

### Visual QA
- **D-10:** **Playwright screenshot snapshots** — Add snapshot tests that screenshot key pages (Entries, Charts, Sources, one management page) and fail on unexpected layout changes. Not full cross-browser — just Chrome headless on CI.

### Claude's Discretion
- Exact warm-dark hex value for sidebar (`#252017` vs `#2a2420` — pick whichever is visually balanced)
- Which lucide-react icon to use for empty states per-page context
- Exact `<mark>` styling (underline vs subtle bg tint) — use whichever is more readable
- Nav icon assignments (if any need updating to match the refreshed look)
- Playwright snapshot threshold tolerances

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Artifacts
- `design/design-v1/wireframes.jsx` — All 5 layout variants (A–E). Variant B is the chosen direction (lines 151–250). Color palette variables and vibe definitions also here.
- `design/design-v1/app.jsx` — Canvas wrapper with palette config (`accent: "#d8553a"`, vibe options: pencil/napkin/blueprint/bw)

### Current Implementation (Foundation)
- `apps/dashboard/app/globals.css` — Tailwind v4 `@theme` block with all CSS variables including coral primary, chart colors, sidebar colors. All design token changes go here.
- `apps/dashboard/app/layout.tsx` — Font setup (Inter + Plus Jakarta Sans) and root layout
- `apps/dashboard/components/layout/Sidebar.tsx` — Current dark sidebar; `bg-[#1c1814]` to be updated
- `apps/dashboard/components/entries/HeroSection.tsx` — Variant B hero card (entries-only)
- `apps/dashboard/components/entries/CategoryFilterTiles.tsx` — Category tile buttons
- `apps/dashboard/components/entries/CategoryBadge.tsx` — Per-category colored badges

### Phase 7–8 Patterns (must maintain)
- `.planning/phases/07-next-js-dashboard-core-views/07-01-SUMMARY.md` — Tailwind v4 CSS-first, Shadcn init, api.server.ts/api.client.ts split
- `.planning/phases/08-next-js-dashboard-alerts-charts/08-CONTEXT.md` — Shadcn Charts (Recharts wrappers), CSS variable theming pattern

### Requirements
- `.planning/ROADMAP.md` — Phase 13 success criteria and plan breakdown (13-01 through 13-04)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dashboard/components/ui/` — Full Shadcn/ui set: Button, Badge, Card, Dialog, Table, Select, Input, Label, Skeleton — all already installed
- `apps/dashboard/components/entries/entries-table.tsx` — Main data table; row density changes here
- `apps/dashboard/components/layout/NavLinks.tsx` — Active nav item styling (coral); any sidebar color change must keep nav contrast readable
- `apps/dashboard/components/layout/PageHeader.tsx` — Shared heading + description component used by all non-entry pages

### Established Patterns
- **CSS-first design tokens:** All theme values live in `globals.css @theme` and `:root {}` — no `tailwind.config.js`
- **Shadcn CSS variable theming:** Components read from `--primary`, `--chart-1` etc., so updating `:root {}` values cascades to all components automatically
- **Tailwind arbitrary values for one-offs:** `bg-[#1c1814]`, `text-[#d8553a]` used where CSS variable isn't semantic enough — convert to CSS variables in this phase
- **Shadcn Charts:** Recharts under the hood; color customization via `config` prop and `--chart-*` CSS variables

### Integration Points
- `apps/dashboard/app/globals.css` — primary site for all design token updates
- `apps/dashboard/components/layout/Sidebar.tsx` — sidebar bg color update
- `apps/dashboard/components/entries/entries-table.tsx` — row padding/density + `<mark>` styling + empty state
- `apps/dashboard/app/charts/page.tsx` — chart page visual treatment
- Any component using `Badge` for status (jobs, notifications, alert rules) — badge color customization

</code_context>

<specifics>
## Specific Ideas

- Wireframe color palette: `accent: "#d8553a"`, background vibe `pencil` (off-white `#fbf8f2`, dark ink `#1a1714`). The production implementation uses OKLCH equivalents — keep this warmth.
- The warm sidebar character (brown-black, not zinc/slate) is intentional and should be preserved — just make it slightly less opaque/heavy by raising lightness slightly.
- Chart colors already set: coral (`--chart-1`), teal (`--chart-2`), amber etc. — use these for the charts page, don't introduce new named colors.

</specifics>

<deferred>
## Deferred Ideas

- Dark mode support — out of scope for this phase (personal project, single user)
- Variant A/C/D/E elements — only Variant B is implemented
- Deployment todos (deploy-phase-11-12, UAT checks) — separate from frontend design work

### Reviewed Todos (not folded)
- **Deploy Phase 11+12 code to GCP VM** — deployment work, not design
- **Phase 12 live deployment UAT checks** — deployment work, not design

</deferred>

---

*Phase: 13-frontend-design-refresh*
*Context gathered: 2026-05-26*
