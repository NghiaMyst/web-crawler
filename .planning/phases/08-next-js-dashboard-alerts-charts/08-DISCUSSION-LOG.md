# Phase 8: Next.js Dashboard — Alerts & Charts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 08-next-js-dashboard-alerts-charts
**Areas discussed:** Chart Library, Alert Condition Form Design, Alert Rule Editing, Chart Date Range

---

## Chart Library

| Option | Description | Selected |
|--------|-------------|----------|
| Recharts standalone | Direct Recharts install, full control, ~500KB | |
| Shadcn Charts (Recharts-based) | Shadcn wrappers around Recharts; matches existing Shadcn design system (zinc/neutral colors, CSS variables) | ✓ |
| Chart.js + react-chartjs-2 | Canvas-based, extra wrapper package, less React-idiomatic | |
| SVG-only (no library) | Zero deps, full control, high manual complexity | |

**User's choice:** Shadcn Charts (option 2)
**Notes:** Consistent with existing component system; Recharts underneath so all primitives are available if needed.

---

## Alert Condition Form Design

| Option | Description | Selected |
|--------|-------------|----------|
| Type selector + conditional field reveal | Dropdown for type (new_item/field_changed/threshold); extra fields revealed per type; follows existing RHF+Zod pattern | ✓ |
| Raw JSON textarea | Single textarea, flexible but error-prone, no field guidance | |
| Wizard / multi-step form | Step-by-step guided input, overkill for 3 simple condition types | |

**User's choice:** Type selector + conditional field reveal (option 1)
**Notes:** Matches the 3-type Condition JSONB structure exactly. `watch("conditionType")` drives conditional rendering in RHF.

---

## Alert Rule Editing

| Option | Description | Selected |
|--------|-------------|----------|
| Add PUT endpoint to .NET API | Clean REST, pre-populates form, consistent with Sources pattern; PUT added to AlertRulesEndpoints.cs | ✓ |
| Delete + recreate (no PUT) | No API changes needed, but loses original Id (breaks FK in notification_logs), fragile on partial failure | |
| Create-only for v1 | Simplest, but fails success criterion 1 explicitly requiring edit pre-population | |

**User's choice:** Add PUT endpoint to .NET API (option 1)
**Notes:** Plan 08-04 already touches the API for the stats endpoint — both API changes colocated.

---

## Chart Date Range

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 7 days only | Hardcoded range=7d, no UI selector, satisfies success criterion as written | |
| Dropdown selector: 7d / 30d / 90d | Small Select above chart, trivial client state, meaningfully more useful | ✓ |
| Free date range picker | Full calendar picker, no date picker in current Shadcn setup, overkill | |

**User's choice:** Dropdown selector 7d/30d/90d (option 2)
**Notes:** Same `?range=7d` API param shape, just passes different values. Default is 7d to satisfy success criterion.

---

## Claude's Discretion

- Exact Shadcn Chart component variant and color assignment per source
- Single combined charts page vs separate routes
- Notification history column layout beyond the specified fields
- Whether to include `messageTpl` field in the alert rule form
- NavLinks icon choices for new nav entries

## Deferred Ideas

None — discussion stayed within phase scope.
