# Pattern: Căn chân trời của nền AI trùng chân vật thể

**Vấn đề**: nền AI gen có đường chân trời/sàn riêng (thường ở ~55–65% chiều cao ảnh), trong khi vật thể trong layout đứng ở vị trí khác (vd 78.5%) → vật thể "lơ lửng" sai ánh sáng.

**Giải pháp** (kiểm chứng 2026-08-05):

1. Đo vị trí chân trời trong ảnh nền: mở ảnh, ước lượng % chiều cao (vd 64%).
2. Scale ảnh nền để chân trời rơi đúng chân vật thể:
   `height = vị_trí_chân_vật_thể / vị_trí_chân_trời_ảnh` → vd `78.5 / 64 ≈ 122%`

```css
.bg-img { position: absolute; top: 0; width: 100%; height: 122%; object-fit: cover; }
```

**Mẹo prompt phòng bệnh**: khi gen nền, mô tả rõ vị trí chân trời ("horizon at lower third") và chừa vùng trên cho title — đỡ phải scale nhiều.
