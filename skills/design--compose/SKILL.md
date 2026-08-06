---
name: nexus:compose
category: design
risk: safe
source: internal
version: 1.6.0
description: Ghép các phần tử thiết kế (ảnh nền AI, element PNG trong suốt, logo, chữ tiếng Việt) thành ảnh truyền thông hoàn chỉnh bằng khung HTML 3 lớp, kèm review overlay tương tác kiểu Figma (layers panel, multi-select, snap guides, undo, comment, pan/zoom) và review-server cho user tự Lưu source + Xuất PNG 0 token. Dùng khi user muốn "ghép ảnh thành banner", "compose banner", "làm ảnh post FB/Instagram/story", "review design", "chỉnh thiết kế trực tiếp", "đè chữ lên ảnh", "thay text trên thiết kế", hoặc đã có sẵn asset và cần lên khung. Hỗ trợ 1:1, 16:9, 9:16, 4:5, 1.91:1, 2.35:1 và 4 style preset. Chữ là HTML nên tiếng Việt đúng chính tả 100%.
---

# Design Compose — Ghép lớp thiết kế kiểu Designer

Skill nguyên tử: nhận asset từ **bất kỳ nguồn nào** (AI gen, ảnh chụp, logo có sẵn) và ghép thành ảnh hoàn chỉnh. Không tự gen ảnh AI — việc đó thuộc `design--cover-image` hoặc backend gen ảnh của agent hiện tại. Có thể dùng lẻ hoặc được orchestrate bởi workflow `design-compose-pipeline`.

## User flow mặc định (đừng bắt user hiểu kỹ thuật)

Output của skill là **một file HTML sống**, không phải chỉ là PNG:

1. Agent tạo `design-{slug}.html` từ template. Mở thường bằng `file://` phải vào luôn **review UI offline** giống `#review`: chọn/kéo/sửa/comment/xuất feedback được, nhưng các nút cần backend local như **Lưu source/Xuất PNG** bị ẩn.
2. HTML offline dùng cùng topbar/panel/layers của review UI và hiện badge **Editor offline**. Nếu cần Lưu/Xuất PNG thì agent mở bằng `open-review.py <file>.html` để chạy review-server.
3. Agent vẫn tự mở bằng `open-review.py` ngay sau khi dựng xong để user có full editor + Lưu/Xuất PNG ngay.
4. User chỉnh trực tiếp trong browser: kéo lớp, sửa chữ, chỉnh opacity, comment.
5. User bấm **Lưu** hoặc mở menu **Xuất** để chọn PNG / handoff JSON. Nút **Feedback JSON** nằm cạnh Comment và chỉ active khi có comment/feedback mới.
6. Khi cần đưa sang app thật/Figma/handoff, agent xuất thêm **compose handoff manifest** bằng `export-compose.py` rồi dùng manifest đó để sinh code hoặc import vào tool khác.

HTML output mở thường phải là review UI offline, không phải một viewer riêng. Offline mode dùng cùng UI với `#review`, chỉ khác là không có backend nên **Lưu source/Xuất PNG** bị ẩn và topbar hiện **Editor offline**. Browser không thể tự start Python từ `file://`; muốn lưu/xuất PNG 0 token thì dùng `open-review.py` để mở qua `http://127.0.0.1:<port>/...`.

`open-review.py` phải mở browser ở page zoom 100% bằng profile Chrome/Edge tạm, vì Chrome có thể nhớ nhầm zoom 25% cho `file://`/origin cũ và làm toàn bộ editor chrome bé xíu. HTML/JS không có quyền reset page zoom của trình duyệt khi user tự mở file trực tiếp; nếu vẫn mở trực tiếp và bị nhỏ, dùng `Ctrl+0` hoặc mở lại bằng `open-review.py`.

Review-server có version/features trong `/__review__/ping`. `open-review.py` không được tái dùng server cũ thiếu `handoff-live`; phải bỏ qua server đó và mở server mới ở port trống. Overlay chỉ bật option Handoff khi ping có `features` chứa `handoff-live`; nếu user gặp `unknown endpoint` nghĩa là tab đang trỏ vào server cũ, mở lại bằng `open-review.py`.

## Backend gen ảnh theo môi trường agent

`design--compose` chỉ cần file ảnh đầu vào, nhưng workflow phía trước có thể tạo ảnh bằng nhiều backend. Chọn đường ngắn nhất theo agent đang chạy:

