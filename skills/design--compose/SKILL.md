---
name: design-compose
category: design
risk: safe
source: internal
version: 1.0.0
description: Ghép các phần tử thiết kế (ảnh nền AI, element PNG trong suốt, logo, chữ tiếng Việt) thành ảnh truyền thông hoàn chỉnh bằng khung HTML 3 lớp, kèm review overlay tương tác kiểu Figma (layers panel, multi-select, snap guides, undo, comment, pan/zoom) và review-server cho user tự Lưu source + Xuất PNG 0 token. Dùng khi user muốn "ghép ảnh thành banner", "compose banner", "làm ảnh post FB/Instagram/story", "review design", "chỉnh thiết kế trực tiếp", "đè chữ lên ảnh", "thay text trên thiết kế", hoặc đã có sẵn asset và cần lên khung. Hỗ trợ 1:1, 16:9, 9:16, 4:5, 1.91:1, 2.35:1 và 4 style preset. Chữ là HTML nên tiếng Việt đúng chính tả 100%.
---

# Design Compose — Ghép lớp thiết kế kiểu Designer

Skill nguyên tử: nhận asset từ **bất kỳ nguồn nào** (AI gen, ảnh chụp, logo có sẵn) và ghép thành ảnh hoàn chỉnh. Không tự gen ảnh AI — dùng backend gen ảnh bất kỳ ở khâu chuẩn bị asset (xem workflow đi kèm). Có thể dùng lẻ hoặc được orchestrate bởi workflow `design-compose-pipeline`.

## Ba nguyên tắc cứng (không thương lượng)

1. **Layering** — không bao giờ trộn Nền, Đồ họa, Chữ vào 1 khối:
   - Lớp 1 `.layer-bg` (z-0): ảnh nền hoặc gradient. Nền AI gen **bắt buộc không chứa chữ**.
   - Lớp 2 `.layer-art` (z-10): element PNG trong suốt (linh vật, sản phẩm, icon).
   - Lớp 3 `.layer-content` (z-20): badge, title, subtitle, CTA, logo — HTML/CSS thuần.
2. **Hierarchy** — mắt đọc theo thứ tự: Title lớn → hình nổi bật → Subtitle → CTA. Title dùng cỡ lớn nhất (`--frame-h * 0.072`), subtitle tối đa 2 dòng, CTA là điểm màu accent duy nhất cạnh tranh với title.
3. **Grid & Contrast** — mọi phần tử bám grid 12 cột của template (căn trái mặc định, `align-center` khi cần); chữ phải đạt tương phản rõ trên nền — nền nhiễu thì **bật scrim** (`.scrim` hoặc `.gradient-bottom`), không giảm cỡ chữ để né.

## Bước 0 — Thu thập thông tin ⛔ BLOCKING

Kiểm tra checklist. Thiếu mục nào → hỏi user bằng **AskUserQuestion, gom tối đa 4 câu trong 1 lần gọi**, đưa option đề xuất kèm lý do lên đầu. **Không tự đoán rồi làm.**

| Thông tin | Bắt buộc | Hỏi khi thiếu |
|-----------|----------|---------------|
| Nội dung chữ: title (subtitle, CTA, badge nếu có) | ✅ | "Title/CTA muốn ghi gì?" |
| Kênh / tỉ lệ (1:1, 16:9, 9:16, 4:5, 1.91:1, 2.35:1) | ✅ | Option theo kênh: FB post 1:1, Story 9:16, Thumbnail 16:9... |
| Style (glassmorphism / minimal-swiss / dark-premium / neo-brutalist) | ✅ | Đề xuất theo tone nội dung, mô tả ngắn từng style |
| Asset có sẵn: nền? element? logo? | ✅ | "Đã có ảnh nền/logo chưa hay cần gen/bỏ qua?" |
| Căn lề (trái / giữa) | ⬜ | Mặc định trái; giữa cho quote/announcement |

Chỉ bỏ qua hỏi khi user đã nói đủ trong yêu cầu, hoặc nói "làm luôn/tự quyết" — khi đó nêu rõ giả định trước khi làm. **Thiếu ảnh nền mà user không muốn gen AI** → dùng gradient fallback có sẵn trong template, báo user.

