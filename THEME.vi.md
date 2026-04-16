# Hướng dẫn Làm đẹp (Theme) cho Horae

## Bắt đầu Nhanh

Toàn bộ phong cách thiết kế trực quan của Horae được kiểm soát bởi các **biến CSS (CSS variables)**. Bạn chỉ cần ghi đè những biến này là có thể thay đổi toàn bộ giao diện của extension.

### Cách 1: Thay đổi các Biến CSS (Khuyên dùng)

Trong Cài đặt Plugin → Cài đặt Giao diện (Appearance settings) → Custom CSS, hãy đưa mã sau vào:

```css
#horae_drawer,
.horae-message-panel,
.horae-modal,
.horae-context-menu,
.horae-progress-overlay {
    --horae-primary: #ec4899;      /* Đổi màu chính thành màu hồng */
    --horae-primary-light: #f472b6;
    --horae-bg: #1a1020;           /* Đổi hình nền thành màu tím đậm */
    --horae-bg-secondary: #2d1f3c;
}
```

### Cách 2: Nhập (Import) file Theme làm đẹp

1. Nhận file `.json` thiết lập giao diện (theme) mà người khác chia sẻ
2. Đi tới Cài đặt Plugin → Cài đặt giao diện → Nhấn nút biểu tượng tải lên (📥)
3. Tại danh sách thả xuống, chọn chủ đề giao diện vừa nhập

### Cách 3: Xuất (Export) & Chia sẻ

1. Sau khi chỉnh sửa được giao diện theo ý muốn, bấm chọn nút xuất dữ liệu (📤)
2. Hệ thống sẽ tự tải xuống tệp `horae-theme.json`
3. Bạn có thể tự do chia sẻ file theme này với những người dùng khác

---

## Bảng tra cứu các Biến CSS

### Bảng màu

| Tên Biến | Giá trị mặc định (Nền tối) | Mô tả |
|------|---------------|------|
| `--horae-primary` | `#7c3aed` | Màu chính (dùng cho nút bấm, làm nổi bật, dải màu gradient) |
| `--horae-primary-light` | `#a78bfa` | Phiên bản màu nhẹ của màu chính (làm nổi bật dòng chữ) |
| `--horae-primary-dark` | `#5b21b6` | Phiên bản màu đậm của màu chính (điểm bắt đầu dải màu gradient) |
| `--horae-accent` | `#f59e0b` | Màu điểm nhấn (vạch màu vàng, tên NPC) |
| `--horae-success` | `#10b981` | Màu chỉ sự thành công / tích cực (VD: Điểm hảo cảm dương) |
| `--horae-warning` | `#f59e0b` | Màu cảnh báo |
| `--horae-danger` | `#ef4444` | Màu chỉ báo nguy hiểm (xóa bỏ, điểm hảo cảm âm) |
| `--horae-info` | `#3b82f6` | Màu hiển thị thông tin (danh mục tag ngoại hình của NPC) |

### Nền & Viền 

| Tên Biến | Mặc định (Tối) | Mô tả |
|------|---------------|------|
| `--horae-bg` | `#1e1e28` | Background nền chính (danh mục, các thẻ thông tin phụ) |
| `--horae-bg-secondary` | `#2d2d3c` | Background nền phụ (Vùng chứa ngoài, bảng danh sách) |
| `--horae-bg-hover` | `#3c3c50` | Màu nền khi đưa con trỏ chuột vào (Hover)  |
| `--horae-border` | `rgba(255,255,255,0.1)` | Màu Bo Các Viền |

### Chữ viết (Text)

| Tên Biến | Mặc định (Tối) | Mô tả |
|------|---------------|------|
| `--horae-text` | `#e5e5e5` | Text Color - Màu cho chữ viết chính yếu |
| `--horae-text-muted` | `#a0a0a0` | Text color phụ - Dùng cho các thẻ hint nhỏ, thông báo dãn mờ |

### Biểu đồ Radar (Radar chart)

| Tên Biến | Mặc định | Ghi chú |
|------|--------|------|
| `--horae-radar-color` | Tự động ăn theo `--horae-primary` | Vùng hiển thị dữ liệu Radar (độ bóng, nét vẽ, khung) |
| `--horae-radar-label` | Tự động ăn theo `--horae-text` | Font chữ màu sắc hiển thị đầu các cạnh Radar |

### Thuộc Tính Khác

| Tên Biến | Mặc định | Ý Nghĩa |
|------|--------|------|
| `--horae-shadow` | `0 4px 20px rgba(0,0,0,0.3)` | Độ đổ bóng khung (Shadow) |
| `--horae-radius` | `8px` | Khung Bo góc kích thước lớn |
| `--horae-radius-sm` | `4px` | Bo góc kích thước nhỏ gọn |

---

## Thiết Kế Khung Chứa Các Lớp (Container Selector)

Để thiết kế lại cấu trúc khung thẻ, tùy biến CSS thì có thể xài những thẻ định danh sau:

### Giao Diện Cấp Cao Cơ Bản (Top-level container)

| Selector (Định danh) | Chức năng chi tiết |
|--------|------|
| `#horae_drawer` | Ngăn kéo chính thao tác điều chỉnh cài đặt hệ thống Status, Thời Gian Time-lines. |
| `.horae-message-panel` | Khu vực biểu đồ thông số theo dõi dính kèm dòng cuối (Footer Metadata) trong tin nhắn văn bản. |
| `.horae-modal` | Bảng Menu dạng thẻ nổi Modals |
| `.horae-context-menu` | Trình đơn tùy chọn dạng click Menu Context |
| `.horae-progress-overlay` | Box Khung Overlay Báo tín hiệu vệt Thanh chạy tiến trình thao tác. |

