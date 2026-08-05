"""Chụp file HTML thiết kế thành ảnh PNG đúng pixel bằng Chrome/Edge headless.

Script này KHÔNG chỉnh nội dung — agent sửa text/asset trực tiếp trong file HTML
(bản copy từ templates/social-frame.html), script chỉ render và capture.

Usage:
    python compose-screenshot.py --html design.html --aspect 1:1 --output out.png
    python compose-screenshot.py --html design.html --size 1600x900 --output out.png
"""
import argparse
import os
import subprocess
import sys

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

# Aspect preset → kích thước chuẩn kênh phân phối
ASPECT_PRESETS = {
    "1:1": (1080, 1080),      # Facebook/Instagram post
    "16:9": (1920, 1080),     # Web hero / YouTube thumbnail
    "9:16": (1080, 1920),     # Stories / TikTok / Reels
    "4:5": (1080, 1350),      # Facebook mobile post
    "1.91:1": (1200, 630),    # Facebook share link / OG image
    "2.35:1": (1920, 817),    # Cinematic cover
}

BROWSER_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]


def find_browser() -> str:
    for path in BROWSER_CANDIDATES:
        if os.path.exists(path):
            return path
    return ""


def resolve_size(aspect: str | None, size: str | None) -> tuple[int, int]:
    if size:
        try:
            w, h = size.lower().split("x")
            return int(w), int(h)
        except ValueError:
            raise SystemExit(f"Lỗi: --size phải dạng WxH (vd 1600x900), nhận được: {size}")
    if aspect in ASPECT_PRESETS:
        return ASPECT_PRESETS[aspect]
    raise SystemExit(
        f"Lỗi: cần --aspect ({', '.join(ASPECT_PRESETS)}) hoặc --size WxH tùy biến."
    )


def capture(browser: str, html_path: str, width: int, height: int,
            output_path: str, wait_ms: int) -> bool:
    abs_html = os.path.abspath(html_path)
    if not os.path.exists(abs_html):
        print(f"Lỗi: không tìm thấy file HTML: {abs_html}")
        return False
    file_url = "file:///" + abs_html.replace(os.sep, "/")

    abs_output = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(abs_output) or ".", exist_ok=True)

    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={width},{height}",
        # Chờ font/ảnh mạng (Google Fonts) load xong trước khi chụp
        f"--virtual-time-budget={wait_ms}",
        f"--screenshot={abs_output}",
        file_url,
    ]
    print(f"Render {width}x{height} → {abs_output}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"Lỗi Chrome (exit {result.returncode}): {result.stderr.strip()[:500]}")
            return False
        if not os.path.exists(abs_output):
            print(f"Lỗi: lệnh chạy xong nhưng không có file output. Stderr: {result.stderr.strip()[:300]}")
            return False
        print(f"OK: {abs_output}")
        return True
    except subprocess.TimeoutExpired:
        print("Lỗi: hết thời gian chờ (60s) khi render.")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Chụp HTML thiết kế thành PNG bằng browser headless")
    parser.add_argument("--html", required=True, help="Đường dẫn file HTML thiết kế")
    parser.add_argument("--aspect", choices=list(ASPECT_PRESETS), help="Tỉ lệ preset")
    parser.add_argument("--size", help="Kích thước tùy biến WxH (ghi đè --aspect)")
    parser.add_argument("--output", required=True, help="Đường dẫn PNG output")
    parser.add_argument("--wait", type=int, default=5000, help="Virtual time budget ms chờ font/ảnh (default 5000)")
    parser.add_argument("--chrome-path", help="Đường dẫn browser tùy biến")
    args = parser.parse_args()

    browser = args.chrome_path or find_browser()
    if not browser:
        print("Lỗi: không tìm thấy Chrome/Edge. Chỉ định bằng --chrome-path.")
        return 1

    width, height = resolve_size(args.aspect, args.size)
    ok = capture(browser, args.html, width, height, args.output, args.wait)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
