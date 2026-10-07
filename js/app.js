/* ==========================================================================
   app.js — Tutor Maksudova (light educational site)
   Lenis smooth scroll + GSAP ScrollTrigger, real-time WebGL hero,
   Canvas2D function grapher, practice widget, skills explorer, report.
   ========================================================================== */
import { initHero3D } from "./hero3d.js";

// ---- Edit links here ------------------------------------------------------
const CONFIG = {
  links: {
    start: "#practice",                            // "Start Learning" — point to the practice app when it is live
    book: "https://t.me/+RJKtP3gJ0942NWQy",          // "Book a Lesson"
    telegram: "https://t.me/+RJKtP3gJ0942NWQy",
  },
};

// Featured skills — taken from the practice platform's curriculum (Common Core codes).
const CURRICULUM = [
  { g: "Grade 1", cats: [{ n: "Addition and subtraction", s: [["Add within 20", "1.OA.C.6"], ["Subtract within 20", "1.OA.C.6"], ["Add a two-digit and a one-digit number", "1.NBT.C.4"]] }] },
  { g: "Grade 2", cats: [{ n: "Addition and subtraction", s: [["Add and subtract within 100", "2.NBT.B.5"], ["Add and subtract within 1,000", "2.NBT.B.7"]] }, { n: "Money", s: [["Count coins", "2.MD.C.8"]] }] },
  { g: "Grade 3", cats: [{ n: "Multiplication and division", s: [["Multiplication facts", "3.OA.C.7"], ["Division facts", "3.OA.C.7"]] }, { n: "Place value", s: [["Round to the nearest ten or hundred", "3.NBT.A.1"]] }, { n: "Area and perimeter", s: [["Area of rectangles", "3.MD.C.7"], ["Perimeter of rectangles", "3.MD.D.8"]] }] },
  { g: "Grade 4", cats: [{ n: "Multiplication and division", s: [["Multiply multi-digit numbers", "4.NBT.B.5"], ["Divide with remainders", "4.NBT.B.6"]] }, { n: "Factors and multiples", s: [["Identify factors and multiples", "4.OA.B.4"]] }, { n: "Fractions", s: [["Equivalent fractions", "4.NF.A.1"], ["Add and subtract fractions with like denominators", "4.NF.B.3"]] }] },
  { g: "Grade 5", cats: [{ n: "Expressions", s: [["Order of operations", "5.OA.A.1"]] }, { n: "Decimals", s: [["Add and subtract decimals", "5.NBT.B.7"]] }, { n: "Fractions", s: [["Add and subtract fractions with unlike denominators", "5.NF.A.1"], ["Multiply fractions", "5.NF.B.4"]] }] },
  { g: "Grade 6", cats: [{ n: "Number theory", s: [["Greatest common factor", "6.NS.B.4"], ["Least common multiple", "6.NS.B.4"]] }, { n: "Ratios and percents", s: [["Find the percent of a number", "6.RP.A.3c"], ["Unit rates", "6.RP.A.3b"]] }, { n: "Expressions and equations", s: [["Evaluate exponents", "6.EE.A.1"], ["Solve one-step equations", "6.EE.B.7"]] }] },
  { g: "Grade 7", cats: [{ n: "Integers", s: [["Add and subtract integers", "7.NS.A.1"], ["Multiply and divide integers", "7.NS.A.2"]] }, { n: "Equations", s: [["Solve two-step equations", "7.EE.B.4a"]] }, { n: "Percents", s: [["Discounts, sales tax and tips", "7.RP.A.3"]] }, { n: "Geometry", s: [["Area and circumference of circles", "7.G.B.4"]] }] },
  { g: "Grade 8", cats: [{ n: "Exponents and roots", s: [["Square roots and cube roots", "8.EE.A.2"], ["Exponent rules", "8.EE.A.1"]] }, { n: "Equations", s: [["Solve equations with variables on both sides", "8.EE.C.7"]] }, { n: "Functions", s: [["Find the slope from two points", "8.F.B.4"]] }, { n: "Geometry", s: [["Pythagorean theorem", "8.G.B.7"]] }] },
  { g: "Algebra 1", cats: [{ n: "Functions", s: [["Evaluate functions", "HSF-IF.A.2"]] }, { n: "Systems of equations", s: [["Solve a system of equations", "HSA-REI.C.6"]] }, { n: "Quadratics", s: [["Factor quadratics", "HSA-SSE.A.2"], ["Solve quadratic equations by factoring", "HSA-REI.B.4"]] }] },
];
const CAT_ICONS = { "Addition and subtraction": "±", Money: "¢", "Multiplication and division": "×", "Place value": "10", "Area and perimeter": "A", "Factors and multiples": "n", Fractions: "½", Expressions: "( )", Decimals: ".5", "Number theory": "ℕ", "Ratios and percents": "%", "Expressions and equations": "x", Integers: "ℤ", Equations: "=", Percents: "%", Geometry: "△", "Exponents and roots": "√", Functions: "f", "Systems of equations": "{", Quadratics: "x²" };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) document.documentElement.classList.add("reduce-motion");
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MINUS = "−";
const fmt = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ---------------------------------------------------------------------------
   Links, smooth scroll
   ------------------------------------------------------------------------- */
