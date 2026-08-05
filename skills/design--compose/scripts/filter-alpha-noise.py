"""Lọc nhiễu alpha sau rmbg — bước chuẩn trước khi trim-alpha.py.

Vì sao bắt buộc: rmbg (model briaai) có thể để lại rất nhiều pixel alpha giữa
chừng (không 0 không 255) rải khắp ảnh — không phải mép lông thật mà là nhiễu
matting lan rộng (kiểm chứng: ảnh xám nền phẳng vẫn ra ~19% pixel alpha giữa
chừng, 2026-08-05).

Chiến lược hysteresis (như Canny 2-threshold) — mạnh hơn "khối lớn nhất" đơn
thuần vì phân biệt được nhiễu-lan-rộng khỏi vật-thể-thật theo ĐỘ TIN CẬY chứ
không chỉ kích thước:
1. `weak`   = alpha > --weak-threshold — vùng CÓ THỂ là vật thể (bao gồm mép mềm).
2. `strong` = alpha > --strong-threshold — vùng CHẮC CHẮN là vật thể (lõi đặc).
3. Label `weak`; chỉ giữ khối nào chứa ít nhất 1 pixel `strong` bên trong — nhiễu
   matting hiếm khi có lõi alpha=255 đặc, vật thể thật luôn có.
   → giữ được TOÀN BỘ mép mềm của vật thể thật (vì giữ cả khối weak, không chỉ
   phần strong), mà vẫn loại sạch nhiễu lan rộng không có lõi đặc.
   → cũng tự động giữ ĐỦ nhiều chủ thể tách rời trong 1 ảnh (mỗi chủ thể có lõi
   strong riêng), không cần đoán ngưỡng kích thước tương đối.

Usage:
    python filter-alpha-noise.py input.png                 # ghi đè input.png
    python filter-alpha-noise.py input.png -o out.png
    python filter-alpha-noise.py input.png --weak-threshold 60 --strong-threshold 200 --dilate 2
"""
import argparse
import os
import sys

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

import numpy as np
from PIL import Image
from scipy import ndimage


def filter_alpha_noise(src: str, dst: str, weak_threshold: int, strong_threshold: int, dilate: int) -> bool:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    alpha = arr[..., 3]

    weak = alpha > weak_threshold
    strong = alpha > strong_threshold
    labels, n = ndimage.label(weak)
    if n == 0:
        print(f"Lỗi: {src} không có vùng alpha nào vượt ngưỡng {weak_threshold}.")
        return False

    strong_ids = set(np.unique(labels[strong])) - {0}
    if not strong_ids:
        print(f"Lỗi: {src} không có khối nào đạt ngưỡng tin cậy {strong_threshold}.")
        return False

    mask = np.isin(labels, list(strong_ids))
    if dilate:
        mask = ndimage.binary_dilation(mask, iterations=dilate)

    arr[..., 3] = np.where(mask, alpha, 0)
    Image.fromarray(arr, mode="RGBA").save(dst)

    print(f"{os.path.basename(src)}: {n} khối (weak), giữ {len(strong_ids)} khối có lõi tin cậy (strong > {strong_threshold})")
    print(f"→ {os.path.abspath(dst)}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lọc nhiễu alpha sau rmbg — hysteresis theo độ tin cậy, giữ mọi chủ thể có lõi đặc")
    parser.add_argument("input", help="Ảnh PNG nguồn (có alpha, output của rmbg)")
    parser.add_argument("-o", "--output", help="File output (mặc định: ghi đè input)")
    parser.add_argument("--weak-threshold", type=int, default=60, help="Ngưỡng alpha coi là 'có thể là vật thể' (mặc định 60)")
    parser.add_argument("--strong-threshold", type=int, default=200, help="Ngưỡng alpha coi là 'chắc chắn là vật thể' — lõi đặc (mặc định 200)")
    parser.add_argument("--dilate", type=int, default=2, help="Số vòng dilate giữ mép mềm sau lọc (mặc định 2)")
    args = parser.parse_args()

    dst = args.output or args.input
    sys.exit(0 if filter_alpha_noise(args.input, dst, args.weak_threshold, args.strong_threshold, args.dilate) else 1)