## Bước 0.5 — Art direction: font có tính cách, màu có ý nghĩa

Trước khi dựng khung, chốt **moodboard tinh thần** của thiết kế (1–2 câu với user hoặc suy ra từ brief): thiết kế này *nói giọng gì*? Font và màu phải mang tính cách đó — không dùng mặc định một cách vô thức.

**Chọn font theo tính cách** (các font dưới đã kiểm hỗ trợ tiếng Việt):

| Tính cách thiết kế | Font gợi ý (Google Fonts, có VN) |
|---|---|
| Tròn trịa, thân thiện, cute (pet, kids, F&B vui) | Baloo 2, Quicksand, Nunito |
| Hiện đại, trung tính, tech/corporate | Be Vietnam Pro, Inter, Montserrat |
| Sang trọng, editorial, cao cấp | Playfair Display, Lora |
| Mạnh mẽ, display, thể thao/sự kiện | Oswald, Anton, Paytone One |
| Viết tay, gần gũi, cá nhân | Itim, Patrick Hand |

**Tải font đã chọn về local** (script tự cảnh báo nếu font thiếu subset Vietnamese):

```bash
python <path-to-skill>/scripts/fetch-fonts.py \
  --family "Baloo 2:700,800" --family "Quicksand:500,700" \
  --out <output-dir>/fonts
# → link <output-dir>/fonts/fonts.css vào design file
```

**Màu theo ý nghĩa**: palette phải trả lời "màu này nói gì?" (tin cậy → xanh dương đậm; tươi non → xanh lá pastel; ấm áp → cam đất...). Tham khảo 4 preset trong [config/style-registry.json](config/style-registry.json) hoặc palette library bạn quen dùng — nhưng chọn có lý do, ghi lý do vào design file (comment đầu file).

## Bước 1 — Chuẩn bị workspace

```
<output-dir>/            # mặc định: cover-image/{slug}/ hoặc theo user chỉ định
├── assets/              # bg-*.png, element-*.png, logo.*
├── design-{slug}.html   # copy từ templates/social-frame.html — file nguồn sửa được
└── {slug}-{aspect}.png  # output
```

1. Copy `templates/social-frame.html` → `design-{slug}.html`.
2. Copy asset user cung cấp vào `assets/` (đường dẫn tương đối từ file HTML).

## Bước 2 — Ghép lớp (sửa trực tiếp file HTML)

**Tư duy design tool (frame-first)**: dựng khung layout TRƯỚC khi có ảnh — mỗi element nằm trong một **slot** (container cố định `left/top/width/height` trên grid), ảnh chỉ là nội dung fill vào slot bằng `object-fit`. Overlay (chữ, QR, badge đè lên element) anchor theo **slot**, không bám theo pixel của ảnh → regen/đổi ảnh bao nhiêu lần layout vẫn đứng yên.

