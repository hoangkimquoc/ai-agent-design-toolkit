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
import locale
import os
import re
import sys

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

SESSION_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$")

# i18n: --lang > env KNOWLEDGE_LANG > locale hệ thống
MSG = {
    "vi": {
        "summary": "knowledge/: {s} sessions · {p} patterns · {pr} prompt notes",
        "last": "Phiên gần nhất: {f} ({d} ngày trước){flag}",
        "stale": "  ⚠️ đã lâu chưa wrap-up phiên nào!",
        "no_session": "⚠️ Chưa có session note nào — sau phiên làm việc chạy: --new-session <slug>",
        "created": "Đã tạo: {p}\nĐiền 4 mục rồi chạy --index để cập nhật tổng hợp.",
        "exists": "Đã tồn tại: {p}",
        "issues": "{n} vấn đề:",
        "bad_name": "sessions/{f}: sai naming (chuẩn: YYYY-MM-DD-slug.md)",
        "no_lesson": "sessions/{f}: thiếu mục 'Bài học'",
        "no_verify": "patterns/{f}: chưa ghi mốc kiểm chứng (pattern phải được kiểm chứng ≥2 lần)",
        "no_prompts": "prompts/: chưa có sổ prompt cho backend nào",
        "clean": "Audit sạch — knowledge đang được nuôi đúng cách.",
        "indexed": "Đã sinh: {p}",
        "index_note": "_Sinh tự động {d} bởi knowledge-manager.py — đừng sửa tay._",
        "not_knowledge": "Lỗi: {p} không phải thư mục knowledge (thiếu sessions/).",
        "not_found": "Lỗi: không tìm thấy knowledge/sessions/ từ thư mục hiện tại — dùng --dir <path>.",
        "template": "# Session {date} — {slug}\n\n## Đã làm\n-\n\n## Feedback người thật → thay đổi\n-\n\n## Bug / bất ngờ đáng nhớ\n-\n\n## Bài học\n- <bài học> — (kiểm chứng ≥2 lần → thăng cấp knowledge/patterns/; quy tắc sống còn → đề xuất ghi vào SKILL.md)\n",
    },
    "en": {
        "summary": "knowledge/: {s} sessions · {p} patterns · {pr} prompt notes",
        "last": "Last session: {f} ({d} days ago){flag}",
        "stale": "  ⚠️ no session wrap-up for a while!",
        "no_session": "⚠️ No session notes yet — after a working session run: --new-session <slug>",
        "created": "Created: {p}\nFill in the 4 sections, then run --index to refresh the summary.",
        "exists": "Already exists: {p}",
        "issues": "{n} issue(s):",
        "bad_name": "sessions/{f}: bad naming (expected: YYYY-MM-DD-slug.md)",
        "no_lesson": "sessions/{f}: missing a 'Lesson' section",
        "no_verify": "patterns/{f}: no verification note (a pattern must be verified at least twice)",
        "no_prompts": "prompts/: no per-backend prompt notes yet",
        "clean": "Audit clean — the knowledge base is being fed properly.",
        "indexed": "Generated: {p}",
        "index_note": "_Auto-generated {d} by knowledge-manager.py — do not edit by hand._",
        "not_knowledge": "Error: {p} is not a knowledge folder (missing sessions/).",
        "not_found": "Error: no knowledge/sessions/ found upward from here — use --dir <path>.",
        "template": "# Session {date} — {slug}\n\n## What was done\n-\n\n## Human feedback → changes\n-\n\n## Bugs / surprises worth remembering\n-\n\n## Lessons\n- <lesson> — (verified twice → promote to knowledge/patterns/; hard rule → propose adding to SKILL.md)\n",
    },
}


def pick_lang(flag: str | None) -> str:
    cand = flag or os.environ.get("KNOWLEDGE_LANG") or (locale.getdefaultlocale()[0] or "")
    return "vi" if str(cand).lower().startswith("vi") else "en"


T = MSG["en"]  # gán lại trong __main__ sau khi parse args


def find_knowledge(explicit: str | None) -> str:
    if explicit:
        k = os.path.abspath(explicit)
        if os.path.isdir(os.path.join(k, "sessions")):
            return k
        sys.exit(T["not_knowledge"].format(p=k))
    cur = os.getcwd()
    for _ in range(8):
        cand = os.path.join(cur, "knowledge")
        if os.path.isdir(os.path.join(cand, "sessions")):
            return cand
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    sys.exit(T["not_found"])


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
    print(T["summary"].format(s=len(sessions), p=len(patterns), pr=len(prompts)))
    if sessions:
        last = sessions[-1]
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", last)
        if m:
            last_date = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            days = (datetime.date.today() - last_date).days
            flag = "" if days <= 7 else T["stale"]
            print(T["last"].format(f=last, d=days, flag=flag))
    else:
        print(T["no_session"])


def cmd_new_session(k: str, slug: str) -> None:
    slug = re.sub(r"[^a-z0-9-]", "-", slug.lower()).strip("-") or "session"
    date = datetime.date.today().isoformat()
    path = os.path.join(k, "sessions", f"{date}-{slug}.md")
    if os.path.exists(path):
        sys.exit(T["exists"].format(p=path))
    with open(path, "w", encoding="utf-8") as f:
        f.write(T["template"].format(date=date, slug=slug))
    print(T["created"].format(p=path))


def cmd_audit(k: str) -> bool:
    issues: list[str] = []
    sdir = os.path.join(k, "sessions")
    for f in list_md(sdir):
        if not SESSION_RE.match(f):
            issues.append(T["bad_name"].format(f=f))
        else:
            body = open(os.path.join(sdir, f), encoding="utf-8").read()
            if "Bài học" not in body and "Lesson" not in body:
                issues.append(T["no_lesson"].format(f=f))
    for f in list_md(os.path.join(k, "patterns")):
        body = open(os.path.join(k, "patterns", f), encoding="utf-8").read()
        if "kiểm chứng" not in body and "verified" not in body.lower():
            issues.append(T["no_verify"].format(f=f))
    if not list_md(os.path.join(k, "prompts")):
        issues.append(T["no_prompts"])
    if issues:
        print(T["issues"].format(n=len(issues)))
        for i in issues:
            print("  -", i)
        return False
    print(T["clean"])
    return True


def cmd_index(k: str) -> None:
    lines = ["# Knowledge Index", "", T["index_note"].format(d=datetime.date.today().isoformat()), ""]
    for sub, title in [("sessions", "Sessions"), ("patterns", "Patterns"), ("prompts", "Prompts")]:
        files = list_md(os.path.join(k, sub))
        lines.append(f"## {title} ({len(files)})")
        lines.append("")
        for f in reversed(files) if sub == "sessions" else files:
            lines.append(f"- [{first_heading(os.path.join(k, sub, f))}]({sub}/{f})")
        lines.append("")
    with open(os.path.join(k, "INDEX.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(T["indexed"].format(p=os.path.join(k, "INDEX.md")))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quản lý knowledge/ của design-compose toolkit")
    parser.add_argument("--dir", help="Đường dẫn thư mục knowledge (mặc định: tự tìm ngược)")
    parser.add_argument("--lang", choices=["vi", "en"], help="Ngôn ngữ output (mặc định: theo locale / env KNOWLEDGE_LANG)")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--new-session", metavar="SLUG")
    parser.add_argument("--audit", action="store_true")
    parser.add_argument("--index", action="store_true")
    args = parser.parse_args()

    T = MSG[pick_lang(args.lang)]
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
