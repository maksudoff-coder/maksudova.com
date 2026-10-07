# maksudova.com — Teacher Maksudova Math Academy

Full-screen (100vw × 100vh) real-time WebGL fly-through. Plain HTML + CSS + ES modules, no build step.

## Ssenariy (scroll progressi)

| Scroll | Sahna | Nima bo'ladi |
|---|---|---|
| 0–30% | **Exterior** | Yorug' zamonaviy "Math Academy" binosi, plaza, geometrik haykallar (sfera, piramida, kub), daraxtlar. Bino ustida shisha panelda "Teacher Maksudova Math Academy", pastda "Scroll to explore". |
| 30–65% | **Classroom + tutor** | Kamera eshikdan ichkariga uchib kiradi. Partalar, javon, raqamlar o'qi, suzib yuruvchi kub/piramida/sfera/torus, π ∑ √x ∞ belgilar, zarrachalar. O'ng devorda ramkalangan portret va "Meet your tutor" shisha kartasi. |
| 65–100% | **Smart blackboard** | Kamera doskaga yaqinlashadi va u ekranni to'ldiradi. Doska ustida interaktiv formulalar (Grade 1 → Algebra 1), 390+ ko'nikmalar kartasi, "Book a Lesson" (Telegram) va "Start Practice" (`/app/`). |

## Tutor rasmi

`assets/tutor-maksudova.jpg` faylini qo'ying. Rasm `THREE.TextureLoader` bilan yuklanadi, ramka rasm proporsiyasiga moslashadi (maks. 2.2 × 2.5 m). Fayl bo'lmasa, ramkada chizilgan placeholder portret ko'rinadi va kartada eslatma chiqadi.

## Texnik

- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`, antialias, PBR (`MeshPhysicalMaterial`), RoomEnvironment aks ettirishlari, Ambient + Hemisphere + yumshoq soyali Directional yorug'lik.
- Kamera yo'li: ikkita `CatmullRomCurve3` (pozitsiya va qarash nuqtasi), keyframe'lar scroll progressiga bog'langan; ekran nisbatiga qarab yakuniy masofa hisoblanadi (doska har doim ekranni to'ldiradi).
- Lenis + GSAP ScrollTrigger → progress → kamera damped-follow bilan.
- Glass panellar 3D nuqtalarga proyeksiya qilinadi; doska overlay'i doskaning ekrandagi to'rtburchagiga aniq masshtablanadi (telefonda — alohida shisha karta).
- WebGL bo'lmasa — oddiy o'qiladigan sahifa.

## Fayllar

```
index.html        sahna, shisha panellar, doska overlay'i
css/styles.css    dizayn (#FAF9F6, #F3F4F6, #14B8A6, #0284C7)
js/hero3d.js      Three.js sahna: bino, sinf, portret, doska, kamera yo'li
js/app.js         scroll → progress, panellar, havolalar (CONFIG)
assets/           tutor-maksudova.jpg shu yerga
vendor/           three r169 + RoomEnvironment, gsap 3.12.5 + ScrollTrigger, lenis 1.3.21
```

Ishga tushirish: `python3 -m http.server 8080` → http://localhost:8080 (ES modullar `file://` da ishlamaydi).
