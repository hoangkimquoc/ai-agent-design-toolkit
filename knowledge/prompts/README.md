# Prompts — sổ prompt theo backend

Mỗi backend gen ảnh một tính nết. Ghi lại điều bạn học được, mỗi backend một file (`codex.md`, `imagen.md`, `dalle.md`...).

Template gợi ý cho mỗi entry:

```markdown
## <mục đích> — <ngày>
Prompt: <prompt đầy đủ hoặc phần quyết định>
Kết quả: đạt / hỏng — vì sao
Bài học: <điều sẽ làm khác lần sau>
```

Kinh nghiệm khởi điểm (kiểm chứng với Codex image_gen, 2026-08-05):

- **Negative bắt buộc cho nền/element**: `NO text, NO letters, NO numbers, NO watermark, NO logos` — thiếu là AI chèn chữ rác.
- **Element để tách nền**: `isolated on flat plain solid light gray (#EDEDED) background, soft contact shadow only` — backend thường KHÔNG xuất alpha thật, phải tách sau bằng rmbg.
- **Bộ nhiều ảnh đồng bộ chất liệu**: prepend cùng một khối ART-STYLE (palette + lighting + rendering) vào mọi prompt của bộ.
- **Nền có compose chữ sau**: mô tả rõ vùng trống (`upper 40% smooth dark gradient reserved for large title text overlay`).
