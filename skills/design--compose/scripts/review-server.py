"""Local review server — cho nút "Xuất PNG" trên overlay hoạt động không cần Claude.

Chạy nền trên máy user (0 token). Phục vụ thư mục design qua HTTP và expose:
  GET  /__review__/ping           → {"ok": true} (overlay detect để bật option PNG/Handoff)
  POST /__review__/export?w=&h=   → body = HTML sạch của DOM hiện tại (kèm mọi chỉnh sửa
                                    live chưa lưu) → chụp headless Chrome → PNG cạnh design
  POST /__review__/handoff        → body = HTML sạch → lưu source → xuất *-handoff.json
  GET  /__skill__/<path>          → serve file từ thư mục skill (overlay js, fonts cache)
  GET  *.html                     → tự rewrite đường dẫn file:///...design--compose → /__skill__/

Usage:
    python review-server.py --dir <design-dir> [--port 7799]
    # rồi mở: http://127.0.0.1:7799/design-xxx.html#review
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOT = os.path.join(SKILL_DIR, "scripts", "compose-screenshot.py")
HANDOFF = os.path.join(SKILL_DIR, "scripts", "export-compose.py")
# Mọi biến thể URL file:/// trỏ vào thư mục skill → map sang /__skill__/
_SKILL_URL_RE = re.compile(r"file:///[^\"']*(?:design--compose|<path-to-skill>)", re.I)
_REVIEW_OVERLAY_TAG = '<script src="/__skill__/scripts/review-overlay.js"></script>'


class ReviewHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # gọn log
        pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/__review__/ping":
            # dir để open-review.py nhận diện server nào đang serve thư mục nào
            return self._json(200, {"ok": True, "dir": os.getcwd()})
        if parsed.path.startswith("/__skill__/"):
            rel = parsed.path[len("/__skill__/"):]
            full = os.path.normpath(os.path.join(SKILL_DIR, rel))
            if not full.startswith(SKILL_DIR) or not os.path.isfile(full):
                return self._json(404, {"ok": False, "error": "not found"})
            self.send_response(200)
            ctype = self.guess_type(full)
            self.send_header("Content-Type", ctype)
            with open(full, "rb") as f:
                data = f.read()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if parsed.path.endswith(".html"):
            full = os.path.normpath(os.path.join(os.getcwd(), parsed.path.lstrip("/")))
            if os.path.isfile(full):
                html = open(full, encoding="utf-8").read()
                html = _SKILL_URL_RE.sub("/__skill__", html)
                if "review-overlay.js" not in html:
                    if "</body>" in html:
                        html = html.replace("</body>", f"  {_REVIEW_OVERLAY_TAG}\n</body>", 1)
                    else:
                        html += f"\n{_REVIEW_OVERLAY_TAG}\n"
                body = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        return super().do_GET()

    def _read_html(self):
        """Đọc body + rewrite /__skill__ về file:/// để source lưu ra vẫn tự chạy qua file protocol."""
        length = int(self.headers.get("Content-Length", 0))
        html = self.rfile.read(length).decode("utf-8")
        return html.replace("/__skill__", "file:///" + SKILL_DIR.replace(os.sep, "/"))

    def _save_source(self, name, html):
        """Ghi đè file design source (backup .bak bản trước đó)."""
        fname = os.path.basename(name)  # chặn path traversal
        if not fname.endswith(".html"):
            fname += ".html"
        full = os.path.join(os.getcwd(), fname)
        if os.path.exists(full):
            shutil.copy2(full, full + ".bak")
        with open(full, "w", encoding="utf-8") as f:
            f.write(html)
        return full

    def do_POST(self):
        parsed = urlparse(self.path)
        q = parse_qs(parsed.query)
        name = q.get("name", ["design.html"])[0]

        if parsed.path == "/__review__/save":
            try:
                full = self._save_source(name, self._read_html())
                return self._json(200, {"ok": True, "path": full})
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)})

        if parsed.path == "/__review__/export":
            # Xuất = LƯU SOURCE trước rồi chụp từ chính source → PNG luôn khớp HTML
            w = int(q.get("w", ["1080"])[0])
            h = int(q.get("h", ["1920"])[0])
            try:
                full = self._save_source(name, self._read_html())
                stem = re.sub(r"[^\w\-]", "", os.path.basename(full).replace(".html", "")) or "design"
                out = os.path.join(os.getcwd(), f"{stem}-final.png")
                r = subprocess.run(
                    [sys.executable, SCREENSHOT, "--html", full, "--size", f"{w}x{h}", "--output", out],
                    capture_output=True, text=True, timeout=90,
                )
                if r.returncode != 0 or not os.path.exists(out):
                    return self._json(500, {"ok": False, "error": (r.stdout + r.stderr)[-400:]})
                return self._json(200, {"ok": True, "path": out, "source_saved": full})
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)})

        if parsed.path == "/__review__/handoff":
            try:
                full = self._save_source(name, self._read_html())
                stem = re.sub(r"[^\w\-]", "", os.path.basename(full).replace(".html", "")) or "design"
                out = os.path.join(os.getcwd(), f"{stem}-handoff.json")
                r = subprocess.run(
                    [sys.executable, HANDOFF, full, "--out", out],
                    capture_output=True, text=True, timeout=30,
                )
                if r.returncode != 0 or not os.path.exists(out):
                    return self._json(500, {"ok": False, "error": (r.stdout + r.stderr)[-400:]})
                return self._json(200, {"ok": True, "path": out, "source_saved": full})
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)})

        return self._json(404, {"ok": False, "error": "unknown endpoint"})


def main():
    parser = argparse.ArgumentParser(description="Local review server cho design--compose")
    parser.add_argument("--dir", required=True, help="Thư mục chứa design HTML")
    parser.add_argument("--port", type=int, default=7799)
    args = parser.parse_args()

    os.chdir(os.path.abspath(args.dir))
    port = args.port
    for _ in range(20):  # port bận → thử port kế
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), ReviewHandler)
            break
        except OSError:
            port += 1
    else:
        print("Lỗi: không tìm được port trống.")
        sys.exit(1)

    print(f"Review server: http://127.0.0.1:{port}/  (dir: {os.getcwd()})")
    print("Mở design: http://127.0.0.1:%d/<design>.html#review" % port)
    server.serve_forever()


if __name__ == "__main__":
    main()
