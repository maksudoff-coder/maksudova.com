/* ==========================================================================
   scroll-cinematic.js — canvas frame-sequence scrub engine
   --------------------------------------------------------------------------
   A short cinematic clip is exported as numbered JPGs. The frame drawn to a
   <canvas> is chosen by scroll progress, so scrolling plays the clip forward
   and backward. Rules that keep it at 60 FPS:
     • every frame is preloaded + decoded off the main thread (img.decode)
     • frames load progressively (every 8th → 4th → 2nd → all) so scrubbing
       works almost immediately, then sharpens in temporal resolution
     • the canvas is redrawn only when the frame index actually changes
     • cover-fit drawing, HiDPI aware (devicePixelRatio capped at 2)
     • overlay copy is driven by the same progress value (no extra listeners)
   ========================================================================== */
(function () {
  "use strict";

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // Order frames so a coarse version of the whole clip arrives first.
  function progressiveOrder(n) {
    const seen = new Uint8Array(n), order = [];
    for (const step of [8, 4, 2, 1]) {
      for (let i = 0; i < n; i += step) if (!seen[i]) { seen[i] = 1; order.push(i); }
    }
    if (!seen[n - 1]) order.push(n - 1);
    return order;
  }

  class FrameSequence {
    /**
     * @param {object}   cfg
     * @param {Element}  cfg.section     the tall scroll section (.scrub)
     * @param {number}   cfg.frameCount
     * @param {Function} cfg.framePath   (index1Based) => url
     * @param {string}   [cfg.bg]        letterbox fill colour
     * @param {number}   [cfg.focusX]    0..1 horizontal point kept in view when
     *                                   cover-fit crops the sides (portrait phones)
     * @param {number}   [cfg.fade]      overlay cross-fade width in progress units
     */
    constructor(cfg) {
      this.cfg = cfg;
      this.section = cfg.section;
      this.canvas = this.section.querySelector("canvas");
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      this.n = cfg.frameCount;
      this.images = new Array(this.n);
      this.ready = new Uint8Array(this.n);
      this.loadedCount = 0;
      this.current = -1;
      this.target = 0;
      this.progress = 0;
      this.lines = [...this.section.querySelectorAll(".reveal-line")].map((el) => ({
        el,
        a: parseFloat(el.dataset.in),
        b: parseFloat(el.dataset.out),
        last: -1,
      }));
      this.readouts = [...this.section.querySelectorAll("[data-frame-readout]")];
      this.fills = [...this.section.querySelectorAll("[data-progress-fill]")];
      this.fade = cfg.fade ?? 0.06;

      this._onResize = this.resize.bind(this);
      window.addEventListener("resize", this._onResize, { passive: true });
      this.resize();
    }

    /** Preload frames progressively. onProgress(loaded, total, coarseDone). */
    load(onProgress, concurrency = 6) {
      const order = progressiveOrder(this.n);
      const coarse = Math.ceil(this.n / 4); // 1/4 temporal resolution = "usable"
      let cursor = 0, done = 0;
      return new Promise((resolve) => {
        const next = () => {
          if (cursor >= order.length) return;
          const i = order[cursor++];
          const img = new Image();
          img.decoding = "async";
          img.src = this.cfg.framePath(i + 1);
          const finish = () => {
            this.images[i] = img;
            if (img.naturalWidth) { this.ready[i] = 1; this.loadedCount++; }
            done++;
            // first frame or a frame closer to where the user is → repaint
            if (i === 0 || Math.abs(i - this.target) < Math.abs(this.current - this.target)) this.current = -1;
            onProgress && onProgress(done, this.n, done >= coarse);
            if (done === this.n) resolve(this);
            else next();
          };
          (img.decode ? img.decode() : Promise.resolve()).then(finish, () => { img.onload = finish; img.onerror = finish; if (img.complete) finish(); });
        };
        for (let k = 0; k < concurrency; k++) next();
      });
    }

    resize() {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      // Frames are 1600px wide: a backing store much wider than ~2048px costs
      // fill-rate on retina screens without adding any visible detail.
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, (this.cfg.maxBackingWidth || 2048) / Math.max(1, w)));
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingQuality = "high";
      this.current = -1; // force repaint
      this.render();
    }

    nearestReady(i) {
      if (this.ready[i]) return i;
      for (let d = 1; d < this.n; d++) {
        if (i - d >= 0 && this.ready[i - d]) return i - d;
        if (i + d < this.n && this.ready[i + d]) return i + d;
      }
      return -1;
    }

    draw(i) {
      const img = this.images[i];
      const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
      const ir = img.naturalWidth / img.naturalHeight, cr = cw / ch;
      let dw, dh;
      if (ir > cr) { dh = ch; dw = ch * ir; } else { dw = cw; dh = cw / ir; }
      // keep the subject in frame when the sides are cropped
      const fx = this.cfg.focusX ?? 0.5;
      const dx = dw > cw ? clamp(cw / 2 - fx * dw, cw - dw, 0) : (cw - dw) / 2;
      this.ctx.fillStyle = this.cfg.bg || "#05060a";
      this.ctx.fillRect(0, 0, cw, ch);
      this.ctx.drawImage(img, dx, (ch - dh) / 2, dw, dh);
    }

    /** Called from ScrollTrigger with 0..1 */
    setProgress(p) {
      this.progress = clamp(p);
      this.target = Math.min(this.n - 1, Math.round(this.progress * (this.n - 1)));
      this.updateOverlay();
    }

    /** Called every animation frame — cheap when nothing changed. */
    render() {
      const idx = this.nearestReady(this.target);
      if (idx < 0 || idx === this.current) return;
      this.current = idx;
      this.draw(idx);
      const label = String(this.target + 1).padStart(3, "0") + " / " + this.n;
      for (const r of this.readouts) r.textContent = label;
    }

    updateOverlay() {
      const p = this.progress, f = this.fade;
      for (const L of this.lines) {
        const enter = L.a <= 0 ? 1 : clamp((p - L.a) / f);
        const exit = L.b >= 1 ? 1 : clamp((L.b - p) / f);
        const o = Math.min(enter, exit);
        const q = Math.round(o * 1000) / 1000;
        if (q === L.last) continue;
        L.last = q;
        const leaving = exit < enter;           // fade upward on exit, rise in on enter
        const k = 1 - o;
        const y = (leaving ? -1 : 1) * k * 46;
        const rx = (leaving ? -1 : 1) * k * 14;
        L.el.style.opacity = q;
        L.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg)`;
        L.el.style.filter = k > 0.01 ? `blur(${(k * 10).toFixed(1)}px)` : "none";
        L.el.style.visibility = q <= 0 ? "hidden" : "visible";
      }
      for (const fl of this.fills) fl.style.transform = `scaleX(${p.toFixed(4)})`;
    }
  }

  window.ScrollCinematic = { FrameSequence };
})();
