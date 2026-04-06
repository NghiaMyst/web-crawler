# Roadmap

Lộ trình từ MVP local đến hệ thống có thể scale, thiết kế để vừa hoàn thành tính năng vừa học được kiến thức system design thực tế.

---

## Tổng quan

| Phase | Tên | Thời gian | Mục tiêu chính |
|---|---|---|---|
| 1 | MVP Local | 4–6 tuần | Crawler chạy được end-to-end |
| 2 | Multi-source + Dedup | 4–6 tuần | Scale theo chiều rộng |
| 3 | Parser + Notification | 3–4 tuần | Biến data thành insight |
| 4 | Deploy + Monitoring | 2–3 tuần | Production-like, 24/7 |
| 5 | Scale | Ongoing | Distributed system thực sự |

---

## Phase 1 — MVP Local

**Mục tiêu**: Có một pipeline end-to-end hoạt động được. Crawl 1 nguồn → lưu DB → hiển thị dashboard.

### Deliverables

- [ ] Setup project structure: monorepo với `/crawler` (Node.js) và `/api` (.NET) và `/dashboard` (Next.js)
- [ ] Setup PostgreSQL + Redis local với Docker Compose
- [ ] Crawl worker đầu tiên: 1 nguồn cụ thể (gợi ý: Genshin event hoặc bảng xếp hạng bóng đá)
- [ ] URL Frontier đơn giản với BullMQ (chưa cần priority/politeness phức tạp)
- [ ] Lưu raw HTML + parsed data vào PostgreSQL
- [ ] .NET API: 2 endpoint cơ bản (`GET /entries`, `GET /sources`)
- [ ] Dashboard: 1 trang hiển thị bảng data + 1 chart đơn giản

### Kiến thức đạt được

- HTTP request lifecycle, HTML parsing
- Job queue cơ bản với BullMQ
- ETL pipeline (Extract → Transform → Load)
- Kết nối .NET API với Next.js frontend

### Nguồn crawl gợi ý để bắt đầu

Chọn **một** trong các nguồn dưới đây (theo mức độ dễ crawl):

1. **Dễ nhất**: Football-data.org API (có free API key, JSON sẵn, không cần parse HTML)
2. **Trung bình**: Genshin Impact wiki — trang static, Cheerio đủ dùng
3. **Khó hơn**: Sofascore — cần inspect network tab để tìm API endpoint ẩn

---

## Phase 2 — Multi-source + Dedup

**Mục tiêu**: Mở rộng sang 3–4 nguồn, áp dụng các cơ chế deduplication và politeness đúng chuẩn.

### Deliverables

- [ ] Bloom Filter cho URL deduplication (`bloom-filters` npm package)
- [ ] Content hashing (MD5) để tránh lưu data không đổi
- [ ] robots.txt parser + cache
- [ ] Politeness queue: rate limit per domain với BullMQ limiter
- [ ] Priority scoring cho URL Frontier
- [ ] DNS cache layer
- [ ] Thêm 3 nguồn mới (1 game, 1 anime/manga, 1 bóng đá)
- [ ] Dashboard: filter theo category, date range

### Kiến thức đạt được

- Bloom Filter — probabilistic data structure, trade-off memory vs accuracy
- Consistent hashing cơ bản (nền tảng cho Phase 5)
- Rate limiting patterns
- Distributed-safe deduplication

### Chi tiết Bloom Filter

```
Tham số gợi ý:
- n = 100,000 URL dự kiến
- p = 0.01 (1% false positive rate)
- Kết quả: ~959,000 bits (~120KB) — rất nhỏ so với Redis Set
```

---

## Phase 3 — Parser + Notification

**Mục tiêu**: Biến raw data thành actionable insight. Diff engine + alert system.

### Deliverables

- [ ] Strategy Pattern cho Content Parser trong .NET (mỗi domain 1 class)
- [ ] Diff engine: so sánh data mới với snapshot cũ, phát hiện thay đổi
- [ ] Alert rule engine: config-driven conditions (field changed, value threshold, new item)
- [ ] Telegram Bot integration (gửi notification khi có sự kiện)
- [ ] Discord Webhook integration
- [ ] SignalR: real-time push khi có data mới lên dashboard
- [ ] Dashboard: notification history, alert rule CRUD UI

