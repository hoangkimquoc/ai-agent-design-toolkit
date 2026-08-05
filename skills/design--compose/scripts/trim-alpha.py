"""Trim viền trong suốt của ảnh PNG có alpha — bước chuẩn trước khi đưa asset vào slot.

Vì sao bắt buộc: asset tách nền thường có padding trong suốt lớn quanh vật thể
(case iPhone: vật thể 312x548 trong khung 680x680) → object-fit contain co nhỏ
vật thể và tạo khe hở với bóng/floor dù slot đã neo đáy.

Usage:
    python trim-alpha.py input.png                    # → input-trim.png
    python trim-alpha.py input.png -o out.png
    python trim-alpha.py input.png --threshold 24     # ngưỡng alpha coi là "có vật thể"
"""
import argparse
import os
import sys

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

from PIL import Image


def trim_alpha(src: str, dst: str, threshold: int) -> bool:
    im = Image.open(src)
    if im.mode not in ("RGBA", "LA"):
        print(f"Bỏ qua: {src} không có kênh alpha (mode={im.mode}) — không cần trim.")
        return False
    im = im.convert("RGBA")
    mask = im.getchannel("A").point(lambda a: 255 if a > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        print(f"Lỗi: {src} trong suốt hoàn toàn — không có vật thể.")
        return False
    out = im.crop(bbox)
    out.save(dst)
    pad = (bbox[0], bbox[1], im.width - bbox[2], im.height - bbox[3])
    print(f"{os.path.basename(src)}: {im.size} → {out.size} (padding đã cắt: trái {pad[0]}, trên {pad[1]}, phải {pad[2]}, dưới {pad[3]})")
    print(f"→ {os.path.abspath(dst)}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Trim viền trong suốt của PNG alpha")
    parser.add_argument("input", help="Ảnh PNG nguồn (có alpha)")
    parser.add_argument("-o", "--output", help="File output (mặc định: <tên>-trim.png, giữ nguyên file gốc)")
    parser.add_argument("--threshold", type=int, default=10, help="Ngưỡng alpha coi là vật thể (mặc định 10)")
    args = parser.parse_args()

    stem, ext = os.path.splitext(args.input)
    dst = args.output or f"{stem}-trim{ext or '.png'}"
    sys.exit(0 if trim_alpha(args.input, dst, args.threshold) else 1)
