"""
Fix 09-02-PLAN.md: Change since -> from for gap recovery API parameter.

Changes:
1. must_haves: "with since parameter" -> "with from parameter"
2. must_haves artifacts: fetchEntriesSince -> fetchEntriesFrom, since?: string -> (no change needed in EntryFilters, 'from' already exists)
3. read_first: add apps/api/Endpoints/EntriesEndpoints.cs
4. behavior: fetchEntriesSince -> fetchEntriesFrom, ?since= -> ?from=
5. action: all since -> from changes in code blocks and narrative
6. acceptance_criteria: since -> from greps
7. done: fetchEntriesSince -> fetchEntriesFrom
8. threat_model: ?since= -> ?from=
9. success_criteria: ?since= -> ?from=
10. verification: fetchEntriesSince -> fetchEntriesFrom
"""

with open('.planning/phases/09-real-time-dashboard-integration/09-02-PLAN.md', 'r', encoding='utf-8') as f:
    content = f.read()

# ============================================================
# FRONTMATTER must_haves changes
# ============================================================

# must_haves truth: "with since parameter" -> "with from parameter"
content = content.replace(
    '"On reconnect, missed entries are fetched via GET /api/entries with since parameter and prepended"',
    '"On reconnect, missed entries are fetched via GET /api/entries with from parameter and prepended"'
)

# must_haves artifacts: fetchEntriesSince -> fetchEntriesFrom
content = content.replace(
    'provides: "fetchEntriesSince function for gap recovery"',
    'provides: "fetchEntriesFrom function for gap recovery"'
)
content = content.replace(
    'exports: ["fetchEntriesSince"]',
    'exports: ["fetchEntriesFrom"]'
)

# must_haves artifacts: since?: string is actually NOT needed on EntryFilters
# because the existing 'from' field already serves this purpose.
# Remove the since artifact and replace with note about reusing from field.
content = content.replace(
    '''    - path: "apps/dashboard/types/api.ts"
      provides: "since field on EntryFilters interface"
      contains: "since?: string"''',
    '''    - path: "apps/dashboard/types/api.ts"
      provides: "EntryFilters interface with from field (reused for gap recovery)"
      contains: "from?: string"'''
)

# ============================================================
# Task 1 read_first: add server endpoint file
# ============================================================
content = content.replace(
    '''  <read_first>
    apps/dashboard/types/api.ts,
    apps/dashboard/lib/api.client.ts,
    apps/dashboard/components/entries/entries-table.tsx,
    apps/dashboard/contexts/signalr.context.tsx,
    apps/dashboard/__tests__/signalr-context.test.ts,
    apps/dashboard/__tests__/__mocks__/signalr.ts
  </read_first>''',
    '''  <read_first>
    apps/dashboard/types/api.ts,
    apps/dashboard/lib/api.client.ts,
    apps/dashboard/components/entries/entries-table.tsx,
    apps/dashboard/contexts/signalr.context.tsx,
    apps/dashboard/__tests__/signalr-context.test.ts,
    apps/dashboard/__tests__/__mocks__/signalr.ts,
    apps/api/Endpoints/EntriesEndpoints.cs
  </read_first>'''
)

# ============================================================
# Task 1 behavior
# ============================================================
content = content.replace(
    '- Test 1: fetchEntriesSince calls request with /api/entries?since=<iso>&limit=50',
    '- Test 1: fetchEntriesFrom calls request with /api/entries?from=<iso>&limit=50'
)
content = content.replace(
    '- Test 5: Gap recovery calls fetchEntriesSince with last received crawledAt timestamp',
    '- Test 5: Gap recovery calls fetchEntriesFrom with last received crawledAt timestamp'
)

# ============================================================
# Task 1 action Step 1: EntryFilters - no need to add 'since' field
# because 'from' already exists in EntryFilters. Replace the whole Step 1.
# ============================================================
content = content.replace(
    '''**Step 1 — Update `apps/dashboard/types/api.ts`.** Add `since` to the `EntryFilters` interface:

```typescript
export interface EntryFilters {
  category?: string;
  sourceId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  since?: string;  // ISO timestamp for gap recovery after SignalR reconnect
}
```''',
    '''**Step 1 — Verify `apps/dashboard/types/api.ts`.** The `EntryFilters` interface already has
a `from?: string` field which maps to the server’s `DateTimeOffset? from` query parameter.
No changes needed to `EntryFilters` — the existing `from` field is reused for gap recovery.

**IMPORTANT:** The .NET server endpoint (`apps/api/Endpoints/EntriesEndpoints.cs`) uses `from`
(DateTimeOffset), NOT `since`. Verified server signature:
```csharp
internal static async Task<IResult> GetEntries(
    AppDbContext db, string? category = null, Guid? sourceId = null,
    DateTimeOffset? from = null, DateTimeOffset? to = null,
    string? cursor = null, int limit = 20)
```'''
)

