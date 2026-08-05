---
description: Orchestrator thiết kế ảnh truyền thông 3 lớp — route theo user story, gọi design--cover-image (gen AI) + auto--media (tách nền) + design--compose (ghép HTML, xuất PNG)
---

# Design Social / Web — Orchestrator

Quy trình designer phân lớp: **Nền (AI gen) → Đồ họa/Element (AI gen + tách nền) → Chữ & CTA (HTML)** → chụp Chrome headless ra PNG đúng pixel. Workflow này KHÔNG chứa logic kỹ thuật — chỉ thu thập thông tin, route đúng điểm vào, và gọi skill.

## Kích hoạt

User yêu cầu: "tạo ảnh đăng FB/Instagram/LinkedIn", "thiết kế banner web/hero", "YouTube thumbnail", "ảnh story/reels", "ảnh sự kiện", "làm bộ ảnh đa kênh", "đổi text trên thiết kế cũ".

## Bước 0 — Thu thập & xác nhận ⛔ BLOCKING

Đối chiếu yêu cầu với checklist; **thiếu mục nào thì hỏi user 1 lần duy nhất bằng AskUserQuestion (gom tối đa 4 câu)**, option đề xuất + lý do đặt đầu:

1. **Nội dung chữ** — title, subtitle, CTA, badge (tiếng Việt đủ dấu).
2. **Kênh & tỉ lệ** — FB/IG post `1:1` · Web hero/Thumbnail `16:9` · Story/Reels `9:16` · FB mobile `4:5` · OG/Share `1.91:1` · Cinematic `2.35:1`. Nhiều kênh → liệt kê đủ.
3. **Style** — `glassmorphism` (tech, hiện đại) / `minimal-swiss` (tối giản, corporate) / `dark-premium` (sang, sự kiện) / `neo-brutalist` (trẻ, gắt). Mô tả + art-direction: `design--compose/config/style-registry.json`.
4. **Asset hiện có** — nền? element/linh vật? logo? → quyết định route bên dưới.

Chỉ skip hỏi khi user đã cung cấp đủ hoặc bảo "tự quyết/làm luôn" — khi đó nêu giả định trước khi chạy.

## Routing theo user story

| User story | Điểm vào pipeline |
|------------|-------------------|
| Brief từ đầu, chưa có gì | A → B → C → D (full) |
| Đã có ảnh nền, cần lên chữ | C → D |
| Đã có đủ asset (nền + element + logo) | C → D |
| Chỉ đổi text/CTA trên thiết kế đã làm | Mở lại `design-{slug}.html` cũ → sửa lớp 3 → D (không tốn lượt gen AI) |
| Bộ đa kênh cùng nội dung | A → B → C một lần, D lặp theo từng aspect |
| Chỉ cần ảnh minh họa nghệ thuật nguyên khối, không chữ HTML | Chỉ A (`design--cover-image` thuần, dừng ở đó) |

## Các bước pipeline

### A — Gen nền (skill `design--cover-image`)
- Bắt buộc `--text none` (ảnh không chứa chữ AI), `--aspect` khớp tỉ lệ đã chốt.
- Chèn **art_direction block** của style đã chọn (từ `style-registry.json`) vào prompt để nền và element đồng bộ chất liệu.
- Lưu: `<output-dir>/assets/bg-{slug}.png`.

### B — Gen element + tách nền (skill `design--cover-image` + `auto--media`)
- Chỉ chạy khi thiết kế cần element rời (linh vật, sản phẩm, icon). Prompt: chủ thể đơn lẻ, "isolated on solid plain background", cùng art_direction block.
- Tách nền bằng RMBG (`auto--media`) → PNG trong suốt `assets/element-{slug}.png`.
- Cạnh mềm (tóc/khói/glow) tách xấu → gen lại với nền phẳng hơn, tối đa 2 vòng rồi hỏi user.

### C — Ghép lớp (skill `design--compose`)
- Copy template → `design-{slug}.html`, set aspect + style, chèn 3 lớp, bật scrim nếu nền nhiễu. Theo đúng 3 nguyên tắc cứng trong SKILL.md của `design--compose`.

### D — Review & chốt
- Khởi động review-server + mở overlay cho user (SKILL.md `design--compose` Bước 3.5) — **KHÔNG giao PNG mỗi vòng**, browser là render sống.
- Claude tự nghiệm thu bằng vision (chụp bản tạm nội bộ): dấu tiếng Việt, tương phản, element không đè chữ, grid thẳng.
- Vòng lặp: user chỉnh trực tiếp trên overlay → **Lưu / Xuất PNG tại chỗ (0 token)**; chỉ gửi feedback JSON khi cần Claude thiết kế tiếp (bố cục lớn, gen asset mới, xử lý comment).
- Chốt: user bấm Xuất PNG → `<design>-final.png` + source HTML tự đồng bộ.

## Quy tắc chung

- Không dùng HTML/SVG vẽ thay ảnh AI ở lớp nền-nghệ-thuật, và ngược lại không để AI vẽ chữ — chữ luôn ở lớp HTML.
- Backend gen ảnh cần Codex CLI đã login; không có → báo user, các bước C–D vẫn chạy được với asset sẵn có hoặc gradient fallback.
- Mọi prompt gen ảnh ghi ra file trong `prompts/` trước khi gen (tái lập được, đổi backend không mất công).