$$("[data-link]").forEach((a) => {
  const href = CONFIG.links[a.dataset.link];
  if (!href) return;
  a.href = href;
  if (href.startsWith("#")) { a.removeAttribute("target"); a.removeAttribute("rel"); a.setAttribute("data-scroll-to", ""); }
});
$("#year").textContent = new Date().getFullYear();

gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: reduceMotion ? 1 : 0.1, smoothWheel: !reduceMotion });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
window.__lenis = lenis;

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-scroll-to]");
  if (!a) return;
  const id = a.getAttribute("href");
  if (!id || !id.startsWith("#")) return;
  const target = id === "#top" ? 0 : $(id);
  if (target === null) return;
  e.preventDefault();
  lenis.scrollTo(target, { offset: -70, duration: 1.2 });
});

const nav = $("#nav");
lenis.on("scroll", ({ scroll }) => nav.classList.toggle("is-scrolled", scroll > 8));

/* ---------------------------------------------------------------------------
   Reveal on scroll + counters
   ------------------------------------------------------------------------- */
function countUp(el) {
  if (el.dataset.counted) return;
  el.dataset.counted = "1";
  const target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "";
  if (reduceMotion) { el.textContent = target + suffix; return; }
  const o = { v: 0 };
  gsap.to(o, { v: target, duration: 1.6, ease: "power3.out", onUpdate: () => (el.textContent = Math.round(o.v) + suffix) });
}

if (reduceMotion) {
  $$("[data-count]").forEach(countUp);
} else {
  ScrollTrigger.batch(".reveal", {
    start: "top 88%",
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.08, overwrite: true }),
  });
  $$("[data-count]").forEach((el) => ScrollTrigger.create({ trigger: el, start: "top 92%", once: true, onEnter: () => countUp(el) }));
}

/* ---------------------------------------------------------------------------
   Hero — real-time WebGL scene + floating formula cards
   ------------------------------------------------------------------------- */
const heroVisual = $("#hero-visual");
initHero3D({ canvas: $("#hero-canvas"), container: heroVisual, tip: $("#shape-tip"), reduceMotion })
  .then((hero) => {
    ScrollTrigger.create({
      trigger: ".hero", start: "top top", end: "bottom top", scrub: true,
      onUpdate: (self) => hero.setScroll(self.progress),
    });
  })
  .catch((err) => { console.warn("3D hero unavailable:", err); heroVisual.classList.add("no-webgl"); });