| Môi trường hiện tại | Cách gen ảnh nên dùng |
|---|---|
| **Codex app/chat có tool `image_gen`** | Gọi `image_gen` trực tiếp trong phiên hiện tại; không gọi vòng ngoài qua Codex CLI. |
| **Claude Code/Qwen/agent khác nhưng máy có Codex CLI** | Dùng `codex exec ...` như backend phụ để tạo PNG bằng Codex/image_gen. |
| **Không có Codex/image backend** | Dùng asset user cung cấp, generator khác, hoặc gradient fallback trong template. |

Quy tắc: nếu agent hiện tại đã có native image tool thì dùng native tool đó trước. Chỉ gọi Codex CLI khi agent hiện tại **không** có image generation trực tiếp.

## Layer Contract — bắt buộc trước khi compose

`design--compose` tạo **file thiết kế sống có thể chỉnh từng phần tử**, không tạo poster bitmap phẳng. Khi user nói "gen lại toàn bộ", "làm lại từ đầu", "theo đúng style", hoặc đưa screenshot làm reference, hiểu là **gen lại toàn bộ asset theo layer**, không phải gen một artboard hoàn chỉnh rồi phủ chữ HTML.

Trước khi viết HTML, agent phải có hoặc tạo **Asset Manifest** tối thiểu:

| Role | Bắt buộc | Yêu cầu |
|---|---:|---|
| `background` | ✅ | Nền/environment sạch, không chữ, không chứa object chính cần kéo/chỉnh riêng. |
| `primary-object` | ✅ khi có sản phẩm/phone/mockup/hero object | File riêng hoặc slot riêng; nếu là screenshot app thì đặt vào slot phone/mockup, không flatten cùng pet/nền. |
| `character-or-product` | ✅ khi có linh vật/sản phẩm | PNG alpha riêng, đã rmbg/filter/trim nếu cần. |
| `supporting-badges` | ✅ khi brief có icon/badge/decor 3D | Mỗi cụm chính là một element riêng hoặc nhóm slot riêng. |
| `content-html` | ✅ | Title/subtitle/CTA/badge/logo bằng HTML/CSS, không để AI vẽ chữ. |

**Gate tự kiểm trước khi giao:** user có chọn/kéo/ẩn/chỉnh z-order được từng object chính trong review không? Nếu không, thiết kế **không đạt pipeline**.

**Fail condition:** chỉ có 1 bitmap artboard trong `.layer-bg`/`.layer-art` + chữ HTML là sai pipeline, trừ khi user nói rõ "chỉ cần ảnh minh họa nguyên khối, không cần live edit layer". Khi fail, quay lại gen/tách asset theo manifest trên.

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
python .agent/skills/design--compose/scripts/fetch-fonts.py \
  --family "Baloo 2:700,800" --family "Quicksand:500,700" \
  --out <output-dir>/fonts
# → link <output-dir>/fonts/fonts.css vào design file
```

**Màu theo ý nghĩa**: palette phải trả lời "màu này nói gì?" (tin cậy → xanh dương đậm; tươi non → xanh lá pastel; ấm áp → cam đất...). Tham khảo 161 palettes trong `design--master`, 11 palettes trong `design--cover-image`, hoặc 4 preset của skill này — nhưng chọn có lý do, ghi lý do vào design file (comment đầu file).

## Bước 1 — Chuẩn bị workspace

```
<output-dir>/            # mặc định: cover-image/{slug}/ hoặc theo user chỉ định
├── assets/              # bg-*.png, element-*.png, logo.*
├── design-{slug}.html   # copy từ templates/social-frame.html — file nguồn sửa được
└── {slug}-{aspect}.png  # output
```

1. Copy `templates/social-frame.html` → `design-{slug}.html`. Giữ nguyên script `review-overlay.js` ở cuối file để HTML mở thường vào review UI offline và mở qua review-server vào review UI online.
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
   python .agent/skills/design--compose/scripts/trim-alpha.py <asset>.png   # → <asset>-trim.png, giữ file gốc
   ```
   Lý do: asset tách nền thường có padding trong suốt lớn (case iPhone: vật thể chỉ 312×548 trong khung 680×680) → `object-fit: contain` co nhỏ vật thể và tạo khe hở với bóng/floor dù slot neo đáy.

   **Asset có sẵn (ảnh sản phẩm đã tách nền)** — kiểm tra alpha thật bằng Pillow (4 góc alpha=0) rồi trim + dùng thẳng, bỏ qua rmbg. Hai việc PHẢI tự dựng vì ảnh tách nền không mang theo (kiểm chứng case iPhone 2026-08-05):
   - **Bóng/phản chiếu**: `drop-shadow` theo hướng sáng của nền; nền tối premium → thêm phản chiếu sàn: slot thứ 2 cùng ảnh, **PHẢI cùng kích thước slot gốc** (slot thấp hơn sẽ bị `object-fit: contain` co nhỏ bóng — feedback case iPhone), ảnh `object-position: bottom` + `scaleY(-1)`, cắt phần hiện bằng `mask-image` fade + opacity ~0.16. ⚠️ mask áp TRƯỚC transform nên bị lật theo — muốn fade xuống dưới (visual) thì gradient phải "to top".
   - **Hòa ánh sáng**: ảnh studio thường lệch tông với nền — grade per-slot (`grade-warm/cool`) cho khớp.
