# DPA — Display Animation file format (version 1)

ไฟล์แอนิเมชันที่ Web Editor สร้างและเฟิร์มแวร์เล่น ทุกค่าเป็น **little-endian**
ภาพถูกเตรียมให้พอดีกับจอเป้าหมายแล้ว บอร์ดแค่ถอดรหัสแล้ววางลงจอ

## โครงสร้าง

```
Header        32 bytes
Palette       palette_size × u16 (RGB565)
Frame table   frame_count × 12 bytes
Frame data    ...
```

### Header (32 bytes)

| Offset | Type | Field | ความหมาย |
|-------:|------|-------|----------|
| 0 | char[4] | magic | `"DPA1"` |
| 4 | u8 | version | `1` |
| 5 | u8 | color_mode | `0` = RGB565, `1` = MONO (1 bit) |
| 6 | u16 | screen_w | ความกว้างจอเป้าหมาย |
| 8 | u16 | screen_h | ความสูงจอเป้าหมาย |
| 10 | u16 | canvas_w | ความกว้างภาพที่เก็บ |
| 12 | u16 | canvas_h | ความสูงภาพที่เก็บ |
| 14 | u8 | scale | ขยายแบบ nearest-neighbor 1..8 |
| 15 | u8 | loop | `0` = วนไม่สิ้นสุด, `n` = เล่น n รอบ |
| 16 | i16 | offset_x | ตำแหน่งมุมซ้ายบนของภาพ (หลังขยาย) บนจอ ติดลบได้ (ถูกครอป) |
| 18 | i16 | offset_y | |
| 20 | u16 | frame_count | |
| 22 | u16 | palette_size | 0..256 |
| 24 | u16 | bg_color | RGB565 สำหรับพื้นที่นอกภาพ (MONO: 0 หรือ 1) |
| 26 | u16 | reserved | 0 |
| 28 | u32 | frame_table_offset | |

### Frame table entry (12 bytes)

| Offset | Type | Field |
|-------:|------|-------|
| 0 | u32 | data_offset (จากต้นไฟล์) |
| 4 | u32 | data_size |
| 8 | u16 | delay_ms |
| 10 | u8 | type |
| 11 | u8 | flags (bit0 = keyframe) |

เฟรมแรกต้องเป็น keyframe เสมอ เพราะการวนกลับมาเฟรมแรกต้องวาดใหม่ทั้งภาพ

## ชนิดเฟรม

พิกัดของเฟรมทุกชนิดเป็นพิกัดใน **canvas** (ก่อนขยาย) บอร์ดคำนวณตำแหน่งบนจอเป็น
`screen_x = offset_x + x × scale`

### type 0 — INDEXED

```
u16 x, u16 y, u16 w, u16 h      สี่เหลี่ยมที่เปลี่ยน (w = 0 คือเฟรมไม่เปลี่ยน แค่หน่วงเวลา)
RLE stream ของ index (w × h bytes หลังถอด) เรียงทีละแถว
```
index อ้างอิง palette ใน header

### type 1 — JPEG

```
u16 x, u16 y, u16 w, u16 h
baseline JPEG (w × h)
```
ใช้กับวิดีโอและภาพถ่าย (`scale` ควรเป็น 1)

### type 2 — MONO

```
u16 x, u16 y, u16 w, u16 h      y และ h เป็นพหุคูณของ 8
RLE stream ของไบต์แบบ page: ทีละ page (8 แถว) ในแต่ละ page เรียงตาม x,
bit 0 = แถวบนสุดของ page, 1 = พิกเซลติด
```
ตรงกับรูปแบบ RAM ของ SSD1306/SH1106 จึงส่งขึ้นจอได้ทันทีเมื่อ scale = 1

## RLE (PackBits)

อ่านไบต์ควบคุม `c`:
- `c < 128` → ข้อมูลดิบ `c + 1` ไบต์ตามมา
- `c ≥ 128` → ไบต์ถัดไปซ้ำ `c − 126` ครั้ง (2..129)

## ตัวอย่างขนาด

| เนื้อหา | ขนาดต่อเฟรมโดยประมาณ |
|---------|-----------------------|
| Pixel art 60×60 ×4, เปลี่ยนบางส่วน | 0.1–1 KB |
| GIF 240×240 indexed | 3–20 KB |
| วิดีโอ 240×240 JPEG q≈70 | 8–12 KB |
| OLED 128×64 | 0.1–0.5 KB |
