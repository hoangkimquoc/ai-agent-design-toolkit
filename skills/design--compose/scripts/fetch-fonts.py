"""Tải Google Fonts (ưu tiên subset Vietnamese) về local cho một thiết kế.

Designer chọn font theo tính cách thiết kế → script tải đúng font đó về,
sinh fonts.css để link vào design file. Cảnh báo nếu font KHÔNG hỗ trợ
tiếng Việt (thiếu subset vietnamese) — tránh chữ rơi về fallback xấu.

Usage:
    python fetch-fonts.py --family "Baloo 2:700,800" --family "Quicksand:500,700" --out <dir>/fonts
    # → <dir>/fonts/*.woff2 + <dir>/fonts/fonts.css
"""
import argparse
import os
import re
import sys
import urllib.parse
import urllib.request

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

# UA Chrome để css2 trả về woff2 (UA cũ sẽ nhận ttf/woff1)
_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}


def parse_family(spec: str) -> tuple[str, list[str]]:
    """'Baloo 2:700,800' → ('Baloo 2', ['700','800']); mặc định 400,700 nếu thiếu."""
    if ":" in spec:
        name, weights = spec.split(":", 1)
        return name.strip(), [w.strip() for w in weights.split(",") if w.strip()]
    return spec.strip(), ["400", "700"]


def build_css2_url(families: list[tuple[str, list[str]]]) -> str:
    parts = []
    for name, weights in families:
        fam = urllib.parse.quote(name).replace("%20", "+")
        parts.append(f"family={fam}:wght@{';'.join(sorted(set(weights)))}")
    return "https://fonts.googleapis.com/css2?" + "&".join(parts) + "&display=swap"


def fetch_fonts(families: list[tuple[str, list[str]]], out_dir: str, subsets: list[str]) -> bool:
    url = build_css2_url(families)
    try:
        css = urllib.request.urlopen(urllib.request.Request(url, headers=_UA), timeout=30).read().decode()
    except Exception as e:
        print(f"Lỗi tải CSS từ Google Fonts: {e}")
        return False

    os.makedirs(out_dir, exist_ok=True)
    blocks = re.findall(r"/\* (\w+) \*/\s*@font-face \{(.*?)\}", css, re.S)

    faces: list[str] = []
    got_vn: dict[str, bool] = {name: False for name, _ in families}
    for subset, body in blocks:
        if subset not in subsets:
            continue
        fam = re.search(r"font-family: '([^']+)'", body).group(1)
        weight = re.search(r"font-weight: (\d+)", body).group(1)
        src = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        urange = re.search(r"unicode-range: ([^;]+);", body).group(1)
        if subset == "vietnamese":
            got_vn[fam] = True
        fname = f"{fam.lower().replace(' ', '-')}-{weight}-{subset}.woff2"
        fpath = os.path.join(out_dir, fname)
        if not os.path.exists(fpath):
            urllib.request.urlretrieve(src, fpath)
        faces.append(
            f"@font-face {{ font-family: '{fam}'; font-style: normal; font-weight: {weight}; "
            f"font-display: swap; src: url('{fname}') format('woff2'); unicode-range: {urange}; }}"
        )

    if not faces:
        print("Lỗi: không tìm thấy @font-face nào khớp — kiểm tra tên font/weights.")
        return False

    # Append vào fonts.css hiện có (dedup theo nội dung dòng)
    css_path = os.path.join(out_dir, "fonts.css")
    existing = set()
    if os.path.exists(css_path):
        existing = set(open(css_path, encoding="utf-8").read().splitlines())
    with open(css_path, "a", encoding="utf-8") as f:
        for face in faces:
            if face not in existing:
                f.write(face + "\n")

    ok = True
    for name, has_vn in got_vn.items():
        if "vietnamese" in subsets and not has_vn:
            print(f"⚠️  CẢNH BÁO: '{name}' KHÔNG có subset Vietnamese — chữ có dấu sẽ rơi về font fallback. Cân nhắc font khác.")
            ok = False
        else:
            print(f"✓ {name}: đã tải ({sum(1 for fc in faces if name in fc)} faces)")
    print(f"fonts.css: {os.path.abspath(css_path)}")
    return ok


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tải Google Fonts subset VN về local cho thiết kế")
    parser.add_argument("--family", action="append", required=True,
                        help="'Tên Font:weight1,weight2' — lặp lại cho nhiều font")
    parser.add_argument("--out", required=True, help="Thư mục output (chứa woff2 + fonts.css)")
    parser.add_argument("--subsets", default="vietnamese,latin", help="Subset cần tải (default: vietnamese,latin)")
    args = parser.parse_args()

    fams = [parse_family(s) for s in args.family]
    subs = [s.strip() for s in args.subsets.split(",")]
    ok = fetch_fonts(fams, args.out, subs)
    sys.exit(0 if ok else 1)
