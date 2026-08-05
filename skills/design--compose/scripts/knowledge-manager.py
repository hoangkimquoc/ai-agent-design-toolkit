"""Quản lý knowledge/ của bộ công cụ design-compose — đảm bảo kinh nghiệm được ghi đều.

Lệnh:
    --status              Tổng quan: số notes/patterns/prompts, phiên cuối cách đây bao lâu
    --new-session <slug>  Tạo session note hôm nay từ template chuẩn
    --audit               Kiểm tra sức khỏe: naming, thiếu mục Bài học, prompts trống
    --index               Sinh knowledge/INDEX.md tổng hợp toàn bộ

Vị trí knowledge/: tự tìm ngược từ thư mục hiện tại (folder có knowledge/sessions/),
hoặc chỉ định --dir <path-to-knowledge>.

Usage:
    python knowledge-manager.py --status
    python knowledge-manager.py --new-session iphone-campaign
    python knowledge-manager.py --audit && python knowledge-manager.py --index
"""
import argparse
import datetime
import os
import re
import sys

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

SESSION_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$")

SESSION_TEMPLATE = """# Session {date} — {slug}

## Đã làm
-

## Feedback người thật → thay đổi
-

## Bug / bất ngờ đáng nhớ
-

## Bài học
- <bài học> — (nếu đã kiểm chứng ≥2 lần → thăng cấp knowledge/patterns/; quy tắc sống còn → đề xuất ghi vào SKILL.md)
"""


def find_knowledge(explicit: str | None) -> str:
    if explicit:
        k = os.path.abspath(explicit)
        if os.path.isdir(os.path.join(k, "sessions")):
            return k
        sys.exit(f"Lỗi: {k} không phải thư mục knowledge (thiếu sessions/).")
    cur = os.getcwd()
    for _ in range(8):
        cand = os.path.join(cur, "knowledge")
        if os.path.isdir(os.path.join(cand, "sessions")):
            return cand
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    sys.exit("Lỗi: không tìm thấy knowledge/sessions/ từ thư mục hiện tại — dùng --dir <path>.")


def list_md(folder: str, skip_readme: bool = True) -> list[str]:
    if not os.path.isdir(folder):
        return []
    return sorted(
        f for f in os.listdir(folder)
        if f.endswith(".md") and not (skip_readme and f.upper().startswith(("README", "INDEX")))
    )


def first_heading(path: str) -> str:
    for line in open(path, encoding="utf-8"):
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return os.path.basename(path)


def cmd_status(k: str) -> None:
    sessions = list_md(os.path.join(k, "sessions"))
    patterns = list_md(os.path.join(k, "patterns"))
    prompts = list_md(os.path.join(k, "prompts"))
    print(f"knowledge/: {len(sessions)} sessions · {len(patterns)} patterns · {len(prompts)} prompt notes")
    if sessions:
        last = sessions[-1]
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", last)
        if m:
            last_date = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            days = (datetime.date.today() - last_date).days
            flag = "" if days <= 7 else "  ⚠️ đã lâu chưa wrap-up phiên nào!"
            print(f"Phiên gần nhất: {last} ({days} ngày trước){flag}")
    else:
        print("⚠️ Chưa có session note nào — sau phiên làm việc chạy: --new-session <slug>")


def cmd_new_session(k: str, slug: str) -> None:
    slug = re.sub(r"[^a-z0-9-]", "-", slug.lower()).strip("-") or "session"
    date = datetime.date.today().isoformat()
    path = os.path.join(k, "sessions", f"{date}-{slug}.md")
    if os.path.exists(path):
        sys.exit(f"Đã tồn tại: {path}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(SESSION_TEMPLATE.format(date=date, slug=slug))
    print(f"Đã tạo: {path}\nĐiền 4 mục rồi chạy --index để cập nhật tổng hợp.")


def cmd_audit(k: str) -> bool:
    issues: list[str] = []
    sdir = os.path.join(k, "sessions")
    for f in list_md(sdir):
        if not SESSION_RE.match(f):
            issues.append(f"sessions/{f}: sai naming (chuẩn: YYYY-MM-DD-slug.md)")
        else:
            body = open(os.path.join(sdir, f), encoding="utf-8").read()
            if "Bài học" not in body and "Lesson" not in body:
                issues.append(f"sessions/{f}: thiếu mục 'Bài học'")
    for f in list_md(os.path.join(k, "patterns")):
        body = open(os.path.join(k, "patterns", f), encoding="utf-8").read()
        if "kiểm chứng" not in body and "verified" not in body.lower():
            issues.append(f"patterns/{f}: chưa ghi mốc kiểm chứng (pattern phải được kiểm chứng ≥2 lần)")
    if not list_md(os.path.join(k, "prompts")):
        issues.append("prompts/: chưa có sổ prompt cho backend nào")
    if issues:
        print(f"{len(issues)} vấn đề:")
        for i in issues:
            print("  -", i)
        return False
    print("Audit sạch — knowledge đang được nuôi đúng cách.")
    return True


def cmd_index(k: str) -> None:
    lines = ["# Knowledge Index", "", f"_Sinh tự động {datetime.date.today().isoformat()} bởi knowledge-manager.py — đừng sửa tay._", ""]
    for sub, title in [("sessions", "Sessions"), ("patterns", "Patterns"), ("prompts", "Prompts")]:
        files = list_md(os.path.join(k, sub))
        lines.append(f"## {title} ({len(files)})")
        lines.append("")
        for f in reversed(files) if sub == "sessions" else files:
            lines.append(f"- [{first_heading(os.path.join(k, sub, f))}]({sub}/{f})")
        lines.append("")
    with open(os.path.join(k, "INDEX.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Đã sinh: {os.path.join(k, 'INDEX.md')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quản lý knowledge/ của design-compose toolkit")
    parser.add_argument("--dir", help="Đường dẫn thư mục knowledge (mặc định: tự tìm ngược)")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--new-session", metavar="SLUG")
    parser.add_argument("--audit", action="store_true")
    parser.add_argument("--index", action="store_true")
    args = parser.parse_args()

    k = find_knowledge(args.dir)
    if args.new_session:
        cmd_new_session(k, args.new_session)
    if args.audit:
        ok = cmd_audit(k)
    if args.index:
        cmd_index(k)
    if args.status or not (args.new_session or args.audit or args.index):
        cmd_status(k)
    if args.audit and not ok:
        sys.exit(1)
