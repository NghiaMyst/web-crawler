# Architecture

Thiết kế dựa theo mô hình **ByteByteGo — Design a Web Crawler** (Alex Xu, System Design Interview Vol.1), được điều chỉnh cho tech stack Node.js + .NET.

---

## 1. High-Level Architecture

```
[Seed URLs]
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CRAWLER LAYER (Node.js)                  │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐ │
│  │ URL Frontier │───▶│ DNS Resolver │───▶│  Crawl Workers     │ │
│  │              │    │  (IP cache)  │    │  Playwright/Cheerio│ │
│  │ - Priority Q │    └──────────────┘    │  BullMQ jobs       │ │
│  │ - Politeness │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│                    │ │
│  └──────────────┘    new URLs found      └────────┬───────────┘ │
│                                                   │             │
│  ┌──────────────┐    ┌──────────────┐             │ raw HTML    │
│  │ URL Dedup    │◀───│Content Parser│◀────────────┘             │
│  │ Bloom Filter │    │ Extract data │                           │
│  └──────────────┘    │ Extract links│                           │
│                      └──────┬───────┘                           │
│                             │ parsed data                       │
│                      ┌──────▼───────┐                           │
│                      │ Content Dedup│                           │
│                      │ Hash checksum│                           │
│                      └──────┬───────┘                           │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Message Queue  │
                    │  BullMQ / Redis │
                    └────────┬────────┘
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │  PostgreSQL  │ │  .NET API   │ │ Notif Service│
    │  Data Store  │ │  REST       │ │ Telegram Bot │
    │              │ │  SignalR    │ └──────────────┘
    └──────────────┘ └──────┬──────┘
                            │
                     ┌──────▼──────┐
                     │  Next.js    │
                     │  Dashboard  │
                     └─────────────┘
```

---

## 2. Components Chi Tiết

### 2.1 URL Frontier

Trái tim của hệ thống crawler. Quản lý toàn bộ URL cần crawl theo 2 cơ chế:

**Priority Queue** — Ưu tiên URL quan trọng hơn được crawl trước.

Ví dụ scoring:
- Event page game đang active: priority 9
- Trang kết quả bóng đá hôm nay: priority 8  
- Trang wiki tĩnh: priority 3

**Politeness Queue** — Đảm bảo mỗi domain chỉ có 1 request active tại một thời điểm, tránh bị block IP.

Cơ chế: Map `domain → queue riêng`, mỗi queue có delay tối thiểu 2s giữa các job.

Implementation: BullMQ với `limiter` per queue name (domain).

```typescript
// Ví dụ tạo queue có politeness cho 1 domain
const queue = new Queue(`crawl:${domain}`, { connection: redis });
await queue.add('crawl', { url }, {
  delay: 2000,           // Politeness: tối thiểu 2s
  priority: jobPriority,
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 }
});
```

### 2.2 DNS Resolver + Cache

Tránh DNS lookup lặp đi lặp lại cho cùng một domain. Cache IP resolution với TTL 10 phút.

Tại sao quan trọng: DNS lookup tốn 20–120ms mỗi lần. Với 500 URL/ngày từ ~10 domain, cache giúp tiết kiệm đáng kể.

```typescript
const dnsCache = new Map<string, { ip: string; expiresAt: number }>();
```

### 2.3 Crawl Workers

Hai loại worker tùy thuộc vào target site:

**Cheerio Worker** (HTML tĩnh) — Nhanh, nhẹ, không cần browser.

Phù hợp: Trang server-side rendered, API JSON endpoint.

```typescript
const { data } = await axios.get(url, {
  headers: { 'User-Agent': 'PersonalCrawlerBot/1.0' }
});
const $ = cheerio.load(data);
```

**Playwright Worker** (JS-rendered SPA) — Chậm hơn nhưng handle được React/Vue sites.

Phù hợp: Genshin wiki, các trang anime modern.

```typescript
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
const content = await page.content();
```

### 2.4 robots.txt Cache

Đọc file `robots.txt` của từng domain một lần, cache lại. Kiểm tra mỗi URL trước khi crawl.

```typescript
async function isAllowed(url: string): Promise<boolean> {
  const { hostname } = new URL(url);
  if (!robotsCache.has(hostname)) {
    const robotsTxt = await fetchRobotsTxt(hostname);
    robotsCache.set(hostname, parseRobots(robotsTxt));
  }
  return robotsCache.get(hostname)!.isAllowed(url, 'PersonalCrawlerBot');
}
```

### 2.5 URL Deduplicator — Bloom Filter

