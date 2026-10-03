# โครงสร้างระบบ

```
┌──────────────────────────── เบราว์เซอร์ (PC / มือถือ) ─────────────────────────────┐
│  Web Editor (web/)                                                              │
│   วาด pixel art · แม่แบบดวงตา · นำเข้า GIF/วิดีโอ · ปรับสี/ขาวดำ · จำลองจอ          │
│        │ เฟรม RGBA                                                               │
│        ▼                                                                         │
│   render/output.ts ── สีตามจอจริง (RGB565 / 1 บิต) ──► codec/dpa.ts ── ไฟล์ .dpa   │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │ HTTP: อัปโหลด / ดูสด / playlist / ตั้งค่า
┌────────────────────────────────────▼────────────────────────────────────────────┐
│  ESP32-C3 / C6 SuperMini (firmware/)                                            │
│   net/web.cpp ──► app/commands (คิว) ──► app/controller ──► player/player ──► จอ │
│      │                                       │                  │               │
│   net/wifi_manager                        playlist        storage (LittleFS)    │
│   (STA / AP + captive portal)                              /anims/*.dpa          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**หลักการ:** งานหนักทั้งหมด (ถอดรหัส GIF/วิดีโอ, ย่อขยาย, ปรับสี, dither, ลดจำนวนสี, บีบอัด) ทำในเบราว์เซอร์
บอร์ดรับไฟล์ที่เตรียมให้พอดีกับจอแล้ว และแค่ถอดรหัส RLE/JPEG ส่งขึ้นจอทีละแถบ จึงไม่ต้องมี frame buffer เต็มจอ (ESP32-C3/C6 ไม่มี PSRAM)

## ไฟล์ .dpa

[docs/dpa-format.md](dpa-format.md): header, palette, ตารางเฟรม และเฟรม 3 แบบ คือ INDEXED (palette + RLE), JPEG และ MONO (page ของ OLED + RLE)
- **delta frame:** เก็บเฉพาะสี่เหลี่ยมที่เปลี่ยนจากเฟรมก่อน
- **ช่วงค้างนิ่ง:** เก็บเป็นเวลาหน่วง ไม่ซ้ำเฟรม
- **ความเข้ากันได้:** ตัวเข้ารหัส (TypeScript) กับตัวถอดรหัส (C++) ต้องตรงกันทุกไบต์ ตรวจด้วย test vector ชุดเดียวกัน (ดูหัวข้อการทดสอบ)

## เฟิร์มแวร์ (`firmware/src/`)

| โฟลเดอร์ | หน้าที่ |
|----------|---------|
| `main.cpp` | ลำดับการบูต, ปุ่ม BOOT, LED |
| `app/controller` | ตัดสินว่าจะแสดงอะไร: playlist / ไฟล์ล่าสุด / ดูสด / หน้าข้อมูล / ภาพทดสอบ |
| `app/commands` | คิวคำสั่งจาก HTTP (network task) ไปยัง loop task (ตัวเดียวที่แตะจอได้) + สถานะ player |
| `app/console` | serial console สำหรับทดสอบและปรับจอ |
| `app/screens` | หน้าบูต / หน้าข้อมูลการเชื่อมต่อ |
| `player/decoder.h` | ถอดรหัสเฟรม (ไม่พึ่ง Arduino ใช้ร่วมกับ native test) |
| `player/player` | อ่านไฟล์ทีละช่วง, จับเวลาเฟรม, ขยายภาพ, ส่งเป็นแถบไปจอ, JPEG ผ่าน JPEGDEC |
| `player/playlist` | `/playlist.json` |
| `storage/` | LittleFS: `/anims/<ชื่อ>.dpa`, ชื่อไฟล์ UTF-8 (ภาษาไทยได้) ไม่เกิน 48 ไบต์ |
| `display/` | ไดรเวอร์จอ: SPI RGB565 (`esp_lcd` + DMA) และ I2C OLED, preset จอ, ฟอนต์, ภาพทดสอบ |
| `net/web` | REST API ([docs/api.md](api.md)) + หน้า Editor ที่ฝังไว้ (`web_assets.h`) |
| `net/wifi_manager` | เชื่อม Wi-Fi ที่บันทึกไว้ ถ้าไม่ได้ให้เปิด AP + captive portal, mDNS `display.local` |
| `bench/` | วัดความเร็วจอ/JPEG (คำสั่ง `bench`) |

**เรื่อง thread:** HTTP handler ทำงานใน task ของ AsyncTCP จึงห้ามวาดจอโดยตรง ให้ส่งคำสั่งผ่าน `commandPost()` แล้ว `controllerLoop()` ใน loop task เป็นผู้ทำ
ส่วนการอัปโหลด handler เขียนลงไฟล์ชั่วคราวเอง (LittleFS ปลอดภัยเมื่อใช้หลาย thread) แล้วให้ loop task เปลี่ยนชื่อไฟล์ เพราะไฟล์นั้นอาจกำลังเล่นอยู่

**การใช้ flash (4 MB):**
- เฟิร์มแวร์ประมาณ 1.33–1.36 MB รวมหน้า Editor 41 KB
- LittleFS ประมาณ 2.1 MB สำหรับแอนิเมชัน
- ค่าตั้งจอและ Wi-Fi เก็บใน NVS

## Web Editor (`web/src/`)

| โฟลเดอร์ | หน้าที่ |
|----------|---------|
| `model/` | โปรเจกต์, preset จอ, palette, store (state + undo + บันทึกอัตโนมัติ) |
| `editor/` | เครื่องมือวาด |
| `templates/` | แม่แบบที่สร้างด้วยโค้ด (ดวงตา 12 ท่า) |
| `color/` | RGB565, ปรับสี, dither, ลดจำนวนสี |
| `render/` | ภาพที่จอจะแสดงจริง + จำลองหน้าจอ |
| `codec/` | RLE, ตัวเขียน/อ่าน .dpa, unit tests, สร้าง test vector |
| `import/` | GIF, วิดีโอ, ย่อขยายภาพ |
| `device/` | REST client, เชื่อมบอร์ดอัตโนมัติ, ดูสด |
| `storage/` | IndexedDB, ไฟล์โปรเจกต์ .dpe |
| `ui/` | หน้าจอ (Preact) รวมหน้า "จัดการบอร์ด" |

## การทดสอบ

```bash
cd web && npm test
```
codec + สร้าง `shared/test-vectors/*.dpa` และ `*.expected`

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/src firmware/test/native/decode_test.cpp -o build/decode_test.exe
```

```bash
build/decode_test.exe shared/test-vectors
```

C++ decoder ต้องได้ภาพตรงกับ JS ทุกพิกเซล ส่วนการทดสอบหน้า Editor โดยไม่มีบอร์ด ให้รันสองคำสั่งนี้ใน terminal แยกกัน:

```bash
cd web && npm run mock-board
```

```bash
cd web && npm run dev:mock
```