# ============================================================
# Task 1 action Step 2: fetchEntriesSince -> fetchEntriesFrom
# ============================================================
content = content.replace(
    '''**Step 2 — Update `apps/dashboard/lib/api.client.ts`.** Add the `since` parameter to
`fetchEntriesClient` query string builder and add a dedicated `fetchEntriesSince` function:

In the existing `fetchEntriesClient`, add after the `to` param handling:
```typescript
if (filters.since) params.set('since', filters.since);
```

Add a new exported function below `fetchEntriesClient`:
```typescript
export async function fetchEntriesSince(since: string, limit = 50): Promise<PaginatedEntries> {
  const params = new URLSearchParams();
  params.set('since', since);
  params.set('limit', String(limit));
  return request<PaginatedEntries>(`/api/entries?${params.toString()}`);
}
```''',
    '''**Step 2 — Update `apps/dashboard/lib/api.client.ts`.** Add a dedicated `fetchEntriesFrom`
function for gap recovery. This function calls `GET /api/entries?from=<iso>&limit=50` using the
server’s actual `from` query parameter (NOT `since` — see server signature above).

The existing `fetchEntriesClient` already passes `filters.from` as the `from` query param,
so no changes are needed there. Add a new exported convenience function below `fetchEntriesClient`:

```typescript
export async function fetchEntriesFrom(from: string, limit = 50): Promise<PaginatedEntries> {
  const params = new URLSearchParams();
  params.set('from', from);
  params.set('limit', String(limit));
  return request<PaginatedEntries>(`/api/entries?${params.toString()}`);
}
```'''
)

# ============================================================
# Task 1 action Step 3: test description updates
# ============================================================
content = content.replace(
    "- Test that `fetchEntriesSince` constructs the correct URL by mocking the `request` function.",
    "- Test that `fetchEntriesFrom` constructs the correct URL by mocking the `request` function."
)
content = content.replace(
    """For `fetchEntriesSince` test, mock `api.client.ts` internal `request`:
```typescript
describe('fetchEntriesSince', () => {
  it('calls /api/entries with since and limit params', async () => {
    // Mock fetch or the request function
    // Verify URL contains ?since=2026-01-01T00:00:00Z&limit=50
  });
});
```""",
    """For `fetchEntriesFrom` test, mock `api.client.ts` internal `request`:
```typescript
describe('fetchEntriesFrom', () => {
  it('calls /api/entries with from and limit params', async () => {
    // Mock fetch or the request function
    // Verify URL contains ?from=2026-01-01T00:00:00Z&limit=50
  });
});
```"""
)

# ============================================================
# Task 1 action Step 4: LiveEntriesWrapper code block
# ============================================================
content = content.replace(
    "import { fetchEntriesSince } from '@/lib/api.client';",
    "import { fetchEntriesFrom } from '@/lib/api.client';"
)
content = content.replace(
    '        const result = await fetchEntriesSince(since, 50);',
    '        const result = await fetchEntriesFrom(since, 50);'
)

# ============================================================
# Task 1 acceptance_criteria
# ============================================================
content = content.replace(
    "- `apps/dashboard/types/api.ts` contains `since?: string` inside `EntryFilters`",
    "- `apps/dashboard/types/api.ts` contains `from?: string` inside `EntryFilters` (pre-existing field reused for gap recovery)"
)
content = content.replace(
    "- `apps/dashboard/lib/api.client.ts` contains `export async function fetchEntriesSince(`",
    "- `apps/dashboard/lib/api.client.ts` contains `export async function fetchEntriesFrom(`"
)
content = content.replace(
    "- `apps/dashboard/lib/api.client.ts` contains `params.set('since', since)`",
    "- `apps/dashboard/lib/api.client.ts` contains `params.set('from', from)`"
)
content = content.replace(
    "- `live-entries-wrapper.tsx` contains `fetchEntriesSince(since, 50)`",
    "- `live-entries-wrapper.tsx` contains `fetchEntriesFrom(since, 50)`"
)

# ============================================================
# Task 1 done
# ============================================================
content = content.replace(
    "gap recovery via fetchEntriesSince, and reconnect toast messages. API client extended with since parameter support.",
    "gap recovery via fetchEntriesFrom, and reconnect toast messages. API client extended with from parameter support (matching server's actual query param)."
)

# ============================================================
# Threat model
# ============================================================
content = content.replace(
    "GET /api/entries?since=<ts> fetches missed entries",
    "GET /api/entries?from=<ts> fetches missed entries"
)
content = content.replace(
    "gap recovery limited to 50 entries via `fetchEntriesSince(since, 50)`",
    "gap recovery limited to 50 entries via `fetchEntriesFrom(since, 50)`"
)
content = content.replace(
    "| T-09-06 | Information Disclosure | since timestamp in gap recovery URL",
    "| T-09-06 | Information Disclosure | from timestamp in gap recovery URL"
)

# ============================================================
# Verification
# ============================================================
content = content.replace(
    "5. `apps/dashboard/lib/api.client.ts` exports `fetchEntriesSince`",
    "5. `apps/dashboard/lib/api.client.ts` exports `fetchEntriesFrom`"
)

# ============================================================
# Success criteria
# ============================================================
content = content.replace(
    "Gap recovery on reconnect calls GET /api/entries?since=<last_crawledAt>&limit=50",
    "Gap recovery on reconnect calls GET /api/entries?from=<last_crawledAt>&limit=50"
)

# ============================================================
# Task name
# ============================================================
content = content.replace(
    '<name>Task 1: Add fetchEntriesSince to API client and create LiveEntriesWrapper</name>',
    '<name>Task 1: Add fetchEntriesFrom to API client and create LiveEntriesWrapper</name>'
)

with open('.planning/phases/09-real-time-dashboard-integration/09-02-PLAN.md', 'w', encoding='utf-8') as f:
    f.write(content)

print('09-02-PLAN.md updated successfully')