Kiểm tra URL đã crawl chưa với memory cực thấp. Bloom Filter dùng O(m) bits thay vì O(n) bytes như HashSet.

Trade-off: Chấp nhận false positive ~1% (có thể bỏ qua URL hợp lệ), nhưng không bao giờ false negative (không bỏ sót URL mới).

```typescript
import { BloomFilter } from 'bloom-filters';
const filter = BloomFilter.create(100000, 0.01); // 100k URLs, 1% false positive
filter.add(url);
const seen = filter.has(url); // O(k) — constant time
```

### 2.6 Content Deduplicator

Hash nội dung page, so sánh với lần crawl trước. Nếu hash giống nhau → skip lưu, không trigger notification.

```typescript
const hash = crypto.createHash('md5').update(rawHtml).digest('hex');
const existing = await db.crawlJob.findFirst({ where: { url, contentHash: hash } });
if (existing) return; // Content không thay đổi
```

### 2.7 Content Parser

Mỗi domain có một parser riêng (Strategy Pattern trong .NET).

```csharp
public interface IContentParser {
    ParsedData Parse(string rawContent, string sourceType);
}

public class GenshinEventParser : IContentParser { ... }
public class FootballResultParser : IContentParser { ... }
public class AnimeScheduleParser : IContentParser { ... }
```

Parser trả về structured `ParsedData` lưu vào PostgreSQL dưới dạng `JSONB`.

### 2.8 Message Queue — BullMQ

Tách biệt hoàn toàn crawler layer và storage layer. Crawler chỉ push message, không cần biết downstream làm gì.

Các queue chính:
- `queue:parsed-data` — Data đã parse, chờ lưu vào DB
- `queue:notifications` — Events trigger alert
- `queue:new-urls` — URL mới tìm thấy, đưa vào Frontier

### 2.9 .NET API Backend

ASP.NET Core Web API đóng vai trò trung tâm cho dashboard và notification.

Các endpoint chính:
- `GET /api/entries?category=game&source=genshin` — Query data
- `GET /api/sources` — Danh sách sources
- `POST /api/sources` — Thêm nguồn mới
- `GET /api/jobs` — Trạng thái crawl jobs
- `POST /api/jobs/{id}/retry` — Retry failed job
- `Hub /hubs/dashboard` — SignalR real-time push

### 2.10 Notification Service

Chạy như một background service trong .NET (IHostedService). Lắng nghe queue `notifications`, gửi message qua Telegram Bot API hoặc Discord Webhook.

```csharp
public class NotificationWorker : BackgroundService {
    protected override async Task ExecuteAsync(CancellationToken ct) {
        while (!ct.IsCancellationRequested) {
            var job = await queue.DequeueAsync();
            await telegramBot.SendMessageAsync(job.ChatId, job.Message);
        }
    }
}
```

---

## 3. Data Flow

### Flow crawl thông thường

```
1. Scheduler trigger job theo interval
2. URL Frontier chọn URL có priority cao nhất
3. Politeness check: domain có đang bị cooldown không?
4. DNS resolve (cache hit hoặc fresh lookup)
5. robots.txt check: URL có được phép crawl không?
6. Crawl Worker fetch content (Cheerio hoặc Playwright)
7. Content hash → so sánh với lần trước
8. Nếu thay đổi: Content Parser extract structured data
9. URL Dedup: extract links mới, filter qua Bloom Filter
10. Push parsed data vào message queue
11. Consumer lưu vào PostgreSQL
12. Diff engine so sánh với data cũ → trigger notification nếu cần
```

### Flow notification

```
1. Consumer nhận parsed data từ queue
2. Load alert rules cho source này
3. Evaluate conditions (banner mới, chapter mới, kết quả trận...)
4. Nếu match → push vào notification queue
5. Notification worker gửi Telegram / Discord message
6. SignalR push real-time lên dashboard
```

---

## 4. Technology Decisions

| Quyết định | Lý do chọn | Thay thế đã cân nhắc |
|---|---|---|
| BullMQ thay vì Hangfire | Node.js native, Redis-backed, distributed-safe | Hangfire (.NET only, khó scale worker) |
| Bloom Filter cho URL dedup | O(1) lookup, memory thấp (100k URL ~ 200KB) | Redis Set (đơn giản hơn nhưng tốn RAM hơn) |
| JSONB cho parsed data | Flexible schema per domain, có thể query | Separate table per domain (quá rigid) |
| Playwright chỉ khi cần | Playwright nặng (Chrome process), dùng Cheerio khi đủ | Puppeteer (tương đương) |
| SignalR cho real-time | Native trong .NET, WebSocket abstraction tốt | Polling (kém hiệu quả) |
