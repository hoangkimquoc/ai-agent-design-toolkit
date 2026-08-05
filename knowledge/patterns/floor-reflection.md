# Pattern: Phản chiếu sàn cho product shot (floor reflection)

**Vấn đề**: ảnh sản phẩm tách nền đặt lên nền tối/premium trông như "dán sticker" — thiếu tiếp đất.

**Giải pháp** (kiểm chứng 2026-08-05, case iPhone):

```css
.slot-reflection {
  /* PHẢI cùng kích thước slot gốc — slot thấp hơn sẽ bị object-fit: contain co nhỏ bóng */
  left: <same>; width: <same>; height: <same>;
  top: <đáy slot gốc + ~0.5-1%>;
  opacity: 0.16; pointer-events: none;
}
.slot-reflection > img {
  object-position: bottom center;   /* content neo đáy pre-flip → sau lật nằm sát mép trên */
  transform: scaleY(-1);
  /* mask áp TRƯỚC transform nên bị lật theo — muốn fade xuống (visual) thì gradient "to top" */
  mask-image: linear-gradient(to top, black 0%, transparent 26%);
}
```

**Điều kiện tiên quyết**: asset đã trim viền trong suốt (`trim-alpha.py`) — còn padding là hở khe giữa vật thể và bóng.
