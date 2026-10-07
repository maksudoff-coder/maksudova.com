/* ==========================================================================
   app.js — site orchestration (Lenis + GSAP ScrollTrigger)
   ========================================================================== */
(function () {
  "use strict";

  // ---- Edit links here -----------------------------------------------------
  const CONFIG = {
    links: {
      book: "https://t.me/+RJKtP3gJ0942NWQy",     // where "Book a lesson" goes
      telegram: "https://t.me/+RJKtP3gJ0942NWQy",
    },
    // One entry per cinematic section. Frames live in frames/<name>/{lg,sm}/.
    // To swap in a Higgsfield clip: run tools/extract-frames.sh and keep the names.
    sequences: [
      { section: "#hero",   name: "hero",   frameCount: 180, focusX: 0.5 },
      { section: "#method", name: "method", frameCount: 180, focusX: 0.63 },
    ],
    bg: "#05060a",
  };
  // ---------------------------------------------------------------------------

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const size = window.innerWidth <= 800 ? "sm" : "lg";

  document.querySelectorAll("[data-link]").forEach((a) => {
    const href = CONFIG.links[a.dataset.link];
    if (href) a.href = href;
  });
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  gsap.registerPlugin(ScrollTrigger);

  // ---- Smooth scroll (Lenis) driven by GSAP's ticker: one rAF for everything
  const lenis = new Lenis({ lerp: reduceMotion ? 1 : 0.085, smoothWheel: !reduceMotion, wheelMultiplier: 0.9 });
  window.__lenis = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop(); // until the preloader is done

  document.querySelectorAll("[data-scroll-to]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || !id.startsWith("#")) return;
      e.preventDefault();
      lenis.scrollTo(id === "#top" ? 0 : id, { duration: 1.8, easing: (x) => 1 - Math.pow(1 - x, 4) });
    });
  });

  // ---- Cinematic frame sequences --------------------------------------------
  const seqs = CONFIG.sequences
    .map((c) => {
      const section = document.querySelector(c.section);
      if (!section) return null;
      const seq = new ScrollCinematic.FrameSequence({
        section,
        frameCount: c.frameCount,
        bg: CONFIG.bg,
        focusX: c.focusX,
        framePath: (i) => `frames/${c.name}/${size}/frame_${String(i).padStart(4, "0")}.jpg`,
      });
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => seq.setProgress(self.progress),
        onRefresh: (self) => seq.setProgress(self.progress),
      });
      seq.setProgress(0);
      return seq;
    })
    .filter(Boolean);

  gsap.ticker.add(() => { for (const s of seqs) s.render(); });

  // ---- Preloader: wait for a coarse pass of the hero, then load the rest ----
  const fill = document.getElementById("preloader-fill");
  const pct = document.getElementById("preloader-pct");
  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    if (fill) fill.style.transform = "scaleX(1)";
    if (pct) pct.textContent = "100%";
    setTimeout(() => {
      document.body.classList.remove("is-loading");
      lenis.start();
      ScrollTrigger.refresh();
      introAnimation();
    }, 350);
  }
  setTimeout(reveal, 9000); // never hold visitors hostage on a slow connection

  (async () => {
    if (!seqs.length) return reveal();
    const [first, ...rest] = seqs;
    const coarseTarget = Math.ceil(first.n / 4);
    await first.load((done, total, coarseDone) => {
      const k = Math.min(1, done / coarseTarget);
      if (fill) fill.style.transform = `scaleX(${k})`;
      if (pct) pct.textContent = Math.round(k * 100) + "%";
      if (coarseDone) reveal();
    });
    for (const s of rest) await s.load();
  })();

  function introAnimation() {
    const hero = document.querySelector("#hero .reveal-line");
    if (!hero || reduceMotion) return;
    gsap.from(hero.children, { y: 60, opacity: 0, rotateX: -20, duration: 1.6, stagger: 0.12, ease: "expo.out" });
    gsap.from("#hero .scrub__canvas", { scale: 1.12, duration: 2.4, ease: "expo.out" });
    gsap.from(".nav", { y: -30, opacity: 0, duration: 1.2, delay: 0.3, ease: "expo.out" });
  }

  // ---- Scroll hint + nav behaviour -------------------------------------------
  const nav = document.getElementById("nav");
  const hints = document.querySelectorAll(".scroll-hint");
  let lastY = 0;
  lenis.on("scroll", ({ scroll }) => {
    hints.forEach((h) => (h.style.opacity = scroll > 60 ? "0" : "1"));
    nav.classList.toggle("is-solid", scroll > 80);
    nav.classList.toggle("is-hidden", scroll > 400 && scroll > lastY + 2);
    if (scroll < lastY - 2) nav.classList.remove("is-hidden");
    lastY = scroll;
  });

  // ---- Pointer parallax on the cinematic canvases (adds depth) ---------------
  if (finePointer && !reduceMotion) {
    const movers = [...document.querySelectorAll(".scrub__canvas")].map((el) => ({
      x: gsap.quickTo(el, "--px", { duration: 1.2, ease: "power3.out", unit: "px" }),
      y: gsap.quickTo(el, "--py", { duration: 1.2, ease: "power3.out", unit: "px" }),
    }));
    window.addEventListener("pointermove", (e) => {
      const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
      movers.forEach((m) => { m.x(nx * -22); m.y(ny * -14); });
    }, { passive: true });
  }

  // ---- Manifesto: words light up as you scroll ------------------------------
  document.querySelectorAll("[data-split-words]").forEach((p) => {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else { const s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.appendChild(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          n.classList.add("w");
        }
      });
    };
    walk(p);
    const words = p.querySelectorAll(".w");
    gsap.to(words, {
      opacity: 1,
      stagger: 0.08,
      ease: "none",
      scrollTrigger: { trigger: p, start: "top 78%", end: "bottom 45%", scrub: true },
    });
  });

  // ---- Reveal on enter + counters -------------------------------------------
  const countUp = (el) => {
    const target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "";
    const plain = el.hasAttribute("data-plain");
    const from = plain ? Math.max(0, target - 40) : 0;
    const o = { v: from };
    gsap.to(o, {
      v: target, duration: reduceMotion ? 0 : 2.2, ease: "expo.out",
      onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString(plain ? "en-US" : undefined, { useGrouping: !plain }) + suffix),
    });
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      e.target.querySelectorAll("[data-count]").forEach(countUp);
      io.unobserve(e.target);
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal").forEach((el, i) => {
    el.style.transitionDelay = (el.closest(".stats, .bento") ? (i % 4) * 0.09 : 0) + "s";
    io.observe(el);
  });

  // ---- Programs: pinned horizontal track (desktop only) ---------------------
  const mm = gsap.matchMedia();
  mm.add("(min-width: 801px)", () => {
    const track = document.querySelector(".programs__track");
    const pin = document.querySelector(".programs");
    if (!track || !pin) return;
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: pin,
        start: "top top",
        end: () => "+=" + distance(),
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
    // each card swings in on a subtle 3D arc as it travels across
    gsap.utils.toArray(".programs .card").forEach((card) => {
      gsap.fromTo(card, { "--sy": "-18deg", "--sz": "-120px", opacity: 0.35 }, {
        "--sy": "0deg", "--sz": "0px", opacity: 1, ease: "power2.out",
        scrollTrigger: { trigger: card, containerAnimation: tween, start: "left 100%", end: "left 55%", scrub: true },
      });
    });
    return () => gsap.set(track, { clearProps: "x" });
  });

  // ---- 3D tilt + specular highlight -----------------------------------------
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".tilt").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--ry", ((x - 0.5) * 14).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - y) * 12).toFixed(2) + "deg");
        el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
      });
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      });
    });

    // magnetic buttons
    document.querySelectorAll(".magnetic").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.28).toFixed(1) + "px");
        el.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1) + "px");
      });
      el.addEventListener("pointerleave", () => { el.style.setProperty("--mx", "0px"); el.style.setProperty("--my", "0px"); });
    });

    // custom cursor
    const cursor = document.querySelector(".cursor");
    if (cursor) {
      const cx = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3.out" });
      const cy = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3.out" });
      window.addEventListener("pointermove", (e) => { cx(e.clientX); cy(e.clientY); }, { passive: true });
      document.querySelectorAll("a, button, .tilt").forEach((el) => {
        el.addEventListener("pointerenter", () => cursor.classList.add("is-hover"));
        el.addEventListener("pointerleave", () => cursor.classList.remove("is-hover"));
      });
    }
  }

  // ---- Infinite marquee that reacts to scroll velocity ----------------------
  const marquees = [...document.querySelectorAll("[data-marquee]")].map((row) => {
    row.innerHTML += row.innerHTML; // duplicate for a seamless loop
    const dir = parseFloat(row.dataset.marquee) || 1;
    const tl = gsap.fromTo(row, { xPercent: dir > 0 ? 0 : -50 }, { xPercent: dir > 0 ? -50 : 0, duration: 38, ease: "none", repeat: -1 });
    if (reduceMotion) tl.pause();
    return tl;
  });
  if (!reduceMotion) {
    lenis.on("scroll", ({ velocity }) => {
      const boost = 1 + Math.min(4, Math.abs(velocity) * 0.12);
      marquees.forEach((tl) => gsap.to(tl, { timeScale: boost, duration: 0.3, overwrite: true }));
    });
  }

  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