if (!reduceMotion) {
  $$("[data-float]").forEach((el, i) => {
    gsap.fromTo(el, { opacity: 0, y: 20, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, delay: 0.5 + i * 0.12, ease: "back.out(1.6)" });
    gsap.to(el, { y: i % 2 ? 8 : -8, duration: 2.6 + i * 0.4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.4 + i * 0.2 });
  });
  // the hero copy and visual drift apart slightly on scroll (depth)
  gsap.to(".hero__copy", { yPercent: -8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
}

/* ---------------------------------------------------------------------------
   Skills explorer
   ------------------------------------------------------------------------- */
const tabsEl = $("#grade-tabs"), panel = $("#skills-panel");
function renderGrade(i) {
  const grade = CURRICULUM[i];
  $$(".tab", tabsEl).forEach((t, k) => { t.setAttribute("aria-selected", k === i ? "true" : "false"); t.tabIndex = k === i ? 0 : -1; });
  panel.setAttribute("aria-label", grade.g + " skills");
  panel.innerHTML = grade.cats.map((c) => `
    <article class="cat card">
      <div class="cat__head"><span class="cat__icon" aria-hidden="true">${CAT_ICONS[c.n] || "∑"}</span><h3>${c.n}</h3></div>
      <ul>${c.s.map(([t, cc]) => `<li><span>${t}</span><code>${cc}</code></li>`).join("")}</ul>
    </article>`).join("") + `
    <div class="skills__more">
      <span>A few highlights from <b>${grade.g}</b> — the platform has 390+ skills in total.</span>
      <a class="btn btn--primary btn--sm" href="${CONFIG.links.start}" ${CONFIG.links.start.startsWith("#") ? "data-scroll-to" : 'target="_blank" rel="noopener"'}>Practise ${grade.g} →</a>
    </div>`;
  if (!reduceMotion) gsap.from(panel.children, { opacity: 0, y: 16, duration: 0.5, stagger: 0.06, ease: "power2.out", clearProps: "all" });
}
CURRICULUM.forEach((g, i) => {
  const b = document.createElement("button");
  b.className = "tab"; b.role = "tab"; b.textContent = g.g;
  b.addEventListener("click", () => renderGrade(i));
  tabsEl.appendChild(b);
});
tabsEl.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const tabs = $$(".tab", tabsEl), cur = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  const next = (cur + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  renderGrade(next); tabs[next].focus();
});
renderGrade(5);

/* ---------------------------------------------------------------------------
   Interactive function grapher (Canvas2D, HiDPI-sharp)
   ------------------------------------------------------------------------- */
(function grapher() {
  const canvas = $("#graph-canvas"), ctx = canvas.getContext("2d");
  const readout = $("#graph-readout"), formulaEl = $("#graph-formula"), factEl = $("#graph-fact");
  const s1 = $("#s1"), s2 = $("#s2"), o1 = $("#s1-out"), o2 = $("#s2-out"), n1 = $("#s1-name"), n2 = $("#s2-name");
  const RANGE = 8; // x and y from -8..8
  const MODES = {
    linear: { names: ["Slope m", "Intercept b"], s1: [-4, 4, 0.5, 1], s2: [-5, 5, 0.5, 1] },
    quad: { names: ["Stretch a", "Shift c"], s1: [-2, 2, 0.25, 0.5], s2: [-6, 6, 0.5, -2] },
  };
  let mode = "linear";
  const cur = { p: 1, q: 1 }; // animated values
  let hover = null, w = 0, h = 0, dpr = 1;

  const num = (v) => { const r = Math.round(v * 100) / 100; return r < 0 ? MINUS + Math.abs(r) : String(r); };
  const f = (x) => (mode === "linear" ? cur.p * x + cur.q : cur.p * x * x + cur.q);

  function setFill(input) {
    const k = (input.value - input.min) / (input.max - input.min);
    input.style.setProperty("--fill", k * 100 + "%");
  }
  function texts() {
    const p = parseFloat(s1.value), q = parseFloat(s2.value);
    o1.textContent = num(p); o2.textContent = num(q);
    const qs = q === 0 ? "" : q > 0 ? ` + ${num(q)}` : ` ${MINUS} ${num(-q)}`;
    const coef = (v) => (v === 1 ? "" : v === -1 ? MINUS : num(v)); // 1x → x, −1x → −x
    if (mode === "linear") {
      formulaEl.textContent = p === 0 ? `y = ${num(q)}` : `y = ${coef(p)}x${qs}`;
      factEl.textContent = p === 0
        ? `A slope of 0 makes a flat line through (0, ${num(q)}).`
        : `The line crosses the y-axis at (0, ${num(q)}) and rises ${num(p)} for every 1 step right.`;
    } else {
      formulaEl.textContent = p === 0 ? `y = ${num(q)}` : `y = ${coef(p)}x²${qs}`;
      factEl.textContent = p === 0
        ? "With a = 0 the parabola flattens into a line."
        : `The vertex is at (0, ${num(q)}); the parabola opens ${p > 0 ? "up" : "down"}.`;
    }
  }
  function onInput() {
    setFill(s1); setFill(s2); texts();
    const to = { p: parseFloat(s1.value), q: parseFloat(s2.value) };
    if (reduceMotion) { Object.assign(cur, to); draw(); } else gsap.to(cur, { ...to, duration: 0.45, ease: "power3.out", onUpdate: draw, overwrite: true });
  }
  function setMode(m) {
    mode = m;
    $$(".seg__btn").forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on); });
    const M = MODES[m];
    n1.textContent = M.names[0]; n2.textContent = M.names[1];
    [[s1, M.s1], [s2, M.s2]].forEach(([el, [mn, mx, st, v]]) => { el.min = mn; el.max = mx; el.step = st; el.value = v; });
    onInput();
  }
  $$(".seg__btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  s1.addEventListener("input", onInput); s2.addEventListener("input", onInput);

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const X = (x) => ((x + RANGE) / (2 * RANGE)) * w;
  const Y = (y) => h - ((y + RANGE) / (2 * RANGE)) * h;
  const invX = (px) => (px / w) * 2 * RANGE - RANGE;
  const crisp = (v) => Math.round(v * dpr) / dpr + 0.5 / dpr;

  function draw() {
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    // grid
    for (let i = -RANGE; i <= RANGE; i++) {
      ctx.strokeStyle = i % 2 === 0 ? "#e2e8f0" : "#f1f5f9";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(crisp(X(i)), 0); ctx.lineTo(crisp(X(i)), h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, crisp(Y(i))); ctx.lineTo(w, crisp(Y(i))); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = "#334155"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), h); ctx.stroke();
    // tick labels
    ctx.fillStyle = "#64748b"; ctx.font = "500 11px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let i = -RANGE + 2; i < RANGE; i += 2) if (i) ctx.fillText(fmt(i), X(i), Y(0) + 6);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = -RANGE + 2; i < RANGE; i += 2) if (i) ctx.fillText(fmt(i), X(0) - 6, Y(i));
    ctx.font = "italic 500 16px 'STIX Two Text', Georgia, serif"; ctx.fillStyle = "#334155";
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("x", w - 8, Y(0) - 4);
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("y", X(0) + 8, 8);

    // curve
    ctx.save();
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= w; px += 1) {
      const y = f(invX(px)), py = Y(y);
      if (py < -50 || py > h + 50) { started = false; continue; }
      started ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      started = true;
    }
    ctx.strokeStyle = "#0284c7"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();

    // y-intercept / vertex point
    const kp = { x: 0, y: f(0) };
    dot(kp.x, kp.y, "#14b8a6", 6);
    label(`(0, ${num(kp.y)})`, X(0) + 10, Y(kp.y) - 10, "#0f766e");

    // hover crosshair
    if (hover !== null) {
      const y = f(hover), px = X(hover), py = Y(y);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, Y(0)); ctx.lineTo(px, py); ctx.lineTo(X(0), py); ctx.stroke();
      ctx.setLineDash([]);
      dot(hover, y, "#0284c7", 5);
      readout.textContent = `x = ${num(hover)},  y = ${num(y)}`;
    } else readout.textContent = "Hover the plane";
  }
  function dot(x, y, color, r) {
    ctx.beginPath(); ctx.arc(X(x), Y(y), r + 3, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  function label(t, x, y, color) {
    ctx.font = "600 13px Inter, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    const m = ctx.measureText(t).width;
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(x - 4, y - 18, m + 8, 20);
    ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  const move = (e) => {
    const r = canvas.getBoundingClientRect();
    hover = Math.round(invX(e.clientX - r.left) * 4) / 4; // snap to quarter steps
    draw();
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerdown", move);
  canvas.addEventListener("pointerleave", () => { hover = null; draw(); });
  new ResizeObserver(resize).observe(canvas);
  document.fonts && document.fonts.ready.then(draw);
  setMode("linear");
})();

/* ---------------------------------------------------------------------------
   Practice widget — fresh questions, answer check, explanation, SmartScore
   ------------------------------------------------------------------------- */
(function practice() {
  const GEN = {
    g12: () => {
      if (Math.random() < 0.5) { const a = ri(12, 68), b = ri(11, 99 - a), s = a + b;
        return { skill: "Add within 100", q: `${a} + ${b} = ?`, a: s, ex: `Add the tens: ${a - (a % 10)} + ${b - (b % 10)} = ${a - (a % 10) + b - (b % 10)}. Add the ones: ${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}. Together: <b>${s}</b>.` }; }
      const a = ri(11, 20), b = ri(2, 9), d = a - b;
      return { skill: "Subtract within 20", q: `${a} ${MINUS} ${b} = ?`, a: d, ex: `Think addition: ${b} + ? = ${a}. Since ${b} + ${d} = ${a}, the answer is <b>${d}</b>.` };
    },
    g35: () => {
      if (Math.random() < 0.5) { const a = ri(3, 9), b = ri(4, 12);
        return { skill: "Multiplication facts", q: `${a} × ${b} = ?`, a: a * b, ex: `${a} × ${b} means ${a} groups of ${b}: ${Array(a).fill(b).join(" + ")} = <b>${a * b}</b>.` }; }
      const l = ri(3, 12), w = ri(2, 9);
      return { skill: "Area of rectangles", q: `A rectangle is ${l} cm long and ${w} cm wide. What is its area (cm²)?`, a: l * w, ex: `Area = length × width = ${l} × ${w} = <b>${l * w} cm²</b>.` };
    },
    g68: () => {
      if (Math.random() < 0.5) { const x = ri(-6, 9), a = ri(2, 7), b = ri(-12, 15), c = a * x + b;
        const bs = b < 0 ? ` ${MINUS} ${-b}` : ` + ${b}`;
        return { skill: "Solve two-step equations", q: `${a}<i>x</i>${bs} = ${fmt(c)}. What is <i>x</i>?`, a: x,
          ex: `${b < 0 ? "Add " + -b : "Subtract " + b} on both sides: ${a}x = ${fmt(c - b)}. Divide by ${a}: x = <b>${fmt(x)}</b>.` }; }
      const p = [10, 20, 25, 50, 75][ri(0, 4)], n = ri(2, 16) * 4, v = (p * n) / 100;
      return { skill: "Find the percent of a number", q: `What is ${p}% of ${n}?`, a: v, ex: `${p}% = ${p}/100. ${n} × ${p} ÷ 100 = <b>${v}</b>.` };
    },
    alg: () => {
      if (Math.random() < 0.5) { const m = ri(-5, 6) || 2, b = ri(-9, 9), k = ri(-4, 5), v = m * k + b;
        const bs = b === 0 ? "" : b < 0 ? ` ${MINUS} ${-b}` : ` + ${b}`;
        return { skill: "Evaluate functions", q: `If <i>f</i>(<i>x</i>) = ${fmt(m)}<i>x</i>${bs}, what is <i>f</i>(${fmt(k)})?`, a: v,
          ex: `Replace x with ${k < 0 ? "(" + fmt(k) + ")" : k}: ${fmt(m)} × ${k < 0 ? "(" + fmt(k) + ")" : k}${bs} = ${fmt(m * k)}${bs} = <b>${fmt(v)}</b>.` }; }
      const x1 = ri(-4, 2), y1 = ri(-5, 5), m = ri(-3, 4) || 1, dx = ri(1, 4), x2 = x1 + dx, y2 = y1 + m * dx;
      return { skill: "Find the slope from two points", q: `What is the slope of the line through (${fmt(x1)}, ${fmt(y1)}) and (${fmt(x2)}, ${fmt(y2)})?`, a: m,
        ex: `Slope = (y₂ ${MINUS} y₁) ÷ (x₂ ${MINUS} x₁) = (${fmt(y2)} ${MINUS} ${y1 < 0 ? "(" + fmt(y1) + ")" : y1}) ÷ (${fmt(x2)} ${MINUS} ${x1 < 0 ? "(" + fmt(x1) + ")" : x1}) = ${fmt(y2 - y1)} ÷ ${dx} = <b>${fmt(m)}</b>.` };
    },
  };

  const qEl = $("#quiz-q"), skillEl = $("#quiz-skill"), form = $("#quiz-form"), input = $("#quiz-input");
  const fb = $("#quiz-feedback"), ring = $("#quiz-ring"), scoreEl = $("#quiz-score"), streakEl = $("#quiz-streak");
  let level = "g12", cur = null, answered = false, score = 0, streak = 0;

  function setScore(v) {
    score = Math.max(0, Math.min(100, v));
    ring.style.setProperty("--p", score);
    const o = { v: parseInt(scoreEl.textContent, 10) || 0 };
    gsap.to(o, { v: score, duration: 0.6, ease: "power2.out", onUpdate: () => (scoreEl.textContent = Math.round(o.v)) });
  }
  function next() {
    cur = GEN[level]();
    answered = false;
    skillEl.textContent = cur.skill;
    qEl.innerHTML = cur.q;
    input.value = ""; input.className = "";
    fb.innerHTML = "";
    if (!reduceMotion) gsap.from([skillEl, qEl], { opacity: 0, y: 10, duration: 0.4, stagger: 0.05, ease: "power2.out" });
  }
  const parse = (s) => parseFloat(String(s).trim().replace(/[−–]/g, "-").replace(",", "."));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (answered) { next(); input.focus({ preventScroll: true }); return; }
    const v = parse(input.value);
    if (Number.isNaN(v)) { input.focus({ preventScroll: true }); return; }
    answered = true;
    const right = Math.abs(v - cur.a) < 1e-9;
    input.className = right ? "is-right" : "is-wrong";
    if (right) {
      streak++;
      setScore(score + (score < 70 ? 12 : score < 90 ? 6 : 3) + Math.min(streak, 3));
      fb.innerHTML = `<div class="fb fb--good"><span class="fb__icon">✓</span><div><b>Correct!</b> ${cur.ex}<br><small>Press Enter for the next question.</small></div></div>`;
      if (!reduceMotion) gsap.fromTo(ring, { scale: 1 }, { scale: 1.15, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" });
    } else {
      streak = 0;
      setScore(score - 6);
      fb.innerHTML = `<div class="fb fb--bad"><span class="fb__icon">!</span><div><b>Not quite — the answer is ${fmt(cur.a)}.</b><br>${cur.ex}</div></div>`;
      if (!reduceMotion) gsap.fromTo(input, { x: -6 }, { x: 0, duration: 0.4, ease: "elastic.out(1, 0.3)" });
    }
    streakEl.textContent = `Streak: ${streak}`;
  });
  $("#quiz-next").addEventListener("click", next);
  $$("#quiz-levels .chip").forEach((c) => c.addEventListener("click", () => {
    level = c.dataset.level;
    $$("#quiz-levels .chip").forEach((x) => { const on = x === c; x.classList.toggle("is-active", on); x.setAttribute("aria-checked", on); });
    next();
  }));
  next();
})();

/* ---------------------------------------------------------------------------
   Method — the dashed path draws itself as you scroll
   ------------------------------------------------------------------------- */
(function methodPath() {
  const base = $("#steps-path");
  if (!base) return;
  const draw = base.cloneNode();
  draw.removeAttribute("id");
  draw.setAttribute("style", "stroke:#14b8a6;stroke-width:3;stroke-dasharray:none;stroke-linecap:round");
  base.after(draw);
  const len = draw.getTotalLength();
  draw.style.strokeDasharray = len;
  draw.style.strokeDashoffset = reduceMotion ? 0 : len;
  if (!reduceMotion) gsap.to(draw, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".steps", start: "top 75%", end: "bottom 60%", scrub: true } });
})();

