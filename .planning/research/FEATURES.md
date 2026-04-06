# Features Research
_Researched: 2026-04-07_

## Data Sources — API vs Scraping

### Football

**Recommended Approach: football-data.org API (free tier)**
- Free tier: 10 req/min, covers EPL + Champions League standings, fixtures, results
- JSON API — no HTML parsing needed, extremely stable
- Base URL: `https://api.football-data.org/v4/`
- Requires free API key in header: `X-Auth-Token: your_key`
- Rate limit fits comfortably within BullMQ politeness queue

**Alternative: ESPN hidden API**
- `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard` (undocumented, no auth)
- Fragile — can change without notice. Use as fallback only.

**Sofascore:** Has anti-bot detection. Not recommended for personal use without risk of IP ban.

---

### Genshin Impact

**Recommended Approach: HoYoWiki API + event page scraping**
- Official event calendar: `https://www.hoyolab.com/circles/2/41/official` — JSON API via network inspect
- HoYoWiki: `https://sg-wiki-api-static.hoyolab.com/hoyowiki/genshin/wapi/` — structured data
- Cheerio is sufficient (server-rendered pages)

**Gift codes:** No official API. Scrape from community sites (gamesradar.com/genshin-impact-codes, prydwen.gg). These are static pages — Cheerio works.

**Alternatives:** Enka.Network API (character/build data), Ambr.top (character/weapon data) — structured and stable.

---

### League of Legends

**Recommended Approach: Riot Games API (free tier)**
- `https://developer.riotgames.com/` — requires free API key
- `/lol/champion-mastery/v4/`, `/lol/league/v4/` endpoints for ranked data
- Rate limit: 20 req/1s, 100 req/2min (personal key) — fits politeness queue

**Tier lists:** No official API. Scrape from u.gg or op.gg.
- u.gg uses React with SSR data in `<script id="__NEXT_DATA__">` — parse JSON from script tag with Cheerio, no Playwright needed
- Patch notes: `https://www.leagueoflegends.com/en-us/news/game-updates/` — RSS feed available

---

### Anime / Manga

**Recommended Approach: AniList GraphQL API (free, no auth required)**
- `https://graphql.anilist.co` — full access to airing schedule, ratings, trending
- GraphQL query for current season airing: filter by `season: SPRING, seasonYear: 2026, status: RELEASING`
- Rate limit: 90 req/min — generous

**Jikan API (unofficial MAL):** `https://api.jikan.moe/v4/` — free, no auth, wraps MAL data
- `/v4/schedules` for airing schedule, `/v4/manga/{id}` for chapter tracking
- Rate limit: 3 req/s, 60 req/min

**New manga chapters:** No clean API. Options:
1. MangaDex API: `https://api.mangadex.org/` — free, structured, covers most titles
2. Scrape aggregator sites — fragile, not recommended

---

### Music

**ZingMP3:** No public API. Heavy anti-bot (Cloudflare). Playwright required + high ban risk. **Not recommended for v1.**

**Spotify Charts:** `https://charts.spotify.com/charts/view/regional-vn-daily/latest` — CSV download available without auth. Parse CSV directly — no HTML scraping needed.

**Recommended Approach for v1:** Spotify Charts CSV + Last.fm API (free key, `https://www.last.fm/api`)

---

## Diff Engine Design

### Recommended Approach: Snapshot comparison with `entry_key`

The `entry_key` column in `data_entries` is the key to reliable diffing:

1. When parsing, assign a stable `entry_key` per domain (e.g., `event_id`, `match_id`, `chapter_number`)
2. On each crawl, compare new payload against the most recent entry with the same `entry_key`
3. Use JSON diff library to detect field-level changes

```typescript
// Node.js diff detection
import { diff } from 'json-diff'; // or 'microdiff' (lighter)

const previous = await db.getLatestEntry(sourceId, entryKey);
const changes = diff(previous?.payload, newPayload);
if (changes) {
  await db.insertEntry({ sourceId, entryKey, payload: newPayload });
  await notifyQueue.add('notify', { changes, rule: alertRule });
}
```

**Alert condition evaluation:**
- `new_item`: `previous === null`
- `field_changed`: `changes[fieldName] !== undefined`
- `threshold`: `newPayload[field] > value && (previous === null || previous[field] <= value)`

### Alternatives
Event sourcing (append-only log + replay) — correct but overbuilt for this scale. Use snapshot comparison for Phase 1-3, revisit if needed.

---

## robots.txt Compliance

### Recommended Approach: `robots-parser` npm package

```bash
npm install robots-parser
```

```typescript
import robotsParser from 'robots-parser';

const robots = robotsParser(url, await fetch(robotsUrl).then(r => r.text()));
const allowed = robots.isAllowed(targetUrl, 'PersonalCrawlerBot');
```

Cache the parsed robots object per domain in a `Map<string, RobotsParser>` with TTL of 24 hours.

**Alternative:** `robotstxt-parser` — simpler but less complete spec coverage.

---

## Dashboard Patterns (Next.js + .NET API)

### Recommended Approach

**Data fetching:** Use `React Query` (TanStack Query) for client-side fetching with caching/stale-while-revalidate.

**Real-time updates:** SignalR `@microsoft/signalr` npm package. Connect on mount, update table rows on `newEntry` event.

**Filtering:** URL-based state (`?category=game&source=genshin-events`) using `nuqs` for type-safe URL params.

**Charts:** Recharts (lightweight, React-native) for win rate trends, crawl volume over time.

**Pagination:** Cursor-based pagination on the API side (`GET /api/entries?cursor=uuid&limit=20`) — more efficient than offset for large tables.
