/**
 * Review overlay cho design--compose — editor chrome kiểu Figma/Canva.
 * Khi mở thường: hiện nút "Edit live" ngoài artboard để user vào editor.
 * Khi URL có "#review" (hoặc "?review"): bật editor chrome. Ảnh export qua
 * compose-screenshot.py chụp đúng artboard nên không dính launcher/editor UI.
 *
 * Tính năng:
 *  - Select (V): click chọn element → selection box + properties panel (X/Y/W %, font-size, nội dung, AI feedback)
 *  - Kéo thả để dời vị trí, mũi tên để nudge (Shift = bước lớn), double-click sửa chữ inline
 *  - Comment (C): click đặt pin đánh số + ghi chú, tự gắn target element khi có thể
 *  - Export: tải feedback JSON + copy clipboard → gửi lại Claude áp vào source
 */
(function () {
  'use strict';
  var wantsReview = /[?#&]review/.test(location.search + location.hash);
  var frame = document.querySelector('[data-rvw-frame],.frame,.frame-container');
  if (!frame) return;

  /* ================= state ================= */
  var changes = { texts: {}, moves: {}, props: {}, pins: [], element_feedback: {} };
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
      openEditor: 'Edit live', openEditorHint: 'Mở live editor để chỉnh chữ, kéo lớp, comment và xuất PNG.',
      startBackendTitle: 'Bật live editor',
      startBackendHint: 'Trình duyệt không thể tự chạy Python từ file offline. Chạy lệnh này rồi HTML sẽ mở bằng review-server có Lưu/Xuất PNG.',
      startBackendCopy: 'Copy lệnh',
      startBackendCopied: 'Đã copy lệnh',
      startBackendClose: 'Đóng',
      startBackendLoading: 'Đang tìm server...',
      emptyHint: 'Click một element trên thiết kế để chọn.<br><br>Kéo để di chuyển · mũi tên để tinh chỉnh · double-click để sửa chữ.',
      multiSel: ' elements đã chọn',
      multiHint: 'Kéo để di chuyển cả nhóm · mũi tên nudge · Delete ẩn tất cả · Shift+click để thêm/bớt · Esc bỏ chọn.',
      rot: 'Xoay (°)', op: 'Mờ (%)', fs: 'Cỡ chữ (px)', content: 'Nội dung',
      flipH: 'Lật ngang', flipV: 'Lật dọc', zUp: 'Lên trước', zDown: 'Ra sau',
      reset: 'Reset', lockRatio: 'Khóa tỉ lệ', unlockRatio: 'Mở khóa tỉ lệ',
      flipGroup: 'Lật', orderGroup: 'Lớp',
      secPerspective: 'Góc nhìn',
      skewX: 'Skew X', skewY: 'Skew Y', rotX: 'Xoay X', rotY: 'Xoay Y', perspective: 'Phối cảnh', resetView: 'Reset view',
      isoHint: 'Xoay 3D',
      dragView: 'Kéo để xoay object',
      isoFlat: 'Phẳng', isoLeft: 'Iso trái', isoRight: 'Iso phải', isoTop: 'Nghiêng lên', isoBottom: 'Nghiêng xuống',
      layerContainerHint: 'Đây là layer container. Chọn một item con trong Layers hoặc double-click trên canvas để sửa ảnh/chữ cụ thể.',
      align: 'Căn chữ', alLeft: 'Trái', alCenter: 'Giữa', alRight: 'Phải',
      secPosition: 'Vị trí', secLayout: 'Kích thước', secAppearance: 'Hiển thị', secTypography: 'Chữ',
      secAiFeedback: 'Feedback cho AI',
      aiFeedback: 'Ghi chú về element này',
      aiFeedbackHint: 'Chọn element rồi nhập ngay trong bubble dưới element. Feedback sẽ đi vào JSON xuất cho AI.',
      aiFeedbackPlaceholder: 'Ví dụ: Làm icon này lớn hơn, đổi màu card này, đưa phần tử này lên trên...',
      aiFeedbackBubbleHint: 'Tự gắn với element đang chọn',
      attachedTo: 'Gắn với',
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
      openEditor: 'Edit live', openEditorHint: 'Open the live editor to edit text, move layers, comment, and export PNG.',
      startBackendTitle: 'Start live editor',
      startBackendHint: 'The browser cannot start Python from an offline file. Run this command, then the HTML will open through the review server with Save/Export PNG.',
      startBackendCopy: 'Copy command',
      startBackendCopied: 'Command copied',
      startBackendClose: 'Close',
      startBackendLoading: 'Looking for server...',
      emptyHint: 'Click an element on the canvas to select it.<br><br>Drag to move · arrows to nudge · double-click to edit text.',
      multiSel: ' elements selected',
      multiHint: 'Drag to move the group · arrows to nudge · Delete hides all · Shift+click to add/remove · Esc to deselect.',
      rot: 'Rotate (°)', op: 'Opacity (%)', fs: 'Font size (px)', content: 'Content',
      flipH: 'Flip H', flipV: 'Flip V', zUp: 'Forward', zDown: 'Backward',
      reset: 'Reset', lockRatio: 'Lock ratio', unlockRatio: 'Unlock ratio',
      flipGroup: 'Flip', orderGroup: 'Layer',
      secPerspective: 'View',
      skewX: 'Skew X', skewY: 'Skew Y', rotX: 'Rotate X', rotY: 'Rotate Y', perspective: 'Perspective', resetView: 'Reset view',
      isoHint: '3D rotate',
      dragView: 'Drag to rotate object',
      isoFlat: 'Flat', isoLeft: 'Iso left', isoRight: 'Iso right', isoTop: 'Tilt up', isoBottom: 'Tilt down',
      layerContainerHint: 'This is a layer container. Select a child item in Layers or double-click the canvas to edit a specific image/text element.',
      align: 'Text align', alLeft: 'Left', alCenter: 'Center', alRight: 'Right',
      secPosition: 'Position', secLayout: 'Layout', secAppearance: 'Appearance', secTypography: 'Typography',
      secAiFeedback: 'AI feedback',
      aiFeedback: 'Note about this element',
      aiFeedbackHint: 'Select an element, then write in the bubble under it. Feedback is exported for the AI agent.',
      aiFeedbackPlaceholder: 'Example: Make this icon larger, recolor this card, bring this item forward...',
      aiFeedbackBubbleHint: 'Bound to selected element',
      attachedTo: 'Attached to',
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
  var overlayScriptSrc = (document.currentScript && document.currentScript.src) || '';

  function installReviewLauncher() {
    if (document.querySelector('.rvw-open-editor')) return;
    var style = document.createElement('style');
    style.className = 'rvw-launcher-style';
    style.textContent = '.rvw-open-editor{position:fixed;z-index:99990;display:flex;align-items:center;gap:8px;' +
      'height:36px;padding:0 12px;border:none;border-radius:8px;background:#0d99ff;color:#fff;' +
      'font:700 12px Inter,Segoe UI,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22);cursor:pointer}' +
      '.rvw-open-editor:hover{background:#0b87e0}.rvw-open-editor svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8}' +
      '.rvw-launcher-modal{position:fixed;z-index:99991;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,10,.45);font-family:Inter,Segoe UI,system-ui,sans-serif}' +
      '.rvw-launcher-card{width:min(560px,calc(100vw - 32px));border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#202020;color:#f5f5f5;box-shadow:0 22px 70px rgba(0,0,0,.42);padding:18px}' +
      '.rvw-launcher-card h2{margin:0 0 8px;font-size:16px;line-height:1.25}.rvw-launcher-card p{margin:0 0 14px;color:#b8b8b8;font-size:13px;line-height:1.5}' +
      '.rvw-launcher-card code{display:block;white-space:pre-wrap;word-break:break-word;background:#111;border:1px solid #3a3a3a;border-radius:8px;padding:12px;color:#d8ecff;font-size:12px;line-height:1.45}' +
      '.rvw-launcher-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.rvw-launcher-actions button{height:34px;border:1px solid #454545;border-radius:7px;background:#2d2d2d;color:#f5f5f5;padding:0 12px;font:700 12px Inter,Segoe UI,system-ui,sans-serif;cursor:pointer}.rvw-launcher-actions .rvw-primary{background:#0d99ff;border-color:#0d99ff}' +
      '@media (max-width:1199px){.rvw-open-editor{display:none}}@media print{.rvw-open-editor{display:none}}';
    document.head.appendChild(style);
    var btn = document.createElement('button');
    btn.className = 'rvw-open-editor';
    btn.type = 'button';
    btn.title = T.openEditorHint;
    btn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 13h3.5L13 6.5 9.5 3 3 9.5z"/><path d="M8.8 3.7l3.5 3.5"/></svg><span>' + T.openEditor + '</span>';
    function place() {
      var r = frame.getBoundingClientRect();
      btn.style.left = Math.round(r.right + 16) + 'px';
      btn.style.top = Math.round(Math.max(16, r.top + 16)) + 'px';
    }
    function fileUrlToPath(url) {
      if (!url || url.indexOf('file:///') !== 0) return '';
      var p = decodeURIComponent(url.replace('file:///', ''));
      if (/^[A-Za-z]:\//.test(p)) p = p.replace(/\//g, '\\');
      return p;
    }
    function dirname(p) {
      var i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
      return i >= 0 ? p.slice(0, i) : '';
    }
    function basename(p) {
      var i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
      return i >= 0 ? p.slice(i + 1) : p;
    }
    function normPath(p) { return (p || '').replace(/\//g, '\\').toLowerCase(); }
    function skillPath() {
      return fileUrlToPath(overlayScriptSrc);
    }
    function reviewCommand() {
      var script = skillPath().replace(/\\review-overlay\.js$/i, '\\open-review.py');
      var file = fileUrlToPath(location.href.split('#')[0]);
      return 'python "' + script + '" "' + file + '"';
    }
    function showLauncherHelp(command) {
      var modal = document.createElement('div');
      modal.className = 'rvw-launcher-modal';
      modal.innerHTML = '<div class="rvw-launcher-card"><h2>' + T.startBackendTitle + '</h2>' +
        '<p>' + T.startBackendHint + '</p><code>' + command.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code>' +
        '<div class="rvw-launcher-actions"><button type="button" data-close="1">' + T.startBackendClose + '</button>' +
        '<button type="button" class="rvw-primary" data-copy="1">' + T.startBackendCopy + '</button></div></div>';
      modal.onclick = function (ev) {
        if (ev.target === modal || ev.target.getAttribute('data-close')) modal.remove();
        if (ev.target.getAttribute('data-copy')) {
          try { navigator.clipboard.writeText(command); ev.target.textContent = T.startBackendCopied; } catch (err) { /* ignore */ }
        }
      };
      document.body.appendChild(modal);
    }
    function findServerThenOpen() {
      var file = fileUrlToPath(location.href.split('#')[0]);
      var dir = normPath(dirname(file));
      var name = basename(file);
      btn.disabled = true;
      btn.querySelector('span').textContent = T.startBackendLoading;
      var ports = [];
      for (var p = 7799; p < 7819; p++) ports.push(p);
      Promise.all(ports.map(function (p) {
        return fetch('http://127.0.0.1:' + p + '/__review__/ping').then(function (r) { return r.json(); })
          .then(function (j) { return j && j.ok && normPath(j.dir) === dir ? p : null; })
          .catch(function () { return null; });
      })).then(function (matches) {
        var port = matches.filter(Boolean)[0];
        if (port) {
          location.href = 'http://127.0.0.1:' + port + '/' + encodeURIComponent(name) + '#review';
          return;
        }
        showLauncherHelp(reviewCommand());
      }).finally(function () {
        btn.disabled = false;
        btn.querySelector('span').textContent = T.openEditor;
      });
    }
    btn.onclick = function () {
      if (location.protocol.indexOf('http') === 0) {
        if (location.hash !== '#review') location.hash = 'review';
        location.reload();
        return;
      }
      findServerThenOpen();
    };
    document.body.appendChild(btn);
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }
  if (!wantsReview) {
    installReviewLauncher();
    return;
  }

  /* ===== Hit-testing tổng quát — overlay KHÔNG phụ thuộc tên class của design =====
     (fix 2026-08-05: design ngoài template gốc như pawos có class tùy ý → selector
     hard-code làm click xuyên qua và không kéo được element trong group lạ) */
  var OVERLAY_UI = '.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note,.rvw-ai-note,.rvw-pin,.rvw-region,.rvw-selbox,.rvw-hoverbox,.rvw-guide,.rvw-marquee';
  function classOf(el) { return (el.getAttribute && el.getAttribute('class')) || ''; }
  function isLayerEl(el) { return /(^| )layer-/.test(classOf(el)); }
  function isPassThroughEl(el) {
    if (!el || !el.closest) return false;
    if (el.closest('.layer-adjust,[data-rvw-pass-through],[data-rvw-click-through]')) return true;
    return /(^| )(adjust|tint|vignette|grain|filter|color-wash)( |$)/.test(classOf(el));
  }
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
      if (!inDesign(el) || isLayerEl(el) || isPassThroughEl(el)) continue;
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
  .rvw-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(6px);
    background:#2c2c2c;border:1px solid #444;border-left:3px solid #666;border-radius:8px;
    padding:12px 18px;color:#e0e0e0;font-size:13px;line-height:1.4;z-index:200000;
    box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:380px;white-space:pre-line;
    opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;}
  .rvw-toast.rvw-show{opacity:1;transform:translateX(-50%) translateY(0);}
  .rvw-toast.rvw-ok{border-left-color:#1f9d55;}
  .rvw-toast.rvw-err{border-left-color:#e5484d;}
  .rvw-panel{position:fixed;top:48px;right:0;bottom:0;width:248px;z-index:99999;background:#2c2c2c;
    border-left:1px solid #444;color:#e0e0e0;font-size:12px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:#4a4a4a transparent;}
  .rvw-panel-resize{position:fixed;top:48px;bottom:0;width:10px;z-index:100000;cursor:ew-resize;
    background:linear-gradient(90deg,rgba(13,153,255,.28),transparent 45%);}
  .rvw-panel-resize::after{content:'';position:absolute;left:2px;top:50%;width:3px;height:44px;
    margin-top:-22px;border-radius:3px;background:#5b5b5b;}
  .rvw-panel-resize:hover,.rvw-panel-resize.rvw-dragging{background:rgba(13,153,255,.4);}
  .rvw-panel-resize:hover::after,.rvw-panel-resize.rvw-dragging::after{background:#0d99ff;}
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
  .rvw-field input[type=number]::-webkit-outer-spin-button,
  .rvw-field input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
  .rvw-field input[type=number]{appearance:textfield;-moz-appearance:textfield;}
  .rvw-field input[type=range]{padding:0;border:none;background:transparent;accent-color:#0d99ff;}
  .rvw-field input:focus,.rvw-field textarea:focus{border-color:#0d99ff;}
  .rvw-field textarea{resize:vertical;min-height:56px;line-height:1.4;}
  .rvw-feedback-status{color:#a8b3c7;font-size:10px;line-height:1.35;word-break:break-word;}
  .rvw-feedback-target{color:#a8b3c7;font-size:10px;line-height:1.35;margin-top:2px;word-break:break-word;}
  .rvw-feedback-help{color:#777;font-size:10px;line-height:1.4;margin-top:2px;}
  .rvw-ai-note{position:fixed;z-index:100001;width:300px;max-width:calc(100vw - 32px);
    border:1px solid rgba(13,153,255,.7);border-radius:8px;background:#2b2b2b;color:#e8e8e8;
    box-shadow:0 14px 38px rgba(0,0,0,.38);padding:8px;box-sizing:border-box;}
  .rvw-ai-note::before{content:'';position:absolute;top:-7px;left:24px;width:12px;height:12px;
    background:#2b2b2b;border-left:1px solid rgba(13,153,255,.7);border-top:1px solid rgba(13,153,255,.7);
    transform:rotate(45deg);}
  .rvw-ai-note.rvw-above::before{top:auto;bottom:-7px;transform:rotate(225deg);}
  .rvw-ai-note-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;
    color:#fff;font-size:11px;font-weight:700;}
  .rvw-ai-note-meta{color:#95a6bf;font-size:10px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .rvw-ai-note textarea{display:block;width:100%;min-height:62px;max-height:136px;box-sizing:border-box;
    resize:vertical;border:1px solid #4b4b4b;border-radius:6px;background:#171717;color:#f0f0f0;
    padding:7px 8px;font:400 12px Inter,'Segoe UI',sans-serif;line-height:1.4;outline:none;}
  .rvw-ai-note textarea:focus{border-color:#0d99ff;}
  .rvw-elname{padding:10px 14px 0;font-weight:600;color:#fff;font-size:12px;word-break:break-word;}
  .rvw-elmeta{padding:4px 14px 10px;color:#8f8f8f;font-size:10px;line-height:1.4;word-break:break-word;}
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
  .rvw-selbox.rvw-selbox-layer{border-style:dashed;border-color:#888;}
  .rvw-selbox.rvw-selbox-layer .rvw-h,.rvw-selbox.rvw-selbox-layer .rvw-rotline{display:none;}
  .rvw-selbox.rvw-selbox-extra{border-width:1px;border-style:solid;}
  .rvw-selbox .rvw-h{position:absolute;width:8px;height:8px;background:#fff;border:1.5px solid #0d99ff;border-radius:1px;}
  .rvw-selbox .rvw-h.nw{left:-5px;top:-5px;}.rvw-selbox .rvw-h.ne{right:-5px;top:-5px;}
  .rvw-selbox .rvw-h.sw{left:-5px;bottom:-5px;}
  .rvw-selbox .rvw-h.se{right:-5px;bottom:-5px;pointer-events:auto;cursor:nwse-resize;}
  .rvw-selbox .rvw-h.rot{left:50%;top:-28px;margin-left:-5px;border-radius:50%;pointer-events:auto;cursor:grab;}
  .rvw-selbox .rvw-rotline{position:absolute;left:50%;top:-19px;width:1px;height:19px;background:#0d99ff;}
  /* Hàng nút đều nhau (căn chữ 3 nút, lật/lớp 4 nút) — PHẢI ép flex-direction:row tường minh,
     vì .rvw-field (cha) set flex-direction:column, cascade đè khiến nút xếp dọc thay vì ngang
     (bug 2026-08-05: tự kiểm tra ẩu tưởng đã đúng hàng ngang, thực ra vẫn xếp dọc). */
  .rvw-btnrow3,.rvw-btnrow4{display:flex;flex-direction:row;flex-wrap:nowrap;gap:6px;}
  .rvw-btnrow3 button,.rvw-btnrow4 button{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;
    background:#3a3a3a;border:none;border-radius:5px;color:#ddd;padding:8px 4px;cursor:pointer;}
  .rvw-btnrow3 button:hover,.rvw-btnrow4 button:hover{background:#454749;}
  .rvw-btnrow3 button.rvw-on,.rvw-btnrow4 button.rvw-on{background:#0d99ff;color:#fff;}
  .rvw-btnrow3 button svg,.rvw-btnrow4 button svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;}
  .rvw-control-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .rvw-control-group{display:flex;flex-direction:column;gap:5px;min-width:0;}
  .rvw-control-label{color:#888;font-size:10px;}
  .rvw-range-row{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:8px;align-items:center;}
  .rvw-view-lab{display:grid;grid-template-columns:1fr;gap:5px;}
  .rvw-iso-preview{height:72px;border:1px solid #3f3f3f;border-radius:7px;background:radial-gradient(circle at 50% 34%,#303236,#1f1f1f 72%);display:flex;align-items:center;justify-content:center;overflow:hidden;perspective:900px;position:relative;cursor:grab;user-select:none;touch-action:none;}
  .rvw-iso-preview::before,.rvw-iso-preview::after{content:'';position:absolute;background:rgba(210,220,230,.08);pointer-events:none;}
  .rvw-iso-preview::before{left:14px;right:14px;top:44%;height:1px;}
  .rvw-iso-preview::after{top:8px;bottom:14px;left:50%;width:1px;}
  .rvw-iso-preview.rvw-dragging{cursor:grabbing;border-color:#0d99ff;}
  .rvw-iso-floor{position:absolute;left:18px;right:18px;bottom:6px;height:38px;transform:rotateX(66deg);transform-origin:50% 100%;background-image:linear-gradient(rgba(180,190,202,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(180,190,202,.12) 1px,transparent 1px);background-size:16px 16px;border-bottom:1px solid rgba(180,190,202,.12);opacity:.58;mask-image:linear-gradient(to top,rgba(0,0,0,.8),transparent 82%);pointer-events:none;}
  .rvw-iso-shadow{position:absolute;width:78px;height:16px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.42),rgba(0,0,0,0) 74%);transform:translate(4px,22px);pointer-events:none;}
  .rvw-iso-plane{--rvw-w:58px;--rvw-h:38px;--rvw-d:18px;width:var(--rvw-w);height:var(--rvw-h);transform-style:preserve-3d;position:relative;z-index:1;}
  .rvw-iso-face{position:absolute;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.16);}
  .rvw-iso-front,.rvw-iso-back{left:0;top:0;width:var(--rvw-w);height:var(--rvw-h);}
  .rvw-iso-front{border-radius:0;background:linear-gradient(135deg,#b9d8ff,#669cf1 52%,#315fb8);transform:translateZ(calc(var(--rvw-d) / 2));}
  .rvw-iso-front::before{content:'';display:block;width:100%;height:100%;border-radius:0;background:linear-gradient(135deg,rgba(255,255,255,.52),rgba(255,255,255,0) 50%);opacity:.68;}
  .rvw-iso-back{border-radius:0;background:linear-gradient(135deg,#303640,#20242b);transform:rotateY(180deg) translateZ(calc(var(--rvw-d) / 2));}
  .rvw-iso-top,.rvw-iso-bottom{left:0;top:calc((var(--rvw-h) - var(--rvw-d)) / 2);width:var(--rvw-w);height:var(--rvw-d);border-radius:0;background:linear-gradient(135deg,#5a5f68,#3f444d);}
  .rvw-iso-top{transform:rotateX(90deg) translateZ(calc(var(--rvw-h) / 2));}
  .rvw-iso-bottom{background:linear-gradient(135deg,#2f343c,#1f232a);transform:rotateX(-90deg) translateZ(calc(var(--rvw-h) / 2));}
  .rvw-iso-left,.rvw-iso-right{left:calc((var(--rvw-w) - var(--rvw-d)) / 2);top:0;width:var(--rvw-d);height:var(--rvw-h);border-radius:0;background:linear-gradient(180deg,#414751,#282d35);}
  .rvw-iso-right{transform:rotateY(90deg) translateZ(calc(var(--rvw-w) / 2));}
  .rvw-iso-left{background:linear-gradient(180deg,#565c66,#333943);transform:rotateY(-90deg) translateZ(calc(var(--rvw-w) / 2));}
  .rvw-iso-tip{position:absolute;left:0;right:0;bottom:3px;text-align:center;color:#8f8f8f;font-size:10px;pointer-events:none;}
  .rvw-iso-presets{display:flex;flex-direction:row;flex-wrap:wrap;gap:5px;}
  .rvw-iso-presets button{flex:1 1 72px;height:26px;border:none;border-radius:5px;background:#3a3a3a;color:#ddd;font:600 11px Inter,'Segoe UI',sans-serif;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px;}
  .rvw-iso-presets button:hover{background:#454749;}
  .rvw-iso-presets button.rvw-on{background:#0d99ff;color:#fff;}
  .rvw-unit-wrap{position:relative;}
  .rvw-unit-wrap input{padding-right:24px;}
  .rvw-unit{position:absolute;right:7px;top:50%;transform:translateY(-50%);color:#777;font-size:10px;pointer-events:none;}
  .rvw-step-row{display:grid;grid-template-columns:32px minmax(0,1fr) 32px 32px;gap:6px;align-items:center;}
  .rvw-step-row button,.rvw-mini-btn{display:inline-flex;align-items:center;justify-content:center;
    height:28px;border:none;border-radius:5px;background:#3a3a3a;color:#ddd;font:600 12px Inter,'Segoe UI',sans-serif;cursor:pointer;}
  .rvw-step-row button:hover,.rvw-mini-btn:hover{background:#454749;}
  .rvw-mini-btn.rvw-on{background:#0d99ff;color:#fff;}
  .rvw-mini-btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}
  .rvw-layout-head{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:8px;align-items:end;}
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
  body.rvw-canvas .layer-adjust,body.rvw-canvas .layer-adjust *,
  body.rvw-canvas .adjust,body.rvw-canvas .tint,body.rvw-canvas .vignette,body.rvw-canvas .grain,
  body.rvw-canvas .filter,body.rvw-canvas .color-wash,
  body.rvw-canvas [data-rvw-pass-through],body.rvw-canvas [data-rvw-click-through]{
    pointer-events:none !important;
  }
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
    alignRight: '<svg viewBox="0 0 16 16"><path d="M2 4h12M6 8h8M4 12h10"/></svg>',
    flipH: '<svg viewBox="0 0 16 16"><path d="M8 1v14" stroke-dasharray="2 2"/><path d="M4.5 5 2 8l2.5 3M11.5 5 14 8l-2.5 3"/></svg>',
    flipV: '<svg viewBox="0 0 16 16"><path d="M1 8h14" stroke-dasharray="2 2"/><path d="M5 4.5 8 2l3 2.5M5 11.5 8 14l3-2.5"/></svg>',
    layerUp: '<svg viewBox="0 0 16 16"><rect x="4" y="6" width="8" height="8" rx="1"/><path d="M8 4V1M6 2.5 8 .5l2 2"/></svg>',
    layerDown: '<svg viewBox="0 0 16 16"><rect x="4" y="2" width="8" height="8" rx="1"/><path d="M8 12v3M6 13.5 8 15.5l2-2"/></svg>',
    lock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>',
    unlock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.7-1.2"/></svg>'
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

  /* Toast thay alert() gốc trình duyệt — alert chặn UI + không style được, phá vỡ dark UI
     (audit 2026-08-05: heuristic #1 Visibility + #8 Aesthetic consistency) */
  var toastEl = document.createElement('div');
  toastEl.className = 'rvw-toast rvw';
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function showToast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.className = 'rvw-toast rvw rvw-show ' + (isErr ? 'rvw-err' : 'rvw-ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('rvw-show'); }, 3000);
  }

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
    if (isPassThroughEl(el)) return true;
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
    var adj = adjustmentName(el);
    if (adj) return adj;
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
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note,.rvw-ai-note')) return;
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
    if (e.target.closest('.rvw-panel,.rvw-layers,.rvw-note,.rvw-ai-note')) return; // panel/bubble giữ scroll gốc
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
    return friendlyName(el);
  }
  function explicitName(el) {
    return el.getAttribute('data-rvw-name') || el.getAttribute('aria-label') ||
      el.getAttribute('alt') || el.getAttribute('title') || '';
  }
  function adjustmentName(el) {
    if (!isPassThroughEl(el)) return '';
    var pc = classOf(el);
    if (/(^| )tint( |$)/.test(pc)) return 'Tint adjustment';
    if (/(^| )vignette( |$)/.test(pc)) return 'Vignette adjustment';
    if (/(^| )grain( |$)/.test(pc)) return 'Grain adjustment';
    if (/(^| )filter( |$)/.test(pc)) return 'Filter adjustment';
    if (/(^| )color-wash( |$)/.test(pc)) return 'Color wash adjustment';
    return 'Adjustment layer';
  }
  function friendlyName(el) {
    var named = explicitName(el);
    if (named) return named.length > 42 ? named.slice(0, 42) + '…' : named;
    if (isLayerEl(el)) return layerName(el);
    var adj = adjustmentName(el);
    if (adj) return adj;
    if (/^IMG$/i.test(el.tagName)) return el.getAttribute('src') ? 'Image asset' : 'Image';
    if (/^(SVG|CANVAS|VIDEO|PICTURE)$/i.test(el.tagName)) return el.tagName.toLowerCase() + ' asset';
    if (isTextEl(el)) {
      var txt = el.textContent.trim().replace(/\s+/g, ' ');
      return txt ? (txt.length > 42 ? txt.slice(0, 42) + '…' : txt) : 'Text';
    }
    var cls = Array.prototype.slice.call(el.classList || []).filter(function (c) {
      return c.indexOf('rvw-') !== 0 && c.indexOf('layer-') !== 0;
    });
    if (cls.some(function (c) { return /title|heading|headline/i.test(c); })) return 'Title text';
    if (cls.some(function (c) { return /subtitle|subhead|caption|body/i.test(c); })) return 'Body text';
    if (cls.some(function (c) { return /cta|button|badge|chip/i.test(c); })) return 'CTA / badge';
    if (cls.some(function (c) { return /logo|brand/i.test(c); })) return 'Logo';
    if (cls.some(function (c) { return /slot|art|asset|product|hero/i.test(c); })) return 'Art asset';
    return el.tagName.toLowerCase() + ' element';
  }
  function debugName(el) {
    var s = selectorOf(el);
    return s.length > 58 ? s.slice(0, 58) + '…' : s;
  }
  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slugifyName(s) {
    return String(s || '').normalize('NFD').toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'element';
  }
  function ensureReviewId(el) {
    if (!el || !el.setAttribute) return '';
    var id = el.getAttribute('data-rvw-id');
    if (id) return id;
    var base = slugifyName(explicitName(el) || friendlyName(el) || selectorOf(el));
    var idTry = base, n = 2;
    while (frame.querySelector('[data-rvw-id="' + idTry + '"]')) idTry = base + '-' + (n++);
    el.setAttribute('data-rvw-id', idTry);
    return idTry;
  }
  function layerOf(el) {
    var n = el;
    while (n && n !== frame) {
      if (isLayerEl(n)) return layerName(n);
      n = n.parentElement;
    }
    return 'Frame';
  }
  function targetOf(el, confidence) {
    if (!el || !inDesign(el) || isLayerEl(el)) return null;
    var target = outerGroup(el) || el;
    var r = target.getBoundingClientRect(), fr = frameRect();
    return {
      id: ensureReviewId(target),
      selector: selectorOf(target),
      label: friendlyName(target),
      layer: layerOf(target),
      confidence: confidence || 'selected',
      bbox: {
        x: +(((r.left - fr.left) / fr.width) * 100).toFixed(2) + '%',
        y: +(((r.top - fr.top) / fr.height) * 100).toFixed(2) + '%',
        w: +((r.width / fr.width) * 100).toFixed(2) + '%',
        h: +((r.height / fr.height) * 100).toFixed(2) + '%'
      }
    };
  }
  function feedbackKeyFor(el) {
    return ensureReviewId(el || selected) || selectorOf(el || selected);
  }
  function bestTargetForRegion(rect) {
    var best = null;
    topLevelElements().forEach(function (o) {
      if (getComputedStyle(o).visibility === 'hidden') return;
      var ro = o.getBoundingClientRect();
      var ix = Math.max(0, Math.min(rect.right, ro.right) - Math.max(rect.left, ro.left));
      var iy = Math.max(0, Math.min(rect.bottom, ro.bottom) - Math.max(rect.top, ro.top));
      var area = ix * iy;
      if (area > 0 && (!best || area > best.area)) best = { el: o, area: area };
    });
    return best ? targetOf(best.el, 'region-overlap') : null;
  }
  var aiNote = null;
  function writeElementFeedback(el, note) {
    var key = feedbackKeyFor(el);
    if (!note) delete changes.element_feedback[key];
    else changes.element_feedback[key] = { target: targetOf(el, 'selected'), note: note };
    updateCount();
  }
  function ensureAiNote() {
    if (aiNote) return aiNote;
    aiNote = document.createElement('div');
    aiNote.className = 'rvw-ai-note rvw';
    document.body.appendChild(aiNote);
    aiNote.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    aiNote.addEventListener('click', function (ev) { ev.stopPropagation(); });
    return aiNote;
  }
  function hideElementFeedbackBubble() {
    if (aiNote) aiNote.style.display = 'none';
  }
  function positionElementFeedbackBubble() {
    if (!aiNote || aiNote.style.display === 'none' || !selected || extraSel.length || isLayerEl(selected)) return;
    var r = selected.getBoundingClientRect();
    var w = Math.min(320, Math.max(240, Math.min(r.width, window.innerWidth - 32)));
    aiNote.style.width = w + 'px';
    var panelW = panel ? panel.offsetWidth : 248;
    var minLeft = (layersPanel ? layersPanel.offsetWidth : 220) + 12;
    var maxLeft = window.innerWidth - panelW - w - 18;
    var left = Math.max(minLeft, Math.min(maxLeft, r.left + (r.width - w) / 2));
    if (maxLeft < minLeft) left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left));
    aiNote.style.left = left + 'px';
    aiNote.style.display = 'block';
    var h = aiNote.offsetHeight || 112;
    var below = r.bottom + 10;
    var above = r.top - h - 10;
    var useAbove = below + h > window.innerHeight - 12 && above > 56;
    aiNote.classList.toggle('rvw-above', useAbove);
    aiNote.style.top = (useAbove ? above : Math.min(below, window.innerHeight - h - 12)) + 'px';
  }
  function renderElementFeedbackBubble() {
    if (!selected || extraSel.length || isLayerEl(selected) || !document.contains(selected)) {
      hideElementFeedbackBubble();
      return;
    }
    var el = selected;
    var key = feedbackKeyFor(el);
    var fb = changes.element_feedback[key] || { note: '' };
    var target = targetOf(el, 'selected');
    var box = ensureAiNote();
    box.style.display = 'block';
    box.innerHTML = '<div class="rvw-ai-note-head"><span>' + T.secAiFeedback + '</span>' +
      '<span class="rvw-ai-note-meta">' + escapeHTML(target ? target.label : shortName(el)) + '</span></div>' +
      '<textarea id="rvw-ai-feedback" placeholder="' + escapeHTML(T.aiFeedbackPlaceholder) + '">' + escapeHTML(fb.note || '') + '</textarea>' +
      '<div class="rvw-feedback-help">' + T.aiFeedbackBubbleHint + '</div>';
    var inp = box.querySelector('textarea');
    inp.addEventListener('input', function () { writeElementFeedback(el, this.value.trim()); });
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); this.blur(); }
    });
    positionElementFeedbackBubble();
  }
  function frameRect() { return frame.getBoundingClientRect(); }
  function pctX(px) { return (px / frameRect().width * 100); }
  function pctY(px) { return (px / frameRect().height * 100); }
  function updateCount() {
    var n = Object.keys(changes.texts).length + Object.keys(changes.moves).length +
      Object.keys(changes.props).length + changes.pins.length +
      Object.keys(changes.element_feedback).filter(function (k) { return changes.element_feedback[k].note; }).length;
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
      selbox.classList.toggle('rvw-selbox-layer', isLayerEl(selected));
      selbox.style.left = r.left + 'px'; selbox.style.top = r.top + 'px';
      selbox.style.width = r.width + 'px'; selbox.style.height = r.height + 'px';
    } else {
      selbox.style.display = 'none';
      selbox.classList.remove('rvw-selbox-layer');
    }
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
    positionElementFeedbackBubble();
  }
  window.addEventListener('scroll', refreshBoxes, true);
  window.addEventListener('resize', refreshBoxes);

  function renderPanel() {
    if (!selected) {
      hideElementFeedbackBubble();
      panel.innerHTML = '<h3>' + T.props + '</h3><div class="rvw-empty">' + T.emptyHint + '</div>';
      return;
    }
    var el = selected, fr = frameRect(), r = el.getBoundingClientRect();
    var x = pctX(r.left - fr.left).toFixed(1), y = pctY(r.top - fr.top).toFixed(1);
    var w = pctX(r.width).toFixed(1), h = pctY(r.height).toFixed(1);
    if (extraSel.length) {
      hideElementFeedbackBubble();
      panel.innerHTML = '<h3>' + T.props + '</h3><div class="rvw-elname">' + (extraSel.length + 1) + T.multiSel + '</div>' +
        '<div class="rvw-empty">' + T.multiHint + '</div>';
      return;
    }
    var st = getState(el);
    var op = Math.round((parseFloat(getComputedStyle(el).opacity) || 1) * 100);
    if (isLayerEl(el)) {
      hideElementFeedbackBubble();
      panel.innerHTML = '<h3>' + T.props + '</h3><div class="rvw-elname">' + friendlyName(el) + '</div>' +
        '<div class="rvw-elmeta">' + T.layerContainerHint + '<br>' + debugName(el) + '</div>';
      return;
    }
    // Nhóm theo section kiểu Figma sidebar (Position / Layout / Appearance / Typography)
    if (st.ratioLocked === undefined) st.ratioLocked = true;
    var target = targetOf(el, 'selected');
    var html = '<h3>' + T.props + '</h3><div class="rvw-elname">' + shortName(el) + '</div>' +
      '<div class="rvw-elmeta">' + debugName(el) + '</div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secPosition + '</div><div class="rvw-fields">' +
      '<div class="rvw-field"><label>X</label><div class="rvw-unit-wrap"><input id="rvw-x" type="number" step="0.5" value="' + x + '"><span class="rvw-unit">%</span></div></div>' +
      '<div class="rvw-field"><label>Y</label><div class="rvw-unit-wrap"><input id="rvw-y" type="number" step="0.5" value="' + y + '"><span class="rvw-unit">%</span></div></div>' +
      '<div class="rvw-field rvw-wide"><label>' + T.rot + '</label><div class="rvw-step-row">' +
      '<button id="rvw-rot-dec" title="-15">-15</button><div class="rvw-unit-wrap"><input id="rvw-rot" type="number" step="1" value="' + st.rot + '"><span class="rvw-unit">deg</span></div>' +
      '<button id="rvw-rot-inc" title="+15">+15</button><button id="rvw-rot-reset" title="' + T.reset + '">0</button></div></div>' +
      '</div></div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secLayout + '</div><div class="rvw-fields">' +
      '<div class="rvw-field rvw-wide"><div class="rvw-layout-head"><label>W / H</label><button id="rvw-ratio-lock" class="rvw-mini-btn ' + (st.ratioLocked ? 'rvw-on' : '') + '" title="' + (st.ratioLocked ? T.unlockRatio : T.lockRatio) + '">' + (st.ratioLocked ? ICONS.lock : ICONS.unlock) + '</button></div></div>' +
      '<div class="rvw-field"><label>W</label><div class="rvw-unit-wrap"><input id="rvw-w" type="number" min="0.1" step="0.5" value="' + w + '"><span class="rvw-unit">%</span></div></div>' +
      '<div class="rvw-field"><label>H</label><div class="rvw-unit-wrap"><input id="rvw-h" type="number" min="0.1" step="0.5" value="' + h + '"><span class="rvw-unit">%</span></div></div>' +
      '</div></div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secPerspective + '</div><div class="rvw-fields">' +
      '<div class="rvw-field rvw-wide"><label>' + T.isoHint + '</label><div class="rvw-view-lab">' +
      '<div id="rvw-iso-pad" class="rvw-iso-preview" title="' + T.dragView + '"><div class="rvw-iso-floor"></div><div class="rvw-iso-shadow"></div><div id="rvw-iso-plane" class="rvw-iso-plane"><div class="rvw-iso-face rvw-iso-front"></div><div class="rvw-iso-face rvw-iso-back"></div><div class="rvw-iso-face rvw-iso-top"></div><div class="rvw-iso-face rvw-iso-bottom"></div><div class="rvw-iso-face rvw-iso-left"></div><div class="rvw-iso-face rvw-iso-right"></div></div><div class="rvw-iso-tip">' + T.dragView + '</div></div>' +
      '<div class="rvw-iso-presets">' +
      '<button id="rvw-iso-flat" title="' + T.isoFlat + '">' + T.isoFlat + '</button>' +
      '<button id="rvw-iso-left" title="' + T.isoLeft + '">' + T.isoLeft + '</button>' +
      '<button id="rvw-iso-right" title="' + T.isoRight + '">' + T.isoRight + '</button>' +
      '<button id="rvw-iso-top" title="' + T.isoTop + '">' + T.isoTop + '</button>' +
      '<button id="rvw-iso-bottom" title="' + T.isoBottom + '">' + T.isoBottom + '</button>' +
      '</div></div></div>' +
      '<div class="rvw-field"><label>' + T.skewX + '</label><div class="rvw-step-row">' +
      '<button id="rvw-skewx-dec" title="-2">-</button><div class="rvw-unit-wrap"><input id="rvw-skewx" type="number" step="1" value="' + (st.skewX || 0) + '"><span class="rvw-unit">deg</span></div>' +
      '<button id="rvw-skewx-inc" title="+2">+</button><button id="rvw-skewx-reset" title="' + T.reset + '">0</button></div></div>' +
      '<div class="rvw-field"><label>' + T.skewY + '</label><div class="rvw-step-row">' +
      '<button id="rvw-skewy-dec" title="-2">-</button><div class="rvw-unit-wrap"><input id="rvw-skewy" type="number" step="1" value="' + (st.skewY || 0) + '"><span class="rvw-unit">deg</span></div>' +
      '<button id="rvw-skewy-inc" title="+2">+</button><button id="rvw-skewy-reset" title="' + T.reset + '">0</button></div></div>' +
      '<div class="rvw-field"><label>' + T.rotX + '</label><div class="rvw-step-row">' +
      '<button id="rvw-rotx-dec" title="-5">-</button><div class="rvw-unit-wrap"><input id="rvw-rotx" type="number" step="1" value="' + (st.rotX || 0) + '"><span class="rvw-unit">deg</span></div>' +
      '<button id="rvw-rotx-inc" title="+5">+</button><button id="rvw-rotx-reset" title="' + T.reset + '">0</button></div></div>' +
      '<div class="rvw-field"><label>' + T.rotY + '</label><div class="rvw-step-row">' +
      '<button id="rvw-roty-dec" title="-5">-</button><div class="rvw-unit-wrap"><input id="rvw-roty" type="number" step="1" value="' + (st.rotY || 0) + '"><span class="rvw-unit">deg</span></div>' +
      '<button id="rvw-roty-inc" title="+5">+</button><button id="rvw-roty-reset" title="' + T.reset + '">0</button></div></div>' +
      '<div class="rvw-field rvw-wide"><label>' + T.perspective + '</label><div class="rvw-range-row">' +
      '<input id="rvw-persp-range" type="range" min="200" max="2000" step="50" value="' + (st.perspective || 900) + '">' +
      '<div class="rvw-unit-wrap"><input id="rvw-persp" type="number" min="200" step="50" value="' + (st.perspective || 900) + '"><span class="rvw-unit">px</span></div></div></div>' +
      '<div class="rvw-field rvw-wide"><button id="rvw-view-reset" class="rvw-mini-btn" title="' + T.resetView + '">' + T.resetView + '</button></div>' +
      '</div></div>' +
      '<div class="rvw-section"><div class="rvw-sectitle">' + T.secAppearance + '</div><div class="rvw-fields">' +
      '<div class="rvw-field rvw-wide"><label>' + T.op + '</label><div class="rvw-range-row">' +
      '<input id="rvw-op-range" type="range" min="0" max="100" step="1" value="' + op + '">' +
      '<div class="rvw-unit-wrap"><input id="rvw-op" type="number" min="0" max="100" step="5" value="' + op + '"><span class="rvw-unit">%</span></div></div></div>' +
      '<div class="rvw-field rvw-wide"><div class="rvw-control-pair">' +
      '<div class="rvw-control-group"><div class="rvw-control-label">' + T.flipGroup + '</div><div class="rvw-btnrow2 rvw-btnrow4">' +
      '<button id="rvw-fliph" title="' + T.flipH + '" class="' + (st.fx ? 'rvw-on' : '') + '">' + ICONS.flipH + '</button>' +
      '<button id="rvw-flipv" title="' + T.flipV + '" class="' + (st.fy ? 'rvw-on' : '') + '">' + ICONS.flipV + '</button></div></div>' +
      '<div class="rvw-control-group"><div class="rvw-control-label">' + T.orderGroup + '</div><div class="rvw-btnrow2 rvw-btnrow4">' +
      '<button id="rvw-zup" title="' + T.zUp + '">' + ICONS.layerUp + '</button>' +
      '<button id="rvw-zdown" title="' + T.zDown + '">' + ICONS.layerDown + '</button></div></div></div></div>' +
      '</div></div>';
    if (isText(el)) {
      var fs = parseFloat(getComputedStyle(el).fontSize);
      if (st.fsBase === undefined) st.fsBase = Math.round(fs);
      var curAlign = getComputedStyle(el).textAlign;
      if (curAlign === 'start' || curAlign === '') curAlign = 'left';
      html += '<div class="rvw-section"><div class="rvw-sectitle">' + T.secTypography + '</div><div class="rvw-fields">' +
        '<div class="rvw-field rvw-wide"><label>' + T.fs + '</label><div class="rvw-step-row">' +
        '<button id="rvw-fs-dec" title="-1">-</button><div class="rvw-unit-wrap"><input id="rvw-fs" type="number" min="6" step="1" value="' + Math.round(fs) + '"><span class="rvw-unit">px</span></div>' +
        '<button id="rvw-fs-inc" title="+1">+</button><button id="rvw-fs-reset" title="' + T.reset + '">R</button></div></div>' +
        '<div class="rvw-field rvw-wide"><label>' + T.align + '</label></div>' +
        '<div class="rvw-field rvw-wide rvw-btnrow3">' +
        '<button id="rvw-al-left" title="' + T.alLeft + '" class="' + (curAlign === 'left' ? 'rvw-on' : '') + '">' + ICONS.alignLeft + '</button>' +
        '<button id="rvw-al-center" title="' + T.alCenter + '" class="' + (curAlign === 'center' ? 'rvw-on' : '') + '">' + ICONS.alignCenter + '</button>' +
        '<button id="rvw-al-right" title="' + T.alRight + '" class="' + (curAlign === 'right' ? 'rvw-on' : '') + '">' + ICONS.alignRight + '</button></div>' +
        '<div class="rvw-field rvw-wide"><label>' + T.content + '</label><textarea id="rvw-text">' + escapeHTML(el.textContent.trim()) + '</textarea></div>' +
        '</div></div>';
    }
    html += '<div class="rvw-section"><div class="rvw-sectitle">' + T.secAiFeedback + '</div><div class="rvw-fields">' +
      '<div class="rvw-field rvw-wide rvw-feedback">' +
      '<div class="rvw-feedback-status">' + T.attachedTo + ': ' + escapeHTML(target ? target.label : shortName(el)) + '</div>' +
      '<div class="rvw-feedback-help">' + T.aiFeedbackHint + '</div></div>' +
      '</div></div>';
    panel.innerHTML = html;
    renderElementFeedbackBubble();
    Array.prototype.forEach.call(panel.querySelectorAll('input,textarea'), function (inp) {
      inp.dataset.rvwInitial = inp.value;
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && inp.tagName !== 'TEXTAREA') inp.blur();
        if (ev.key === 'Escape') {
          inp.value = inp.dataset.rvwInitial || '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.blur();
        }
      });
    });

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
      var wp = Math.max(0.1, parseFloat(this.value) || 0.1);
      el.style.width = (wp / 100 * frame.offsetWidth).toFixed(0) + 'px';
      if (getState(el).ratioLocked && r.height) {
        var hp = (wp / 100 * frame.offsetWidth / (r.width / r.height)) / frame.offsetHeight * 100;
        el.style.height = (hp / 100 * frame.offsetHeight).toFixed(0) + 'px';
        var hi = document.getElementById('rvw-h');
        if (hi) hi.value = hp.toFixed(1);
      }
      recordMove(el); refreshBoxes();
    }.bind(document.getElementById('rvw-w')));
    apply('rvw-h', function () {
      var hp = Math.max(0.1, parseFloat(this.value) || 0.1);
      el.style.height = (hp / 100 * frame.offsetHeight).toFixed(0) + 'px';
      if (getState(el).ratioLocked && r.height) {
        var wp = (hp / 100 * frame.offsetHeight * (r.width / r.height)) / frame.offsetWidth * 100;
        el.style.width = (wp / 100 * frame.offsetWidth).toFixed(0) + 'px';
        var wi = document.getElementById('rvw-w');
        if (wi) wi.value = wp.toFixed(1);
      }
      recordMove(el); refreshBoxes();
    }.bind(document.getElementById('rvw-h')));
    apply('rvw-rot', function () {
      getState(el).rot = parseFloat(this.value) || 0;
      applyTransform(el); refreshBoxes();
    }.bind(document.getElementById('rvw-rot')));
    function setRotation(v) {
      var inp = document.getElementById('rvw-rot');
      if (!inp) return;
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var rotDec = document.getElementById('rvw-rot-dec');
    if (rotDec) rotDec.onclick = function () { setRotation((parseFloat(document.getElementById('rvw-rot').value) || 0) - 15); };
    var rotInc = document.getElementById('rvw-rot-inc');
    if (rotInc) rotInc.onclick = function () { setRotation((parseFloat(document.getElementById('rvw-rot').value) || 0) + 15); };
    var rotReset = document.getElementById('rvw-rot-reset');
    if (rotReset) rotReset.onclick = function () { setRotation(0); };
    var ratioBtn = document.getElementById('rvw-ratio-lock');
    if (ratioBtn) ratioBtn.onclick = function () {
      var s = getState(el);
      s.ratioLocked = !s.ratioLocked;
      ratioBtn.classList.toggle('rvw-on', s.ratioLocked);
      ratioBtn.innerHTML = s.ratioLocked ? ICONS.lock : ICONS.unlock;
      ratioBtn.title = s.ratioLocked ? T.unlockRatio : T.lockRatio;
    };
    function syncViewInputs() {
      var s = getState(el);
      var map = {
        'rvw-skewx': s.skewX || 0,
        'rvw-skewy': s.skewY || 0,
        'rvw-rotx': s.rotX || 0,
        'rvw-roty': s.rotY || 0,
        'rvw-persp': s.perspective || 900,
        'rvw-persp-range': Math.min(2000, Math.max(200, s.perspective || 900))
      };
      Object.keys(map).forEach(function (id) {
        var inp = document.getElementById(id);
        if (inp) inp.value = map[id];
      });
    }
    function viewPresetKey(s) {
      var sx = Math.round(s.skewX || 0), sy = Math.round(s.skewY || 0);
      var rx = Math.round(s.rotX || 0), ry = Math.round(s.rotY || 0);
      if (!sx && !sy && !rx && !ry) return 'flat';
      if (sx === 10 && rx === 50 && !sy && !ry) return 'left';
      if (sx === -10 && rx === 50 && !sy && !ry) return 'right';
      if (!sx && !sy && rx === 60 && ry === -30) return 'top';
      if (!sx && !sy && rx === -45 && ry === 30) return 'bottom';
      return '';
    }
    function updateViewPreview() {
      var s = getState(el);
      var plane = document.getElementById('rvw-iso-plane');
      if (plane) {
        plane.style.transform = 'rotateX(' + (s.rotX || 0) + 'deg) rotateY(' + (s.rotY || 0) + 'deg) skewX(' + (s.skewX || 0) + 'deg) skewY(' + (s.skewY || 0) + 'deg)';
      }
      var key = viewPresetKey(s);
      ['flat', 'left', 'right', 'top', 'bottom'].forEach(function (name) {
        var b = document.getElementById('rvw-iso-' + name);
        if (b) b.classList.toggle('rvw-on', key === name);
      });
    }
    function setView(values) {
      pushUndo(el);
      var s = getState(el);
      s.skewX = values.skewX || 0;
      s.skewY = values.skewY || 0;
      s.rotX = values.rotX || 0;
      s.rotY = values.rotY || 0;
      s.perspective = values.perspective || 900;
      syncViewInputs();
      updateViewPreview();
      applyTransform(el); refreshBoxes();
    }
    function bindViewPad() {
      var pad = document.getElementById('rvw-iso-pad');
      if (!pad || !pad.addEventListener) return;
      var dragView = null;
      function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
      function snap(v) { return Math.round(v * 10) / 10; }
      pad.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        pushUndo(el);
        var s = getState(el);
        dragView = {
          x: ev.clientX, y: ev.clientY,
          rotX: s.rotX || 0, rotY: s.rotY || 0
        };
        pad.classList.add('rvw-dragging');
        try { pad.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      });
      pad.addEventListener('pointermove', function (ev) {
        if (!dragView) return;
        ev.preventDefault();
        var s = getState(el);
        s.rotY = snap(clamp(dragView.rotY + (ev.clientX - dragView.x) * 0.55, -75, 75));
        s.rotX = snap(clamp(dragView.rotX - (ev.clientY - dragView.y) * 0.55, -75, 75));
        if (!s.perspective) s.perspective = 900;
        syncViewInputs();
        updateViewPreview();
        applyTransform(el); refreshBoxes();
      });
      function endDrag(ev) {
        if (!dragView) return;
        dragView = null;
        pad.classList.remove('rvw-dragging');
        try { pad.releasePointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      }
      pad.addEventListener('pointerup', endDrag);
      pad.addEventListener('pointercancel', endDrag);
      pad.addEventListener('dblclick', function () {
        setView({ skewX: 0, skewY: 0, rotX: 0, rotY: 0, perspective: 900 });
      });
    }
    function bindViewNumber(id, key, fallback) {
      apply(id, function () {
        var n = parseFloat(this.value);
        getState(el)[key] = isNaN(n) ? fallback : n;
        updateViewPreview(); applyTransform(el); refreshBoxes();
      }.bind(document.getElementById(id)));
    }
    function bindStepper(base, key, step, fallback) {
      function setVal(v) {
        var inp = document.getElementById(base);
        if (!inp) return;
        inp.value = v;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      bindViewNumber(base, key, fallback);
      var dec = document.getElementById(base + '-dec');
      if (dec) dec.onclick = function () { setVal((parseFloat(document.getElementById(base).value) || fallback) - step); };
      var inc = document.getElementById(base + '-inc');
      if (inc) inc.onclick = function () { setVal((parseFloat(document.getElementById(base).value) || fallback) + step); };
      var reset = document.getElementById(base + '-reset');
      if (reset) reset.onclick = function () { setVal(fallback); };
    }
    bindStepper('rvw-skewx', 'skewX', 2, 0);
    bindStepper('rvw-skewy', 'skewY', 2, 0);
    bindStepper('rvw-rotx', 'rotX', 5, 0);
    bindStepper('rvw-roty', 'rotY', 5, 0);
    bindViewPad();
    var isoFlat = document.getElementById('rvw-iso-flat');
    if (isoFlat) isoFlat.onclick = function () { setView({ skewX: 0, skewY: 0, rotX: 0, rotY: 0, perspective: 900 }); };
    var isoLeft = document.getElementById('rvw-iso-left');
    if (isoLeft) isoLeft.onclick = function () { setView({ skewX: 10, skewY: 0, rotX: 50, rotY: 0, perspective: 900 }); };
    var isoRight = document.getElementById('rvw-iso-right');
    if (isoRight) isoRight.onclick = function () { setView({ skewX: -10, skewY: 0, rotX: 50, rotY: 0, perspective: 900 }); };
    var isoTop = document.getElementById('rvw-iso-top');
    if (isoTop) isoTop.onclick = function () { setView({ skewX: 0, skewY: 0, rotX: 60, rotY: -30, perspective: 900 }); };
    var isoBottom = document.getElementById('rvw-iso-bottom');
    if (isoBottom) isoBottom.onclick = function () { setView({ skewX: 0, skewY: 0, rotX: -45, rotY: 30, perspective: 900 }); };
    apply('rvw-persp', function () {
      var v = Math.max(200, parseFloat(this.value) || 900);
      this.value = v;
      var range = document.getElementById('rvw-persp-range');
      if (range) range.value = Math.min(2000, v);
      getState(el).perspective = v;
      updateViewPreview(); applyTransform(el); refreshBoxes();
    }.bind(document.getElementById('rvw-persp')));
    var perspRange = document.getElementById('rvw-persp-range');
    if (perspRange) perspRange.addEventListener('input', function () {
      var num = document.getElementById('rvw-persp');
      if (num) num.value = this.value;
      if (!this.dataset.rvwPushed) { pushUndo(el); this.dataset.rvwPushed = '1'; }
      getState(el).perspective = parseFloat(this.value) || 900;
      updateViewPreview(); applyTransform(el); refreshBoxes();
    });
    var viewReset = document.getElementById('rvw-view-reset');
    if (viewReset) viewReset.onclick = function () {
      setView({ skewX: 0, skewY: 0, rotX: 0, rotY: 0, perspective: 900 });
    };
    updateViewPreview();
    apply('rvw-op', function () {
      var pct = Math.min(100, Math.max(0, parseFloat(this.value) || 0));
      this.value = pct;
      var v = pct / 100;
      var range = document.getElementById('rvw-op-range');
      if (range) range.value = pct;
      el.style.opacity = v;
      recordProp(el, 'opacity', v); refreshBoxes();
    }.bind(document.getElementById('rvw-op')));
    var opRange = document.getElementById('rvw-op-range');
    if (opRange) opRange.addEventListener('input', function () {
      var num = document.getElementById('rvw-op');
      if (num) num.value = this.value;
      if (!this.dataset.rvwPushed) { pushUndo(el); this.dataset.rvwPushed = '1'; }
      var v = Math.min(100, Math.max(0, parseFloat(this.value) || 0)) / 100;
      el.style.opacity = v;
      recordProp(el, 'opacity', v); refreshBoxes();
    });
    var bh = document.getElementById('rvw-fliph');
    if (bh) bh.onclick = function () { pushUndo(el); var s = getState(el); s.fx = !s.fx; bh.classList.toggle('rvw-on', s.fx); applyTransform(el); refreshBoxes(); };
    var bv = document.getElementById('rvw-flipv');
    if (bv) bv.onclick = function () { pushUndo(el); var s = getState(el); s.fy = !s.fy; bv.classList.toggle('rvw-on', s.fy); applyTransform(el); refreshBoxes(); };
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
      var px = Math.max(6, parseInt(this.value, 10) || 6);
      this.value = px;
      el.style.fontSize = px + 'px';
      recordProp(el, 'fontSize', px + 'px');
      refreshBoxes();
    }.bind(document.getElementById('rvw-fs')));
    function setFontSize(v) {
      var inp = document.getElementById('rvw-fs');
      if (!inp) return;
      inp.value = Math.max(6, Math.round(v));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var fsDec = document.getElementById('rvw-fs-dec');
    if (fsDec) fsDec.onclick = function () { setFontSize((parseInt(document.getElementById('rvw-fs').value, 10) || st.fsBase || 12) - 1); };
    var fsInc = document.getElementById('rvw-fs-inc');
    if (fsInc) fsInc.onclick = function () { setFontSize((parseInt(document.getElementById('rvw-fs').value, 10) || st.fsBase || 12) + 1); };
    var fsReset = document.getElementById('rvw-fs-reset');
    if (fsReset) fsReset.onclick = function () { setFontSize(st.fsBase || Math.round(fs)); };
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
    if (!elState.has(el)) {
      elState.set(el, {
        rot: 0, fx: false, fy: false, scale: 1,
        skewX: 0, skewY: 0, rotX: 0, rotY: 0, perspective: 900
      });
    }
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
    var has3d = !!(s.rotX || s.rotY);
    if (has3d) t += ' perspective(' + Math.max(200, s.perspective || 900) + 'px)';
    if (s.rotX) t += ' rotateX(' + s.rotX + 'deg)';
    if (s.rotY) t += ' rotateY(' + s.rotY + 'deg)';
    if (s.rot) t += ' rotate(' + s.rot + 'deg)';
    if (s.skewX) t += ' skewX(' + s.skewX + 'deg)';
    if (s.skewY) t += ' skewY(' + s.skewY + 'deg)';
    if (s.fx) t += ' scaleX(-1)';
    if (s.fy) t += ' scaleY(-1)';
    if (s.scale && s.scale !== 1) t += ' scale(' + s.scale.toFixed(3) + ')';
    el.style.transform = t.trim();
    recordProp(el, 'transform', el.style.transform);
    recordProp(el, 'rotate', s.rot);
    recordProp(el, 'flipX', s.fx);
    recordProp(el, 'flipY', s.fy);
    recordProp(el, 'scale', s.scale);
    recordProp(el, 'skewX', s.skewX || 0);
    recordProp(el, 'skewY', s.skewY || 0);
    recordProp(el, 'rotateX', s.rotX || 0);
    recordProp(el, 'rotateY', s.rotY || 0);
    recordProp(el, 'perspective', s.perspective || 900);
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
      if (!(e.target.closest && e.target.closest('.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note,.rvw-ai-note,.rvw-pin'))) {
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
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-layers,.rvw-note,.rvw-ai-note')) return;
    if (e.target.classList.contains('rot')) {
      if (!selected || isLayerEl(selected)) return;
      e.preventDefault();
      pushUndo(selected);
      var rr = selected.getBoundingClientRect();
      rotating = { el: selected, cx: rr.left + rr.width / 2, cy: rr.top + rr.height / 2 };
      return;
    }
    if (e.target.classList.contains('se')) {
      if (!selected || isLayerEl(selected)) return;
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
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-note,.rvw-ai-note,.rvw-pin,.rvw-region')) return;
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

  function addComment(x, y, w, h, clientX, clientY, target) {
    var note = document.createElement('div');
    note.className = 'rvw-note rvw';
    note.style.left = Math.min(clientX, window.innerWidth - 260) + 'px';
    note.style.top = Math.min(clientY + 10, window.innerHeight - 150) + 'px';
    var targetLine = target ? '<div class="rvw-feedback-target">' + T.attachedTo + ': ' + escapeHTML(target.label) + '</div>' : '';
    note.innerHTML = targetLine + '<textarea placeholder="' + (w ? T.noteRegion : T.notePoint) + '"></textarea>' +
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
        changes.pins.push({ n: pinCount, type: 'region', x: x + '%', y: y + '%', w: w + '%', h: h + '%', note: txt, target: target });
      } else {
        var pin = document.createElement('div');
        pin.className = 'rvw-pin';
        pin.style.left = x + '%'; pin.style.top = y + '%';
        pin.textContent = pinCount;
        pin.dataset.n = pinCount; pin.dataset.note = txt;
        frame.appendChild(pin);
        pushUndoPin(pin);
        changes.pins.push({ n: pinCount, type: 'point', x: x + '%', y: y + '%', note: txt, target: target });
      }
      updateCount();
    };
  }

  document.addEventListener('mousedown', function (e) {
    if (mode !== 'comment') return;
    if (spaceDown || e.button === 1) return; // đang pan canvas
    if (e.target.closest('.rvw-topbar,.rvw-panel,.rvw-note,.rvw-ai-note,.rvw-pin,.rvw-region')) return;
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
    var target = isRegion
      ? bestTargetForRegion({ left: x1, top: y1, right: x1 + wpx, bottom: y1 + hpx })
      : targetOf(pickAtPoint(cx, cy), 'hit-test');
    addComment(x, y, isRegion ? w : 0, isRegion ? h : 0, cx, cy, target);
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
    } else if (!e.target.closest('.rvw-note,.rvw-ai-note')) hideNoteView();
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
      texts: changes.texts, moves: changes.moves, props: changes.props,
      element_feedback: changes.element_feedback,
      pins: changes.pins
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
          .then(function (res) { showToast(res.ok ? T.savedSource + res.path : T.errSave + res.error, !res.ok); })
          .catch(function (err) { showToast(T.errServer + err, true); });
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
          showToast(res.ok ? T.exported + res.path : T.errExport + res.error, !res.ok);
        }).catch(function (err) {
          btn.disabled = false; btn.innerHTML = ICONS.image + T.png;
          showToast(T.errServer + err, true);
        });
      };
    }).catch(showNoServer);
  } else {
    // Mở trực tiếp qua file:// (không phải link http://127.0.0.1:xxxx của open-review.py)
    // → không có review-server, Lưu/Xuất PNG không thể hoạt động (không ghi được xuống đĩa).
    showNoServer();
  }
})();