7. Element cần tách nền:
   - **Nếu asset được gen trên nền phẳng đồng nhất** (`isolated on solid plain background`) → ưu tiên connected-background keying, KHÔNG mặc định `rmbg`:
     ```bash
     python .agent/skills/design--compose/scripts/extract-solid-bg-alpha.py <asset>.png -o <asset>-alpha.png
     python .agent/skills/design--compose/scripts/trim-alpha.py <asset>-alpha.png
     ```
     Lý do: với nền phẳng, segmentation model như `modnet` có thể ăn alpha vào chủ thể hoặc làm vùng lông/kem/cam bán trong suốt; khi đặt lên nền coral/đậm sẽ thấy "lem" màu xuyên vào thân. Connected-background keying chỉ xóa vùng nền có màu gần 4 góc **và nối với mép ảnh**, nên giữ lõi chủ thể opaque tốt hơn, chỉ feather nhẹ ở viền.
   - **Nếu nền không phẳng hoặc object hòa vào nền phức tạp** → dùng `rmbg <img> -m modnet -o <out>.png` (skill `auto--media`), rồi hậu xử lý:
     - **Model mặc định là `modnet`, KHÔNG phải `briaai`**: kiểm chứng 4/4 lần trong 1 session, `briaai` ra alpha loang lổ khắp khung hình (~14-19% pixel alpha lửng lơ — không phải mép mềm mà là noise thật) kể cả khi chủ thể tương phản tốt với nền, không riêng case đồng tông. `modnet` luôn sạch hơn hẳn (~8-10% alpha lửng — đúng nghĩa mép mềm tự nhiên). Chỉ thử `briaai` nếu modnet cho kết quả tệ hơn ở case cụ thể nào đó. Đọc lại ảnh bằng vision sau rmbg để xác nhận trước khi tốn công lọc nhiễu.
     - **Lọc nhiễu alpha (bắt buộc)**: briaai để lại mảng alpha loang lổ khắp ảnh — chạy `python .agent/skills/design--compose/scripts/filter-alpha-noise.py <asset>.png` (giữ khối liền mạch lớn nhất qua `scipy.ndimage.label`, dilate 3px giữ mép mềm, mảng rời rạc set alpha = 0).
     - **Trim sát vật thể (bắt buộc — quy tắc chuẩn mục 6)**: chạy `trim-alpha.py` sau khi lọc nhiễu; nhờ slot-based nên trim không ảnh hưởng tọa độ overlay, nhưng quyết định vật thể fill khít slot và bóng/floor sát chân.
   - Prompt element: nền PHẲNG đồng nhất, tông NGƯỢC với palette chủ thể (chủ thể sáng/trắng → xám trung tính "#B0B0B0"–"#D0D0D0"; chủ thể tối → xám sáng "#EDEDED"; mặc định "#EDEDED"; CẤM nền cùng tông chủ thể, CẤM chroma xanh lá/magenta — gen model bleed màu vào mép lông/tóc), "soft contact shadow only". Lý do: rmbg là segmentation ngữ nghĩa chứ không phải chroma-key — cần tương phản chủ thể–nền, không cần màu key. Codex image_gen KHÔNG xuất alpha trực tiếp.
   - **QA alpha bắt buộc**: đặt asset đã tách lên nền tương phản với thiết kế thật (ví dụ coral/đậm) trước khi compose. Nếu thấy halo xám, thân chủ thể bị nền xuyên màu, hoặc lông/viền bị mất → đổi ngưỡng `extract-solid-bg-alpha.py` / regen nền phẳng hơn; không chữa bằng blur/feather lớn.

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
- User tự mở menu **Xuất → PNG** trên overlay (lưu source + chụp, 0 token) — đường chính, hoặc
- User yêu cầu Claude chụp trực tiếp.

