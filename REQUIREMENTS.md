# Requirements

## 1. Functional Requirements

### 1.1 Crawling
- Hệ thống thu thập dữ liệu định kỳ từ các nguồn được cấu hình sẵn.
- Hỗ trợ crawl trang HTML tĩnh và trang render bằng JavaScript (SPA).
- Tự động đọc và tuân thủ file `robots.txt` của từng domain.
- Không crawl trùng lặp URL đã xử lý (URL deduplication).
- Không lưu trùng lặp nội dung không thay đổi (content deduplication).
- Hỗ trợ cấu hình tần suất crawl per source (ví dụ: mỗi 30 phút, mỗi 6 giờ).

### 1.2 Nguồn dữ liệu theo domain

**Bóng đá**
- Kết quả & lịch thi đấu (Premier League, Champions League)
- Bảng xếp hạng theo mùa giải
- Tin chuyển nhượng

**Games (LoL, Genshin Impact, Wuthering Waves, Pricon)**
- Meta & tier list theo patch (LoL)
- Sự kiện, banner gacha đang active
- Gift code / promo code mới
- Lịch update và patch notes

**Anime / Manga**
- Lịch phát sóng anime theo mùa
- Chapter mới của manga đang theo dõi
- Rating & ranking từ MAL / AniList

**Âm nhạc**
- Bảng xếp hạng nhạc (Spotify Charts, ZingMP3)
- Album / single mới của artist đang follow

### 1.3 Lưu trữ & Phân tích
- Lưu raw data và parsed data riêng biệt.
- Hỗ trợ query lịch sử dữ liệu theo thời gian (trending, so sánh).
- Dashboard hiển thị charts, bảng, filter theo category và source.

### 1.4 Notification
- Gửi cảnh báo khi phát hiện thay đổi quan trọng (banner mới, chapter mới, kết quả trận, code quà tặng).
- Hỗ trợ kênh: Telegram Bot, Discord Webhook.
- Cho phép cấu hình rule alert per source (điều kiện trigger, kênh nhận).

### 1.5 Quản lý
- CRUD nguồn crawl (thêm, sửa, xóa, bật/tắt).
- Xem trạng thái job (pending, running, done, failed).
- Xem log crawl và re-trigger job thất bại.

---

## 2. Non-Functional Requirements

### 2.1 Performance

| Chỉ số | Phase 1 (Local) | Phase 4 (Deployed) | Phase 5 (Scale) |
|---|---|---|---|
| URL crawl / ngày | ~500 | ~5,000 | ~50,000 |
| Độ trễ notification | < 30 phút | < 10 phút | < 5 phút |
| API response time | < 500ms | < 300ms | < 200ms |
| Dashboard load | < 2s | < 1.5s | < 1s |

### 2.2 Reliability
- Retry tự động khi crawl job thất bại (tối đa 3 lần, exponential backoff).
- Dead-letter queue cho job thất bại sau khi hết retry.
- Hệ thống không bị crash khi một nguồn dữ liệu không available.

### 2.3 Politeness (quan trọng về đạo đức crawling)
- Tối thiểu 2 giây giữa 2 request tới cùng một domain.
- Đọc và tuân thủ `robots.txt` — không crawl các path bị disallow.
- Đặt `User-Agent` rõ ràng, định danh là bot cá nhân.
- Không crawl ở tần suất cao tới các site nhỏ.

### 2.4 Scalability
- Crawler workers có thể scale horizontal (thêm worker mà không cần đổi logic).
- Queue-based architecture cho phép tách crawl layer và storage layer.
- Schema database dùng JSONB (PostgreSQL) để linh hoạt với các domain khác nhau.

### 2.5 Maintainability
- Mỗi domain có parser riêng biệt (Strategy Pattern), dễ thêm mới.
- Config-driven: nguồn crawl được quản lý qua database, không hardcode.
- Log đầy đủ với structured logging (Serilog trên .NET).

### 2.6 Cost (Free tier constraints)
- Target: $0/tháng khi đã ổn định.
- Database: PostgreSQL trên Oracle Cloud Free Tier hoặc Railway free.
- Cache/Queue: Redis trên cùng VPS.
- Dashboard: Vercel free tier.
- VPS: Oracle Cloud Always Free (4 CPU ARM, 24GB RAM).

---

## 3. Constraints & Assumptions

- Đây là side project cá nhân, không phục vụ thương mại.
- Chỉ crawl các trang public, không bypass authentication.
- Không lưu trữ nội dung có bản quyền (lyrics, manga images, v.v.) — chỉ lưu metadata và structured data.
- Ưu tiên học được kiến thức system design, không chỉ đơn thuần hoàn thành tính năng.
