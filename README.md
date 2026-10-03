# Display Editor

สร้างแอนิเมชันในเบราว์เซอร์ (pixel art, แม่แบบดวงตา, GIF, วิดีโอ) แล้วส่งผ่าน Wi-Fi ไปเล่นบนจอที่ต่อกับ ESP32-C3 / ESP32-C6 SuperMini
รองรับจอ TFT 0.96" 80×160, TFT 1.3" 240×240, TFT กลม 240×240, OLED 128×64 และ OLED 128×32

| โฟลเดอร์ | คืออะไร |
|----------|---------|
| [firmware/](firmware/README.md) | เฟิร์มแวร์ ESP32: ตัวเล่น, ที่เก็บไฟล์, Wi-Fi, REST API, หน้า Editor ที่ฝังไว้ |
| [web/](web/README.md) | Web Editor (Vite + Preact + TypeScript) |
| [docs/](docs/architecture.md) | [โครงสร้างระบบ](docs/architecture.md), [รูปแบบไฟล์ .dpa](docs/dpa-format.md), [REST API](docs/api.md) |
| `shared/test-vectors/` | ไฟล์ทดสอบที่ทั้งตัวเข้ารหัส (JS) และตัวถอดรหัส (C++) ต้องให้ผลตรงกัน |
| [PLAN.md](PLAN.md) | แผนและสถานะของโปรเจกต์ |

## เริ่มเร็ว

1. **แฟลชเฟิร์มแวร์** (ใช้ PowerShell):

   ```bash
   cd firmware; python -m platformio run -e c3_supermini -t upload
   ```

2. **เชื่อม Wi-Fi ของบอร์ด** `DisplayEditor-XXXX` รหัส `displayedit` หน้า Editor จะเปิดขึ้นเอง (หรือเข้า http://192.168.4.1)
3. **สร้างแอนิเมชัน** แล้วกด **ส่งไปบอร์ด**

ถ้ายังไม่มีบอร์ดแต่อยากลองใช้ Editor ให้รันสองคำสั่งนี้ใน terminal แยกกัน:

```bash
cd web; npm install; npm run mock-board
```

```bash
cd web; npm run dev:mock
```

แล้วเปิด http://localhost:5173
