# Horae v1.11.13 - Memory Engine for SillyTavern

**Tiếng Việt** | [English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

![Image](https://github.com/SenriYuki/SillyTavern-Horae/blob/main/HoraeLogo.jpg)

> *Horae — Các nữ thần Hy Lạp quản lý sự tiến triển có trật tự của thời gian*

Những người chơi Roleplay (RP) dạng dài đều hiểu nỗi đau này: Trí nhớ của AI giống như một con cá vàng. Các sự kiện hôm qua biến thành "sáng nay", trang phục thay đổi giữa các đoạn văn, mối quan hệ của NPC bị đảo lộn, đồ vật được tặng biến mất, và những đồ đã vứt đi lại xuất hiện.

**Horae cung cấp cho AI của bạn một sổ cái trí nhớ đáng tin cậy sử dụng các mỏ neo thời gian có cấu trúc.**

---

## Tính năng

### Hệ thống Trí nhớ Cốt lõi
- **Theo dõi Dòng thời gian (Timeline)** — Các sự kiện được gán mốc thời gian với các tính toán thời gian tương đối ("hôm qua", "thứ Tư tuần trước", "2 tháng trước"). Cuối cùng thì AI cũng hiểu được sự khác biệt.
- **Khóa Trang phục** — Trang phục hiện tại của mỗi nhân vật được ghi lại và chỉ được gửi (prompt) đối với các nhân vật đang có mặt. Không còn những lần thay đổi trang phục ảo ma nữa.
- **Theo dõi NPC** — Theo dõi ngoại hình, tính cách và các mối quan hệ. Độ tuổi tăng theo thời gian của cốt truyện. Các prompt về mối quan hệ được kiểm soát một cách nghiêm ngặt.
- **Túi đồ (Item Inventory)** — Hệ thống ID độc nhất với các cấp bậc Bình thường (Normal) / Quan trọng (Important) / Thiết yếu (Critical). Phân tích số lượng thông minh, tự động phát hiện các vật phẩm đã sử dụng.
- **Sổ tay (Agenda)** — AI tự động ghi chép những lời hứa trong cốt truyện và thời hạn (deadline). Các hạng mục đã hoàn thành sẽ tự động được xóa đi.
- **Tâm trạng & Mối quan hệ** — Tính năng theo dõi cảm xúc giúp các nhân vật nhất quán. Mạng lưới quan hệ ghi lại sự gắn kết giữa các nhân vật. Cả hai tính năng đều chỉ hoạt động khi có sự thay đổi: không tốn token nếu không có gì thay đổi.
- **Trí nhớ Cảnh (Scene Memory)** — Ghi lại những đặc điểm vật lý cố định của các địa điểm để có sự mô tả thống nhất qua các lần viếng thăm.

### Hệ thống RPG (Đa mô-đun)
- **Thanh trạng thái** — HP/MP/SP với tên và màu sắc tùy chỉnh. Hàng chục biểu tượng hiệu ứng trạng thái.
- **Bảng Thuộc tính** — Thông số đa chiều (STR/DEX/CON/INT/WIS/CHA) với biểu đồ radar.
- **Kỹ năng** — Theo dõi việc sở hữu kỹ năng, cấp độ và mô tả kỹ năng.
- **Trang bị** — Cấu hình slot cho từng nhân vật với 6 mẫu chủng tộc (Human, Orc, Centaur, Lamia, Winged, Demon). Hỗ trợ các mẫu tùy chỉnh.
- **Danh tiếng** — Các hạng mục phe phái tùy chỉnh với các chỉ số phụ.
- **Cấp độ / XP** — Công thức kinh nghiệm đi kèm thanh tiến trình trực quan.
- **Tiền tệ** — Mệnh giá tùy chỉnh với biểu tượng emoji và tỷ giá quy đổi.
- **Căn cứ (Strongholds)** — Quản lý căn cứ/lãnh thổ theo cấu trúc dạng cây.
- Tất cả các mô-đun đều có thể **bật/tắt độc lập**. Tắt = không tốn token nào.

### Quản lý Token Thông minh
- **Tự động Tóm tắt & Ẩn** — Tự động nén lại các tin nhắn cũ thành các bản tóm tắt do AI tự tạo. Các tin nhắn gốc sẽ bị `/hide` để tiết kiệm token. Bản tóm tắt có thể được chuyển hoàn nguyên lại thành các sự kiện gốc bất cứ lúc nào.
- **Vector Memory (Trí nhớ Vector)** — Công cụ tìm kiếm theo ngữ nghĩa để gợi nhớ các chi tiết bị ẩn khi cuộc trò chuyện đề cập đến các sự kiện diễn ra trong lịch sử. Chạy cục bộ thông qua Web Worker — Không tốn phí API.
- **AI Phân tích Hàng loạt (Batch Scan)** — Quét phân tích hồi tố toàn bộ lịch sử trò chuyện chỉ bằng một cú nhấp chuột.
- **Đầu ra Hướng theo Sự thay đổi (Change-Driven)** — AI chỉ xuất ra những gì có thay đổi trong lượt reply đó. Không lặp lại trạng thái một cách thừa thãi.

### Trải nghiệm Người dùng
- **Bảng tùy chỉnh** — Bảng dạng Excel tự động điền nhờ AI, khóa hàng/cột, hoàn tác/làm lại.
- **Trình thiết kế Theme** — Trình chỉnh sửa chủ đề trực quan với thanh trượt sắc độ/độ bão hòa, hình nền trang trí, chế độ ngày/đêm. Xuất & chia sẻ theme dưới định dạng JSON.
- **Hướng dẫn Tương tác** — Người dùng lần đầu tiên trải nghiệm sẽ được hướng dẫn qua tất cả các tính năng.
- **Prompt Tùy chỉnh (Custom Prompts)** — Kiểm soát toàn diện prompt Hệ thống (System), chức năng quét hàng loạt (Batch scan), tính năng nén (Compression) và prompt của RPG. Có hệ thống lưu/tải preset cài sẵn.
- **Profile Cấu hình** — Xuất tất cả cài đặt ra thành tệp JSON. Những người tạo thẻ nhân vật (Card authors) có thể chia sẻ các cấu hình để thiết lập chỉ với một cú nhấp.

---

## Cài đặt

1. Mở SillyTavern → Bảng Tiện ích mở rộng (biểu tượng mảnh ghép) → **Cài đặt tiện ích mở rộng (Install Extension)**
2. Dán Git URL của kho lưu trữ này và nhấp Install
3. Tải lại trang (F5) — hoàn tất!

> Regex đi kèm được **tự động chèn** trong lần tải đầu tiên. Không cần phải import thủ công.

---

## Khả năng Tương thích

- **SillyTavern**: 1.12.6+ (Tính năng Phân tích của AI yêu cầu bản 1.13.5+)
- **Nền tảng**: Desktop + Điện thoại

---

## Hỗ trợ Ngôn ngữ

| Ngôn ngữ | Trạng thái |
|----------|--------|
| 简体中文 (Tiếng Trung Giản thể) | ✅ Đầy đủ |
| 繁體中文 (Tiếng Trung Phồn thể) | ✅ Đầy đủ |
| English (Tiếng Anh) | ✅ Đầy đủ |
| 한국어 (Tiếng Hàn) | ✅ Đầy đủ |
| 日本語 (Tiếng Nhật) | ✅ Đầy đủ |
| Русский (Tiếng Nga) | ✅ Đầy đủ |
| Tiếng Việt | ✅ Đầy đủ |

**Bạn muốn Horae có ngôn ngữ của mình?** Hãy mở [Issue](https://github.com/SenriYuki/SillyTavern-Horae/issues) hoặc mở một PR (Pull request) kèm tệp dịch thuật của bạn! Hãy tham khảo tệp `locales/en.json` làm bản dịch mẫu.

---

## Có gì Mới trong v1.11.0

### Sự Quốc tế hóa (i18n)
- **Công cụ chọn Ngôn ngữ UI** — Chuyển đổi giữa Tiếng Trung (Giản/Phồn), Tiếng Anh, Tiếng Hàn, Tiếng Nhật và Tiếng Nga. Sẵn sàng cho chế độ tự động nhận diện ngôn ngữ.
- **Ngôn ngữ Phản hồi của AI** — Cài đặt riêng biệt để thay đổi ngôn ngữ phản hồi đối với AI, hoàn toàn độc lập với ngôn ngữ của giao diện.
- **Hơn 900 key được dịch** — Toàn bộ văn bản giao diện (UI), prompt (lời nhắc), công cụ mẹo (tooltip) và các hướng dẫn giới thiệu đều đã được dịch toàn diện.
- **Phân tích cú pháp 2 chiều Tiếng Trung Giản thể/Phồn thể** — Không còn nỗi lo hệ thống bị lỗi phân tích ký tự do các biến thể chữ.

Vui lòng xem [CHANGELOG](CHANGELOG.md) để biết đầy đủ lịch sử của các phiên bản.

---

Gửi báo cáo lỗi (Bug reports) và gợi ý đóng góp luôn hoan nghênh nồng nhiệt!

> ⚠️ Đây là một dự án cá nhân phụ — Việc phản hồi có thể bị chậm trễ. Cảm ơn vì sự kiên nhẫn của bạn.

**Tác giả: SenriYuki**

### Lời cảm ơn Dịch giả (Translation Credits)

- **Russian (Русский)** — [@KiskaSora](https://github.com/KiskaSora)
- **Vietnamese (Tiếng Việt)** — (Đóng góp mã nguồn nội bộ)