(Claude vẫn được chụp bản tạm để tự nghiệm thu bằng vision — đó là việc nội bộ, không phải deliverable.)

```bash
python .agent/skills/design--compose/scripts/compose-screenshot.py \
  --html <output-dir>/design-{slug}.html --aspect 1:1 \
  --output <output-dir>/{slug}-1x1.png
```

- Bộ đa kênh: chỉnh `--frame-w/--frame-h` + layout cho từng aspect rồi chụp từng khung (mỗi aspect nên có bản HTML riêng nếu layout khác nhau đáng kể).
- `--size WxH` cho kích thước tùy biến; `--wait` tăng lên nếu font/ảnh chưa kịp load.

## Bước 3.2 — Export handoff đa đích

`design--compose` không dừng ở PNG. Treat HTML source như một file thiết kế sống, còn exporter là cầu nối sang app/tool khác:

| Target | Output | Dùng khi |
|---|---|---|
| Review/source | `design-{slug}.html` | User chỉnh layer/comment trực tiếp |
| Raster | `{slug}.png` | Onboarding/splash/banner tĩnh đúng pixel |
| Handoff manifest | `{slug}-handoff.json` | Agent khác đọc để sinh code/app/Figma payload |
| Expo/React Native | `.tsx` + assets | Onboarding thật cần text native, i18n, accessibility |
| React/Web | component + CSS/assets | Landing/app web |
| Figma | plugin/import JSON | Đưa layer tree vào Figma để designer chỉnh tiếp |

Manifest là contract trung gian bắt buộc trước khi sinh code native. Khi xuất từ menu **Xuất → Handoff JSON** trong review UI online, manifest phải lấy từ DOM đang render bằng `getBoundingClientRect()` + `getComputedStyle()` và có `fidelity: "pixel-lock"`:

```bash
python .agent/skills/design--compose/scripts/export-compose.py \
  <output-dir>/design-{slug}.html \
  --out <output-dir>/design-{slug}-handoff.json
```

Manifest gồm `frame`, `layout_system`, `nodes[]`, `layer`, `role`, `selector`, `src/resolvedSrc`, `text`, `rect.px`, `rect.pct`, `grid`, `computed`, `parent`, `feedback`, và `implementation_policy`. Static `export-compose.py` chỉ là fallback CLI; khi cần app/Figma/handoff chính thức, ưu tiên manifest live từ review UI vì nó chứa computed style thật sau khi user chỉnh.

**Pixel-lock contract cho agent nhận handoff:** phải dựng đúng compose frame trước. Không tự thêm logo, skip button, pagination, CTA, header/footer, safe-area chrome, hay reflow layout nếu các phần đó không tồn tại trong `nodes[]`. Muốn thêm app chrome/native onboarding controls thì làm ở bước sau như một shell riêng, không làm thay đổi frame thiết kế gốc.

**Grid intent contract:** handoff live luôn xuất thêm grid 12 cột x 24 hàng theo `layout_system`. Mỗi node có `grid.colStart`, `grid.colSpan`, `grid.rowStart`, `grid.rowSpan`, `anchor`, `zone`, và `reflow: "locked"`. Agent nhận handoff phải dùng `rect.pct`/`rect.px` để match bản gốc; chỉ dùng `grid` để hiểu intent, đặt constraints, hoặc adapt có kiểm soát sang viewport khác. Nếu cần responsive thật, tạo variant/adaptation mới thay vì ghi đè pixel-lock frame.

Khi implement vào app thật, agent phải dùng manifest để map:
- `layer-bg`/ảnh nền → `ImageBackground` hoặc absolute `<Image>`
- `.slot > img` → asset absolute-position theo `%` frame
- text trong `.layer-content` → component text native, không flatten vào ảnh nếu cần i18n/accessibility
- `layout_system`/`node.grid` → constraints/grid metadata cho Figma, responsive hints, hoặc RN helper
- z-order/layer order → thứ tự render hoặc `zIndex`

