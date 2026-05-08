---
status: testing
phase: 07-next-js-dashboard-core-views
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md
started: 2026-05-04T00:00:00Z
updated: 2026-05-04T00:00:00Z
---

## Current Test

number: 1
name: Root Redirect
expected: |
  Navigate to http://localhost:3000 (the dashboard root). The browser should
  immediately redirect to /entries without any manual navigation. The entries
  page content (or its loading skeleton) should appear in the main area.
awaiting: user response

## Tests

### 1. Root Redirect
expected: Navigate to http://localhost:3000 — browser redirects automatically to /entries. No manual click required.
result: [pending]

### 2. Dashboard Layout (Desktop)
expected: On a wide viewport (≥768px), a persistent sidebar is visible on the left (~240px wide) containing navigation links for at least "Entries" and "Sources". The current active page link appears visually distinct (bold or highlighted) compared to inactive links.
result: [pending]

### 3. Mobile Navigation
expected: On a narrow viewport (<768px), the sidebar is hidden and a hamburger/menu icon appears at the top. Clicking the icon opens a slide-out drawer containing the same navigation links. Clicking a link closes the drawer and navigates to that page.
result: [pending]

### 4. Entries Page Loads
expected: /entries renders a data table with rows of crawled entries. Each row shows at minimum: a category badge, an entry key (possibly truncated), a payload preview, and a crawled-at timestamp. If the API is unreachable, an error state or empty message appears rather than a crash.
result: [pending]

### 5. Category Filter
expected: On /entries, selecting a value from the Category dropdown (e.g. "football") filters the table to show only entries of that category. The URL updates to include ?category=football. Selecting "All" removes the filter and restores all entries.
result: [pending]

### 6. Source Filter
expected: On /entries, selecting a source from the Source dropdown filters the table to show only entries from that source. The URL updates with ?sourceId=... Selecting "All sources" removes the filter.
result: [pending]

### 7. Date Range Filter
expected: On /entries, setting a "From" date and/or "To" date filters the entries table to entries within that date range. The URL updates with ?from= and/or ?to= parameters. Clearing the dates removes the filter.
result: [pending]

### 8. Load More Pagination
expected: On /entries, if the API returns more entries than the initial page (20 entries), a "Load more" button appears below the table. Clicking it appends the next batch of entries to the existing table without reloading the page. The button disappears when there are no more entries.
result: [pending]

### 9. Sources Page Loads
expected: /sources renders a table of configured sources. Each row shows the source name, URL, active/inactive status (badge), and at least the crawler type. If no sources exist, an empty state with an "Add Source" call-to-action is shown instead.
result: [pending]

### 10. Add Source
expected: On /sources, clicking the "Add Source" button opens a modal/dialog with a form. Filling in required fields (name, URL, category, crawl interval, etc.) and submitting creates the source. The new source appears in the table and the modal closes. If the API is unavailable, an error message is shown inline.
result: [pending]

### 11. Edit Source
expected: On /sources, clicking the edit icon on an existing source opens a modal pre-filled with that source's current values. Fields that are immutable after creation (name, category, parser key, crawler type) are disabled/greyed out. Submitting with changed values (display name, URL, interval, status) updates the source.
result: [pending]

### 12. Delete Source
expected: On /sources, clicking the delete icon on a source opens a confirmation dialog. Confirming the delete immediately removes the source from the list (optimistic UI — no loading spinner before removal). If the API call fails, the source reappears with a rollback message.
result: [pending]

### 13. Sources Empty State
expected: On a fresh install with no sources configured, /sources shows an empty state UI (not a blank page or error). The empty state includes a visible "Add Source" button that opens the add modal when clicked.
result: [pending]

## Summary

total: 13
passed: 0
issues: 0
pending: 13
skipped: 0
blocked: 0

## Gaps

[none yet]
