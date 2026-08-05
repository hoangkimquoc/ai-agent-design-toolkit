# Prompt notes — Codex image_gen

Kinh nghiệm khởi điểm(kiểm chứng với Codex image_gen, 2026-08-05):

- **Negative bắt buộc cho nền/element**: `NO text, NO letters, NO numbers, NO watermark, NO logos` — thiếu là AI chèn chữ rác.
- **Element để tách nền**: nền PHẲNG tông ngược chủ thể — chủ thể sáng → `solid neutral gray (#C0C0C0)`, chủ thể tối → `solid light gray (#EDEDED)`; CẤM cùng tông chủ thể, CẤM chroma green/magenta (gen model bleed màu vào mép lông/tóc). Kèm `soft contact shadow only`. rmbg là segmentation ngữ nghĩa, không phải chroma-key — backend thường KHÔNG xuất alpha thật, tách sau bằng rmbg.
- **Bộ nhiều ảnh đồng bộ chất liệu**: prepend cùng một khối ART-STYLE (palette + lighting + rendering) vào mọi prompt của bộ.
- **Nền có compose chữ sau**: mô tả rõ vùng trống (`upper 40% smooth dark gradient reserved for large title text overlay`).