Quy tắc chọn target:
- User nói “đưa vào Expo/app/mobile/onboarding” → xuất handoff manifest live trước, rồi sinh screen native từ manifest ở chế độ pixel-lock. Nếu user muốn biến nó thành màn app có logo/skip/CTA/pagination, hỏi/ghi rõ đó là bước adaptation riêng.
- User chỉ cần hình marketing/splash tĩnh → PNG đủ.
- User nói “như Figma/chỉnh tiếp trong Figma” → xuất handoff manifest làm payload import; không hứa tương thích `.fig` riêng tư của Figma.

## Bước 3.5 — Review tương tác (feedback loop với user)

Output không phải ảnh chết — design file là bề mặt làm việc. **Ngay khi dựng xong design HTML (cuối Bước 2), mở preview luôn — đừng để user phải tự kiếm file:**

```bash
python .agent/skills/design--compose/scripts/open-review.py <output-dir>/design-{slug}.html
```

Một lệnh lo trọn: tái dùng review-server đang serve đúng thư mục (hoặc tự khởi động nền ở port trống), chờ sẵn sàng, mở browser vào `#review`. Server cho phép nút Lưu/Xuất PNG hoạt động 0 token.

HTML mở thường cũng là review UI:
- Nếu đang mở qua `http://127.0.0.1:<port>/...`, topbar có **Lưu** và **Xuất PNG** vì review-server đang online.
- Nếu đang mở trực tiếp `file://`, topbar hiện **Editor offline**; vẫn chọn/kéo/sửa/comment/xuất feedback JSON được, nhưng **Lưu/Xuất PNG** bị ẩn vì browser không được ghi file/chạy Python.
- Ảnh render sạch dùng `compose-screenshot.py`, script này mở HTML với `?render=1` để tắt overlay UI khi chụp.

(Fallback không server: mở `file:///<đường-dẫn>/design-{slug}.html#review` — nút Lưu/Xuất PNG tự ẩn, còn lại hoạt động đủ. Đừng đưa link dạng text — IDE/chat encode `?`/`#` gây ERR_FILE_NOT_FOUND, luôn mở bằng lệnh.)

Overlay ([scripts/review-overlay.js](scripts/review-overlay.js), template đã nhúng sẵn, chỉ kích hoạt khi có `#review`/`?review`) là editor chrome kiểu Figma — dark canvas, icon SVG, không emoji:
- **Layers panel (trái)**: cây phân lớp Nền → Art → Adjustment → Nội dung, expand/collapse group, click chọn đúng element trong nhóm chồng nhau, toggle ẩn/hiện từng lớp để soi; sync 2 chiều với selection trên canvas
- **Chọn (V)** — select model Figma: click = group ngoài cùng · double-click = drill sâu 1 cấp · Ctrl+click = element sâu nhất · double-click text đã chọn = sửa chữ inline · **Shift+click = thêm/bớt vào nhóm · quét marquee vùng trống = chọn nhiều · kéo/nudge/Delete áp cả nhóm** (tự loại cặp cha–con lồng nhau). Đã chọn gì thì kéo cái đó (px theo hệ tọa độ của chính element, element static tự chuyển relative); mũi tên nudge 2px, Shift = 10px; **xoay** bằng handle tròn trên selection box (Shift = bước 15°); **Delete** = ẩn element + ghi yêu cầu xóa vào feedback. Panel Thuộc tính: X/Y/W/H, Xoay (°), Góc nhìn với 3D pad kéo trực tiếp để rotate object X/Y (khối 3D + grid chiều sâu), preset nhanh (Flat/Iso/Tilt), Skew/Perspective để tinh chỉnh, Mờ (%), Lật ngang/dọc, Lên trước/Ra sau (z-order), cỡ chữ, nội dung — sửa là áp ngay. **Feedback cho AI gắn với element đang chọn hiển thị bằng bubble ngay dưới element trên canvas**, có nút **Lưu feedback** rõ ràng, `Ctrl+Enter` lưu nhanh, sau khi lưu nút chuyển **Đã lưu** và disabled cho tới khi user sửa tiếp; bubble vẫn tự sync khi ẩn để tránh mất draft; không đặt textarea xa trong panel phải.
- **Comment (C)**: click đặt pin điểm, **kéo để khoanh vùng** (region đánh số kiểu Figma) + ghi chú qua popup; overlay tự hit-test/overlap để gắn comment với target element khi có thể
- **Snap & alignment guides**: khi kéo, element tự hít vào mép/tâm frame và mép/tâm các element khác (ngưỡng 6px), guide line đỏ hiện chỗ khớp; toggle nút Snap trên topbar, giữ Alt để tạm tắt khi kéo
- **Canvas navigation**: Space+kéo hoặc chuột giữa = pan (hand tool) · Ctrl+lăn = zoom neo tại con trỏ · lăn = pan dọc, Shift+lăn = pan ngang · −/+/Fit trên topbar (Fit reset cả pan), tự fit khi mở
- **Undo (Ctrl+Z / nút topbar)**: hoàn tác mọi mutation (move, resize, rotate, flip, opacity, z-order, sửa chữ, delete, đặt pin/region) — snapshot-based, max bước theo RAM máy (`navigator.deviceMemory` × 64, kẹp 50–500)
- **Feedback JSON**: nút nằm cạnh **Comment**, chỉ active khi có pin comment hoặc feedback gắn element mới. Khi bấm, tải `feedback-{slug}.json` (`texts`/`moves`/`props`/`element_feedback`/`pins`) và dùng được cả offline.
- **Menu Xuất** (xanh dương): một nút có nhiều option giống design tool. **PNG** lưu source rồi chụp `<design>-final.png`; **Handoff JSON** lưu source rồi xuất `<design>-handoff.json` để agent sinh Expo/React/Figma payload. Khi export thành công, overlay tự mở file output trong tab mới. Option cần backend chỉ bật khi mở qua review-server online.
- **Lưu** (chỉ hiện khi có review-server): ghi mọi chỉnh sửa live **thẳng vào file HTML source** (backup `.bak` bản trước) — 0 token
- **Xuất PNG/Handoff** (trong menu Xuất, chỉ bật khi có review-server): **lưu source trước rồi xuất từ chính source** — PNG/JSON và HTML luôn đồng bộ, 0 token, không qua Claude

