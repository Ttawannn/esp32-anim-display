# tools

`test_240.jpg` — 240×240 baseline JPEG embedded in `src/bench/test_jpeg.h` for the decode benchmark.

Regenerate (needs ffmpeg + Python):

```bash
ffmpeg -y -f lavfi -i "mandelbrot=size=240x240:rate=1:start_scale=0.5" -vf "eq=saturation=1.4" \
  -frames:v 1 -q:v 4 -pix_fmt yuvj420p tools/test_240.jpg
python tools/bin2header.py tools/test_240.jpg src/bench/test_jpeg.h kTestJpeg240
```