*(Để tinh chỉnh chi tiết về CSS, hãy tham khảo bản tiếng Anh/Trung trong file THEME gốc hoặc sử dụng tính năng kiểm tra mã nguồn (Inspect) trong trình duyệt)*

---

## Cấu trúc File JSON của Theme

File `horae-theme.json` thường có cấu trúc cơ bản như sau:

```json
{
    "name": "Chủ Đề Bầu Trời Đêm Của Tôi",
    "author": "Tên Tác Giả Ở Đây",
    "version": "1.0",
    "variables": {
        "--horae-primary": "#ec4899",
        "--horae-primary-light": "#f472b6",
        "--horae-primary-dark": "#be185d",
        "--horae-accent": "#f59e0b",
        "--horae-bg": "#1a1020",
        "--horae-bg-secondary": "#2d1f3c",
        "--horae-bg-hover": "#3c2f50",
        "--horae-border": "rgba(255, 255, 255, 0.08)",
        "--horae-text": "#e5e5e5",
        "--horae-text-muted": "#a0a0a0"
    },
    "css": "/* Đây là mục tùy chọn: Nơi gõ các thiết lập CSS riêng biệt \n */ .horae-timeline-item { border-radius: 12px; }"
}
```

---

## Một số Thông số Mẫu (Gợi ý Theme đẹp)

### Hoa Anh Đào Cánh Hồng (Sakura Pink)

```json
{
    "name": "Sakura Pink",
    "variables": {
        "--horae-primary": "#ec4899",
        "--horae-primary-light": "#f472b6",
        "--horae-primary-dark": "#be185d",
        "--horae-accent": "#fb923c",
        "--horae-bg": "#1f1018",
        "--horae-bg-secondary": "#2d1825",
        "--horae-bg-hover": "#3d2535",
        "--horae-text": "#fce7f3",
        "--horae-text-muted": "#d4a0b9"
    }
}
```

### Rừng Điệp Ngọc Xanh (Forest Green)

```json
{
    "name": "Forest Green",
    "variables": {
        "--horae-primary": "#059669",
        "--horae-primary-light": "#34d399",
        "--horae-primary-dark": "#047857",
        "--horae-accent": "#fbbf24",
        "--horae-bg": "#0f1a14",
        "--horae-bg-secondary": "#1a2e22",
        "--horae-bg-hover": "#2a3e32",
        "--horae-text": "#d1fae5",
        "--horae-text-muted": "#6ee7b7"
    }
}
```

### Đáy Đại Dương (Ocean Blue)

```json
{
    "name": "Ocean Blue",
    "variables": {
        "--horae-primary": "#3b82f6",
        "--horae-primary-light": "#60a5fa",
        "--horae-primary-dark": "#1d4ed8",
        "--horae-accent": "#f59e0b",
        "--horae-bg": "#0c1929",
        "--horae-bg-secondary": "#162a45",
        "--horae-bg-hover": "#1e3a5f",
        "--horae-text": "#dbeafe",
        "--horae-text-muted": "#93c5fd"
    }
}
```

---

## Mẹo & Hỏi Đáp Thường Gặp (FAQ)

### Trình quản lý Data Panel nằm dưới cuôi bị che khuất không bấm được

Silly Tavern đi kèm với nhiều giao diện mặc định có độ Z-index cao hơn Horae. Để bảng Panel quản lí không bị lấp, hãy dán lệnh này vài Tùy chỉnh CSS (Custom CSS):

```css
.horae-message-panel {
    margin-bottom: 10px;
    z-index: 9999;
    position: relative;
}
```

### Thay Đổi Hình Ảnh Icon trên Thanh Công Cụ Trên Cùng

Nếu không thích logo cài đặt của extension là Hoa Cúc mặc định, có thể thay đổi bằng mã nguồn này:

```css
#horae_drawer .drawer-icon::before {
    background-image: url('Địa_Chỉ_Đường_Dẫn_Link_URL_Của_Hình_Ảnh_Vào_Đây_Nhé') !important;
}
```

---

## Vài Ghi Nhớ Quan Trọng

1. **Phạm Vi Ứng Dụng:** Các mã CSS chỉnh hình thức này chỉ chịu trách nhiệm nội trong cấp cao của `#horae_drawer`. Không gộp cài đặt giao diện này vào `body` hay `:root` vì điều đó sẽ không thể tải được giao diện ra hệ thống chung.
2. **Khóa chống đè `!important`:** Vì để chống bị xung đột với các code thiết kế sẵn có của ứng dụng gốc SillyTavern, phần lớn các thành phần khung nền đều có mã khóa `!important` kế thừa. Do đó muốn tùy biến các dòng CSS bắt buộc bạn cũng phải thêm lệnh `!important` ở cuối.
3. **Chế độ Giao diện Tối/Sáng:** Đa phần code Theme (Theme Code File) này đều dùng bảng mã sắc TỐI là gốc, hãy điều chỉnh lại Màu Chữ (`--horae-text`) và một số tính chất khác để tương thích cho Màn Sáng/Light Mode.
4. **Không Tạo Ảnh Hưởng & Phá Vỡ Cấu Hình SillyTavern Gốc:** Tiện ích mở rộng Horae có quy chuẩn mã lệnh riêng cô lập với ứng dụng SillyTavern chính, do đó bạn cứ tùy ý phá vỡ giao diện mà không sợ làm hư tính ổn định của trò chơi gốc.
