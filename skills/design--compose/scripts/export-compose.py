"""Export design--compose HTML to a portable handoff JSON manifest."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
STYLE_RE = re.compile(r"([-\w]+)\s*:\s*([^;]+)")
VAR_RE = re.compile(r"--frame-([wh])\s*:\s*([0-9.]+)px")
VOID_TAGS = {"meta", "link", "img", "br", "hr", "input"}
LAYER_NAMES = (
    ("layer-bg", "background"),
    ("layer-art", "art"),
    ("layer-adjust", "adjustment"),
    ("layer-content", "content"),
)

class Node:
    def __init__(self, tag: str, attrs: dict[str, str], parent: Node | None = None) -> None:
        self.tag, self.attrs, self.parent = tag, attrs, parent
        self.children: list[Node] = []
        self.text_parts: list[str] = []

    @property
    def classes(self) -> list[str]:
        return [c for c in self.attrs.get("class", "").split() if c]

    @property
    def text(self) -> str:
        return " ".join(" ".join(self.text_parts).split())

class ComposeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {})
        self.stack = [self.root]
        self.styles: list[str] = []
        self.in_style = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        node = Node(tag, {k: v or "" for k, v in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        self.in_style = self.in_style or tag == "style"
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "style":
            self.in_style = False
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, data: str) -> None:
        if self.in_style:
            self.styles.append(data)
        elif data.strip():
            self.stack[-1].text_parts.append(data.strip())

def walk(node: Node):
    yield node
    for child in node.children:
        yield from walk(child)

def style_map(value: str) -> dict[str, str]:
    return {m.group(1): m.group(2).strip() for m in STYLE_RE.finditer(value or "")}

def frame_size(css: str) -> tuple[float, float]:
    found = {m.group(1): float(m.group(2)) for m in VAR_RE.finditer(css)}
    return found.get("w", 1080.0), found.get("h", 1080.0)

def abs_asset(html_path: Path, src: str) -> str:
    if not src or src.startswith("data:"):
        return src
    parsed = urlparse(src)
    if parsed.scheme == "file":
        return unquote(parsed.path.lstrip("/"))
    return src if parsed.scheme else str((html_path.parent / src).resolve())

def selector_for(node: Node) -> str:
    if node.attrs.get("id"):
        return "#" + node.attrs["id"]
    suffix = "." + ".".join(node.classes[:3]) if node.classes else ""
    return node.tag + suffix
def role_for(node: Node) -> str:
    if node.tag == "img":
        return "image"
    if node.text:
        return "text"
    return "slot" if "slot" in node.classes else "group"

def nearest_layer(node: Node) -> str:
    cur = node
    while cur:
        classes = set(cur.classes)
        for klass, name in LAYER_NAMES:
            if klass in classes:
                return name
        cur = cur.parent
    return ""

def expand_inset(styles: dict[str, str]) -> None:
    if "inset" not in styles or ("top" in styles and "left" in styles):
        return
    parts = styles["inset"].split()
    if len(parts) == 1:
        top = right = bottom = left = parts[0]
    elif len(parts) == 2:
        top = bottom = parts[0]
        right = left = parts[1]
    elif len(parts) == 3:
        top, right, bottom = parts
        left = right
    else:
        top, right, bottom, left = parts[:4]
    for key, val in {"top": top, "right": right, "bottom": bottom, "left": left}.items():
        if val != "auto":
            styles.setdefault(key, val)

def pct(raw: str, frame_len: float) -> str:
    if raw.endswith("%"):
        return raw
    if raw.endswith("px"):
        return f"{float(raw[:-2]) / frame_len * 100:.4g}%"
    return raw

def bounds(node: Node, frame_w: float, frame_h: float) -> dict[str, str]:
    styles = style_map(node.attrs.get("style", ""))
    expand_inset(styles)
    dims = {"left": frame_w, "right": frame_w, "width": frame_w,
            "top": frame_h, "bottom": frame_h, "height": frame_h}
    return {key: pct(styles[key], length) for key, length in dims.items() if key in styles}

def node_item(html_path: Path, node: Node, frame_w: float, frame_h: float) -> dict:
    item = {
        "id": node.attrs.get("id", ""),
        "selector": selector_for(node),
        "tag": node.tag,
        "layer": nearest_layer(node),
        "role": role_for(node),
        "class": node.attrs.get("class", ""),
        "bounds": bounds(node, frame_w, frame_h),
        "style": style_map(node.attrs.get("style", "")),
    }
    if node.text:
        item["text"] = node.text
    if node.attrs.get("src"):
        item["src"] = node.attrs["src"]
        item["asset_path"] = abs_asset(html_path, node.attrs["src"])
    return item

def export_manifest(html_path: Path) -> dict:
    parser = ComposeParser()
    parser.feed(html_path.read_text(encoding="utf-8"))
    frame_w, frame_h = frame_size("\n".join(parser.styles))
    nodes = []
    for node in walk(parser.root):
        layer = nearest_layer(node)
        keep = node.tag in {"img", "svg"} or node.text or node.attrs.get("style") or "slot" in node.classes
        if layer and keep and node.tag not in {"document", "style", "script"}:
            nodes.append(node_item(html_path, node, frame_w, frame_h))
    return {
        "format": "design-compose-handoff",
        "version": "1.0",
        "source": str(html_path.resolve()),
        "frame": {"w": int(frame_w), "h": int(frame_h), "unit": "px"},
        "targets": ["figma-plugin", "expo-react-native", "react-web", "png"],
        "nodes": nodes,
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="Export design-compose HTML to handoff JSON")
    parser.add_argument("html", help="Design HTML file")
    parser.add_argument("--out", help="Output JSON path; default: <html>-handoff.json")
    args = parser.parse_args()
    html_path = Path(args.html).resolve()
    if not html_path.is_file():
        print(f"Lỗi: không tìm thấy HTML: {html_path}")
        return 1
    out = Path(args.out).resolve() if args.out else html_path.with_name(html_path.stem + "-handoff.json")
    out.write_text(json.dumps(export_manifest(html_path), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {out}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
