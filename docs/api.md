# REST API ของบอร์ด

ทุก endpoint อยู่ที่ `http://<ip บอร์ด>/api/...` (หรือ `http://display.local/api/...`) ตอบเป็น JSON
error ตอบ `{"error": "..."}` พร้อม HTTP status ที่เหมาะสม และส่ง CORS header มาด้วย Editor ที่รันบน PC จึงเรียกได้

ตัวจริงอยู่ที่ [firmware/src/net/web.cpp](../firmware/src/net/web.cpp)
ส่วน [web/scripts/mock-board.mjs](../web/scripts/mock-board.mjs) เป็นบอร์ดจำลองที่ตอบ API ชุดเดียวกัน

## สถานะ

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/api/info` | เวอร์ชัน, บอร์ด, จอ (`width`, `height`, `color`, `shape`), พื้นที่ `fs`, Wi-Fi, สถานะ player |

## แอนิเมชัน

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/api/anims` | `{anims: [{name, size, width, height, frames, color}], free}` |
| POST | `/api/anims?name=<n>&play=1` | อัปโหลด `.dpa` แบบ multipart (field `file`) `play=0` คือเก็บไว้เฉย ๆ ไม่เล่นทันที |
| DELETE | `/api/anims?name=<n>` | ลบ |
| POST | `/api/play?name=<n>` | เล่นไฟล์นี้ (playlist หยุดชั่วคราว) |
| POST | `/api/stop` | หยุดและล้างจอ |
| POST | `/api/next` | รายการถัดไปใน playlist หรือไฟล์ถัดไป |

ข้อผิดพลาดของการอัปโหลด: `400` ชื่อไฟล์ใช้ไม่ได้, `415` ไม่ใช่ไฟล์ DPA, `507` พื้นที่ไม่พอ
ไฟล์จะถูกเขียนเป็นไฟล์ชั่วคราวและตรวจ header ก่อน แล้วจึงแทนที่ไฟล์เดิม ถ้าเน็ตหลุดกลางทาง ไฟล์เดิมจึงไม่เสีย

## ดูสด (live preview)

| Method | Path | คำอธิบาย |
|--------|------|----------|
| POST | `/api/live` | body คือไฟล์ `.dpa` ทั้งไฟล์ (ปกติมี 1 เฟรม, ไม่เกิน 96 KB) แสดงทันทีจาก RAM |
| POST | `/api/live/end` | กลับไปเล่นสิ่งที่เล่นอยู่ก่อนหน้า (ถ้าไม่ได้รับเฟรมใหม่เกิน 60 วินาที บอร์ดจะกลับเองอัตโนมัติ) |

## Playlist

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/api/playlist` | `{enabled, shuffle, items: [{name, seconds}]}` |
| PUT | `/api/playlist` | บันทึก (JSON แบบเดียวกัน) `seconds: 0` คือเล่นจบหนึ่งรอบ (หรือตามจำนวนรอบในไฟล์) แล้วไปรายการถัดไป |

## จอ

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/api/display` | `{preset, rotation, offset_x, offset_y, invert, bgr, mirror_x, spi_hz, spi_mode, i2c_hz, i2c_addr, brightness, pins}` |
| PUT | `/api/display` | ส่งเฉพาะ field ที่ต้องการเปลี่ยน บันทึกแล้ว**รีบูต** ถ้าเปลี่ยน `preset` ค่าปรับแต่งอื่นจะกลับเป็นค่าของ preset นั้น |
| GET | `/api/display/presets` | `{presets: [{id, name, width, height, color, round}]}` |
| POST | `/api/display/test` | แสดงภาพทดสอบ 10 วินาที |
| POST | `/api/brightness?value=0-255` | ปรับความสว่างทันทีและบันทึก (ไม่รีบูต) |

## Wi-Fi และระบบ

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/api/wifi` | `{mode: "ap"/"sta", ssid, ip, rssi, saved_ssid}` |
| PUT | `/api/wifi` | `{ssid, password}` บันทึกแล้ว**รีบูต** ถ้าเชื่อมไม่ได้ใน 15 วินาที บอร์ดจะกลับไปเปิด AP เอง |
| DELETE | `/api/wifi` | ลืม Wi-Fi แล้วกลับเป็นโหมด AP (รีบูต) |
| GET | `/api/wifi/scan` | ครั้งแรกตอบ `{scanning: true}` ให้เรียกซ้ำจนได้ `{scanning: false, networks: [{ssid, rssi, secure}]}` |
| POST | `/api/reboot` | รีบูต |

## หน้าเว็บ

`GET /` และ `/assets/*` คือหน้า Editor ที่ฝังอยู่ในเฟิร์มแวร์ (gzip, สร้างโดย `npm run build:device`)
ในโหมด AP ทุก URL ที่ไม่ใช่ `/api/` จะถูก redirect ไปหน้า Editor (captive portal) มือถือจึงเปิดหน้า Editor ให้เองหลังเชื่อม Wi-Fi
