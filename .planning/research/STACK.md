# Stack Research
_Researched: 2026-04-07_

## BullMQ — Job Queue Best Practices

BullMQ is the right choice here. Key patterns for 2025:

### Key Recommendation
- Use `Worker` with `concurrency` set per queue type: URL Frontier workers `concurrency: 5`, per-domain crawl queues `concurrency: 1`
- Set `removeOnComplete: { count: 1000 }` and `removeOnFail: { count: 500 }` to prevent Redis memory bloat
- Use `attempts: 3` + `backoff: { type: 'exponential', delay: 5000 }` for retry
- Enable `stalledInterval` (default 30s) so crashed workers release stalled jobs

```typescript
const worker = new Worker('crawl:lichess.org', async (job) => {
  // process job
}, {
  connection: redis,
  concurrency: 1,
  limiter: { max: 1, duration: 2000 } // politeness: 1 req / 2s
});
```

### Gotchas
- **BullMQ on ARM/Docker**: Use `redis:7-alpine` — it has ARM64 builds. The `ioredis` client (BullMQ dependency) works on ARM without issues.
- **Rate limiter scope**: BullMQ `limiter` applies per worker instance, not globally across multiple Node processes. For multi-process scale (Phase 5), use a shared Redis counter instead.
- **Job deduplication**: BullMQ `jobId` option enables deduplication — set `jobId: url_hash` to prevent duplicate URLs entering the queue.

---

## Cheerio vs Playwright — Worker Strategy

### Key Recommendation
Structure workers as two separate BullMQ worker classes sharing a common interface:

```typescript
interface CrawlWorker {
  fetch(url: string): Promise<string>; // returns raw HTML
}

class CheerioWorker implements CrawlWorker { ... }
class PlaywrightWorker implements CrawlWorker { ... }
```

Source `crawler_type` field in DB drives which worker is instantiated.

### Playwright Memory Management
- Use a **browser pool** with a max of 2-3 Playwright browser instances (not one per job)
- Reuse pages, close after each job, reopen browser if it crashes
- On Oracle ARM (24GB), budget ~400MB per browser instance → max 3 instances safely
- Use `browserType.launch({ args: ['--disable-dev-shm-usage'] })` in Docker containers

### Gotchas
- Playwright `waitUntil: 'networkidle'` can hang on sites with polling. Use `waitUntil: 'domcontentloaded'` + explicit `waitForSelector` for target elements instead.
- Chromium ARM64 build: `playwright install chromium` works on ARM64 since Playwright 1.20+. Confirm with `playwright install --with-deps chromium`.

---

## .NET + Node.js Queue Integration

The project uses PostgreSQL `LISTEN/NOTIFY` as the handoff mechanism (not sharing BullMQ directly).

### Key Recommendation
**PostgreSQL outbox pattern:**
1. Node.js crawler inserts parsed data into `data_entries` table
2. Node.js fires `pg.query("NOTIFY new_entry, '...'")` with the entry ID
3. .NET uses Npgsql `NpgsqlConnection.Notification` event listener to receive and process

```csharp
// .NET: listen for new entries
await using var conn = new NpgsqlConnection(connectionString);
await conn.OpenAsync();
conn.Notification += (o, e) => ProcessNewEntry(e.Payload);
await conn.ExecuteNonQueryAsync("LISTEN new_entry");
while (true) await conn.WaitAsync(); // blocks, fires events
```

### Gotchas
- `LISTEN/NOTIFY` payloads are limited to 8000 bytes — pass only the entry UUID, not the full payload
- One persistent connection per listener in .NET — wrap in `IHostedService` for lifecycle management
- If .NET is down when crawler inserts, notifications are lost. Use a `processed: bool` column on `data_entries` as fallback — .NET can poll for unprocessed rows on startup.

---

## PostgreSQL JSONB Performance

### Key Recommendation
- GIN index on `payload` column is mandatory: `CREATE INDEX idx_data_entries_payload ON data_entries USING gin(payload)`
- Use `@>` operator for containment queries (uses GIN): `WHERE payload @> '{"is_active": true}'`
- Use `->>'field'` for text extraction, `->` for JSON sub-objects
- Cast to typed value when needed: `(payload->>'win_rate')::float`

### When to migrate JSONB to columns
- When the same field is queried in > 50% of queries for a source
- When you need foreign key constraints on JSONB values
- Phase 5 signal: query planner chooses seq scan over GIN index → time to add a typed column

### Gotchas
- GIN index update cost: every INSERT/UPDATE to `data_entries` re-indexes the JSONB. For high-frequency sources, consider partial GIN index: `WHERE category = 'game'`
- `jsonb_path_query` (JSONPath) is more expressive but doesn't always use GIN index. Profile first.

---

## Bloom Filter Persistence

### Key Recommendation
**Serialize to Redis as a string on shutdown, reload on startup:**

```typescript
// Save
const serialized = filter.saveAsJSON();
await redis.set('bloom:url-filter', JSON.stringify(serialized));

// Load
const data = await redis.get('bloom:url-filter');
if (data) {
  filter = BloomFilter.fromJSON(JSON.parse(data));
} else {
  filter = BloomFilter.create(100000, 0.01);
}
```

Use `process.on('SIGTERM', ...)` to save before graceful shutdown.

### Gotchas
- Bloom Filter cannot remove entries — if corrupted, delete the Redis key and rebuild from `crawl_jobs` table (query all `status='done'` URLs and re-add to fresh filter)
- Filter capacity (100k) should be 2-3x your expected 1-year URL count, not current count
- Redis key TTL: set no TTL (or very long TTL) — accidental expiry forces full rebuild
