# maksudova.com

Light, interactive landing page for **Tutor Maksudova** — online math from Grade 1 to Algebra 1.
Plain HTML + CSS + JS (ES modules), no build step. Runs from any static host.

## Dizayn tizimi

| | |
|---|---|
| **Fon** | `#FFFFFF`, `#F8FAFC`, `#F1F5F9` |
| **Matn** | `#0F172A`, `#1E293B` (ikkilamchi `#475569`, `#64748B`) |
| **Urg'u** | Firuza `#14B8A6` → ko'k `#0284C7` gradienti; kamdan-kam amber `#F59E0B` |
| **Shriftlar** | Lexend (sarlavhalar), Inter (matn), STIX Two Text italik (formulalar) |

## Bo'limlar

1. **Hero** — real-time Three.js 3D koordinata fazosi: pol va orqa devor setkasi, x/y/z o'qlari, kub, piramida, sfera, `y = x²` parabolasi va u bo'ylab harakatlanuvchi nuqta. Sichqoncha bilan aylantiriladi, shakl ustiga borilsa formula chiqadi. Atrofida formula kartochkalari va SmartScore kartasi.
2. **Skills** — sinflar bo'yicha tablar, Common Core kodlari bilan ko'nikmalar (amaliyot platformasi o'quv dasturidan).
3. **Explore** — Canvas2D grafik: `y = mx + b` va `y = ax² + c`, slayderlar, hover koordinatalari.
4. **Try it now** — mashq vidjeti: yangi savollar, javobni tekshirish, yechim bosqichlari, SmartScore va streak.
5. **Method** — Diagnose → Practice → Master, scroll bilan chiziladigan yo'l.
6. **Progress** — namunaviy hisobot (hover tooltipli ustunli grafik, mahorat ko'rsatkichlari).
7. **Platform** — interaktiv kartalar (390+ ko'nikma, 10 brain games, quizzes, video, live board, badges).
8. **CTA** va footer.

## Sifat va tezlik

- WebGL: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, antialias, yumshoq soyalar — Retina/4K'da tiniq.
- Canvas2D grafik ham `devicePixelRatio` bo'yicha chiziladi.
- 3D sahna ekrandan tashqarida yoki fon tabda to'xtaydi (IntersectionObserver + visibilitychange).
- Lenis + GSAP ScrollTrigger bitta `gsap.ticker` sikli orqali.
- `prefers-reduced-motion` hurmat qilinadi.

## Fayllar

```
index.html
css/styles.css
js/app.js        Lenis/GSAP, skills, grapher, practice, report, CONFIG (havolalar)
js/hero3d.js     Three.js hero sahnasi
vendor/          three r169, RoomEnvironment, gsap 3.12.5 + ScrollTrigger, lenis 1.3.21
```

## Ishga tushirish

```bash
python3 -m http.server 8080   # http://localhost:8080
```

ES modullar `file://` orqali ochilmaydi — har doim server orqali oching.

## Havolalar

`js/app.js` boshidagi `CONFIG.links`: `start` (hozir sahifadagi mashq vidjetiga olib boradi — amaliyot ilovasi manzili tayyor bo'lsa, shu yerga qo'ying), `book`, `telegram`.