Nhận feedback JSON từ user → áp `texts` / `moves` / `props` / `element_feedback` / `pins` vào source HTML → re-render → giao lại. Ưu tiên `element_feedback` khi cần sửa đúng phần tử vì nó có target metadata, không phải chỉ tọa độ trên frame. Ảnh export qua `compose-screenshot.py` không bao giờ dính overlay (URL không có `?review`).

## Bước 4 — Tự kiểm tra trước khi giao ⚠️

Đọc lại PNG bằng Read tool và kiểm: (1) chữ tiếng Việt đủ dấu, không tràn khung; (2) tương phản chữ–nền đạt (nheo mắt vẫn đọc được title); (3) element không đè text; (4) căn lề thẳng hàng theo grid. Lỗi → sửa HTML, chụp lại. Giao user: **PNG + file HTML nguồn** (để user tự đổi text sau này không tốn lượt gen).

## Bước 5 — Wrap-up phiên (knowledge)

Cuối mỗi phiên thiết kế, chốt sổ kinh nghiệm theo hệ knowledge của workspace Nexus:

1. Session note → `knowledge/notes/` (theo quy trình wrap-up chung của workspace).
2. Kỹ thuật kiểm chứng ≥ 2 lần → `knowledge/patterns/` (check trùng trước, update thay vì tạo mới).
3. Kinh nghiệm prompt gen ảnh → cập nhật pattern `layered-ai-asset-html-compose-pipeline` hoặc pattern riêng theo backend.
4. Quy tắc sống còn → ghi thẳng vào bước tương ứng của SKILL.md này, kèm ngày kiểm chứng.
5. Rebuild index: `python core/knowledge_manager.py --rebuild`.

(Bản standalone/public của skill dùng `scripts/knowledge-manager.py` với thư mục `knowledge/` cạnh skill — cùng triết lý, khác hạ tầng.)

## Fonts

**Quy trình**: chọn font theo tính cách (Bước 0.5) → `scripts/fetch-fonts.py` tải subset VN+latin về `<output-dir>/fonts/` → link `fonts.css` vào design file. Font đi theo từng thiết kế, KHÔNG cố định một bộ cho mọi design.

Bộ cache khởi điểm tại [assets/fonts/](assets/fonts/) (Be Vietnam Pro + Baloo 2, OFL) — dùng khi offline hoặc thiết kế nhanh; vẫn phải là lựa chọn có chủ đích, không phải mặc định vô thức.

## Giới hạn

- Không thay thế cho ảnh AI nguyên khối nghệ thuật — cần chất liệu painterly/hand-drawn toàn khung thì dùng `design--cover-image` thuần.
- Sửa cấu trúc ảnh (pose, thêm bớt vật thể) → regen hoặc inpainting backend, adjustment layer không làm được.