1. Set `--frame-w/--frame-h` theo aspect (bảng trong comment template) và dựng đủ slot rỗng cho các element dự kiến — duyệt layout được ngay cả khi chưa gen ảnh.
2. Đổi class `.frame` sang style đã chốt (`style-glassmorphism`...). Palette/font đồng bộ với [config/style-registry.json](config/style-registry.json).
3. Lớp 1: chèn `<img src="assets/bg-....png">` — nền luôn `object-fit: cover` phủ kín khung; nền nhiễu → bật scrim.
4. Lớp 2: mỗi element một `.slot` (`object-fit: contain`, chỉnh `object-position` để neo đáy/cạnh); element chính chiếm 30–45% khung, không đè vùng title.
5. Lớp 3: điền title (từ khóa nhấn → `<span class="highlight">`), subtitle, CTA, badge, logo. Tiếng Việt đủ dấu — đây là lý do lớp này là HTML.
6. **QUY TẮC CHUẨN — mọi asset có alpha đều trim trước khi vào slot** (dù user đưa sẵn hay rmbg tách ra):
   ```bash
   python <path-to-skill>/scripts/trim-alpha.py <asset>.png   # → <asset>-trim.png, giữ file gốc
   ```
   Lý do: asset tách nền thường có padding trong suốt lớn (case iPhone: vật thể chỉ 312×548 trong khung 680×680) → `object-fit: contain` co nhỏ vật thể và tạo khe hở với bóng/floor dù slot neo đáy.

   **Asset có sẵn (ảnh sản phẩm đã tách nền)** — kiểm tra alpha thật bằng Pillow (4 góc alpha=0) rồi trim + dùng thẳng, bỏ qua rmbg. Hai việc PHẢI tự dựng vì ảnh tách nền không mang theo (kiểm chứng case iPhone 2026-08-05):
   - **Bóng/phản chiếu**: `drop-shadow` theo hướng sáng của nền; nền tối premium → thêm phản chiếu sàn: slot thứ 2 cùng ảnh, **PHẢI cùng kích thước slot gốc** (slot thấp hơn sẽ bị `object-fit: contain` co nhỏ bóng — feedback case iPhone), ảnh `object-position: bottom` + `scaleY(-1)`, cắt phần hiện bằng `mask-image` fade + opacity ~0.16. ⚠️ mask áp TRƯỚC transform nên bị lật theo — muốn fade xuống dưới (visual) thì gradient phải "to top".
   - **Hòa ánh sáng**: ảnh studio thường lệch tông với nền — grade per-slot (`grade-warm/cool`) cho khớp.
7. Element cần tách nền → `rmbg <img> -m briaai -o <out>.png` (cài: `npm i -g rmbg-cli`), rồi hậu xử lý (kiểm chứng 2026-08-05):
   - **Lọc nhiễu alpha (bắt buộc)**: briaai để lại mảng alpha loang lổ khắp ảnh — giữ đúng khối liền mạch lớn nhất (`scipy.ndimage.label` trên alpha > 100, dilate 3px giữ mép mềm), các mảng rời rạc set alpha = 0.
   - **Trim sát vật thể (bắt buộc — quy tắc chuẩn mục 6)**: chạy `trim-alpha.py` sau khi lọc nhiễu; nhờ slot-based nên trim không ảnh hưởng tọa độ overlay, nhưng quyết định vật thể fill khít slot và bóng/floor sát chân.
   - Prompt element ghi rõ "isolated on flat plain solid light gray (#EDEDED) background, soft contact shadow only" — Codex image_gen KHÔNG xuất alpha trực tiếp.

## Bước 2.5 — Adjustment layers (tùy chọn, non-destructive)

CSS filter/blend/overlay = adjustment layer Photoshop — đổi mood, đồng bộ tông, thêm chất liệu **không tốn lượt gen AI**. Template có sẵn utilities, z-index 15 (trên Art, DƯỚI Text — grade ảnh, không bao giờ grade chữ):

| Utility | Kỹ thuật | Dùng khi |
|---|---|---|
| `.adjust.tint` (+ `.multiply`/`.screen`) | wash màu `mix-blend-mode` | Phủ tông brand, unify palette toàn khung |
| `.adjust.vignette` | radial-gradient | Hướng mắt vào chủ thể, thêm chiều sâu |
| `.adjust.grain` | SVG feTurbulence, opacity ~0.05 | Chất liệu film, giấu artifact AI |
| `.grade-warm/cool/mono/pop` trên slot | `filter: hue-rotate/saturate...` | Element gen khác lượt lệch tông với nền |
| `.fade-bottom` trên slot | `mask-image` gradient | Tan mép element vào nền, che mép tách nền xấu |

**Giới hạn**: chỉ chỉnh màu/tông/ánh sáng toàn cục hoặc per-slot. Sửa cấu trúc (đổi pose, thêm bớt vật thể, sửa chi tiết AI vẽ lỗi) vẫn cần regen hoặc inpainting backend.

## Bước 3 — Xuất ảnh (CHỈ khi chốt, không nằm trong vòng lặp)

**Trong vòng lặp thiết kế KHÔNG giao PNG mỗi lần** — bản mở trong browser (review overlay) chính là render sống pixel thật, user xem/chỉnh trực tiếp trên đó. PNG chính thức:
- User tự bấm **Xuất PNG** trên overlay (lưu source + chụp, 0 token) — đường chính, hoặc
- User yêu cầu Claude chụp trực tiếp.

