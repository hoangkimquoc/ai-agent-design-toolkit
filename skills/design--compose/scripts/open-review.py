"""Mở preview review cho một design HTML — một lệnh, không phải tự kiếm/tự bật gì.

Tự lo trọn: tìm review-server đang serve đúng thư mục (tái dùng), chưa có thì
tự khởi động ở port trống (process nền, sống sau khi script thoát), chờ server
sẵn sàng rồi mở browser mặc định vào #review.

Usage:
    python open-review.py <đường-dẫn>/design-xxx.html [--port 7799]
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

SERVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "review-server.py")


def ping(port: int) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/__review__/ping", timeout=0.6) as r:
            return json.load(r)
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Mở preview review cho design HTML")
    parser.add_argument("design", help="File design .html")
    parser.add_argument("--port", type=int, default=7799, help="Port bắt đầu dò (default 7799)")
    args = parser.parse_args()

    design = os.path.abspath(args.design)
    if not os.path.isfile(design):
        print(f"Lỗi: không tìm thấy {design}")
        return 1
    ddir = os.path.normcase(os.path.dirname(design))
    fname = os.path.basename(design)

    # Dò server: tái dùng nếu đang serve đúng thư mục; ghi nhớ port trống đầu tiên
    port = None
    free = None
    for p in range(args.port, args.port + 20):
        info = ping(p)
        if info is None:
            if free is None:
                free = p
            continue
        if info.get("ok") and os.path.normcase(info.get("dir", "")) == ddir:
            port = p
            print(f"Tái dùng review-server đang chạy: port {p}")
            break

    # Chưa có → khởi động server nền (sống độc lập sau khi script thoát)
    if port is None:
        port = free if free is not None else args.port
        kwargs = {}
        if sys.platform.startswith("win"):
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen(
            [sys.executable, SERVER, "--dir", os.path.dirname(design), "--port", str(port)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs,
        )
        for _ in range(20):
            time.sleep(0.25)
            info = ping(port)
            if info and info.get("ok"):
                break
        else:
            print(f"Lỗi: server không phản hồi trên port {port}.")
            return 1
        print(f"Đã khởi động review-server: port {port} (dir: {os.path.dirname(design)})")

    url = f"http://127.0.0.1:{port}/{fname}#review"
    webbrowser.open(url)
    print(f"Preview: {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