/* ---------------------------------------------------------------------------
   Progress report (sample data) — bars with hover tooltips, mastery meters
   ------------------------------------------------------------------------- */
(function report() {
  const WEEK = [["Mon", 18], ["Tue", 26], ["Wed", 14], ["Thu", 31], ["Fri", 22], ["Sat", 12], ["Sun", 25]];
  const SKILLS = [["Equivalent fractions", 92], ["Unit rates", 78], ["Two-step equations", 64], ["Area of circles", 85]];
  const bars = $("#bars"), tip = $("#bars-tip"), chart = $(".dash__chart");
  const max = 35;
  bars.innerHTML = WEEK.map(([d, v]) => `<div class="bar" data-day="${d}" data-v="${v}"><div class="bar__fill" style="height:${(v / max) * 100}%"></div><span class="bar__day">${d}</span></div>`).join("");
  $("#mastery").innerHTML = SKILLS.map(([n, v]) => `<li><div class="mastery__row"><span>${n}</span><b>${v}</b></div><div class="mastery__track"><div class="mastery__fill" data-w="${v}"></div></div></li>`).join("");

  $$(".bar", bars).forEach((b) => {
    b.addEventListener("pointerenter", () => {
      const cr = chart.getBoundingClientRect(), fr = b.querySelector(".bar__fill").getBoundingClientRect();
      tip.textContent = `${b.dataset.day}: ${b.dataset.v} questions`;
      tip.style.left = fr.left - cr.left + fr.width / 2 + "px";
      tip.style.top = fr.top - cr.top - 6 + "px";
      tip.classList.add("is-on");
    });
    b.addEventListener("pointerleave", () => tip.classList.remove("is-on"));
  });

  const play = () => {
    gsap.to($$(".bar__fill", bars), { scaleY: 1, duration: reduceMotion ? 0 : 0.9, ease: "power3.out", stagger: 0.06 });
    $$(".mastery__fill").forEach((el) => (el.style.width = el.dataset.w + "%"));
  };
  ScrollTrigger.create({ trigger: "#dash", start: "top 80%", once: true, onEnter: play });
})();

window.addEventListener("load", () => ScrollTrigger.refresh());
