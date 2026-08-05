/**
 * Review overlay cho design--compose — editor chrome kiểu Figma/Canva.
 * Kích hoạt CHỈ KHI URL có "#review" (hoặc "?review"); không có cờ → no-op,
 * ảnh export qua compose-screenshot.py luôn sạch.
 *
 * Tính năng:
 *  - Select (V): click chọn element → selection box + properties panel (X/Y/W %, font-size, nội dung)
 *  - Kéo thả để dời vị trí, mũi tên để nudge (Shift = bước lớn), double-click sửa chữ inline
 *  - Comment (C): click đặt pin đánh số + ghi chú
 *  - Export: tải feedback JSON + copy clipboard → gửi lại Claude áp vào source
 */
(function () {
  'use strict';
  if (!/[?#&]review/.test(location.search + location.hash)) return;
  var frame = document.querySelector('.frame');
  if (!frame) return;

  /* ================= state ================= */
  var changes = { texts: {}, moves: {}, props: {}, pins: [] };
  var mode = 'select';           // 'select' | 'comment'
  var selected = null;
  var pinCount = 0;
  var zoom = 1;

  /* ================= i18n (vi/en) — auto theo browser, toggle trên topbar ================= */
  var LANGS = {
    vi: {
      select: 'Chọn', comment: 'Comment', snap: 'Snap', exportFb: 'Xuất comment cho AI sửa', save: 'Lưu',
      png: 'Xuất PNG', shooting: 'Đang chụp...', changes: 'thay đổi',
      props: 'Thuộc tính', layersTitle: 'Layers',
      emptyHint: 'Click một element trên thiết kế để chọn.<br><br>Kéo để di chuyển · mũi tên để tinh chỉnh · double-click để sửa chữ.',
      multiSel: ' elements đã chọn',
      multiHint: 'Kéo để di chuyển cả nhóm · mũi tên nudge · Delete ẩn tất cả · Shift+click để thêm/bớt · Esc bỏ chọn.',
      rot: 'Xoay (°)', op: 'Mờ (%)', fs: 'Cỡ chữ (px)', content: 'Nội dung',
      flipH: 'Lật ngang', flipV: 'Lật dọc', zUp: 'Lên trước', zDown: 'Ra sau',
      align: 'Căn chữ', alLeft: 'Trái', alCenter: 'Giữa', alRight: 'Phải',
      secPosition: 'Vị trí', secLayout: 'Kích thước', secAppearance: 'Hiển thị', secTypography: 'Chữ',
      notePoint: 'Ghi chú cho vị trí này...', noteRegion: 'Ghi chú cho vùng này...',
      cancel: 'Hủy', saveNote: 'Lưu',
      tipSelect: 'Chọn và di chuyển (V)', tipComment: 'Đặt ghi chú (C)',
      tipSnap: 'Snap & alignment guides (giữ Alt để tạm tắt)',
      tipUndo: 'Hoàn tác (Ctrl+Z)', undoMax: ' bước (theo RAM)',
      tipExport: 'Gửi thay đổi/comment cho AI agent khi cần thiết kế tiếp',
      tipSave: 'Lưu mọi chỉnh sửa live vào file HTML source (backup .bak)',
      tipPng: 'Lưu source + chụp PNG chính thức ngay trên máy — không qua AI',
      tipRotHandle: 'Kéo để xoay (Shift = bước 15°)',
      savedSource: 'Đã lưu source:\n', exported: 'Đã lưu source + xuất PNG:\n',
      errSave: 'Lỗi lưu: ', errExport: 'Lỗi xuất: ', errServer: 'Không kết nối được review server: ',
      commentN: 'Comment ',
      noServer: 'Không server — Lưu/Xuất PNG bị ẩn. Mở qua link http://127.0.0.1:xxxx (lệnh open-review.py), đừng mở file trực tiếp.',
      layerNames: { 'layer-bg': 'Nền (Background)', 'layer-art': 'Art (Assets)', 'layer-adjust': 'Adjustment', 'layer-content': 'Nội dung (Text/UI)' }
    },
    en: {
      select: 'Select', comment: 'Comment', snap: 'Snap', exportFb: 'Export comment for AI editing', save: 'Save',
      png: 'Export PNG', shooting: 'Capturing...', changes: 'changes',
      props: 'Properties', layersTitle: 'Layers',
      emptyHint: 'Click an element on the canvas to select it.<br><br>Drag to move · arrows to nudge · double-click to edit text.',
      multiSel: ' elements selected',
      multiHint: 'Drag to move the group · arrows to nudge · Delete hides all · Shift+click to add/remove · Esc to deselect.',
      rot: 'Rotate (°)', op: 'Opacity (%)', fs: 'Font size (px)', content: 'Content',
      flipH: 'Flip H', flipV: 'Flip V', zUp: 'Forward', zDown: 'Backward',
      align: 'Text align', alLeft: 'Left', alCenter: 'Center', alRight: 'Right',
      secPosition: 'Position', secLayout: 'Layout', secAppearance: 'Appearance', secTypography: 'Typography',
      notePoint: 'Note for this spot...', noteRegion: 'Note for this region...',
      cancel: 'Cancel', saveNote: 'Save',
      tipSelect: 'Select & move (V)', tipComment: 'Add comment (C)',
      tipSnap: 'Snap & alignment guides (hold Alt to bypass)',
      tipUndo: 'Undo (Ctrl+Z)', undoMax: ' steps (RAM-based)',
      tipExport: 'Send changes/comments to your AI agent for further design work',
      tipSave: 'Save live edits into the source HTML file (.bak backup)',
      tipPng: 'Save source + capture the official PNG locally — no AI involved',
      tipRotHandle: 'Drag to rotate (Shift = 15° steps)',
      savedSource: 'Source saved:\n', exported: 'Source saved + PNG exported:\n',
      errSave: 'Save error: ', errExport: 'Export error: ', errServer: 'Cannot reach review server: ',
      commentN: 'Comment ',
      noServer: 'No server — Save/Export PNG hidden. Open via http://127.0.0.1:xxxx (the open-review.py command), not the raw file.',
      layerNames: { 'layer-bg': 'Background', 'layer-art': 'Art (Assets)', 'layer-adjust': 'Adjustment', 'layer-content': 'Content (Text/UI)' }
    }
  };
  var lang = localStorage.getItem('rvw-lang') ||
    ((navigator.language || '').toLowerCase().indexOf('vi') === 0 ? 'vi' : 'en');
  if (!LANGS[lang]) lang = 'en';
  var T = LANGS[lang];

  /* ===== Hit-testing tổng quát — overlay KHÔNG phụ thuộc tên class của design =====
     (fix 2026-08-05: design ngoài template gốc như pawos có class tùy ý → selector
     hard-code làm click xuyên qua và không kéo được element trong group lạ) */
  var OVERLAY_UI = '.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note,.rvw-pin,.rvw-region,.rvw-selbox,.rvw-hoverbox,.rvw-guide,.rvw-marquee';
  function classOf(el) { return (el.getAttribute && el.getAttribute('class')) || ''; }
  function isLayerEl(el) { return /(^| )layer-/.test(classOf(el)); }
  function inDesign(el) {
    return el && el.nodeType === 1 && el !== frame && frame.contains(el) &&
      classOf(el).indexOf('rvw-') < 0 && !(el.closest && el.closest(OVERLAY_UI));
  }
  function hasDirectText(el) {
    return Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
  }
  function isTextEl(el) { return !!el && !!el.childNodes && hasDirectText(el); }
  // "Solid" tại điểm nhìn: media, có chữ trực tiếp, hoặc có nền/viền/bóng thấy được
  function isSolid(el) {
    if (/^(IMG|SVG|VIDEO|CANVAS|PICTURE)$/i.test(el.tagName)) return true;
    if (hasDirectText(el)) return true;
    var cs = getComputedStyle(el);
    return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' ||
      parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none');
  }
  // Element thiết kế trên cùng THẬT SỰ dưới con trỏ (bỏ qua container trong suốt che khuất)
  function pickAtPoint(x, y) {
    var list = document.elementsFromPoint(x, y);
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!inDesign(el) || isLayerEl(el)) continue;
      if (!fallback) fallback = el;
      if (isSolid(el)) return el;
    }
    return fallback;
  }
  // Group ngoài cùng: con trực tiếp của một layer-* (hoặc của frame)
  function outerGroup(el) {
    var n = el;
    while (n.parentElement && n.parentElement !== frame && !isLayerEl(n.parentElement)) n = n.parentElement;
    return n;
  }
  // Tập element dùng cho snap/marquee: mọi con trực tiếp của các layer
  function topLevelElements() {
    return Array.prototype.filter.call(
      frame.querySelectorAll('.layer-art > *, .layer-content > *'),
      function (o) { return classOf(o).indexOf('rvw-') < 0; }
    );
  }

  /* ================= theme ================= */
  var css = `
  body.rvw-canvas{background:#1e1e1e !important;padding:64px 272px 48px 244px;box-sizing:content-box;}
  body.rvw-canvas .frame{margin:0 auto;box-shadow:0 4px 32px rgba(0,0,0,.5);}
  .rvw{font-family:Inter,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
  .rvw-topbar{position:fixed;top:0;left:0;right:0;height:48px;z-index:100000;display:flex;align-items:center;
    gap:4px;padding:0 12px;background:#2c2c2c;border-bottom:1px solid #444;color:#e0e0e0;font-size:12px;}
  .rvw-topbar .rvw-title{font-weight:600;margin-right:16px;color:#fff;}
  .rvw-srvstatus{background:#4a3410;color:#f2b84b;border:1px solid #6b4c17;border-radius:10px;
    padding:3px 10px;font-size:11px;font-weight:600;margin-right:16px;}
  .rvw-tool{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:none;border-radius:6px;
    background:transparent;color:#ccc;font:500 12px Inter,'Segoe UI',sans-serif;cursor:pointer;}
  .rvw-tool:hover{background:#3a3a3a;}
  .rvw-tool.rvw-active{background:#0d99ff;color:#fff;}
  .rvw-tool svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}
  .rvw-sep{width:1px;height:20px;background:#444;margin:0 6px;}
  .rvw-group{display:flex;align-items:center;gap:4px;}
  .rvw-group:empty{display:none;}
  .rvw-langsw{display:flex;align-items:center;background:#1e1e1e;border-radius:6px;padding:2px;gap:2px;margin-left:8px;}
  .rvw-langsw button{display:flex;align-items:center;gap:5px;padding:3px 8px;border:none;border-radius:4px;
    background:transparent;color:#888;font:600 11px Inter,'Segoe UI',sans-serif;cursor:pointer;}
  .rvw-langsw button:hover{color:#ccc;}
  .rvw-langsw button.rvw-lon{background:#3a3a3a;color:#fff;}
  .rvw-langsw svg{width:16px;height:11px;border-radius:2px;display:block;}
  .rvw-zoom{display:flex;align-items:center;gap:2px;margin-left:4px;color:#aaa;}
  .rvw-zoom button{width:26px;height:26px;border:none;border-radius:4px;background:transparent;color:#ccc;cursor:pointer;font-size:14px;}
  .rvw-zoom button:hover{background:#3a3a3a;}
  .rvw-zoom .rvw-zval{min-width:44px;text-align:center;}
  .rvw-export{background:#0d99ff;color:#fff;font-weight:600;}
  .rvw-export:hover{background:#0b87e0;}
  .rvw-approve{background:#1f9d55;color:#fff;font-weight:600;}
  .rvw-approve:hover{background:#188945;}
  .rvw-png{background:#e7b84c;color:#1a1a1a;font-weight:700;}
  .rvw-png:hover{background:#d9a93f;}
  .rvw-png:disabled{opacity:.6;cursor:wait;}
  .rvw-badge{background:#3a3a3a;border-radius:10px;padding:3px 10px;color:#aaa;margin-left:auto;}
  .rvw-panel{position:fixed;top:48px;right:0;bottom:0;width:248px;z-index:99999;background:#2c2c2c;
    border-left:1px solid #444;color:#e0e0e0;font-size:12px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:#4a4a4a transparent;}
  .rvw-panel-resize{position:fixed;top:48px;bottom:0;width:8px;z-index:100000;cursor:ew-resize;
    background:transparent;}
  .rvw-panel-resize:hover,.rvw-panel-resize.rvw-dragging{background:rgba(13,153,255,.4);}
  .rvw-panel h3{font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;
    padding:14px 14px 6px;margin:0;}
  .rvw-panel .rvw-empty{padding:8px 14px;color:#777;line-height:1.5;}
  .rvw-fields{padding:4px 14px 14px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;}
  .rvw-section{border-top:1px solid #333;}
  .rvw-section:first-of-type{border-top:none;}
  .rvw-sectitle{padding:10px 14px 0;font-size:11px;font-weight:600;color:#999;
    text-transform:uppercase;letter-spacing:.04em;}
  .rvw-field{display:flex;flex-direction:column;gap:3px;}
  .rvw-field.rvw-wide{grid-column:1/-1;}
  .rvw-field label{color:#888;font-size:10px;}
  .rvw-field input,.rvw-field textarea{background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#e0e0e0;
    padding:5px 7px;font:400 12px Inter,'Segoe UI',sans-serif;outline:none;
    width:100%;min-width:0;box-sizing:border-box;}
  .rvw-field input:focus,.rvw-field textarea:focus{border-color:#0d99ff;}
  .rvw-field textarea{resize:vertical;min-height:56px;line-height:1.4;}
  .rvw-elname{padding:10px 14px 0;font-weight:600;color:#fff;font-size:12px;word-break:break-all;}
  .rvw-layers{position:fixed;top:48px;left:0;bottom:0;width:220px;z-index:99999;background:#2c2c2c;
    border-right:1px solid #444;color:#e0e0e0;overflow-y:auto;font-size:11px;
    scrollbar-width:thin;scrollbar-color:#4a4a4a transparent;}
  .rvw-panel::-webkit-scrollbar,.rvw-layers::-webkit-scrollbar,.rvw-field textarea::-webkit-scrollbar{width:8px;}
  .rvw-panel::-webkit-scrollbar-track,.rvw-layers::-webkit-scrollbar-track,.rvw-field textarea::-webkit-scrollbar-track{background:transparent;}
  .rvw-panel::-webkit-scrollbar-thumb,.rvw-layers::-webkit-scrollbar-thumb,.rvw-field textarea::-webkit-scrollbar-thumb{
    background:#4a4a4a;border-radius:4px;}
  .rvw-panel::-webkit-scrollbar-thumb:hover,.rvw-layers::-webkit-scrollbar-thumb:hover,.rvw-field textarea::-webkit-scrollbar-thumb:hover{background:#5c5c5c;}
  .rvw-layers h3{font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;
    padding:14px 12px 6px;margin:0;}
  .rvw-lrow{display:flex;align-items:center;gap:4px;height:26px;padding-right:8px;cursor:pointer;color:#ccc;white-space:nowrap;}
  .rvw-lrow:hover{background:#37393b;}
  .rvw-lrow.rvw-lactive{background:rgba(13,153,255,.22);color:#fff;}
  .rvw-lrow .rvw-lname{overflow:hidden;text-overflow:ellipsis;flex:1;}
  .rvw-chev{width:14px;flex:none;display:inline-flex;justify-content:center;}
  .rvw-chev::before{content:'';display:inline-block;border:4px solid transparent;border-left-color:#888;
    margin-left:4px;transition:transform .12s;transform:rotate(90deg);transform-origin:2px 4px;}
  .rvw-lrow.rvw-closed .rvw-chev::before{transform:rotate(0deg);}
  .rvw-chev.rvw-leaf::before{border-left-color:transparent;}
  .rvw-lkids.rvw-collapsed{display:none;}
  .rvw-eye{flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;
    border-radius:4px;opacity:0;}
  .rvw-lrow:hover .rvw-eye,.rvw-lrow.rvw-lhidden .rvw-eye{opacity:1;}
  .rvw-eye:hover{background:#454749;}
  .rvw-eye svg{width:13px;height:13px;stroke:#bbb;fill:none;stroke-width:1.4;stroke-linecap:round;}
  .rvw-lrow.rvw-lhidden .rvw-lname{opacity:.4;}
  .rvw-lrow.rvw-lhidden .rvw-eye svg{stroke:#777;}
  .rvw-selbox{position:fixed;z-index:99998;pointer-events:none;border:1.5px solid #0d99ff;}
  .rvw-selbox.rvw-selbox-extra{border-width:1px;border-style:solid;}
  .rvw-selbox .rvw-h{position:absolute;width:8px;height:8px;background:#fff;border:1.5px solid #0d99ff;border-radius:1px;}
  .rvw-selbox .rvw-h.nw{left:-5px;top:-5px;}.rvw-selbox .rvw-h.ne{right:-5px;top:-5px;}
  .rvw-selbox .rvw-h.sw{left:-5px;bottom:-5px;}
  .rvw-selbox .rvw-h.se{right:-5px;bottom:-5px;pointer-events:auto;cursor:nwse-resize;}
  .rvw-selbox .rvw-h.rot{left:50%;top:-28px;margin-left:-5px;border-radius:50%;pointer-events:auto;cursor:grab;}
  .rvw-selbox .rvw-rotline{position:absolute;left:50%;top:-19px;width:1px;height:19px;background:#0d99ff;}
  .rvw-btnrow{display:flex;gap:6px;flex-wrap:wrap;}
  .rvw-btnrow button{flex:1 1 45%;display:inline-flex;align-items:center;justify-content:center;
    background:#3a3a3a;border:none;border-radius:5px;color:#ddd;
    font:500 11px Inter,sans-serif;padding:6px 4px;cursor:pointer;}
  .rvw-btnrow button:hover{background:#454749;}
  .rvw-btnrow button.rvw-on{background:#0d99ff;color:#fff;}
  .rvw-btnrow button svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;}
  /* Hàng 3 nút đều nhau (căn trái/giữa/phải) — KHÔNG wrap, khác với rvw-btnrow 4-nút 2x2 ở trên */
  .rvw-btnrow3{display:flex;gap:6px;}
  .rvw-btnrow3 button{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;
    background:#3a3a3a;border:none;border-radius:5px;color:#ddd;padding:8px 4px;cursor:pointer;}
  .rvw-btnrow3 button:hover{background:#454749;}
  .rvw-btnrow3 button.rvw-on{background:#0d99ff;color:#fff;}
  .rvw-btnrow3 button svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;}
  .rvw-hoverbox{position:fixed;z-index:99997;pointer-events:none;border:1px solid rgba(13,153,255,.55);}
  .rvw-guide{position:fixed;z-index:99998;background:#f24822;pointer-events:none;display:none;}
  .rvw-guide.rvw-gv{width:1px;}
  .rvw-guide.rvw-gh{height:1px;}
  .rvw-pin{position:absolute;z-index:9999;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
    background:#0d99ff;color:#fff;display:flex;align-items:center;justify-content:center;
    font:700 12px Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.45);border:2px solid #fff;cursor:default;}
  .rvw-note{position:fixed;z-index:100001;width:240px;background:#2c2c2c;border:1px solid #555;border-radius:8px;
    padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);}
  .rvw-note textarea{width:100%;box-sizing:border-box;background:#1e1e1e;border:1px solid #444;border-radius:4px;
    color:#e0e0e0;padding:6px;font:400 12px Inter,sans-serif;min-height:60px;resize:none;outline:none;}
  .rvw-note .rvw-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:8px;}
  .rvw-note button{border:none;border-radius:5px;padding:5px 12px;font:600 11px Inter,sans-serif;cursor:pointer;}
  .rvw-note .rvw-save{background:#0d99ff;color:#fff;}
  .rvw-note .rvw-cancel{background:#3a3a3a;color:#ccc;}
  .rvw-editing{outline:1.5px solid #f5a623 !important;user-select:text;}
  body.rvw-comment .frame{cursor:crosshair;}
  body.rvw-space, body.rvw-space *{cursor:grab !important;}
  body.rvw-panning, body.rvw-panning *{cursor:grabbing !important;}
  .rvw-marquee{position:fixed;z-index:99998;border:1.5px dashed #0d99ff;background:rgba(13,153,255,.1);pointer-events:none;}
  .rvw-pin{cursor:pointer !important;}
  .rvw-region .rvw-region-n{cursor:pointer !important;}
  .rvw-note-view .rvw-note-head{font:700 11px Inter,sans-serif;color:#0d99ff;margin-bottom:6px;}
  .rvw-note-view .rvw-note-body{font:400 12px Inter,sans-serif;color:#e0e0e0;line-height:1.5;white-space:pre-wrap;}
  .rvw-region{position:absolute;z-index:9998;border:2px solid #0d99ff;background:rgba(13,153,255,.12);border-radius:4px;pointer-events:none;}
  .rvw-region .rvw-region-n{position:absolute;top:-13px;left:-13px;width:26px;height:26px;border-radius:50%;
    background:#0d99ff;color:#fff;display:flex;align-items:center;justify-content:center;
    font:700 12px Inter,sans-serif;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);pointer-events:auto;cursor:default;}
  /* Hit-testing khi review: container phủ toàn khung cho xuyên qua,
     còn element tương tác (chữ, block, slot) bắt sự kiện — kể cả khi
     design file đặt pointer-events:none trên layer-content */
  body.rvw-canvas .frame{pointer-events:auto !important;}
  body.rvw-canvas .frame :not([class*="rvw-"]){pointer-events:auto !important;}
  body.rvw-canvas .layer-adjust,body.rvw-canvas .layer-adjust *{pointer-events:none !important;}
  body.rvw-canvas .frame{user-select:none;}
  body.rvw-canvas .frame img{-webkit-user-drag:none;}`;
  var st = document.createElement('style');
  st.className = 'rvw-style'; // đánh dấu để cleanHTML purge khi lưu/xuất
  st.textContent = css;
  document.head.appendChild(st);
  document.body.classList.add('rvw-canvas', 'rvw');

  /* ================= icons (SVG, không emoji) ================= */
  var ICONS = {
    select: '<svg viewBox="0 0 16 16"><path d="M3 1.5l10 6.2-4.6 1 2.5 5-1.8.9-2.5-5L3 13z"/></svg>',
    comment: '<svg viewBox="0 0 16 16"><path d="M2 2.5h12v8H8l-3.5 3v-3H2z"/></svg>',
    export: '<svg viewBox="0 0 16 16"><path d="M8 2v7m0 0L5 6.2M8 9l3-2.8M2.5 12v1.5h11V12"/></svg>',
    grid: '<svg viewBox="0 0 16 16"><path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12"/></svg>',
    undo: '<svg viewBox="0 0 16 16"><path d="M6.5 3 3 6.5 6.5 10"/><path d="M3 6.5h6.2a3.8 3.8 0 0 1 0 7.6H7.5"/></svg>',
    check: '<svg viewBox="0 0 16 16"><path d="M2.5 8.5 6.5 12.5 13.5 4"/></svg>',
    image: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><circle cx="5.5" cy="6" r="1.2"/><path d="M2.5 12l3.5-4 3 3.5 2-2.5 2.5 3"/></svg>',
    alignLeft: '<svg viewBox="0 0 16 16"><path d="M2 4h12M2 8h8M2 12h10"/></svg>',
    alignCenter: '<svg viewBox="0 0 16 16"><path d="M2 4h12M4 8h8M3 12h10"/></svg>',
    alignRight: '<svg viewBox="0 0 16 16"><path d="M2 4h12M6 8h8M4 12h10"/></svg>'
  };
  // Cờ SVG (Windows không render emoji cờ)
  var FLAGS = {
    vi: '<svg viewBox="0 0 24 16"><rect width="24" height="16" fill="#da251d"/><path fill="#ffff00" d="M12 3.2l1.06 3.26h3.43l-2.77 2.02 1.06 3.26L12 9.72l-2.78 2.02 1.06-3.26-2.77-2.02h3.43z"/></svg>',
    en: '<svg viewBox="0 0 24 16"><rect width="24" height="16" fill="#012169"/><path d="M0 0l24 16M24 0L0 16" stroke="#fff" stroke-width="3.2"/><path d="M0 0l24 16M24 0L0 16" stroke="#C8102E" stroke-width="1.3"/><path d="M12 0v16M0 8h24" stroke="#fff" stroke-width="5.4"/><path d="M12 0v16M0 8h24" stroke="#C8102E" stroke-width="3.2"/></svg>'
  };

  /* ================= chrome ================= */
  var topbar = document.createElement('div');
  topbar.className = 'rvw-topbar rvw';
  // Nhóm theo logic tool: modes │ trợ giúp chỉnh sửa │ đầu ra local │ vòng AI ──── status · settings · zoom
  topbar.innerHTML =
    '<span class="rvw-title">Design Review</span>' +
    '<span class="rvw-srvstatus" id="rvw-srvstatus" style="display:none"></span>' +
    '<button class="rvw-tool rvw-active" id="rvw-mode-select" title="' + T.tipSelect + '">' + ICONS.select + T.select + '</button>' +
    '<button class="rvw-tool" id="rvw-mode-comment" title="' + T.tipComment + '">' + ICONS.comment + T.comment + '</button>' +
    '<span class="rvw-sep"></span>' +
    '<button class="rvw-tool rvw-active" id="rvw-snap" title="' + T.tipSnap + '">' + ICONS.grid + T.snap + '</button>' +
    '<button class="rvw-tool" id="rvw-undo" title="' + T.tipUndo + '">' + ICONS.undo + '</button>' +
    '<span class="rvw-sep"></span>' +
    '<span class="rvw-group" id="rvw-actions"></span>' +
    '<button class="rvw-tool rvw-export" id="rvw-export" title="' + T.tipExport + '">' + ICONS.export + T.exportFb + '</button>' +
    '<span class="rvw-badge" id="rvw-count">0 ' + T.changes + '</span>' +
    '<span class="rvw-langsw" id="rvw-lang" title="Language / Ngôn ngữ">' +
    '<button data-lang="vi" class="' + (lang === 'vi' ? 'rvw-lon' : '') + '">' + FLAGS.vi + 'VI</button>' +
    '<button data-lang="en" class="' + (lang === 'en' ? 'rvw-lon' : '') + '">' + FLAGS.en + 'EN</button></span>' +
    '<span class="rvw-zoom"><button id="rvw-zout">−</button><span class="rvw-zval" id="rvw-zval">100%</span>' +
    '<button id="rvw-zin">+</button><button id="rvw-zfit" title="Fit" style="width:auto;padding:0 8px;font-size:11px;">Fit</button></span>';
  document.body.appendChild(topbar);

  var panel = document.createElement('div');
  panel.className = 'rvw-panel rvw';
  panel.innerHTML = '<h3>' + T.props + '</h3><div class="rvw-empty">' + T.emptyHint + '</div>';
  document.body.appendChild(panel);

  /* Kéo mở rộng panel Thuộc tính — field/nút bị wrap xấu khi panel quá hẹp (feedback 2026-08-05) */
  var PANEL_W_MIN = 220, PANEL_W_MAX = 520;
  var panelW = Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, parseInt(localStorage.getItem('rvw-panel-w'), 10) || 248));
  panel.style.width = panelW + 'px';
  var panelResize = document.createElement('div');
  panelResize.className = 'rvw-panel-resize rvw';
  document.body.appendChild(panelResize);
  function updatePanelResizeHandle() { panelResize.style.right = (panel.offsetWidth - 4) + 'px'; }
  updatePanelResizeHandle();
  (function () {
    var dragging = null;
    panelResize.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragging = { sx: e.clientX, w0: panel.offsetWidth };
      panelResize.classList.add('rvw-dragging');
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var w = Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, dragging.w0 + (dragging.sx - e.clientX)));
      panel.style.width = w + 'px';
      updatePanelResizeHandle();
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = null;
      panelResize.classList.remove('rvw-dragging');
      localStorage.setItem('rvw-panel-w', parseInt(panel.style.width, 10));
    });
  })();

  /* ---------- Layers panel (trái): cây phân lớp, chọn đúng element, ẩn/hiện ---------- */
  var EYE_OPEN = '<svg viewBox="0 0 16 16"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 16 16"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><path d="M3 13L13 3"/></svg>';
  var LAYER_NAMES = T.layerNames;
  // Node đáng hiện trong tree: media, có chữ trực tiếp, hoặc chứa media/chữ bên trong
  function isInterestingNode(el) {
    if (classOf(el).indexOf('rvw-') >= 0) return false;
    if (/^(IMG|SVG|VIDEO|CANVAS|PICTURE)$/i.test(el.tagName)) return true;
    return hasDirectText(el);
  }
  var elRow = new Map();

  var layersPanel = document.createElement('div');
  layersPanel.className = 'rvw-layers rvw';
  layersPanel.innerHTML = '<h3>' + T.layersTitle + '</h3>';
  var treeBox = document.createElement('div');
  layersPanel.appendChild(treeBox);
  document.body.appendChild(layersPanel);

  function layerName(el) {
    for (var i = 0; i < el.classList.length; i++) {
      if (LAYER_NAMES[el.classList[i]]) return LAYER_NAMES[el.classList[i]];
    }
    var cls = Array.prototype.slice.call(el.classList).filter(function (c) { return c.indexOf('rvw-') !== 0; });
    return cls.length ? cls.slice(0, 2).join(' ') : el.tagName.toLowerCase();
  }

  function buildNode(el, depth, container) {
    var kids = Array.prototype.filter.call(el.children, function (c) {
      if (classOf(c).indexOf('rvw-') >= 0) return false;
      return isInterestingNode(c) ||
        (c.querySelector && c.querySelector('img,svg,video,canvas,picture')) ||
        (c.textContent && c.textContent.trim());
    });
    var row = document.createElement('div');
    row.className = 'rvw-lrow';
    row.style.paddingLeft = (6 + depth * 14) + 'px';
    row.innerHTML = '<span class="rvw-chev' + (kids.length ? '' : ' rvw-leaf') + '"></span>' +
      '<span class="rvw-lname"></span><span class="rvw-eye">' + EYE_OPEN + '</span>';
    row.querySelector('.rvw-lname').textContent = layerName(el);
    container.appendChild(row);
    elRow.set(el, row);

    var kidsBox = null;
    if (kids.length) {
      kidsBox = document.createElement('div');
      kidsBox.className = 'rvw-lkids';
      container.appendChild(kidsBox);
      kids.forEach(function (k) { buildNode(k, depth + 1, kidsBox); });
    }
    row.querySelector('.rvw-chev').addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (kidsBox) { kidsBox.classList.toggle('rvw-collapsed'); row.classList.toggle('rvw-closed'); }
    });
    row.querySelector('.rvw-eye').addEventListener('click', function (ev) {
      ev.stopPropagation();
      var hidden = el.style.visibility === 'hidden';
      el.style.visibility = hidden ? '' : 'hidden';
      row.classList.toggle('rvw-lhidden', !hidden);
      this.innerHTML = hidden ? EYE_OPEN : EYE_OFF;
      refreshBoxes();
    });
    row.addEventListener('click', function () { select(el); });
  }
  Array.prototype.forEach.call(frame.children, function (l) {
    if (l.classList && /^layer-/.test(l.classList[0] || '')) buildNode(l, 0, treeBox);
  });

  var selbox = document.createElement('div');
  selbox.className = 'rvw-selbox';
  selbox.style.display = 'none';
  selbox.innerHTML = '<div class="rvw-rotline"></div><div class="rvw-h rot" title="' + T.tipRotHandle + '"></div>' +
    '<div class="rvw-h nw"></div><div class="rvw-h ne"></div><div class="rvw-h sw"></div><div class="rvw-h se"></div>';
  document.body.appendChild(selbox);

  var hoverbox = document.createElement('div');
  hoverbox.className = 'rvw-hoverbox';
  hoverbox.style.display = 'none';
  document.body.appendChild(hoverbox);

  /* Snap & alignment guides */
  var snapOn = true;
  var guideV = document.createElement('div'); guideV.className = 'rvw-guide rvw-gv'; document.body.appendChild(guideV);
  var guideH = document.createElement('div'); guideH.className = 'rvw-guide rvw-gh'; document.body.appendChild(guideH);
  function hideGuides() { guideV.style.display = 'none'; guideH.style.display = 'none'; }
  document.getElementById('rvw-snap').onclick = function () {
    snapOn = !snapOn;
    this.classList.toggle('rvw-active', snapOn);
    if (!snapOn) hideGuides();
  };

  /* ================= canvas navigation: pan (Space/chuột giữa) + wheel zoom ================= */
  var panX = 0, panY = 0, panning = null, spaceDown = false;
  function applyPan() {
    frame.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
    refreshBoxes();
  }
  function isEditableTarget(t) {
    return t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName);
  }
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && !isEditableTarget(e.target) && !spaceDown) {
      spaceDown = true;
      document.body.classList.add('rvw-space');
      e.preventDefault(); // chặn page scroll
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space') {
      spaceDown = false;
      document.body.classList.remove('rvw-space');
    }
  });
  document.addEventListener('mousedown', function (e) {
    if (!(spaceDown || e.button === 1)) return;
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note')) return;
    e.preventDefault();
    panning = { sx: e.clientX, sy: e.clientY, x0: panX, y0: panY };
    document.body.classList.add('rvw-panning');
  });
  document.addEventListener('mousemove', function (e) {
    if (!panning) return;
    panX = panning.x0 + (e.clientX - panning.sx);
    panY = panning.y0 + (e.clientY - panning.sy);
    applyPan();
  });
  document.addEventListener('mouseup', function () {
    if (panning) { panning = null; document.body.classList.remove('rvw-panning'); }
  });
  // Wheel: Ctrl = zoom neo tại con trỏ · thường = pan dọc · Shift = pan ngang
  document.addEventListener('wheel', function (e) {
    if (e.target.closest('.rvw-panel,.rvw-layers,.rvw-note')) return; // panel giữ scroll gốc
    e.preventDefault();
    if (e.ctrlKey) {
      var oldZoom = zoom;
      var before = frame.getBoundingClientRect();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
      var r = zoom / oldZoom;
      var after = frame.getBoundingClientRect();
      panX += (e.clientX - (e.clientX - before.left) * r) - after.left;
      panY += (e.clientY - (e.clientY - before.top) * r) - after.top;
      applyPan();
    } else if (e.shiftKey) {
      panX -= e.deltaY; applyPan();
    } else {
      panX -= e.deltaX; panY -= e.deltaY; applyPan();
    }
  }, { passive: false });

  /* ================= helpers ================= */
  function selectorOf(el) {
    if (el.id) return '#' + el.id;
    var cls = Array.prototype.slice.call(el.classList).filter(function (c) { return c.indexOf('rvw-') !== 0; }).join('.');
    var base = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    var p = el.parentElement;
    if (p && p !== document.body) {
      var same = Array.prototype.filter.call(p.children, function (s) { return s.tagName === el.tagName; });
      if (same.length > 1) base += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
    }
    return base;
  }
  function shortName(el) {
    var s = selectorOf(el);
    return s.length > 34 ? s.slice(0, 34) + '…' : s;
  }
  function frameRect() { return frame.getBoundingClientRect(); }
  function pctX(px) { return (px / frameRect().width * 100); }
  function pctY(px) { return (px / frameRect().height * 100); }
  function updateCount() {
    var n = Object.keys(changes.texts).length + Object.keys(changes.moves).length +
      Object.keys(changes.props).length + changes.pins.length;
    document.getElementById('rvw-count').textContent = n + ' ' + T.changes;
  }
  function isText(el) { return isTextEl(el); }

  /* ================= zoom ================= */
  function setZoom(z) {
    zoom = Math.min(2, Math.max(0.15, z));
    frame.style.zoom = zoom;
    document.getElementById('rvw-zval').textContent = Math.round(zoom * 100) + '%';
    refreshBoxes();
  }
  function fitZoom() {
    frame.style.zoom = 1;
    if (typeof panX !== 'undefined') { panX = 0; panY = 0; frame.style.transform = ''; }
    var vw = window.innerWidth - 244 - 272, vh = window.innerHeight - 64 - 48;
    setZoom(Math.min(1, vw / frame.offsetWidth, vh / frame.offsetHeight));
  }
  document.getElementById('rvw-zin').onclick = function () { setZoom(zoom + 0.1); };
  document.getElementById('rvw-zout').onclick = function () { setZoom(zoom - 0.1); };
  document.getElementById('rvw-zfit').onclick = fitZoom;
  fitZoom();

  /* ================= selection ================= */
  var extraBoxes = [];
  function refreshBoxes() {
    if (selected && document.contains(selected)) {
      var r = selected.getBoundingClientRect();
      selbox.style.display = 'block';
      selbox.style.left = r.left + 'px'; selbox.style.top = r.top + 'px';
      selbox.style.width = r.width + 'px'; selbox.style.height = r.height + 'px';
    } else selbox.style.display = 'none';
    // Box phụ cho các element chọn thêm (viền mảnh, không handle)
    // Guard: refreshBoxes được gọi từ fitZoom() lúc init, TRƯỚC khi extraBoxes kịp gán []
    if (!extraBoxes) extraBoxes = [];
    extraBoxes.forEach(function (b) { b.remove(); });
    extraBoxes = [];
    (typeof extraSel !== 'undefined' ? extraSel : []).forEach(function (m) {
      if (!document.contains(m)) return;
      var rm = m.getBoundingClientRect();
      var b = document.createElement('div');
      b.className = 'rvw-selbox rvw-selbox-extra';
      b.style.left = rm.left + 'px'; b.style.top = rm.top + 'px';
      b.style.width = rm.width + 'px'; b.style.height = rm.height + 'px';
      document.body.appendChild(b);
      extraBoxes.push(b);
    });
  }
  window.addEventListener('scroll', refreshBoxes, true);
  window.addEventListener('resize', refreshBoxes);

  function renderPanel() {
    if (!selected) {
      panel.innerHTML = '<h3>' + T.props + '</h3><div class="rvw-empty">' + T.emptyHint + '</div>';
      return;
    }
    var el = selected, fr = frameRect(), r = el.getBoundingClientRect();
    var x = pctX(r.left - fr.left).toFixed(1), y = pctY(r.top - fr.top).toFixed(1);
    var w = pctX(r.width).toFixed(1), h = pctY(r.height).toFixed(1);
    if (extraSel.length) {
      panel.innerHTML = '<h3>' + T.props + '</h3><div class="rvw-elname">' + (extraSel.length + 1) + T.multiSel + '</div>' +
        '<div class="rvw-empty">' + T.multiHint + '</div>';
      return;
    }
    var st = getState(el);
    var op = Math.round((parseFloat(getComputedStyle(el).opacity) || 1) * 100);
    // Nhóm theo section kiểu Figma sidebar (Position / Layout / Appearance / Typography)
    var html = '<h3>Thuộc tính</h3><div class="rvw-elname">' + shortName(el) + '</div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secPosition + '</div><div class="rvw-fields">' +
      '<div class="rvw-field"><label>X (%)</label><input id="rvw-x" type="number" step="0.5" value="' + x + '"></div>' +
      '<div class="rvw-field"><label>Y (%)</label><input id="rvw-y" type="number" step="0.5" value="' + y + '"></div>' +
      '<div class="rvw-field rvw-wide"><label>' + T.rot + '</label><input id="rvw-rot" type="number" step="1" value="' + st.rot + '"></div>' +
      '</div></div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secLayout + '</div><div class="rvw-fields">' +
      '<div class="rvw-field"><label>W (%)</label><input id="rvw-w" type="number" step="0.5" value="' + w + '"></div>' +
      '<div class="rvw-field"><label>H (%)</label><input id="rvw-h" type="number" step="0.5" value="' + h + '"></div>' +
      '</div></div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secAppearance + '</div><div class="rvw-fields">' +
      '<div class="rvw-field rvw-wide"><label>' + T.op + '</label><input id="rvw-op" type="number" min="0" max="100" step="5" value="' + op + '"></div>' +
      '<div class="rvw-field rvw-wide rvw-btnrow">' +
      '<button id="rvw-fliph">' + T.flipH + '</button><button id="rvw-flipv">' + T.flipV + '</button>' +
      '<button id="rvw-zup">' + T.zUp + '</button><button id="rvw-zdown">' + T.zDown + '</button></div>' +
      '</div></div>';
    if (isText(el)) {
      var fs = parseFloat(getComputedStyle(el).fontSize);
      var curAlign = getComputedStyle(el).textAlign;
      if (curAlign === 'start' || curAlign === '') curAlign = 'left';
      html += '<div class="rvw-section"><div class="rvw-sectitle">' + T.secTypography + '</div><div class="rvw-fields">' +
        '<div class="rvw-field rvw-wide"><label>' + T.fs + '</label><input id="rvw-fs" type="number" step="1" value="' + Math.round(fs) + '"></div>' +
        '<div class="rvw-field rvw-wide"><label>' + T.align + '</label></div>' +
        '<div class="rvw-field rvw-wide rvw-btnrow3">' +
        '<button id="rvw-al-left" title="' + T.alLeft + '" class="' + (curAlign === 'left' ? 'rvw-on' : '') + '">' + ICONS.alignLeft + '</button>' +
        '<button id="rvw-al-center" title="' + T.alCenter + '" class="' + (curAlign === 'center' ? 'rvw-on' : '') + '">' + ICONS.alignCenter + '</button>' +
        '<button id="rvw-al-right" title="' + T.alRight + '" class="' + (curAlign === 'right' ? 'rvw-on' : '') + '">' + ICONS.alignRight + '</button></div>' +
        '<div class="rvw-field rvw-wide"><label>' + T.content + '</label><textarea id="rvw-text">' + el.textContent.trim() + '</textarea></div>' +
        '</div></div>';
    }
    panel.innerHTML = html;

    function apply(prop, cb) {
      var inp = document.getElementById(prop);
      if (inp) inp.addEventListener('input', function (ev) {
        // snapshot 1 lần cho mỗi phiên sửa input (không spam stack theo từng phím)
        if (!inp.dataset.rvwPushed) { pushUndo(el); inp.dataset.rvwPushed = '1'; }
        cb.call(inp, ev);
      });
    }
    apply('rvw-x', function () { moveTo(parseFloat(this.value), null); }.bind(document.getElementById('rvw-x')));
    apply('rvw-y', function () { moveTo(null, parseFloat(this.value)); }.bind(document.getElementById('rvw-y')));
    apply('rvw-w', function () {
      // % nhập theo khung → quy về px layout để đúng với mọi element con
      el.style.width = (parseFloat(this.value) / 100 * frame.offsetWidth).toFixed(0) + 'px';
      recordMove(el); refreshBoxes();
    }.bind(document.getElementById('rvw-w')));
    apply('rvw-h', function () {
      el.style.height = (parseFloat(this.value) / 100 * frame.offsetHeight).toFixed(0) + 'px';
      recordMove(el); refreshBoxes();
    }.bind(document.getElementById('rvw-h')));
    apply('rvw-rot', function () {
      getState(el).rot = parseFloat(this.value) || 0;
      applyTransform(el); refreshBoxes();
    }.bind(document.getElementById('rvw-rot')));
    apply('rvw-op', function () {
      var v = Math.min(100, Math.max(0, parseFloat(this.value) || 0)) / 100;
      el.style.opacity = v;
      recordProp(el, 'opacity', v); refreshBoxes();
    }.bind(document.getElementById('rvw-op')));
    var bh = document.getElementById('rvw-fliph');
    if (bh) bh.onclick = function () { pushUndo(el); var s = getState(el); s.fx = !s.fx; applyTransform(el); refreshBoxes(); };
    var bv = document.getElementById('rvw-flipv');
    if (bv) bv.onclick = function () { pushUndo(el); var s = getState(el); s.fy = !s.fy; applyTransform(el); refreshBoxes(); };
    var bu = document.getElementById('rvw-zup');
    if (bu) bu.onclick = function () {
      pushUndo(el);
      var z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
      el.style.zIndex = z + 1; recordProp(el, 'zIndex', z + 1);
    };
    var bd = document.getElementById('rvw-zdown');
    if (bd) bd.onclick = function () {
      pushUndo(el);
      var z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
      el.style.zIndex = z - 1; recordProp(el, 'zIndex', z - 1);
    };
    apply('rvw-fs', function () {
      el.style.fontSize = parseInt(this.value, 10) + 'px';
      recordProp(el, 'fontSize', parseInt(this.value, 10) + 'px');
      refreshBoxes();
    }.bind(document.getElementById('rvw-fs')));
    ['left', 'center', 'right'].forEach(function (al) {
      var b = document.getElementById('rvw-al-' + al);
      if (!b) return;
      b.onclick = function () {
        pushUndo(el);
        el.style.textAlign = al;
        recordProp(el, 'textAlign', al);
        refreshBoxes(); renderPanel();
      };
    });
    apply('rvw-text', function () {
      var sel = selectorOf(el);
      if (!(sel in changes.texts)) changes.texts[sel] = { before: el.textContent.trim(), after: '' };
      el.textContent = this.value;
      changes.texts[sel].after = this.value.trim();
      updateCount(); refreshBoxes();
    }.bind(document.getElementById('rvw-text')));
  }

  /* Di chuyển trong hệ tọa độ của CHÍNH element (px, chia zoom) — không dùng % của
     frame vì element con định vị theo cha (slot/block), % frame làm nó teleport.
     Element static (chữ trong flow) → tự chuyển position:relative để dời được. */
  function ensurePositioned(el) {
    var cs = getComputedStyle(el);
    if (cs.position === 'static') { el.style.position = 'relative'; return; }
    // Element absolute neo bằng left+right (hoặc top+bottom) không có width/height tường minh:
    // khi drag ta set right/bottom = auto → mất neo → co lại ôm content ("hug", bug 2026-08-05).
    // Đóng băng kích thước hiện tại trước khi thả neo — đúng hành vi Figma: move không đổi size.
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      var dz = zoom || 1;
      var r = el.getBoundingClientRect();
      if (!el.style.width) el.style.width = (r.width / dz).toFixed(1) + 'px';
      if (!el.style.height) el.style.height = (r.height / dz).toFixed(1) + 'px';
    }
  }
  function moveTo(xPct, yPct) {
    if (!selected) return;
    var el = selected, fr = frameRect(), r = el.getBoundingClientRect(), dz = zoom || 1;
    ensurePositioned(el);
    var cs = getComputedStyle(el);
    var l = parseFloat(cs.left) || 0, t = parseFloat(cs.top) || 0;
    if (xPct !== null && !isNaN(xPct)) l += (fr.left + xPct / 100 * fr.width - r.left) / dz;
    if (yPct !== null && !isNaN(yPct)) t += (fr.top + yPct / 100 * fr.height - r.top) / dz;
    el.style.left = l.toFixed(1) + 'px'; el.style.top = t.toFixed(1) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    recordMove(el); refreshBoxes();
  }
  function recordMove(el) {
    changes.moves[selectorOf(el)] = {
      position: el.style.position || undefined,
      left: el.style.left, top: el.style.top,
      width: el.style.width || undefined,
      height: el.style.height || undefined
    };
    updateCount();
  }
  function recordProp(el, key, val) {
    var sel = selectorOf(el);
    if (!changes.props[sel]) changes.props[sel] = {};
    changes.props[sel][key] = val;
    updateCount();
  }

  /* Xoay/lật: compose lên transform gốc của element (giữ translateX(-50%) v.v.) */
  var elState = new Map();
  function getState(el) {
    if (!elState.has(el)) elState.set(el, { rot: 0, fx: false, fy: false, scale: 1 });
    return elState.get(el);
  }
  function applyTransform(el) {
    var s = getState(el);
    if (el.dataset.rvwBase === undefined) {
      var cs = getComputedStyle(el);
      var base = el.style.transform || (cs.transform !== 'none' ? cs.transform : '');
      // getComputedStyle luôn resolve transform về matrix() — translateX(-50%) canh giữa
      // (title-group, qr-card...) bị đóng băng thành px TĨNH trong tx/ty. Nếu giữ nguyên,
      // mọi lần xoay/scale sau đó compose lên px tĩnh này → lệch vị trí khi kích thước đổi
      // (bug 2026-08-05: "scale đường chéo không work"). Tách tx/ty ra, dồn vào left/top,
      // base chỉ giữ phần xoay/scale (matrix a,b,c,d) — tx/ty luôn = 0.
      var mm = /matrix\(([^)]+)\)/.exec(base);
      if (mm) {
        var p = mm[1].split(',').map(function (n) { return parseFloat(n); });
        var tx = p[4] || 0, ty = p[5] || 0;
        if (tx || ty) {
          ensurePositioned(el);
          var csL = getComputedStyle(el);
          el.style.left = ((parseFloat(csL.left) || 0) + tx).toFixed(1) + 'px';
          el.style.top = ((parseFloat(csL.top) || 0) + ty).toFixed(1) + 'px';
        }
        base = 'matrix(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + p[3] + ',0,0)';
      }
      el.dataset.rvwBase = base;
    }
    var t = el.dataset.rvwBase;
    if (s.rot) t += ' rotate(' + s.rot + 'deg)';
    if (s.fx) t += ' scaleX(-1)';
    if (s.fy) t += ' scaleY(-1)';
    if (s.scale && s.scale !== 1) t += ' scale(' + s.scale.toFixed(3) + ')';
    el.style.transform = t.trim();
    recordProp(el, 'transform', el.style.transform);
    recordProp(el, 'rotate', s.rot);
    recordProp(el, 'flipX', s.fx);
    recordProp(el, 'flipY', s.fy);
    recordProp(el, 'scale', s.scale);
  }

  /* ================= undo (Ctrl+Z) =================
     Snapshot style + textContent + entry changes của element trước mỗi mutation.
     Max bước theo RAM máy (navigator.deviceMemory GB → ~64 bước/GB, kẹp 50–500). */
  var MAX_UNDO = Math.min(500, Math.max(50, (navigator.deviceMemory || 4) * 64));
  var undoStack = [];
  function snapshotChanges(sel) {
    return {
      move: changes.moves[sel] ? JSON.parse(JSON.stringify(changes.moves[sel])) : undefined,
      prop: changes.props[sel] ? JSON.parse(JSON.stringify(changes.props[sel])) : undefined,
      text: changes.texts[sel] ? JSON.parse(JSON.stringify(changes.texts[sel])) : undefined
    };
  }
  function pushUndo(el) {
    var sel = selectorOf(el);
    undoStack.push({
      type: 'style', el: el, css: el.style.cssText,
      content: isText(el) ? el.textContent : null,
      state: JSON.parse(JSON.stringify(getState(el))),
      sel: sel, snap: snapshotChanges(sel)
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }
  function pushUndoPin(node) {
    undoStack.push({ type: 'pin', node: node });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }
  function doUndo() {
    var u = undoStack.pop();
    if (!u) return;
    if (u.type === 'pin') {
      u.node.remove();
      changes.pins.pop();
      pinCount = Math.max(0, pinCount - 1);
    } else {
      u.el.style.cssText = u.css;
      if (u.content !== null) u.el.textContent = u.content;
      elState.set(u.el, u.state);
      if (u.snap.move) changes.moves[u.sel] = u.snap.move; else delete changes.moves[u.sel];
      if (u.snap.prop) changes.props[u.sel] = u.snap.prop; else delete changes.props[u.sel];
      if (u.snap.text) changes.texts[u.sel] = u.snap.text; else delete changes.texts[u.sel];
      var lrow = elRow.get(u.el);
      if (lrow) {
        var hid = u.el.style.visibility === 'hidden';
        lrow.classList.toggle('rvw-lhidden', hid);
        lrow.querySelector('.rvw-eye').innerHTML = hid ? EYE_OFF : EYE_OPEN;
      }
    }
    updateCount(); refreshBoxes(); renderPanel();
  }
  document.getElementById('rvw-undo').onclick = doUndo;
  document.getElementById('rvw-undo').title = T.tipUndo + ' · ' + MAX_UNDO + T.undoMax;
  /* Multi-select: selected = primary, extraSel = các element chọn thêm (Shift+click / marquee) */
  var extraSel = [];
  function selectionAll() {
    return (selected ? [selected] : []).concat(extraSel).filter(function (m) { return document.contains(m); });
  }
  // Loại element lồng nhau khỏi nhóm kéo (con di chuyển theo cha → kéo cả 2 = dịch gấp đôi)
  function pruneNested(list) {
    return list.filter(function (el) {
      return !list.some(function (other) { return other !== el && other.contains(el); });
    });
  }
  function select(el, keepExtras) {
    selected = el;
    if (!keepExtras) extraSel = [];
    refreshBoxes(); renderPanel();
    // Sync highlight với Layers panel (primary + extras)
    layersPanel.querySelectorAll('.rvw-lactive').forEach(function (r) { r.classList.remove('rvw-lactive'); });
    selectionAll().forEach(function (m) {
      if (elRow.has(m)) elRow.get(m).classList.add('rvw-lactive');
    });
    if (el && elRow.has(el)) elRow.get(el).scrollIntoView({ block: 'nearest' });
  }

  /* ================= mouse: hover / drag / click ================= */
  var drag = null, resizing = null, rotating = null;

  document.addEventListener('mousemove', function (e) {
    if (mode !== 'select' || drag || resizing) { hoverbox.style.display = 'none'; }
    else {
      var t = null;
      if (!(e.target.closest && e.target.closest('.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note,.rvw-pin'))) {
        var dh = pickAtPoint(e.clientX, e.clientY);
        if (dh) {
          var mh = selectionAll();
          for (var mhi = 0; mhi < mh.length; mhi++) if (mh[mhi].contains(dh)) { t = mh[mhi]; break; }
          if (!t) t = outerGroup(dh);
        }
      }
      if (t && t !== selected) {
        var r = t.getBoundingClientRect();
        hoverbox.style.display = 'block';
        hoverbox.style.left = r.left + 'px'; hoverbox.style.top = r.top + 'px';
        hoverbox.style.width = r.width + 'px'; hoverbox.style.height = r.height + 'px';
      } else hoverbox.style.display = 'none';
    }
    if (selq && selqBox) {
      selqBox.style.left = Math.min(selq.sx, e.clientX) + 'px';
      selqBox.style.top = Math.min(selq.sy, e.clientY) + 'px';
      selqBox.style.width = Math.abs(e.clientX - selq.sx) + 'px';
      selqBox.style.height = Math.abs(e.clientY - selq.sy) + 'px';
      if (Math.abs(e.clientX - selq.sx) > 4 || Math.abs(e.clientY - selq.sy) > 4) selq.moved = true;
    }
    if (drag) {
      if (!drag.moved) drag.members.forEach(function (m) { pushUndo(m.el); }); // snapshot cả nhóm trước lần dịch đầu
      var dz = zoom || 1;
      var vdx = e.clientX - drag.sx, vdy = e.clientY - drag.sy;
      var adjX = 0, adjY = 0;
      hideGuides();
      if (snapOn && !e.altKey && drag.xs) {
        var TH = 6; // ngưỡng hít (px màn hình)
        var pl = drag.r0.left + vdx, pcx = pl + drag.r0.width / 2, pr = pl + drag.r0.width;
        var bestX = null;
        [pl, pcx, pr].forEach(function (cand) {
          drag.xs.forEach(function (tx) {
            var d = tx - cand;
            if (Math.abs(d) <= TH && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d: d, at: tx };
          });
        });
        var pt2 = drag.r0.top + vdy, pcy = pt2 + drag.r0.height / 2, pb = pt2 + drag.r0.height;
        var bestY = null;
        [pt2, pcy, pb].forEach(function (cand) {
          drag.ys.forEach(function (ty) {
            var d = ty - cand;
            if (Math.abs(d) <= TH && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d: d, at: ty };
          });
        });
        var frv = frameRect();
        if (bestX) {
          adjX = bestX.d;
          guideV.style.display = 'block';
          guideV.style.left = bestX.at + 'px';
          guideV.style.top = frv.top + 'px'; guideV.style.height = frv.height + 'px';
        }
        if (bestY) {
          adjY = bestY.d;
          guideH.style.display = 'block';
          guideH.style.top = bestY.at + 'px';
          guideH.style.left = frv.left + 'px'; guideH.style.width = frv.width + 'px';
        }
      }
      drag.members.forEach(function (m) {
        m.el.style.left = (m.l + (vdx + adjX) / dz).toFixed(1) + 'px';
        m.el.style.top = (m.t0 + (vdy + adjY) / dz).toFixed(1) + 'px';
        m.el.style.right = 'auto'; m.el.style.bottom = 'auto';
      });
      drag.moved = true;
      refreshBoxes();
    }
    if (resizing) {
      var dz2 = zoom || 1;
      var rdx = (e.clientX - resizing.sx) / dz2;
      var rdy = (e.clientY - resizing.sy) / dz2;
      var diag0 = Math.sqrt(resizing.w * resizing.w + resizing.h * resizing.h) || 1;
      var delta = (rdx + rdy) / Math.SQRT2; // chiếu delta chuột lên đường chéo handle
      var factor = Math.max(0.05, (diag0 + delta) / diag0);
      // scale = transform, KHÔNG đổi width/height: đổi box size không phóng to chữ/icon
      // bên trong group flex (vd .chips) — chỉ tạo khoảng trống, nhìn như "chỉ dãn ngang"
      // (bug 2026-08-05). transform:scale() phóng to đều toàn bộ nội dung, giống Figma.
      getState(resizing.el).scale = Math.max(0.05, resizing.scale0 * factor);
      applyTransform(resizing.el);
      refreshBoxes();
    }
    if (rotating) {
      var ang = Math.atan2(e.clientY - rotating.cy, e.clientX - rotating.cx) * 180 / Math.PI + 90;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      getState(rotating.el).rot = Math.round(ang * 10) / 10;
      applyTransform(rotating.el);
      refreshBoxes();
    }
  });

  document.addEventListener('mousedown', function (e) {
    if (spaceDown || e.button === 1) return; // đang pan canvas
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note')) return;
    if (e.target.classList.contains('rot')) {
      e.preventDefault();
      pushUndo(selected);
      var rr = selected.getBoundingClientRect();
      rotating = { el: selected, cx: rr.left + rr.width / 2, cy: rr.top + rr.height / 2 };
      return;
    }
    if (e.target.classList.contains('se')) {
      e.preventDefault();
      pushUndo(selected);
      ensurePositioned(selected);
      var rse = selected.getBoundingClientRect();
      var dzse = zoom || 1;
      resizing = {
        el: selected, sx: e.clientX, sy: e.clientY,
        w: rse.width / dzse, h: rse.height / dzse,
        scale0: getState(selected).scale || 1
      };
      return;
    }
    if (mode !== 'select') return;
    // Select model kiểu Figma:
    //  - Ctrl/Cmd+click → deep select · Shift+click → thêm/bớt vào nhóm
    //  - click member của nhóm = kéo CẢ NHÓM · click vùng trống = quét marquee chọn nhiều
    var deep = pickAtPoint(e.clientX, e.clientY);
    var t = null;
    if (e.ctrlKey || e.metaKey) t = deep; // deep-select: element solid sâu nhất dưới chuột
    else if (deep) {
      var members0 = selectionAll();
      for (var mi = 0; mi < members0.length; mi++) {
        if (members0[mi] === deep || members0[mi].contains(deep)) { t = members0[mi]; break; }
      }
      if (!t) t = outerGroup(deep);
    }
    if (!t || e.target.isContentEditable) {
      if (!t) startMarquee(e);
      return;
    }
    e.preventDefault();
    // Shift+click: toggle membership trong nhóm
    if (e.shiftKey && selected && t !== selected) {
      var ix = extraSel.indexOf(t);
      if (ix >= 0) extraSel.splice(ix, 1); else extraSel.push(t);
      refreshBoxes(); renderPanel(); select(selected, true);
      return;
    }
    select(t, selectionAll().indexOf(t) >= 0);
    var members = pruneNested(selectionAll());
    members.forEach(ensurePositioned);
    // Thu thập mốc snap: mép/tâm frame + mép/tâm các element NGOÀI nhóm
    var r0 = t.getBoundingClientRect(), fr0 = frameRect();
    var xs = [fr0.left, fr0.left + fr0.width / 2, fr0.right];
    var ys = [fr0.top, fr0.top + fr0.height / 2, fr0.bottom];
    topLevelElements().forEach(function (o) {
      if (members.some(function (m) { return m === o || m.contains(o) || o.contains(m); })) return;
      if (getComputedStyle(o).visibility === 'hidden') return;
      var ro = o.getBoundingClientRect();
      if (!ro.width && !ro.height) return;
      xs.push(ro.left, ro.left + ro.width / 2, ro.right);
      ys.push(ro.top, ro.top + ro.height / 2, ro.bottom);
    });
    drag = {
      el: t, sx: e.clientX, sy: e.clientY, r0: r0, xs: xs, ys: ys,
      members: members.map(function (m) {
        var c = getComputedStyle(m);
        return { el: m, l: parseFloat(c.left) || 0, t0: parseFloat(c.top) || 0 };
      })
    };
  });

  /* Marquee select trên vùng trống */
  var selq = null, selqBox = null;
  function startMarquee(e) {
    selq = { sx: e.clientX, sy: e.clientY, moved: false };
    selqBox = document.createElement('div');
    selqBox.className = 'rvw-marquee';
    selqBox.style.left = e.clientX + 'px'; selqBox.style.top = e.clientY + 'px';
    document.body.appendChild(selqBox);
  }

  document.addEventListener('mouseup', function (e) {
    // Chỉ record khi thật sự kéo — click suông không tạo move rác (left/top rỗng)
    if (drag) {
      if (drag.moved) drag.members.forEach(function (m) { recordMove(m.el); });
      renderPanel(); drag = null; hideGuides();
    }
    if (resizing) { recordMove(resizing.el); renderPanel(); resizing = null; }
    if (rotating) { renderPanel(); rotating = null; }
    if (selq) {
      if (selqBox) { selqBox.remove(); selqBox = null; }
      if (selq.moved) {
        // Hit-test: chọn mọi element giao với vùng quét (bỏ cặp lồng nhau)
        var rl = Math.min(selq.sx, e.clientX), rt = Math.min(selq.sy, e.clientY);
        var rr2 = Math.max(selq.sx, e.clientX), rb = Math.max(selq.sy, e.clientY);
        var hits = [];
        topLevelElements().forEach(function (o) {
          if (getComputedStyle(o).visibility === 'hidden') return;
          var ro = o.getBoundingClientRect();
          if (!ro.width && !ro.height) return;
          if (ro.left < rr2 && ro.right > rl && ro.top < rb && ro.bottom > rt) hits.push(o);
        });
        hits = pruneNested(hits);
        if (hits.length) {
          extraSel = hits.slice(1);
          select(hits[0], true);
        } else select(null);
      } else select(null);
      selq = null;
    }
  });

  /* ================= inline text edit ================= */
  function startEdit(el) {
    pushUndo(el);
    var sel = selectorOf(el);
    if (!(sel in changes.texts)) changes.texts[sel] = { before: el.textContent.trim(), after: '' };
    el.setAttribute('contenteditable', 'true');
    el.classList.add('rvw-editing');
    el.focus();
    var done = function () {
      el.removeAttribute('contenteditable');
      el.classList.remove('rvw-editing');
      changes.texts[sel].after = el.textContent.trim();
      if (changes.texts[sel].after === changes.texts[sel].before) delete changes.texts[sel];
      updateCount(); renderPanel();
      el.removeEventListener('blur', done);
    };
    el.addEventListener('blur', done);
  }

  // Double-click kiểu Figma: drill sâu vào group 1 cấp mỗi lần;
  // đã chọn đúng text element rồi thì double-click = vào chế độ sửa chữ
  document.addEventListener('dblclick', function (e) {
    if (mode !== 'select') return;
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-note,.rvw-pin,.rvw-region')) return;
    e.preventDefault();
    var deep = pickAtPoint(e.clientX, e.clientY);
    if (!deep) return;
    if (selected === deep && isTextEl(deep)) { startEdit(deep); return; }
    if (selected && selected !== deep && selected.contains(deep)) {
      var n = deep;
      while (n && n.parentElement !== selected) n = n.parentElement;
      if (n) { select(n); return; }
    }
    if (isTextEl(deep)) { select(deep); startEdit(deep); return; }
    select(outerGroup(deep));
  });

  /* ================= comment mode ================= */
  function setMode(m) {
    mode = m;
    document.getElementById('rvw-mode-select').classList.toggle('rvw-active', m === 'select');
    document.getElementById('rvw-mode-comment').classList.toggle('rvw-active', m === 'comment');
    document.body.classList.toggle('rvw-comment', m === 'comment');
    if (m !== 'select') { select(null); hoverbox.style.display = 'none'; }
  }
  document.getElementById('rvw-mode-select').onclick = function () { setMode('select'); };
  document.getElementById('rvw-mode-comment').onclick = function () { setMode('comment'); };
  document.getElementById('rvw-lang').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-lang]');
    if (!b || b.dataset.lang === lang) return;
    localStorage.setItem('rvw-lang', b.dataset.lang);
    location.reload();
  });

  /* Comment: click = pin điểm · kéo = khoanh vùng (region) */
  var cdrag = null, marquee = null;

  function addComment(x, y, w, h, clientX, clientY) {
    var note = document.createElement('div');
    note.className = 'rvw-note rvw';
    note.style.left = Math.min(clientX, window.innerWidth - 260) + 'px';
    note.style.top = Math.min(clientY + 10, window.innerHeight - 150) + 'px';
    note.innerHTML = '<textarea placeholder="' + (w ? T.noteRegion : T.notePoint) + '"></textarea>' +
      '<div class="rvw-actions"><button class="rvw-cancel">' + T.cancel + '</button><button class="rvw-save">' + T.saveNote + '</button></div>';
    document.body.appendChild(note);
    note.querySelector('textarea').focus();
    note.querySelector('.rvw-cancel').onclick = function () { note.remove(); };
    note.querySelector('.rvw-save').onclick = function () {
      var txt = note.querySelector('textarea').value.trim();
      note.remove();
      if (!txt) return;
      pinCount++;
      if (w > 0) {
        var rg = document.createElement('div');
        rg.className = 'rvw-region';
        rg.style.left = x + '%'; rg.style.top = y + '%';
        rg.style.width = w + '%'; rg.style.height = h + '%';
        var badge = document.createElement('span');
        badge.className = 'rvw-region-n';
        badge.textContent = pinCount;
        badge.dataset.n = pinCount; badge.dataset.note = txt;
        rg.appendChild(badge);
        frame.appendChild(rg);
        pushUndoPin(rg);
        changes.pins.push({ n: pinCount, type: 'region', x: x + '%', y: y + '%', w: w + '%', h: h + '%', note: txt });
      } else {
        var pin = document.createElement('div');
        pin.className = 'rvw-pin';
        pin.style.left = x + '%'; pin.style.top = y + '%';
        pin.textContent = pinCount;
        pin.dataset.n = pinCount; pin.dataset.note = txt;
        frame.appendChild(pin);
        pushUndoPin(pin);
        changes.pins.push({ n: pinCount, type: 'point', x: x + '%', y: y + '%', note: txt });
      }
      updateCount();
    };
  }

  document.addEventListener('mousedown', function (e) {
    if (mode !== 'comment') return;
    if (spaceDown || e.button === 1) return; // đang pan canvas
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-note,.rvw-pin,.rvw-region')) return;
    var fr = frameRect();
    if (e.clientX < fr.left || e.clientX > fr.right || e.clientY < fr.top || e.clientY > fr.bottom) return;
    e.preventDefault();
    cdrag = { sx: e.clientX, sy: e.clientY };
    marquee = document.createElement('div');
    marquee.className = 'rvw-marquee';
    marquee.style.left = e.clientX + 'px'; marquee.style.top = e.clientY + 'px';
    document.body.appendChild(marquee);
  });

  document.addEventListener('mousemove', function (e) {
    if (!cdrag || !marquee) return;
    marquee.style.left = Math.min(cdrag.sx, e.clientX) + 'px';
    marquee.style.top = Math.min(cdrag.sy, e.clientY) + 'px';
    marquee.style.width = Math.abs(e.clientX - cdrag.sx) + 'px';
    marquee.style.height = Math.abs(e.clientY - cdrag.sy) + 'px';
  });

  document.addEventListener('mouseup', function (e) {
    if (!cdrag) return;
    if (marquee) { marquee.remove(); marquee = null; }
    var fr = frameRect();
    var x1 = Math.min(cdrag.sx, e.clientX), y1 = Math.min(cdrag.sy, e.clientY);
    var wpx = Math.abs(e.clientX - cdrag.sx), hpx = Math.abs(e.clientY - cdrag.sy);
    var isRegion = wpx > 6 || hpx > 6;
    var x = +((x1 - fr.left) / fr.width * 100).toFixed(2);
    var y = +((y1 - fr.top) / fr.height * 100).toFixed(2);
    var w = +(wpx / fr.width * 100).toFixed(2);
    var h = +(hpx / fr.height * 100).toFixed(2);
    var cx = e.clientX, cy = e.clientY;
    cdrag = null;
    addComment(x, y, isRegion ? w : 0, isRegion ? h : 0, cx, cy);
  });

  /* Xem lại comment (Figma-style): click pin/badge → bubble hiện ghi chú ngay trên ảnh */
  var viewer = null;
  function hideNoteView() { if (viewer) { viewer.remove(); viewer = null; } }
  document.addEventListener('click', function (e) {
    var p = e.target.closest('.rvw-pin,.rvw-region-n');
    if (p && p.dataset.note) {
      hideNoteView();
      viewer = document.createElement('div');
      viewer.className = 'rvw-note rvw-note-view rvw';
      var r = p.getBoundingClientRect();
      viewer.style.left = Math.min(r.right + 10, window.innerWidth - 270) + 'px';
      viewer.style.top = Math.min(r.top - 4, window.innerHeight - 130) + 'px';
      viewer.innerHTML = '<div class="rvw-note-head">' + T.commentN + p.dataset.n + '</div><div class="rvw-note-body"></div>';
      viewer.querySelector('.rvw-note-body').textContent = p.dataset.note;
      document.body.appendChild(viewer);
    } else if (!e.target.closest('.rvw-note')) hideNoteView();
  });

  /* ================= keyboard ================= */
  document.addEventListener('keydown', function (e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'v' || e.key === 'V') setMode('select');
    else if (e.key === 'c' || e.key === 'C') setMode('comment');
    else if (e.key === 'Escape') select(null);
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      doUndo();
    }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      // Ẩn cả nhóm + ghi vào feedback là yêu cầu xóa (bật lại bằng icon mắt ở Layers)
      e.preventDefault();
      pruneNested(selectionAll()).forEach(function (m) {
        pushUndo(m);
        m.style.visibility = 'hidden';
        recordProp(m, 'removed', true);
        var lrow = elRow.get(m);
        if (lrow) { lrow.classList.add('rvw-lhidden'); lrow.querySelector('.rvw-eye').innerHTML = EYE_OFF; }
      });
      select(null);
    }
    else if (selected && /^Arrow/.test(e.key)) {
      e.preventDefault();
      var step = e.shiftKey ? 10 : 2;
      var dxk = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      var dyk = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      pruneNested(selectionAll()).forEach(function (m) {
        pushUndo(m);
        ensurePositioned(m);
        var csn = getComputedStyle(m);
        m.style.left = ((parseFloat(csn.left) || 0) + dxk) + 'px';
        m.style.top = ((parseFloat(csn.top) || 0) + dyk) + 'px';
        m.style.right = 'auto'; m.style.bottom = 'auto';
        recordMove(m);
      });
      refreshBoxes(); renderPanel();
    }
  });

  /* ================= export ================= */
  document.getElementById('rvw-export').onclick = function () {
    var payload = {
      file: location.pathname.split('/').pop(),
      exported_at: new Date().toISOString(),
      frame: { w: frame.offsetWidth, h: frame.offsetHeight },
      texts: changes.texts, moves: changes.moves, props: changes.props, pins: changes.pins
    };
    var json = JSON.stringify(payload, null, 2);
    try { navigator.clipboard.writeText(json); } catch (err) { /* ignore */ }
    var a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    a.download = 'feedback-' + payload.file.replace('.html', '') + '.json';
    a.click();
  };

  /* ================= Xuất PNG trực tiếp (0 token — cần review-server.py) =================
     Serialize DOM hiện tại (gồm mọi chỉnh sửa live chưa lưu), lột sạch overlay chrome,
     reset zoom/pan → POST cho local server → server gọi headless Chrome chụp. */
  function cleanHTML() {
    var root = document.documentElement.cloneNode(true);
    // 1) Gỡ class overlay trên BODY trước — nếu purge trước thì body (mang class rvw-canvas)
    //    bị xóa nguyên khối → trang trắng (bug 2026-08-05)
    var b = root.querySelector('body');
    if (b) { b.removeAttribute('class'); b.removeAttribute('style'); }
    // 2) Class tạm trên element THIẾT KẾ → gỡ class, giữ element
    root.querySelectorAll('.rvw-editing,.rvw-hover').forEach(function (n) {
      n.classList.remove('rvw-editing', 'rvw-hover');
      if (!n.className) n.removeAttribute('class');
    });
    root.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    // 3) Node overlay thật sự (chrome, pin, box, style rvw-style) → xóa
    root.querySelectorAll('[class*="rvw-"]').forEach(function (n) { n.remove(); });
    var f = root.querySelector('.frame');
    if (f) { f.style.zoom = ''; f.style.transform = ''; }
    // Giữ nguyên <script> overlay — nó tự no-op khi không có #review,
    // và cần giữ để file source lưu về vẫn mở review được lần sau
    return '<!DOCTYPE html>\n' + root.outerHTML;
  }
  function showNoServer() {
    var b = document.getElementById('rvw-srvstatus');
    if (!b) return;
    b.textContent = T.noServer;
    b.style.display = '';
  }
  if (location.protocol.indexOf('http') === 0) {
    fetch('/__review__/ping').then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { showNoServer(); return; }
      var fileName = location.pathname.split('/').pop();
      // Nút Lưu — ghi đè source HTML (backup .bak), 0 token
      var saveBtn = document.createElement('button');
      saveBtn.className = 'rvw-tool';
      saveBtn.id = 'rvw-save';
      saveBtn.title = T.tipSave;
      saveBtn.innerHTML = ICONS.check + T.save;
      document.getElementById('rvw-actions').appendChild(saveBtn);
      saveBtn.onclick = function () {
        fetch('/__review__/save?name=' + encodeURIComponent(fileName), { method: 'POST', body: cleanHTML() })
          .then(function (r) { return r.json(); })
          .then(function (res) { alert(res.ok ? T.savedSource + res.path : T.errSave + res.error); })
          .catch(function (err) { alert(T.errServer + err); });
      };
      // Nút Xuất PNG — lưu source TRƯỚC rồi chụp từ source → PNG luôn khớp HTML
      var btn = document.createElement('button');
      btn.className = 'rvw-tool rvw-png';
      btn.id = 'rvw-png';
      btn.title = T.tipPng;
      btn.innerHTML = ICONS.image + T.png;
      document.getElementById('rvw-actions').appendChild(btn);
      btn.onclick = function () {
        btn.disabled = true; btn.innerHTML = ICONS.image + T.shooting;
        fetch('/__review__/export?w=' + frame.offsetWidth + '&h=' + frame.offsetHeight +
          '&name=' + encodeURIComponent(fileName), {
          method: 'POST', body: cleanHTML()
        }).then(function (r) { return r.json(); }).then(function (res) {
          btn.disabled = false; btn.innerHTML = ICONS.image + T.png;
          alert(res.ok ? T.exported + res.path : T.errExport + res.error);
        }).catch(function (err) {
          btn.disabled = false; btn.innerHTML = ICONS.image + T.png;
          alert(T.errServer + err);
        });
      };
    }).catch(showNoServer);
  } else {
    // Mở trực tiếp qua file:// (không phải link http://127.0.0.1:xxxx của open-review.py)
    // → không có review-server, Lưu/Xuất PNG không thể hoạt động (không ghi được xuống đĩa).
    showNoServer();
  }
})();
