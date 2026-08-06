---
description: Orchestrator thiết kế ảnh truyền thông 3 lớp — route theo user story, gọi design--cover-image (gen AI) + auto--media (tách nền) + design--compose (ghép HTML, xuất PNG)
---

# Design Social / Web — Orchestrator

Quy trình designer phân lớp: **Nền (AI gen) → Đồ họa/Element (AI gen + tách nền) → Chữ & CTA (HTML)** → mở live editor cho user chỉnh trực tiếp → user tự Lưu/Xuất PNG khi chốt. Workflow này KHÔNG chứa logic kỹ thuật — chỉ thu thập thông tin, chọn backend gen ảnh phù hợp với agent hiện tại, route đúng điểm vào, và gọi skill.

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

### Backend gen ảnh — chọn theo môi trường

| Môi trường agent | Backend ưu tiên |
|---|---|
| Codex app/chat có tool `image_gen` | Gọi `image_gen` trực tiếp trong phiên hiện tại. Không gọi `codex exec` vòng ngoài. |
| Claude Code/Qwen/agent khác, máy có Codex CLI | Gọi `codex exec ...` để mượn Codex CLI + image backend. |
| Không có backend gen ảnh | Dùng asset sẵn có hoặc gradient fallback; vẫn chạy C → D được. |

Mọi prompt gen ảnh vẫn ghi ra file trong `prompts/` trước khi gen để tái lập và đổi backend khi cần.

### A — Gen nền (skill `design--cover-image`)
- Bắt buộc `--text none` (ảnh không chứa chữ AI), `--aspect` khớp tỉ lệ đã chốt.
- Chèn **art_direction block** của style đã chọn (từ `style-registry.json`) vào prompt để nền và element đồng bộ chất liệu.
- Nếu đang ở Codex app/chat: dùng trực tiếp tool `image_gen` để tạo PNG. Nếu đang ở Claude/Qwen: có thể gọi Codex CLI hoặc backend khác. Lưu kết quả: `<output-dir>/assets/bg-{slug}.png`.

### B — Gen element + tách nền (skill `design--cover-image` + `auto--media`)
- Chỉ chạy khi thiết kế cần element rời (linh vật, sản phẩm, icon). Prompt: chủ thể đơn lẻ, "isolated on solid plain background", cùng art_direction block.
- Nếu đang ở Codex app/chat: dùng trực tiếp tool `image_gen` để tạo element. Nếu không có native image tool thì dùng Codex CLI/generator khác.
- Tách nền bằng RMBG (`auto--media`) → PNG trong suốt `assets/element-{slug}.png`.
- Cạnh mềm (tóc/khói/glow) tách xấu → gen lại với nền phẳng hơn, tối đa 2 vòng rồi hỏi user.

### C — Ghép lớp (skill `design--compose`)
- Copy template → `design-{slug}.html`, set aspect + style, chèn 3 lớp, bật scrim nếu nền nhiễu. HTML mở thường là **offline view sạch**; giữ `review-overlay.js` để có nút **Edit live** ngoài artboard. Nút này tìm review-server đang chạy hoặc hiện command `open-review.py` để bật backend local. Theo đúng 3 nguyên tắc cứng trong SKILL.md của `design--compose`.

### D — Review & chốt
- Khởi động review-server + mở overlay cho user bằng `open-review.py` (SKILL.md `design--compose` Bước 3.5) — **KHÔNG giao PNG mỗi vòng**, browser là render sống. Không chỉ gửi đường dẫn HTML rồi để user tự mò.
- Claude tự nghiệm thu bằng vision (chụp bản tạm nội bộ): dấu tiếng Việt, tương phản, element không đè chữ, grid thẳng.
- Vòng lặp: user chỉnh trực tiếp trên overlay → **Lưu / Xuất PNG tại chỗ (0 token)**; chỉ gửi feedback JSON khi cần Claude thiết kế tiếp (bố cục lớn, gen asset mới, xử lý comment).
- Chốt: user bấm Xuất PNG → `<design>-final.png` + source HTML tự đồng bộ.

## Quy tắc chung

- Không dùng HTML/SVG vẽ thay ảnh AI ở lớp nền-nghệ-thuật, và ngược lại không để AI vẽ chữ — chữ luôn ở lớp HTML.
- Không mặc định bắt buộc Codex CLI: nếu agent hiện tại có native image tool thì dùng native tool trước. Codex CLI chỉ là fallback cho agent không có image tool.
- Mọi prompt gen ảnh ghi ra file trong `prompts/` trước khi gen (tái lập được, đổi backend không mất công).
