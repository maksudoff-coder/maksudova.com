/* ==========================================================================
   app.js — scroll → camera progress, glass panels pinned to 3D anchors,
   smart-board overlay mapped onto the board surface.
   ========================================================================== */
import { initAcademy } from "./hero3d.js";

// ---- Edit links here ------------------------------------------------------
const CONFIG = {
  links: {
    book: "https://t.me/+RJKtP3gJ0942NWQy", // "Book a Lesson" (Telegram)
    start: "/app/",                          // "Start Practice" → Firebase practice app
  },
  photo: "assets/tutor-maksudova.jpg",
};
// ---------------------------------------------------------------------------

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

$$("[data-link]").forEach((a) => { const href = CONFIG.links[a.dataset.link]; if (href) a.href = href; });
$("#year").textContent = new Date().getFullYear();

function fail(err) {
  console.warn("3D scene unavailable, showing the static page:", err);
  document.documentElement.classList.add("no-webgl");
  document.documentElement.classList.add("is-ready");
}

// WebGL support check before doing anything heavy
const probe = document.createElement("canvas");
if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) fail("no WebGL");
else boot().catch(fail);

async function boot() {
  const academy = await initAcademy({
    canvas: $("#stage"),
    photoUrl: CONFIG.photo,
    reduceMotion,
    onPhoto: (ok) => { $("#photo-note").hidden = ok; },
  });

  /* ---- smooth scroll → camera progress ---- */
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({ lerp: reduceMotion ? 1 : 0.09, smoothWheel: !reduceMotion });
  window.__lenis = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  const track = $("#track");
  const st = ScrollTrigger.create({
    trigger: track, start: "top top", end: "bottom bottom",
    onUpdate: (self) => academy.setProgress(self.progress),
  });
  academy.jump(st.progress);

  // chapter links jump to a progress value
  $$("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const p = parseFloat(a.dataset.jump);
    lenis.scrollTo(st.start + (st.end - st.start) * p, { duration: 2.2, easing: (x) => 1 - Math.pow(1 - x, 3) });
  }));

  /* ---- overlay panels ---- */
  const panels = $$("[data-show]").map((el) => {
    const [a, b] = el.dataset.show.split(",").map(Number);
    return { el, a, b, anchor: el.dataset.anchor || null, last: -1 };
  });
  const FADE = 0.035;
  const board = $("#board");
  const chapters = $$(".chapter");
  const railFill = $("#rail-fill");
  const narrow = () => window.innerWidth <= 760;

  academy.onFrame((f) => {
    const p = f.p;
    for (const P of panels) {
      const enter = P.a <= 0 ? 1 : clamp01((p - P.a) / FADE);
      const exit = P.b >= 1 ? 1 : clamp01((P.b - p) / FADE);
      let o = Math.min(enter, exit);
      const k = 1 - o;
      const rise = (exit < enter ? -1 : 1) * k * 18;

      if (P.el === board) {
        placeBoard(f.board, o, k);
        continue;
      }
      if (P.anchor && f[P.anchor]) {
        const A = f[P.anchor];
        if (!A.visible) o = 0;
        if (!(P.anchor === "tutor" && narrow())) {
          // keep anchored panels fully on screen (below the top bar)
          const h = P.el.offsetHeight, w = P.el.offsetWidth;
          const minY = P.anchor === "title" ? h + 76 : h / 2 + 76;
          const maxY = P.anchor === "title" ? window.innerHeight - 90 : window.innerHeight - h / 2 - 16;
          const x = P.anchor === "title"
            ? Math.min(Math.max(A.x, w / 2 + 12), window.innerWidth - w / 2 - 12)
            : Math.min(Math.max(A.x, w + 12), window.innerWidth - 12);
          P.el.style.left = x.toFixed(1) + "px";
          P.el.style.top = Math.min(Math.max(A.y, minY), maxY).toFixed(1) + "px";
        }
      }
      if (o !== P.last) {
        P.el.style.opacity = o.toFixed(3);
        P.el.style.visibility = o > 0.001 ? "visible" : "hidden";
        P.el.style.pointerEvents = o > 0.6 ? "auto" : "none";
        P.last = o;
      }
      P.el.style.transform = `translate3d(0, ${rise.toFixed(1)}px, 0)`;
    }

    // chapter + rail state
    const ch = p < 0.34 ? 0 : p < 0.72 ? 1 : 2;
    chapters.forEach((c, i) => c.classList.toggle("is-active", i === ch));
    railFill.style.transform = `scaleY(${p.toFixed(4)})`;
  });

  // board overlay sits on the board's projected rectangle
  function placeBoard(r, o, k) {
    const free = !r.visible || r.w < 760;
    board.classList.toggle("is-free", free);
    if (!free) {
      const s = r.w / 1200;
      board.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    } else {
      board.style.transform = "";
    }
    board.style.opacity = o.toFixed(3);
    board.style.visibility = o > 0.001 ? "visible" : "hidden";
    board.style.pointerEvents = o > 0.6 ? "auto" : "none";
    board.style.filter = k > 0.01 ? `blur(${(k * 6).toFixed(1)}px)` : "none";
  }

  // formulas: tap/click toggles the skill label (hover does it on desktop)
  $$(".formula").forEach((b) => b.addEventListener("click", () => b.classList.toggle("is-on")));

  // reveal once the first frame is painted
  requestAnimationFrame(() => document.documentElement.classList.add("is-ready"));
  window.addEventListener("load", () => ScrollTrigger.refresh());
}
