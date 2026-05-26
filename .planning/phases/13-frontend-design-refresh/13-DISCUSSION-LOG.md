# Phase 13: Frontend Design Refresh - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 13-frontend-design-refresh
**Areas discussed:** Design Direction, Data Table Polish, Component Depth & Pages

---

## Design Direction

| Option | Description | Selected |
|--------|-------------|----------|
| Locked — Variant B as-is | Proceed with hero/sidebar/coral foundation as-is | |
| Variant B + small tweaks | Keep core direction, adjust specific elements | ✓ |
| Reconsider — look at other variants | Review A/C/D/E before committing | |

**User's choice:** Variant B + small tweaks

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hero only on Entries page | Keep hero on /entries; other pages use PageHeader only | |
| Sidebar color/weight | Sidebar #1c1814 feels too heavy — adjust | ✓ |
| Category tiles layout | Sizing/spacing work for different screen widths | |
| Other | Something else | |

**User's choice:** Sidebar color/weight — the dark sidebar is too heavy

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cooler dark — zinc-900 / #18181b | Standard Shadcn dark, less warm | |
| Lighter sidebar — light grey background | Airy light sidebar | |
| Keep warm dark but slightly lighter | Bump from #1c1814 to ~#2a2420 or #252017 | ✓ |

**User's choice:** Keep warm dark but slightly lighter (~#252017 or #2a2420)
**Notes:** Preserve the warm brown-black character but reduce the heaviness slightly

---

## Data Table Polish

| Option | Description | Selected |
|--------|-------------|----------|
| Comfortable — slightly taller rows (~48px) | Easier to scan, good for personal dashboard | ✓ |
| Dense — compact rows (~36px) | More entries visible at once | |
| Claude's discretion | Pick based on Shadcn defaults | |

**User's choice:** Comfortable row density

---

| Option | Description | Selected |
|--------|-------------|----------|
| Highlighted text only (`<mark>` tags, coral) | Only matched tokens visually marked | ✓ |
| Full row highlight | Entire row gets a coral/amber tint | |
| Claude's discretion | Keep Phase 11 as-is, style `<mark>` tags | |

**User's choice:** Highlighted text only — `<mark>` tags with coral styling

---

| Option | Description | Selected |
|--------|-------------|----------|
| Centered message with icon | lucide-react icon + "No entries found" message | ✓ |
| Full-width illustration block | Sketch-style SVG illustration | |
| Claude's discretion | Whatever fits in current table layout | |

**User's choice:** Centered icon + message (Shadcn-consistent)

---

## Component Depth & Pages

| Option | Description | Selected |
|--------|-------------|----------|
| Full visual treatment | Chart containers styled, colors match coral palette | ✓ |
| Minimal polish — just card/header | No chart color changes | |
| Claude's discretion | Claude picks polish level | |

**User's choice:** Full visual treatment for Charts page

---

| Option | Description | Selected |
|--------|-------------|----------|
| Status badges + action buttons styled | Consistent badge colors, action button palette | ✓ |
| Full page refresh — cards instead of tables | Higher visual impact, more work | |
| Just headers — no table/component changes | PageHeader is enough | |

**User's choice:** Status badges + action buttons styled across management pages

---

| Option | Description | Selected |
|--------|-------------|----------|
| Consistent with new palette only | Inputs/buttons/labels use coral primary + typography | ✓ |
| Polish header + footer bar | Styled modal header with icon + coral underline | |
| Claude's discretion | Whatever looks clean with new palette | |

**User's choice:** Palette consistency only for modals

---

| Option | Description | Selected |
|--------|-------------|----------|
| Local browser check only | Developer inspects in Chrome/Firefox | |
| Playwright screenshot snapshots | Screenshot tests for key pages, fail on layout breaks | ✓ |
| Claude's discretion | Claude decides QA depth | |

**User's choice:** Playwright screenshot snapshots (Chrome headless, CI-compatible)

---

## Claude's Discretion

- Exact warm-dark hex value for sidebar
- lucide-react icon selection per empty state context
- `<mark>` styling details (underline vs subtle bg tint)
- Nav icon assignments
- Playwright snapshot tolerance thresholds

## Deferred Ideas

- Dark mode support
- Variants A/C/D/E elements
- Deployment todos (unrelated to design)