(Claude vẫn được chụp bản tạm để tự nghiệm thu bằng vision — đó là việc nội bộ, không phải deliverable.)

```bash
python <path-to-skill>/scripts/compose-screenshot.py \
  --html <output-dir>/design-{slug}.html --aspect 1:1 \
  --output <output-dir>/{slug}-1x1.png
```

- Bộ đa kênh: chỉnh `--frame-w/--frame-h` + layout cho từng aspect rồi chụp từng khung (mỗi aspect nên có bản HTML riêng nếu layout khác nhau đáng kể).
- `--size WxH` cho kích thước tùy biến; `--wait` tăng lên nếu font/ảnh chưa kịp load.

## Bước 3.5 — Review tương tác (feedback loop với user)

Output không phải ảnh chết — design file là bề mặt làm việc. Khi giao cho user review, **khởi động review-server (nền) rồi mở Chrome qua HTTP** — server cho phép nút "Xuất PNG" hoạt động 0 token:

```bash
python <path-to-skill>/scripts/review-server.py --dir <output-dir> --port 7799 &
"C:/Program Files/Google/Chrome/Application/chrome.exe" "http://127.0.0.1:7799/design-{slug}.html#review"
```

(Fallback không server: mở `file:///<đường-dẫn>/design-{slug}.html#review` — nút Xuất PNG tự ẩn, còn lại hoạt động đủ. Đừng đưa link dạng text — IDE/chat encode `?`/`#` gây ERR_FILE_NOT_FOUND, luôn mở bằng lệnh.)

Overlay ([scripts/review-overlay.js](scripts/review-overlay.js), template đã nhúng sẵn, chỉ kích hoạt khi có `#review`/`?review`) là editor chrome kiểu Figma — dark canvas, icon SVG, không emoji:
- **Layers panel (trái)**: cây phân lớp Nền → Art → Adjustment → Nội dung, expand/collapse group, click chọn đúng element trong nhóm chồng nhau, toggle ẩn/hiện từng lớp để soi; sync 2 chiều với selection trên canvas
- **Chọn (V)** — select model Figma: click = group ngoài cùng · double-click = drill sâu 1 cấp · Ctrl+click = element sâu nhất · double-click text đã chọn = sửa chữ inline · **Shift+click = thêm/bớt vào nhóm · quét marquee vùng trống = chọn nhiều · kéo/nudge/Delete áp cả nhóm** (tự loại cặp cha–con lồng nhau). Đã chọn gì thì kéo cái đó (px theo hệ tọa độ của chính element, element static tự chuyển relative); mũi tên nudge 2px, Shift = 10px; **xoay** bằng handle tròn trên selection box (Shift = bước 15°); **Delete** = ẩn element + ghi yêu cầu xóa vào feedback. Panel Thuộc tính: X/Y/W/H, Xoay (°), Mờ (%), Lật ngang/dọc, Lên trước/Ra sau (z-order), cỡ chữ, nội dung — sửa là áp ngay
- **Comment (C)**: click đặt pin điểm, **kéo để khoanh vùng** (region đánh số kiểu Figma) + ghi chú qua popup
- **Snap & alignment guides**: khi kéo, element tự hít vào mép/tâm frame và mép/tâm các element khác (ngưỡng 6px), guide line đỏ hiện chỗ khớp; toggle nút Snap trên topbar, giữ Alt để tạm tắt khi kéo
- **Canvas navigation**: Space+kéo hoặc chuột giữa = pan (hand tool) · Ctrl+lăn = zoom neo tại con trỏ · lăn = pan dọc, Shift+lăn = pan ngang · −/+/Fit trên topbar (Fit reset cả pan), tự fit khi mở
- **Undo (Ctrl+Z / nút topbar)**: hoàn tác mọi mutation (move, resize, rotate, flip, opacity, z-order, sửa chữ, delete, đặt pin/region) — snapshot-based, max bước theo RAM máy (`navigator.deviceMemory` × 64, kẹp 50–500)
- **Xuất feedback** (xanh dương): tải `feedback-{slug}.json` (texts/moves/props/pins) — dùng khi cần **Claude thiết kế tiếp** (đổi bố cục lớn, gen asset mới, xử lý comment)
- **Lưu** (chỉ hiện khi có review-server): ghi mọi chỉnh sửa live **thẳng vào file HTML source** (backup `.bak` bản trước) — 0 token
- **Xuất PNG** (vàng, chỉ hiện khi có review-server): **lưu source trước rồi chụp từ chính source** → `<design>-final.png` cạnh design — PNG và HTML luôn đồng bộ, 0 token, không qua Claude

