# maksudova.com — cinematic 3D scroll site

Ultra-premium landing page for **Tutor Maksudova** (online math, Grades 1–8 and Algebra 1).
Apple-style canvas frame-sequence scrubbing, Lenis smooth scroll, GSAP ScrollTrigger,
CSS 3D tilt. No build step: plain HTML, CSS and JS that runs from any static host.

## Dizayn konsepsiyasi — "Math, made beautiful"

| | |
|---|---|
| **G'oya** | Matematika — tartib va go'zallik. Sayt tartibsizlikdan (chaos) tuzilmaga (structure) o'tishni ko'rsatadi, xuddi o'quvchining yo'li kabi. |
| **Palitra** | Siyoh-qora `#05060a` · iliq fil suyagi `#f4efe6` · antik oltin `#e8c27a` · brend firuzasi `#2cc7dd` / `#17a2b8` |
| **Shriftlar** | *Instrument Serif* (italik urg'ular) · *Inter Tight* 300 (yirik sarlavhalar) · *JetBrains Mono* (HUD, eyebrow) |
| **3D obyektlar** | 1) Shaffof kristall ikosaedr, ichida oltin dodekaedr, atrofida oltin halqalar va suzuvchi belgilar (π, ∑, √, ∞ …). 2) 5×5×5 kubik portlab, oltin burchak (137.5°) bo'yicha Fibonachchi spiraliga yig'iladi. |
| **Harakat** | Lenis inersiyali scroll, scroll bilan boshqariladigan kadrlar, 3D `rotateX` + blur bilan chiqadigan matnlar, sichqoncha parallaksi, magnit tugmalar, 3D tilt kartalar, film donadorligi. |

## Sahifa strukturasi

1. **Preloader** — "M" monogrammasi, hero kadrlarining yuklanish foizi
2. **Hero (cinematic scrub #1, 520vh)** — kristall atrofida 210° kamera aylanishi; 4 ta matn sahnasi
3. **Manifesto** — so'zlar scroll bilan birma-bir yonadi
4. **Statistika** — 2018 · 1000+ · 390+ · 1:1 (sanoq animatsiyasi)
5. **Metod (cinematic scrub #2, 440vh)** — Diagnose → Practice → Master (kubik → spiral)
6. **Dasturlar** — gorizontal pin qilingan trek, 3D yoyda kirib keladigan kartalar
7. **Platforma** — bento grid (390+ ko'nikma, o'yinlar, testlar, video, doska, hisobotlar)
8. **Mavzular marquee** — scroll tezligiga javob beradigan cheksiz lenta
9. **CTA** — "Book a lesson" / Telegram
10. **Footer**

## Fayllar

```
index.html               sahifa
css/styles.css           dizayn tizimi va barcha bo'limlar
js/scroll-cinematic.js   canvas frame-scrub engine (FrameSequence)
js/app.js                Lenis + ScrollTrigger orkestratsiyasi, CONFIG (havolalar, ketma-ketliklar)
vendor/                  gsap 3.12.5, ScrollTrigger, lenis 1.3.21 (lokal nusxalar)
frames/<clip>/lg|sm/     1600px (desktop) va 800px (mobil) JPG kadrlar, har biri 180 ta
tools/render/            kliplarni yaratuvchi Three.js sahna + Playwright renderer
tools/*.sh               ffmpeg: videodan kadr ajratish va siqish
tutor-maksudova-site (17).zip   avvalgi sayt (tegilmagan)
```

## 60 FPS qanday ta'minlanadi

- Barcha kadrlar oldindan yuklanadi va `img.decode()` bilan fon oqimida dekodlanadi.
- Progressiv yuklash: avval har 8-kadr, keyin 4-, 2-, so'ng hammasi — scroll darhol ishlaydi.
- Canvas faqat kadr indeksi o'zgarganda qayta chiziladi; bitta `gsap.ticker` rAF sikli.
- Retina ekranlarda canvas kengligi ~2048px bilan cheklanadi (keraksiz fill-rate yo'q).
- Mobil qurilmalar 800px kadrlarni oladi (~4 MB bir klip uchun).
- `prefers-reduced-motion` hurmat qilinadi.

## Ishga tushirish

```bash
python3 -m http.server 8080    # keyin http://localhost:8080
```

## Havolalarni o'zgartirish

`js/app.js` boshidagi `CONFIG.links` — "Book a lesson" va Telegram manzillari.

## Kliplarni qayta yaratish / almashtirish

Three.js sahnalaridan (lokal render):

```bash
cd tools/render && npm i && npm i playwright
node render.mjs hero out/hero 180     # yoki: method
# so'ng siqish:
for f in out/hero/frame_*.jpg; do b=$(basename $f)
  ffmpeg -y -i $f -q:v 4 ../../frames/hero/lg/$b
  ffmpeg -y -i $f -vf scale=800:-2 -q:v 5 ../../frames/hero/sm/$b; done
```

Higgsfield (yoki istalgan) video klipidan:

```bash
tools/extract-frames.sh clip.mp4 frames/hero/lg 180
tools/compress-frames.sh frames/hero/lg 1600 88
```

Kadrlar soni o'zgarsa, `CONFIG.sequences[].frameCount` ni yangilang.
