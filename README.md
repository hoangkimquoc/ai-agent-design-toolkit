# ai-design-compose

**Design-tool thinking for AI agents.** Compose marketing visuals with layered HTML (Background → Art → Adjustment → Text), review them in a Figma-like browser editor, and export pixel-perfect PNGs — with zero AI tokens spent on the review/export loop.

*Đọc tiếng Việt: [README.vi.md](README.vi.md)*

Built for AI coding agents (Claude Code, Codex, Qwen...) that follow skill instructions, but every tool works standalone.

## Why

AI image generators paint text badly (especially non-Latin scripts like Vietnamese), can't render real QR codes, and force a full regeneration for a one-word change. This toolkit splits the work the way a designer would:

| Layer | Tool | Why |
|---|---|---|
| Background | AI-generated image or CSS | artistic texture |
| Art / assets | transparent PNGs in fixed slots | swap without breaking layout |
| Adjustment | CSS filters/blend (like Photoshop adjustment layers) | change mood without regenerating |
| Text & CTA | pure HTML/CSS | 100% correct type, any language, real QR codes |

The browser **is** the live render. A local review server makes Save-to-source and Export-PNG one-click, offline, token-free.

## What's inside

```
skills/design--compose/
├── SKILL.md                    # Full step-by-step process for AI agents (Vietnamese, see Roadmap)
├── templates/social-frame.html # 3-layer design frame, 4 style presets, slot system
├── config/style-registry.json  # Palettes, fonts, AI art-direction blocks per style
├── assets/fonts/               # Be Vietnam Pro + Baloo 2 (Vietnamese subsets, SIL OFL)
└── scripts/
    ├── compose-screenshot.py   # HTML → exact-pixel PNG via headless Chrome
    ├── review-overlay.js       # In-browser editor (layers, multi-select, snap, undo, comments)
    ├── review-server.py        # Local server: Save-to-source + Export-PNG buttons
    ├── fetch-fonts.py          # Download Google Fonts (Vietnamese subset) for offline use
    └── trim-alpha.py           # Trim transparent padding from cut-out PNGs
workflows/design-compose-pipeline.md  # Full pipeline: AI gen → background removal → compose → review
```

## Requirements

- Google Chrome (or Edge) — used headless for pixel-perfect capture
- Python 3.10+ — scripts use stdlib only, except `trim-alpha.py` (`pip install pillow`)
- Optional: `npm i -g rmbg-cli` (AI background removal), an image-gen backend (e.g. Codex CLI) for AI layers

## Install

1. Copy `skills/design--compose/` into your agent workspace's skills directory (e.g. `.claude/skills/`).
2. Copy `workflows/design-compose-pipeline.md` into your workflows directory if you use one.
3. The template references the skill via a `file:///<path-to-skill>` placeholder — either replace it with your actual path, or simply always review through `review-server.py`: it maps the placeholder automatically, and your first **Save** writes the correct absolute paths for you.

## Quick start

```bash
# 1. Ask your AI agent to compose a design (it reads SKILL.md), or copy the template yourself
# 2. Start the review server and open the editor:
python skills/design--compose/scripts/review-server.py --dir <design-folder> --port 7799
# then open: http://127.0.0.1:7799/<design>.html#review

# 3. Edit visually, then click "Xuất PNG" (Export PNG) — done. No AI tokens used.
```

## The review editor

UI auto-detects your browser language (Vietnamese/English) — toggle anytime with the VI/EN button on the topbar.

- **Select (V)**: click = outer group · double-click = drill one level deeper · Ctrl+click = deepest element · Shift+click = add/remove from multi-selection · drag on empty canvas = marquee-select
- Drag to move with **snap & alignment guides** (frame + sibling edges/centers, hold Alt to bypass) · arrows nudge 2px, Shift+arrows 10px · Delete hides element
- Double-click text to edit inline — properties panel edits X/Y/W/H, rotation, opacity, flip, z-order, font size
- **Layers panel**: full tree, per-layer visibility toggles, precise selection
- **Comment (C)**: click = numbered pin, drag = region annotation; click a pin to read it back
- **Ctrl+Z** undo (RAM-scaled history) · **Space+drag** pan · **Ctrl+wheel** cursor-anchored zoom
- **Export feedback**: downloads a JSON of every change + comment — hand it to your AI agent when you want it to redesign something
- **Lưu (Save)**: writes live edits back into the source HTML (with `.bak` backup)
- **Xuất PNG (Export PNG)**: saves source first, then captures from it — PNG and HTML never drift apart

## Design principles baked into the skill

1. **Never let AI paint text.** Text is always HTML — correct in any language, real scannable QR codes.
2. **Frame-first**: slots define layout; images only fill them (`object-fit`). Regenerate an asset without breaking composition.
3. **Trim transparent padding** on every alpha asset before slotting (`trim-alpha.py`) — padding breaks scale and floor contact.
4. **Shadows and reflections are built, not painted**: CSS drop-shadow + flipped-and-masked reflection slots.
5. **Fonts have personality**: pick per design mood, fetch Vietnamese-safe subsets locally (`fetch-fonts.py` warns when a font lacks your script).

## Roadmap

- English translation of `SKILL.md` (agent instructions currently in Vietnamese — AI agents follow them regardless of your conversation language)
- Inpainting backend integration for structural image edits

## License

Code: [MIT](LICENSE). Bundled fonts (Be Vietnam Pro, Baloo 2): [SIL Open Font License 1.1](skills/design--compose/assets/fonts/OFL.txt).

---
Built through an AI-agent pair-design workflow — Hoang Kim Quoc, 2026.
