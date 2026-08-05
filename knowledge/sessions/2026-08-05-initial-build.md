# Session 2026-08-05 — phiên xây dựng đầu tiên (seed mẫu)

> Đây là session note mẫu — chính lịch sử ra đời của bộ công cụ, để bạn thấy một ghi chú phiên trông thế nào.

## Đã làm
- Xây skill compose 3 lớp + template slot-based, case thật: poster iPhone 16 dark premium 9:16 từ ảnh tách nền có sẵn.
- Xây review editor (layers, multi-select, snap, undo, comment) + review server (Lưu/Xuất PNG 0 token).

## Feedback người thật → thay đổi
1. "Bóng chưa bằng kích thước ảnh gốc" → phát hiện slot phản chiếu thấp hơn slot máy làm `object-fit: contain` co nhỏ bóng → pattern `floor-reflection`.
2. "Bóng phải sát vật thể" → phát hiện padding trong suốt 66px trong PNG gốc → quy tắc trim-alpha bắt buộc.
3. "Idea: gen background bằng prompt" → nền AI studio; phải scale 122% để chân trời ảnh trùng chân máy → pattern `bg-horizon-alignment`.

## Bug đáng nhớ
- Export trắng: lệnh purge `[class*="rvw-"]` xóa nhầm cả `<body>` (body mang class overlay). Thứ tự dọn dẹp: gỡ class body TRƯỚC, purge node overlay SAU.
- `mask-image` áp trước `transform` → bị `scaleY(-1)` lật theo — gradient phải viết ngược hướng.

## Bài học thăng cấp vào SKILL.md
- Trim alpha là quy tắc chuẩn cho mọi asset trong suốt.
- Phản chiếu: slot cùng kích thước slot gốc.
- Không giao PNG trong vòng lặp — browser là render sống, chỉ xuất khi chốt.
