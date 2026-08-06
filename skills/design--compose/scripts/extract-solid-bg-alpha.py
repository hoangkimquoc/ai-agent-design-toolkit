"""Tách nền phẳng bằng connected-background keying, tránh rmbg ăn vào chủ thể.

Dùng cho asset đã prompt "isolated on solid plain background". Khác rmbg/modnet,
script chỉ xóa vùng nền có màu gần màu 4 góc VÀ nối với mép ảnh, nên không làm
trong suốt các vùng lông/kem/cam tương tự nằm bên trong chủ thể.

Usage:
    python extract-solid-bg-alpha.py input.png
    python extract-solid-bg-alpha.py input.png -o out.png
    python extract-solid-bg-alpha.py input.png --threshold 44 --feather 2 --pad 14
"""
import argparse
import os
import sys
from collections import deque

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

import numpy as np
from PIL import Image, ImageFilter


def estimate_bg_color(arr: np.ndarray) -> np.ndarray:
    h, w, _ = arr.shape
    sample = max(10, min(h, w) // 18)
    patches = [
        arr[:sample, :sample, :3],
        arr[:sample, -sample:, :3],
        arr[-sample:, :sample, :3],
        arr[-sample:, -sample:, :3],
    ]
    pixels = np.concatenate([p.reshape(-1, 3) for p in patches], axis=0)
    return np.median(pixels, axis=0)


def connected_background(candidate: np.ndarray) -> np.ndarray:
    h, w = candidate.shape
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    for x in range(w):
        if candidate[0, x]:
            queue.append((0, x))
        if candidate[h - 1, x]:
            queue.append((h - 1, x))
    for y in range(h):
        if candidate[y, 0]:
            queue.append((y, 0))
        if candidate[y, w - 1]:
            queue.append((y, w - 1))

    while queue:
        y, x = queue.popleft()
        if y < 0 or x < 0 or y >= h or x >= w:
            continue
        if visited[y, x] or not candidate[y, x]:
            continue
        visited[y, x] = True
        queue.append((y - 1, x))
        queue.append((y + 1, x))
        queue.append((y, x - 1))
        queue.append((y, x + 1))

    return visited


def trim_alpha(im: Image.Image, threshold: int, pad: int) -> Image.Image:
    arr = np.array(im)
    ys, xs = np.where(arr[..., 3] > threshold)
    if len(xs) == 0:
        return im
    left = max(int(xs.min()) - pad, 0)
    top = max(int(ys.min()) - pad, 0)
    right = min(int(xs.max()) + pad + 1, im.width)
    bottom = min(int(ys.max()) + pad + 1, im.height)
    return im.crop((left, top, right, bottom))


def extract_solid_bg_alpha(src: str, dst: str, threshold: int, feather: int, pad: int, decontaminate: bool) -> bool:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im).astype(np.float32)
    bg_color = estimate_bg_color(arr)
    dist = np.linalg.norm(arr[..., :3] - bg_color, axis=2)
    bg_mask = connected_background(dist < threshold)

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    if feather:
        alpha = np.array(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(feather)))

    # Giữ lõi chủ thể opaque; feather chỉ nằm quanh biên nền thật.
    solid_subject = (~bg_mask) & (dist > threshold + 18)
    alpha[solid_subject] = 255

    rgba = np.array(im).astype(np.float32)
    if decontaminate:
        a = np.maximum(alpha.astype(np.float32) / 255.0, 0.01)
        edge = (alpha > 0) & (alpha < 255)
        for channel in range(3):
            rgba[..., channel][edge] = np.clip(
                (rgba[..., channel][edge] - bg_color[channel] * (1 - a[edge])) / a[edge],
                0,
                255,
            )

    rgba[..., 3] = alpha
    out = trim_alpha(Image.fromarray(rgba.astype(np.uint8), mode="RGBA"), 4, pad)
    out.save(dst)

    removed = int(bg_mask.sum())
    total = int(bg_mask.size)
    print(
        f"{os.path.basename(src)}: bg={bg_color.round(1).tolist()} "
        f"threshold={threshold}, removed={removed / total:.1%} → {out.size}"
    )
    print(f"→ {os.path.abspath(dst)}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tách nền phẳng bằng connected-background keying")
    parser.add_argument("input", help="Ảnh nguồn trên nền phẳng đồng nhất")
    parser.add_argument("-o", "--output", help="File output (mặc định: <tên>-solid-alpha.png)")
    parser.add_argument("--threshold", type=int, default=44, help="Khoảng cách màu coi là nền (mặc định 44)")
    parser.add_argument("--feather", type=int, default=2, help="Blur alpha ở mép nền (mặc định 2)")
    parser.add_argument("--pad", type=int, default=14, help="Padding giữ lại sau trim alpha (mặc định 14px)")
    parser.add_argument("--no-decontaminate", action="store_true", help="Không khử màu nền ở mép bán trong suốt")
    args = parser.parse_args()

    stem, ext = os.path.splitext(args.input)
    dst = args.output or f"{stem}-solid-alpha{ext or '.png'}"
    ok = extract_solid_bg_alpha(
        args.input,
        dst,
        args.threshold,
        args.feather,
        args.pad,
        not args.no_decontaminate,
    )
    sys.exit(0 if ok else 1)
