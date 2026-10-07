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

## Texnik (render)

- **PBR:** barcha materiallar `MeshPhysicalMaterial` / `MeshStandardMaterial`. Procedural tekstura to'plamlari (albedo + roughness + bump): shpaklyovka devor, laklangan dub parket (clearcoat), ohaktosh plaza, maysazor, beton, cho'tkalangan alyuminiy.
- **Shisha:** `transmission: 0.9, roughness: 0.1, ior: 1.5, thickness: 0.5` — fasad, ochiq eshiklar, yuqori qavat, piramida haykali; suzuvchi kub/torus — iridescent shisha; portret ustida aks ettiruvchi shisha qoplama (rasm tiniq qolishi uchun transmission ishlatilmagan).
- **Metall:** oyna-xrom sfera, oltin halqa va portret ramkasi, cho'tkalangan alyuminiy (doska ramkasi, mullionlar), shisha plitka ichidagi oltin/xrom matematika belgilari (π ∑ √x ∞ x² Δ).
- **Yorug'lik:** RoomEnvironment IBL, quyosh `DirectionalLight` (PCFSoft soyalar, 2048²), osmon gradienti, hemisphere fill, sinf ichida `PointLight`lar, portret ustida `SpotLight` (galereya chirog'i).
- **Post-processing:** `EffectComposer` — MSAA (4×) HalfFloat target → `UnrealBloomPass` (faqat chiroq panellari porlaydi) → vinyetka → `OutputPass` (`ACESFilmicToneMapping`, exposure 1.2, sRGB).
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` va composer ham shu nisbatda.
- Kamera yo'li: ikkita `CatmullRomCurve3`, keyframe'lar scroll progressiga bog'langan; Lenis + GSAP ScrollTrigger → damped-follow.
- Glass panellar 3D nuqtalarga proyeksiya qilinadi; doska overlay'i doska sirtiga aniq masshtablanadi (telefonda — alohida shisha karta).
- WebGL bo'lmasa — oddiy o'qiladigan sahifa.

## Fayllar

```
index.html        sahna, shisha panellar, doska overlay'i
css/styles.css    dizayn (#FAF9F6, #F3F4F6, #14B8A6, #0284C7)
js/hero3d.js      Three.js sahna: bino, sinf, portret, doska, kamera yo'li
js/app.js         scroll → progress, panellar, havolalar (CONFIG)
assets/           tutor-maksudova.jpg shu yerga
vendor/           three r169 + addons (RoomEnvironment, RoundedBox, EffectComposer, UnrealBloom, OutputPass), gsap 3.12.5 + ScrollTrigger, lenis 1.3.21
```

Ishga tushirish: `python3 -m http.server 8080` → http://localhost:8080 (ES modullar `file://` da ishlamaydi).