Nhận feedback JSON từ user → áp `texts` / `moves` / `pins` vào source HTML → re-render → giao lại. Ảnh export qua `compose-screenshot.py` không bao giờ dính overlay (URL không có `?review`).

## Bước 4 — Tự kiểm tra trước khi giao ⚠️

Đọc lại PNG bằng Read tool và kiểm: (1) chữ tiếng Việt đủ dấu, không tràn khung; (2) tương phản chữ–nền đạt (nheo mắt vẫn đọc được title); (3) element không đè text; (4) căn lề thẳng hàng theo grid. Lỗi → sửa HTML, chụp lại. Giao user: **PNG + file HTML nguồn** (để user tự đổi text sau này không tốn lượt gen).

## Bước 5 — Wrap-up phiên (knowledge)

Cuối mỗi phiên thiết kế, agent PHẢI chốt sổ kinh nghiệm vào `knowledge/` (cạnh thư mục skills):

1. Chạy `python <path-to-skill>/scripts/knowledge-manager.py --new-session <slug>` rồi điền 4 mục (đã làm, feedback, bug, bài học).
2. Mẹo đã kiểm chứng ≥ 2 lần → thăng cấp thành `knowledge/patterns/<tên>.md`.
3. Kinh nghiệm prompt gen ảnh → ghi vào `knowledge/prompts/<backend>.md`.
4. Quy tắc sống còn → đề xuất user cho ghi thẳng vào SKILL.md này.
5. Chốt: `knowledge-manager.py --audit --index` — audit phải sạch trước khi kết thúc phiên.

## Fonts

**Quy trình**: chọn font theo tính cách (Bước 0.5) → `scripts/fetch-fonts.py` tải subset VN+latin về `<output-dir>/fonts/` → link `fonts.css` vào design file. Font đi theo từng thiết kế, KHÔNG cố định một bộ cho mọi design.

Bộ cache khởi điểm tại [assets/fonts/](assets/fonts/) (Be Vietnam Pro + Baloo 2, OFL) — dùng khi offline hoặc thiết kế nhanh; vẫn phải là lựa chọn có chủ đích, không phải mặc định vô thức.

## Giới hạn

- Không thay thế cho ảnh AI nguyên khối nghệ thuật — cần chất liệu painterly/hand-drawn toàn khung thì gen AI nguyên khối trực tiếp.
- Sửa cấu trúc ảnh (pose, thêm bớt vật thể) → regen hoặc inpainting backend, adjustment layer không làm được.

## Mở rộng skill này (dành cho người dùng)

SKILL.md này là **sổ tay sống** — cách đúng để dùng nó là ghi thêm kinh nghiệm của chính bạn:

- Bài học theo phiên → `knowledge/sessions/`; kỹ thuật tái dùng → `knowledge/patterns/`; prompt → `knowledge/prompts/` (xem [knowledge/README.md](../../knowledge/README.md)).
- Quy tắc sống còn đã kiểm chứng → ghi thẳng vào bước tương ứng của file này, kèm ngày (như các mục "kiểm chứng 2026-08-05" — đều từ lỗi thật).
- Style mới → thêm entry vào [config/style-registry.json](config/style-registry.json) với palette + art_direction block.
- Kinh nghiệm prompt cho backend gen ảnh của bạn → tự ghi chú và bổ sung vào Bước 0.5 / phần asset.

AI agent đọc file này mỗi lần chạy — mọi dòng bạn thêm là một lần dạy nó vĩnh viễn.