### Kiến thức đạt được

- Strategy Pattern trong thực tế
- Event-driven architecture
- WebSocket vs polling
- Diff algorithms (JSON diff)

### Ví dụ alert rules

```json
[
  {
    "source": "genshin-events",
    "condition": { "type": "new_item", "field": "event_name" },
    "message": "🎮 Genshin event mới: {event_name}",
    "channel": "telegram"
  },
  {
    "source": "lol-patch",
    "condition": { "type": "changed", "field": "patch_version" },
    "message": "⚔️ LoL patch mới: {patch_version}",
    "channel": "discord"
  },
  {
    "source": "football-epl",
    "condition": { "type": "match_finished", "team": "Arsenal" },
    "message": "⚽ Kết quả: {home} {score} {away}",
    "channel": "telegram"
  }
]
```

---

## Phase 4 — Deploy + Monitoring

**Mục tiêu**: Chạy 24/7 trên cloud miễn phí, có observability cơ bản.

### Deliverables

- [ ] Dockerize toàn bộ stack (Dockerfile cho crawler, api, dashboard)
- [ ] `docker-compose.yml` cho local dev
- [ ] `docker-compose.prod.yml` cho Oracle Cloud
- [ ] Setup Oracle Cloud Always Free instance (ARM, 4 CPU, 24GB RAM)
- [ ] Nginx/Caddy reverse proxy + HTTPS (Let's Encrypt)
- [ ] Structured logging với Serilog (.NET) và winston (Node.js)
- [ ] Health check endpoints: `GET /health`
- [ ] Retry + dead-letter queue cho failed jobs
- [ ] Basic alerting: notification khi crawler bị lỗi liên tiếp

### Kiến thức đạt được

- Docker & docker-compose
- Reverse proxy, HTTPS/TLS
- Structured logging và observability
- Graceful shutdown, health checks

### Oracle Cloud Free Tier

```
Always Free resources:
- 4x Ampere A1 CPU (ARM)
- 24 GB RAM
- 200 GB block storage
- Đủ để chạy: PostgreSQL + Redis + .NET API + Node.js crawler
- Dashboard deploy riêng trên Vercel (free)
```

---

## Phase 5 — Scale

**Mục tiêu**: Áp dụng distributed system patterns. Học qua thực hành, không chỉ lý thuyết.

### Deliverables

- [ ] Horizontal scale crawl workers (nhiều Node.js process song song)
- [ ] Distributed URL Frontier với Redis Cluster / Redis Sorted Set
- [ ] Consistent hashing để phân phối URLs đều giữa các workers
- [ ] Object storage cho raw HTML (Cloudflare R2 — free 10GB)
- [ ] Full-text search với Meilisearch hoặc Typesense
- [ ] Metrics dashboard (Grafana + Prometheus, hoặc đơn giản hơn: Plausible)
- [ ] Database read replica (nếu query dashboard nặng)

### Kiến thức đạt được

- Horizontal scaling vs vertical scaling
- Consistent hashing — tại sao cần khi thêm/xóa worker
- Object storage vs block storage
- Search engine inverted index
- Database replication

### Mô hình scale workers

```
Redis Sorted Set (URL Frontier)
         │
    ┌────┴────┐
    ▼         ▼
Worker 1   Worker 2   ... Worker N
(domains A-F) (domains G-M)  (domains N-Z)

Phân phối theo consistent hashing trên domain name
→ cùng domain luôn đến cùng worker → politeness đảm bảo
```

---

## Ghi chú về học tập

Mỗi phase có 2 mục tiêu song song:

1. **Làm**: Tính năng chạy được, data crawl được, dashboard hiển thị được.
2. **Hiểu**: Tại sao thiết kế như vậy? Trade-off là gì? Thay thế là gì?

Gợi ý: Sau mỗi phase, viết một note ngắn về những gì đã học và những quyết định thiết kế đã đưa ra. Đây là cách tốt nhất để consolidate kiến thức.
