# Knowledge — sổ tích lũy kinh nghiệm / experience log

Cấu trúc để kinh nghiệm thiết kế của bạn (và AI agent) được giữ lại qua từng phiên — mô phỏng hệ knowledge của một AI workspace hoàn chỉnh, thu gọn về 3 ngăn:

| Thư mục | Ghi gì | Khi nào |
|---|---|---|
| `sessions/` | Ghi chú mỗi phiên làm việc: làm gì, feedback nào, bài học nào | Cuối mỗi phiên thiết kế (agent tự ghi — xem SKILL.md Bước 5) |
| `patterns/` | Kỹ thuật tái dùng được: cách dựng bóng, căn chân trời, xử lý mask... | Khi một mẹo được kiểm chứng ≥ 2 lần |
| `prompts/` | Sổ prompt cho từng backend gen ảnh: câu nào ăn, negative nào bắt buộc | Sau mỗi lượt gen đạt/hỏng đáng nhớ |

Quy ước đặt tên: `sessions/YYYY-MM-DD-<slug>.md` · `patterns/<ten-pattern>.md`.

**Vòng đời một bài học**: xuất hiện trong session note → lặp lại và được kiểm chứng → thăng cấp thành pattern → nếu là quy tắc sống còn thì ghi thẳng vào SKILL.md (agent đọc mỗi lần chạy).

---

*English*: A lightweight knowledge base so design experience survives across sessions. `sessions/` = per-session notes (agent writes them — SKILL.md Step 5). `patterns/` = reusable techniques verified at least twice. `prompts/` = per-backend prompt notes. Lesson lifecycle: session note → verified pattern → promoted into SKILL.md when it becomes a hard rule.
