/* ==========================================================================
   hero3d.js — full-screen real-time WebGL fly-through (architectural viz)
   Exterior (Math Academy) → through the door → classroom with the tutor's
   framed portrait → zoom onto the smart blackboard.

   Rendering: PBR (MeshPhysical / MeshStandard) with procedural texture sets
   (albedo + roughness + bump), true transmissive glass, RoomEnvironment IBL,
   soft PCF shadows, ACES filmic tone mapping and an EffectComposer chain
   (MSAA → UnrealBloom → vignette → OutputPass). devicePixelRatio capped at 2.
   ========================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const PAL = {
  bg: 0xfaf9f6,
  teal: 0x14b8a6,
  blue: 0x0284c7,
};

// Building footprint: x ∈ [-9, 9], z ∈ [-6, 6], ground floor 5 m tall.
const B = { x: 9, z: 6, h: 5, wall: 0.3 };
// z values are the visible surfaces, in front of the wall lining (-B.z + B.wall + 0.02)
export const BOARD = { w: 8, h: 3.4, cx: 0, cy: 2.45, z: -B.z + B.wall + 0.105 };
const PORTRAIT = { cx: 6.55, cy: 2.55, z: -B.z + B.wall + 0.02, maxW: 2.2, maxH: 2.5 };

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ==========================================================================
   Procedural texture sets (generated once on a canvas, tiled on the GPU)
   ========================================================================== */
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function canvas(size = 1024, h = size) {
  const c = document.createElement("canvas");
  c.width = size; c.height = h;
  return [c, c.getContext("2d")];
}
/** Smooth value-noise blotches: random low-res grid upscaled with filtering, several octaves. */
function noiseLayer(g, w, h, cells, alpha, light = 255, dark = 0) {
  const [s, sg] = canvas(cells, Math.max(1, Math.round((cells * h) / w)));
  const img = sg.createImageData(s.width, s.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = dark + rnd() * (light - dark);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(s, 0, 0, w, h);
  g.restore();
}
function speckle(g, w, h, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const r = rMin + rnd() * (rMax - rMin);
    g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2); g.fill();
  }
}
function tex(c, repeat = [1, 1], srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fine architectural plaster: albedo + bump. */
function plasterSet(base = "#f7f5f0") {
  const [c, g] = canvas(1024);
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  noiseLayer(g, 1024, 1024, 16, 0.05, 255, 200);
  noiseLayer(g, 1024, 1024, 64, 0.04, 255, 210);
  speckle(g, 1024, 1024, 9000, ["rgba(0,0,0,0.035)", "rgba(255,255,255,0.08)"], 0.4, 1.2);
  const [b, bg] = canvas(1024);
  bg.fillStyle = "#808080"; bg.fillRect(0, 0, 1024, 1024);
  noiseLayer(bg, 1024, 1024, 128, 0.5, 200, 60);
  noiseLayer(bg, 1024, 1024, 512, 0.35, 220, 40);
  return { map: tex(c), bump: tex(b, [1, 1], false) };
}
/** Lacquered oak planks: albedo + roughness + bump. */
function oakSet() {
  const W = 1024, H = 1024, rows = 8, ph = H / rows;
  const [c, g] = canvas(W, H), [r, rg] = canvas(W, H), [b, bg] = canvas(W, H);
  rg.fillStyle = "#6e6e6e"; rg.fillRect(0, 0, W, H);
  bg.fillStyle = "#808080"; bg.fillRect(0, 0, W, H);
  for (let row = 0; row < rows; row++) {
    const y0 = row * ph, off = rnd() * W;
    const tone = 168 + rnd() * 26;
    // plank segments with staggered joints
    for (let seg = -1; seg < 3; seg++) {
      const x0 = off + seg * (W / 2), len = W / 2;
      const hue = tone + (rnd() - 0.5) * 18;
      g.fillStyle = `rgb(${hue}, ${hue * 0.86}, ${hue * 0.68})`;
      for (const dx of [0, -W]) g.fillRect(((x0 + dx) % W + W) % W - (dx ? 0 : 0), y0, len, ph);
    }
    // grain: wavy long lines
    for (let k = 0; k < 46; k++) {
      const y = y0 + rnd() * ph, amp = 1 + rnd() * 3, freq = 0.004 + rnd() * 0.01, ph0 = rnd() * 6.28;
      const dark = rnd() < 0.5;
      g.strokeStyle = dark ? `rgba(120, 82, 45, ${0.08 + rnd() * 0.14})` : `rgba(255, 240, 215, ${0.06 + rnd() * 0.08})`;
      g.lineWidth = 0.6 + rnd() * 1.6;
      bg.strokeStyle = dark ? "rgba(40,40,40,0.25)" : "rgba(200,200,200,0.15)";
      bg.lineWidth = g.lineWidth;
      g.beginPath(); bg.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const yy = Math.min(y0 + ph - 1, Math.max(y0 + 1, y + Math.sin(x * freq + ph0) * amp));
        x ? (g.lineTo(x, yy), bg.lineTo(x, yy)) : (g.moveTo(x, yy), bg.moveTo(x, yy));
      }
      g.stroke(); bg.stroke();
    }
    // knots
    if (rnd() < 0.5) { g.fillStyle = "rgba(110, 72, 40, 0.18)"; g.beginPath(); g.ellipse(rnd() * W, y0 + ph / 2, 10 + rnd() * 10, 4, 0, 0, 6.28); g.fill(); }
    // seams
    g.fillStyle = "rgba(80, 55, 30, 0.45)"; g.fillRect(0, y0, W, 2);
    bg.fillStyle = "#202020"; bg.fillRect(0, y0, W, 2);
    rg.fillStyle = "#b0b0b0"; rg.fillRect(0, y0, W, 2);
    for (let seg = 0; seg < 2; seg++) {
      const x = (((off + seg * (W / 2)) % W) + W) % W;
      g.fillRect(x, y0, 2, ph); bg.fillRect(x, y0, 2, ph); rg.fillRect(x, y0, 2, ph);
    }
  }
  noiseLayer(rg, W, H, 32, 0.25, 140, 80);
  return { map: tex(c), rough: tex(r, [1, 1], false), bump: tex(b, [1, 1], false) };
}
/** Pale limestone pavers with joints. */
function paverSet(tile = 128, base = [236, 233, 226]) {
  const W = 1024;
  const [c, g] = canvas(W), [r, rg] = canvas(W), [b, bg] = canvas(W);
  rg.fillStyle = "#c8c8c8"; rg.fillRect(0, 0, W, W);
  bg.fillStyle = "#909090"; bg.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += tile) for (let x = 0; x < W; x += tile * 2) {
    const v = (rnd() - 0.5) * 10;
    g.fillStyle = `rgb(${base[0] + v}, ${base[1] + v}, ${base[2] + v})`;
    g.fillRect(x, y, tile * 2, tile);
  }
  noiseLayer(g, W, W, 48, 0.07, 255, 170);
  speckle(g, W, W, 14000, ["rgba(90,80,70,0.10)", "rgba(255,255,255,0.18)", "rgba(150,140,125,0.12)"], 0.4, 1.4);
  g.fillStyle = "rgba(120,115,105,0.55)"; bg.fillStyle = "#303030"; rg.fillStyle = "#f0f0f0";
  for (let y = 0; y <= W; y += tile) { g.fillRect(0, y - 1, W, 3); bg.fillRect(0, y - 1, W, 3); rg.fillRect(0, y - 1, W, 3); }
  for (let y = 0; y < W; y += tile) for (let x = 0; x <= W; x += tile * 2) {
    g.fillRect(x - 1, y, 3, tile); bg.fillRect(x - 1, y, 3, tile); rg.fillRect(x - 1, y, 3, tile);
  }
  noiseLayer(bg, W, W, 256, 0.3, 200, 60);
  return { map: tex(c), rough: tex(r, [1, 1], false), bump: tex(b, [1, 1], false) };
}
/** Soft lawn. */
function lawnSet() {
  const W = 1024;
  const [c, g] = canvas(W), [b, bg] = canvas(W);
  g.fillStyle = "#b5d29e"; g.fillRect(0, 0, W, W);
  noiseLayer(g, W, W, 12, 0.18, 230, 150);
  noiseLayer(g, W, W, 96, 0.08, 255, 160);
  speckle(g, W, W, 26000, ["rgba(95,140,85,0.10)", "rgba(240,250,230,0.14)"], 0.4, 1.1);
  bg.fillStyle = "#808080"; bg.fillRect(0, 0, W, W);
  noiseLayer(bg, W, W, 512, 0.6, 230, 30);
  return { map: tex(c), bump: tex(b, [1, 1], false) };
}
/** Brushed metal roughness streaks. */
function brushedRough() {
  const [c, g] = canvas(512);
  g.fillStyle = "#6a6a6a"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const v = 70 + rnd() * 80;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(0, rnd() * 512, 512, 0.6 + rnd() * 1.4);
  }
  return tex(c, [1, 1], false);
}
/** Board surface: slate with a faint grid and chalk haze. */
function boardTexture() {
  const [c, g] = canvas(2048, 870);
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "#1f4b48"); grad.addColorStop(1, "#163937");
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  noiseLayer(g, c.width, c.height, 40, 0.07, 255, 120);
  g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 2;
  for (let x = 0; x <= c.width; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y <= c.height; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  speckle(g, c.width, c.height, 5000, ["rgba(255,255,255,0.04)"], 0.5, 1.4);
  return tex(c, [1, 1], true, 16);
}
function placeholderPortrait() {
  const [c, g] = canvas(800, 1000);
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, "#ccfbf1"); grad.addColorStop(1, "#e0f2fe");
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(15, 118, 110, 0.16)";
  g.beginPath(); g.arc(400, 400, 150, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(400, 860, 280, 250, 0, Math.PI, 0); g.fill();
  g.fillStyle = "#0f766e";
  g.font = 'italic 500 120px "STIX Two Text", Georgia, serif';
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("M", 400, 405);
  g.font = '600 46px "Lexend", system-ui, sans-serif';
  g.fillStyle = "#0f172a";
  g.fillText("Ms. Maksudova", 400, 640);
  g.font = '400 30px "Inter", system-ui, sans-serif';
  g.fillStyle = "#475569";
  g.fillText("Math tutor · since 2018", 400, 694);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** White-on-black glyph mask, used as an alphaMap for metal symbols. */
function glyphMask(text) {
  const [c, g] = canvas(512);
  g.fillStyle = "#000"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#fff";
  g.font = 'italic 500 330px "STIX Two Text", Georgia, serif';
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 256, 270, 470);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}
function dotTexture() {
  const [c, g] = canvas(64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.4, "rgba(255,255,255,0.5)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ==========================================================================
   Geometry helpers
   ========================================================================== */
function mesh(geo, mat, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
/** Box spanning [x0,x1]×[y0,y1]×[z0,z1]; optional rounded edges. UVs are scaled to metres via `uvScale`. */
function span(x0, x1, y0, y1, z0, z1, mat, { r = 0, cast = true, receive = true } = {}) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  if (mat.userData.metres) worldUV(geo, w, h, d);
  return mesh(geo, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, { cast, receive });
}
/** Re-map box UVs so a texture tiles at a constant real-world size. */
function worldUV(geo, w, h, d) {
  const uv = geo.attributes.uv, n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const [sx, sy] = nx > 0.5 ? [d, h] : ny > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  }
  uv.needsUpdate = true;
}

/* ==========================================================================
   Scene
   ========================================================================== */
export async function initAcademy({ canvas: cvs, photoUrl = "assets/tutor-maksudova.jpg", onPhoto, reduceMotion = false }) {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (_) {}

  const renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.bg);
  scene.fog = new THREE.Fog(0xf3f1ec, 50, 150);

  // Image-based lighting: physically based reflections for glass, metal and lacquer
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.15, 400);

  // Sky dome: soft daylight gradient (zenith → warm horizon)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x9cc8d8) }, mid: { value: new THREE.Color(0xe2ecea) }, bottom: { value: new THREE.Color(0xe9e4da) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0), 0.8)) : mix(mid, bottom, clamp(-h*4.0,0.0,1.0)); gl_FragColor = vec4(c, 1.0); }",
    })
  );
  scene.add(sky);

  /* ---- lights: daylight sun + sky fill + warm interior ---- */
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xcfc8ba, 0.45));
  scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
  sun.position.set(24, 19, 20); // lower afternoon sun → longer, readable shadows
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.025;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 2, far: 90 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdff1ff, 0.35); // shadowless sky bounce, also reaches the interior
  fill.position.set(-12, 14, 20);
  scene.add(fill);
  for (const [x, z, i] of [[-4.5, 2, 6], [4.5, 2, 6], [0, 0.5, 5], [0, -3.6, 3]]) {
    const p = new THREE.PointLight(0xfff4e6, i, 13, 2);
    p.position.set(x, 4.55, z);
    scene.add(p);
  }

  /* ---- material library ---- */
  const T = {
    plaster: plasterSet(), oak: oakSet(), pavers: paverSet(), lawn: lawnSet(), brushed: brushedRough(),
    stone: paverSet(256, [228, 226, 220]),
  };
  for (const set of Object.values(T)) for (const t of Object.values(set.isTexture ? { t: set } : set)) t.anisotropy = Math.min(maxAniso, 16);
  const metres = (m) => { m.userData.metres = true; return m; };
  const rep = (t, x, y = x) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };

  const M = {
    lawn: new THREE.MeshStandardMaterial({ map: rep(T.lawn.map, 60), bumpMap: rep(T.lawn.bump, 60), bumpScale: 1.2, roughness: 0.95 }),
    pavers: new THREE.MeshPhysicalMaterial({ map: T.pavers.map, roughnessMap: T.pavers.rough, bumpMap: T.pavers.bump, bumpScale: 0.8, roughness: 0.8, clearcoat: 0.12, clearcoatRoughness: 0.4 }),
    walk: new THREE.MeshPhysicalMaterial({ map: T.stone.map, roughnessMap: T.stone.rough, bumpMap: T.stone.bump, bumpScale: 0.6, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
    plaster: metres(new THREE.MeshStandardMaterial({ map: rep(T.plaster.map, 0.33), bumpMap: rep(T.plaster.bump, 0.33), bumpScale: 0.6, roughness: 0.92, color: 0xffffff })),
    plasterIn: metres(new THREE.MeshStandardMaterial({ map: rep(T.plaster.map, 0.33), bumpMap: rep(T.plaster.bump, 0.33), bumpScale: 0.4, roughness: 0.94, color: 0xfffdf8 })),
    concrete: metres(new THREE.MeshStandardMaterial({ map: rep(T.stone.map, 0.25), bumpMap: rep(T.stone.bump, 0.25), bumpScale: 0.5, roughness: 0.85, color: 0xe9e7e2 })),
    floor: metres(new THREE.MeshPhysicalMaterial({ map: rep(T.oak.map, 0.25), roughnessMap: rep(T.oak.rough, 0.25), bumpMap: rep(T.oak.bump, 0.25), bumpScale: 0.35, roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 })),
    oak: metres(new THREE.MeshPhysicalMaterial({ map: rep(T.oak.map, 0.6), roughnessMap: rep(T.oak.rough, 0.6), bumpMap: rep(T.oak.bump, 0.6), bumpScale: 0.25, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.15 })),
    alu: new THREE.MeshPhysicalMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.32, roughnessMap: T.brushed }),
    aluDark: new THREE.MeshPhysicalMaterial({ color: 0x3a4452, metalness: 1, roughness: 0.38, roughnessMap: T.brushed }),
    steel: new THREE.MeshPhysicalMaterial({ color: 0x5b6572, metalness: 0.9, roughness: 0.5 }),
    tealPowder: new THREE.MeshPhysicalMaterial({ color: 0x14b8a6, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    tealMetal: new THREE.MeshPhysicalMaterial({ color: 0x2dd4bf, metalness: 1, roughness: 0.28, roughnessMap: T.brushed }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xf4fbfc, metalness: 0, roughness: 0.1, transmission: 0.9, ior: 1.5, thickness: 0.5,
      attenuationColor: new THREE.Color(0xd6f2f0), attenuationDistance: 6, specularIntensity: 1, envMapIntensity: 1.1,
    }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xf5f7fa, metalness: 1, roughness: 0.04 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xe2b768, metalness: 1, roughness: 0.18, clearcoat: 0.4, clearcoatRoughness: 0.1 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: 0x8cc79f, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color(0xd9f5dc), sheenRoughness: 0.6 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x8a7258, roughness: 0.9 }),
    light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffaf0, emissiveIntensity: 5 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
  };

  const world = new THREE.Group();
  scene.add(world);
  const add = (...o) => o.forEach((x) => world.add(x));

  /* ---- landscape ---- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.lawn);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);
  const plazaGeo = new THREE.PlaneGeometry(32, 28);
  plazaGeo.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (i % 2 ? 28 / 8 : 32 / 8)));
  const plaza = new THREE.Mesh(plazaGeo, M.pavers);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 4.5); plaza.receiveShadow = true;
  add(plaza);
  const walkGeo = new THREE.PlaneGeometry(4.4, 42);
  walkGeo.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (i % 2 ? 42 / 4 : 4.4 / 4)));
  const walk = new THREE.Mesh(walkGeo, M.walk);
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.035, 39); walk.receiveShadow = true;
  add(walk);
  // stone kerbs along the plaza
  add(span(-16, 16, 0, 0.12, 18.3, 18.6, M.concrete, { r: 0.03 }));
  // entrance steps
  for (let i = 0; i < 2; i++) add(span(-3.2 + i * 0.3, 3.2 - i * 0.3, 0, 0.09 + i * 0.09, B.z + 0.2, B.z + 2.4 - i * 0.6, M.concrete, { r: 0.02 }));

  /* ---- building shell ---- */
  const { x: BX, z: BZ, h: BH, wall: TW } = B;
  // exterior skin (plaster) and interior lining (warm plaster) as separate shells
  add(span(-BX, BX, 0, BH, -BZ, -BZ + TW, M.plaster));
  add(span(-BX, -BX + TW, 0, BH, -BZ, BZ, M.plaster));
  add(span(BX - TW, BX, 0, BH, -BZ, BZ, M.plaster));
  add(span(-BX + TW, BX - TW, 0.03, BH - 0.02, -BZ + TW, -BZ + TW + 0.02, M.plasterIn, { cast: false }));
  add(span(-BX + TW, -BX + TW + 0.02, 0.03, BH - 0.02, -BZ + TW, BZ - TW, M.plasterIn, { cast: false }));
  add(span(BX - TW - 0.02, BX - TW, 0.03, BH - 0.02, -BZ + TW, BZ - TW, M.plasterIn, { cast: false }));
  // plinth band
  add(span(-BX - 0.05, BX + 0.05, 0, 0.45, -BZ - 0.05, BZ + 0.05, M.concrete, { cast: false }));

  // front façade: piers, transmissive glass curtain wall with aluminium mullions, door portal
  const DOOR = 1.7, DOOR_H = 3.5;
  add(span(-BX, -BX + 1.6, 0, BH, BZ - TW, BZ, M.plaster));
  add(span(BX - 1.6, BX, 0, BH, BZ - TW, BZ, M.plaster));
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -BX + 1.6 : DOOR, x1 = side < 0 ? -DOOR : BX - 1.6;
    add(span(x0, x1, 0.45, BH, BZ - 0.17, BZ - 0.13, M.glass, { cast: false, receive: false }));
    const step = (x1 - x0) / 4;
    for (let i = 0; i <= 4; i++) { const x = x0 + i * step; add(span(x - 0.045, x + 0.045, 0.45, BH, BZ - 0.24, BZ - 0.06, M.aluDark, { r: 0.012, receive: false })); }
    add(span(x0, x1, 2.46, 2.54, BZ - 0.24, BZ - 0.06, M.aluDark, { r: 0.012, receive: false }));
    add(span(x0, x1, 0.45, 0.53, BZ - 0.24, BZ - 0.06, M.aluDark, { receive: false }));
  }
  add(span(-DOOR, DOOR, DOOR_H, BH, BZ - TW, BZ, M.plaster));
  // glass sliding doors, parked open
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -DOOR - 0.05 : DOOR - 0.85, x1 = x0 + 0.9;
    add(span(x0, x1, 0.02, DOOR_H - 0.05, BZ - 0.42, BZ - 0.39, M.glass, { cast: false, receive: false }));
    add(span(x0, x1, DOOR_H - 0.12, DOOR_H - 0.05, BZ - 0.44, BZ - 0.37, M.alu, { receive: false }));
    add(span(x0, x1, 0.02, 0.09, BZ - 0.44, BZ - 0.37, M.alu, { receive: false }));
  }
  // teal portal frame + cantilevered canopy
  add(span(-DOOR - 0.25, -DOOR, 0, DOOR_H + 0.25, BZ - 0.1, BZ + 0.35, M.tealPowder, { r: 0.03 }));
  add(span(DOOR, DOOR + 0.25, 0, DOOR_H + 0.25, BZ - 0.1, BZ + 0.35, M.tealPowder, { r: 0.03 }));
  add(span(-2.8, 2.8, DOOR_H + 0.25, DOOR_H + 0.42, BZ - 0.1, BZ + 2.6, M.tealPowder, { r: 0.03 }));
  for (const x of [-2, -0.7, 0.7, 2]) add(span(x - 0.15, x + 0.15, DOOR_H + 0.235, DOOR_H + 0.25, BZ + 1.6, BZ + 2.0, M.light, { cast: false, receive: false }));
  // roof slab with overhang + aluminium fascia
  add(span(-BX - 0.6, BX + 0.6, BH, BH + 0.4, -BZ - 0.6, BZ + 0.6, M.concrete));
  add(span(-BX - 0.62, BX + 0.62, BH + 0.32, BH + 0.42, BZ + 0.58, BZ + 0.64, M.alu, { receive: false }));
  // upper volume: glass band behind vertical plaster fins
  const UP = { x: 6.2, z0: -4.5, z1: 3.6, y0: BH + 0.4, y1: BH + 3.6 };
  add(span(-UP.x, UP.x, UP.y0, UP.y1, UP.z0, UP.z1 - 0.25, M.plaster));
  add(span(-UP.x + 0.6, UP.x - 0.6, UP.y0 + 0.7, UP.y1 - 0.6, UP.z1 - 0.25, UP.z1 - 0.2, M.glass, { cast: false, receive: false }));
  // warm interior glow behind the upper glass band
  add(span(-UP.x + 0.6, UP.x - 0.6, UP.y0 + 0.7, UP.y1 - 0.6, UP.z1 - 0.32, UP.z1 - 0.3, new THREE.MeshStandardMaterial({ color: 0xf7efe2, emissive: 0xfff3df, emissiveIntensity: 0.25, roughness: 1 }), { cast: false }));
  for (let x = -UP.x + 0.6; x <= UP.x - 0.6 + 1e-3; x += 0.95) add(span(x - 0.06, x + 0.06, UP.y0 + 0.4, UP.y1, UP.z1 - 0.12, UP.z1 + 0.35, M.plaster, { r: 0.02 }));
  add(span(-UP.x - 0.3, UP.x + 0.3, UP.y1, UP.y1 + 0.3, UP.z0 - 0.3, UP.z1 + 0.5, M.concrete));
  add(span(-UP.x, UP.x, UP.y0 + 0.3, UP.y0 + 0.42, UP.z1 - 0.2, UP.z1 + 0.02, M.tealPowder));

  /* ---- exterior sculptures (mirror, glass, brushed metal) + trees ---- */
  const plinth = (x, z, w) => span(x - w, x + w, 0, 0.55, z - w, z + w, M.concrete, { r: 0.04 });
  const bigSphere = mesh(new THREE.SphereGeometry(1.5, 96, 64), M.chrome, -12, 2.05, 12);
  const ring = mesh(new THREE.TorusGeometry(2.1, 0.055, 24, 200), M.gold, -12, 2.05, 12);
  ring.rotation.set(1.1, 0.3, 0.2);
  add(plinth(-12, 12, 1.4), bigSphere, ring);
  const bigPyr = mesh(new THREE.ConeGeometry(1.9, 3.2, 4, 1), M.glass, 12.5, 2.15, 11, { cast: true });
  bigPyr.rotation.y = Math.PI / 4;
  const pyrEdges = new THREE.LineSegments(new THREE.EdgesGeometry(bigPyr.geometry), new THREE.LineBasicMaterial({ color: 0x9fd8e8 }));
  bigPyr.add(pyrEdges);
  add(plinth(12.5, 11, 1.6), bigPyr);
  const bigCube = mesh(new RoundedBoxGeometry(2.2, 2.2, 2.2, 4, 0.08), M.tealMetal, 13, 2.35, -1.5);
  bigCube.rotation.set(0.62, 0.78, 0);
  add(plinth(13, -1.5, 1.3), bigCube);

  // trees: clustered, noise-displaced crowns
  function crownGeo(r) {
    const g = new THREE.IcosahedronGeometry(r, 5);
    const p = g.attributes.position, v = new THREE.Vector3();
    const k1 = rnd() * 10, k2 = rnd() * 10;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 3.1 + k1) * Math.sin(v.y * 2.7 + k2) * Math.sin(v.z * 3.3) * 0.5 + Math.sin(v.x * 9 + v.z * 7 + k1) * 0.12;
      v.multiplyScalar(1 + n * 0.16);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  const tree = (x, z, s = 1) => {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    const trunk = mesh(new THREE.CylinderGeometry(0.09 * s, 0.16 * s, 2.2 * s, 12), M.bark, 0, 1.1 * s, 0);
    grp.add(trunk);
    for (let i = 0; i < 4; i++) {
      const r = (0.75 + rnd() * 0.45) * s;
      const c = mesh(crownGeo(r), M.leaf, (rnd() - 0.5) * 1.1 * s, (2.3 + rnd() * 0.9) * s, (rnd() - 0.5) * 1.1 * s);
      c.rotation.set(rnd() * 6, rnd() * 6, 0);
      grp.add(c);
    }
    return grp;
  };
  for (const [x, z, s] of [[-6.5, 15, 1], [-17, 4, 1.2], [17, 5, 1.1], [-18, -6, 1], [18, -7, 1.3], [-9, 22, 1.1], [24, 22, 1], [-22, 14, 1.2], [20, 15, 1], [-26, -2, 1.3], [27, 6, 1.2], [-14, 30, 1], [15, 32, 1.1]]) add(tree(x, z, s));
  // planters flanking the entrance
  for (const x of [-4.2, 4.2]) {
    add(span(x - 0.7, x + 0.7, 0, 0.6, BZ + 1.2, BZ + 2.2, M.concrete, { r: 0.05 }));
    const shrub = mesh(crownGeo(0.55), M.leaf, x, 0.95, BZ + 1.7);
    shrub.scale.set(1.2, 0.8, 0.9);
    add(shrub);
  }

  /* ---- classroom interior ---- */
  add(span(-BX + TW, BX - TW, 0, 0.03, -BZ + TW, BZ - TW, M.floor, { cast: false }));
  add(span(-BX + TW, BX - TW, BH - 0.02, BH, -BZ + TW, BZ - TW, M.plasterIn, { cast: false }));
  // recessed light panels with aluminium trims (bloom picks these up)
  for (const [x, z] of [[-4.5, 2.5], [0, 2.5], [4.5, 2.5], [-4.5, -2], [0, -2], [4.5, -2]]) {
    add(span(x - 1.16, x + 1.16, BH - 0.06, BH - 0.02, z - 0.41, z + 0.41, M.alu, { cast: false, receive: false }));
    add(span(x - 1.1, x + 1.1, BH - 0.075, BH - 0.06, z - 0.35, z + 0.35, M.light, { cast: false, receive: false }));
  }
  // skirting + teal accent line on the back wall
  add(span(-BX + TW, BX - TW, 0.03, 0.14, -BZ + TW + 0.02, -BZ + TW + 0.045, M.oak, { cast: false }));
  add(span(-BX + TW, BX - TW, 4.25, 4.32, -BZ + TW + 0.02, -BZ + TW + 0.045, M.tealPowder, { cast: false }));

  // smart blackboard: brushed aluminium frame, matte slate surface, chalk tray
  const bd = BOARD;
  add(span(bd.cx - bd.w / 2 - 0.16, bd.cx + bd.w / 2 + 0.16, bd.cy - bd.h / 2 - 0.16, bd.cy + bd.h / 2 + 0.16, -BZ + TW + 0.02, -BZ + TW + 0.1, M.alu, { r: 0.03 }));
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(bd.w, bd.h), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.93, envMapIntensity: 0.25 }));
  boardMesh.position.set(bd.cx, bd.cy, bd.z);
  boardMesh.receiveShadow = true;
  add(boardMesh);
  add(span(bd.cx - bd.w / 2, bd.cx + bd.w / 2, bd.cy - bd.h / 2 - 0.26, bd.cy - bd.h / 2 - 0.19, -BZ + TW + 0.02, -BZ + TW + 0.24, M.alu, { r: 0.015 }));
  for (const [x, c] of [[-2.6, 0xffffff], [-2.4, 0x5eead4], [-2.2, 0xfde68a]]) {
    add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }), x, bd.cy - bd.h / 2 - 0.175, -BZ + TW + 0.15));
  }

  // number line above the board (brushed steel)
  for (let i = -5; i <= 5; i++) add(span(i * 0.7 - 0.012, i * 0.7 + 0.012, 4.42, 4.6, -BZ + TW + 0.02, -BZ + TW + 0.05, M.aluDark, { cast: false }));
  add(span(-3.6, 3.6, 4.5, 4.52, -BZ + TW + 0.02, -BZ + TW + 0.05, M.aluDark, { cast: false }));

  // desks (lacquered oak, rounded) + chairs (teal powder-coat, steel frames)
  const deskTop = new RoundedBoxGeometry(1.5, 0.05, 0.8, 3, 0.02); worldUV(deskTop, 1.5, 0.05, 0.8);
  const leg = new THREE.CylinderGeometry(0.022, 0.022, 0.74, 14);
  const seat = new RoundedBoxGeometry(0.56, 0.05, 0.5, 3, 0.022);
  const back = new RoundedBoxGeometry(0.56, 0.36, 0.04, 3, 0.018);
  const chairLeg = new THREE.CylinderGeometry(0.014, 0.014, 0.45, 10);
  const desk = (x, z) => {
    const out = [mesh(deskTop, M.oak, x, 0.765, z)];
    for (const [dx, dz] of [[-0.68, -0.33], [0.68, -0.33], [-0.68, 0.33], [0.68, 0.33]]) out.push(mesh(leg, M.steel, x + dx, 0.37, z + dz, { receive: false }));
    out.push(mesh(seat, M.tealPowder, x, 0.47, z + 0.86));
    out.push(mesh(back, M.tealPowder, x, 0.78, z + 1.1));
    for (const [dx, dz] of [[-0.24, 0.66], [0.24, 0.66], [-0.24, 1.06], [0.24, 1.06]]) out.push(mesh(chairLeg, M.steel, x + dx, 0.225, z + dz, { receive: false }));
    // an open notebook on some desks
    if ((x + z) % 2 > 0.5) { const nb = mesh(new THREE.BoxGeometry(0.42, 0.008, 0.3), M.paper, x - 0.3, 0.795, z - 0.05); nb.rotation.y = 0.2; out.push(nb); }
    return out;
  };
  for (const z of [3.0, 0.6, -1.8]) for (const x of [-5.4, -2.6, 2.6, 5.4]) add(...desk(x, z));
  // teacher's desk + globe
  add(span(-6.6, -4.6, 0.78, 0.84, -4.4, -3.6, M.oak, { r: 0.02 }), span(-6.55, -4.65, 0.03, 0.78, -4.35, -4.25, M.plasterIn));
  add(mesh(new THREE.SphereGeometry(0.18, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: 0.35, clearcoat: 0.8 }), -5.0, 1.12, -4.0));
  add(mesh(new THREE.TorusGeometry(0.2, 0.008, 8, 64, Math.PI * 1.2), M.gold, -5.0, 1.12, -4.0));
  add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 24), M.gold, -5.0, 0.89, -4.0));
  // bookshelf on the left wall with books
  add(span(-BX + TW, -BX + TW + 0.4, 0.03, 2.2, -1, 2.2, M.oak));
  const bookMats = [M.tealPowder, new THREE.MeshPhysicalMaterial({ color: 0x0284c7, roughness: 0.5, clearcoat: 0.3 }), new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, roughness: 0.55, clearcoat: 0.2 }), M.paper];
  for (let shelf = 0; shelf < 3; shelf++) for (let i = 0; i < 13; i++) {
    const h = 0.28 + rnd() * 0.12;
    add(span(-BX + TW + 0.06, -BX + TW + 0.34, 0.3 + shelf * 0.62, 0.3 + shelf * 0.62 + h, -0.9 + i * 0.235, -0.9 + i * 0.235 + 0.19, bookMats[(i + shelf) % 4], { r: 0.01 }));
  }

  /* ---- the tutor's framed portrait: gold frame, mat, glass cover, picture light ---- */
  const portrait = new THREE.Group();
  portrait.position.set(PORTRAIT.cx, PORTRAIT.cy, PORTRAIT.z);
  add(portrait);
  const photoMat = new THREE.MeshPhysicalMaterial({ map: placeholderPortrait(), roughness: 0.6 });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), photoMat);
  photo.position.z = 0.085;
  photo.receiveShadow = true;
  portrait.add(photo);
  // reflective glass glazing: not transmissive (transmission re-samples the photo at a lower
  // resolution and softens it), so the portrait stays pin-sharp under real reflections
  const glassCover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.06, ior: 1.5,
    specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, depthWrite: false,
  }));
  glassCover.position.z = 0.12;
  portrait.add(glassCover);
  const frameParts = new THREE.Group();
  portrait.add(frameParts);
  // brass picture light above the frame + spotlight onto it
  const lampArm = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 12).rotateX(Math.PI / 2), M.gold, 0, 0, 0.13);
  const lampHead = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 24).rotateZ(Math.PI / 2), M.gold, 0, 0, 0.26);
  portrait.add(lampArm, lampHead);
  const picLight = new THREE.SpotLight(0xffefd6, 2.6, 4, Math.PI / 4.5, 0.6, 1.5);
  picLight.position.set(PORTRAIT.cx, PORTRAIT.cy + 1.5, PORTRAIT.z + 0.45);
  picLight.target.position.set(PORTRAIT.cx, PORTRAIT.cy - 0.2, PORTRAIT.z);
  add(picLight, picLight.target);

  function fitPortrait(aspect) {
    // keep the image proportions; fit inside maxW × maxH
    let h = PORTRAIT.maxH, w = h * aspect;
    if (w > PORTRAIT.maxW) { w = PORTRAIT.maxW; h = w / aspect; }
    photo.scale.set(w, h, 1);
    const m = 0.13, f = 0.11, d = 0.12;
    glassCover.scale.set(w + 2 * m, h + 2 * m, 1);
    frameParts.clear();
    frameParts.add(mesh(new THREE.BoxGeometry(w + 2 * m, h + 2 * m, 0.03), M.paper, 0, 0, 0.065, { cast: false }));
    const W = w + 2 * m + 2 * f, H = h + 2 * m + 2 * f;
    const bar = (bw, bh, x, y) => mesh(new RoundedBoxGeometry(bw, bh, d, 4, 0.025), M.gold, x, y, 0.07);
    frameParts.add(bar(W, f, 0, H / 2 - f / 2), bar(W, f, 0, -H / 2 + f / 2), bar(f, H, -W / 2 + f / 2, 0), bar(f, H, W / 2 - f / 2, 0));
    lampArm.position.y = lampHead.position.y = H / 2 + 0.12;
  }
  fitPortrait(0.8);

  new THREE.TextureLoader().load(
    photoUrl,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      photoMat.map = t;
      photoMat.needsUpdate = true;
      fitPortrait(t.image.width / t.image.height);
      onPhoto && onPhoto(true);
    },
    undefined,
    () => onPhoto && onPhoto(false)
  );

  /* ---- floating math objects: glass, chrome-gold, brushed metal; metal glyphs in glass tiles ---- */
  const floaters = [];
  const addFloater = (obj, x, y, z, spin) => {
    obj.position.set(x, y, z);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    add(obj);
    floaters.push({ mesh: obj, base: new THREE.Vector3(x, y, z), spin, phase: rnd() * 6.28 });
  };
  const glassTeal = M.glass.clone(); Object.assign(glassTeal, { roughness: 0.04, transmission: 1, thickness: 0.7, iridescence: 0.35, iridescenceIOR: 1.3 }); glassTeal.attenuationColor = new THREE.Color(0x5eead4); glassTeal.attenuationDistance = 1.2;
  const glassBlue = glassTeal.clone(); glassBlue.attenuationColor = new THREE.Color(0x7dd3fc);
  const blueMetal = M.tealMetal.clone(); blueMetal.color = new THREE.Color(0x7cc4f0);
  addFloater(mesh(new RoundedBoxGeometry(0.7, 0.7, 0.7, 4, 0.06), glassTeal, 0, 0, 0), -3.8, 3.1, 0.2, [0.4, 0.6, 0]);
  addFloater(mesh(new THREE.ConeGeometry(0.5, 0.85, 4, 1), blueMetal, 0, 0, 0), 3.6, 3.5, 1.4, [0, 0.8, 0]);
  addFloater(mesh(new THREE.SphereGeometry(0.42, 96, 64), M.gold, 0, 0, 0), -1.6, 3.7, -2.8, [0, 0.3, 0]);
  addFloater(mesh(new THREE.TorusGeometry(0.34, 0.11, 48, 128), glassBlue, 0, 0, 0), 1.9, 3.0, -3.2, [0.7, 0.4, 0]);
  const tileGeo = new RoundedBoxGeometry(0.62, 0.62, 0.1, 4, 0.05);
  const symbols = [["π", M.gold, -5.6, 3.6, 1.8], ["∑", M.chrome, 5.4, 3.9, -0.6], ["√x", M.gold, -0.6, 4.1, 0.9], ["∞", M.chrome, -6.4, 2.8, -2.8], ["x²", M.gold, 4.6, 2.9, 3.2], ["Δ", M.chrome, 0.9, 3.4, 2.6]];
  for (const [t, metal, x, y, z] of symbols) {
    const grp = new THREE.Group();
    const glyphMat = metal.clone();
    Object.assign(glyphMat, { alphaMap: glyphMask(t), alphaTest: 0.5, side: THREE.DoubleSide });
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glyphMat);
    grp.add(glyph, new THREE.Mesh(tileGeo, M.glass));
    grp.rotation.y = rnd() * 0.8 - 0.4;
    addFloater(grp, x, y, z, [0, 0.25 * (rnd() < 0.5 ? -1 : 1), 0]);
  }
  // dust motes catching the light
  const N = 320, pp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pp[i * 3] = (rnd() - 0.5) * 16; pp[i * 3 + 1] = 0.6 + rnd() * 4; pp[i * 3 + 2] = (rnd() - 0.5) * 10.5; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xbff7ee, map: dotTexture(), size: 0.05, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  add(particles);

  /* ==========================================================================
     Post-processing: MSAA HDR target → bloom → vignette → ACES + sRGB
     ========================================================================== */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // threshold sits above sunlit plaster (~1.5–2.5 linear) so only real light sources glow
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 3.0);
  composer.addPass(bloom);
  const vignette = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0.22 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - strength * smoothstep(0.25, 0.85, length(d) * 1.25); gl_FragColor = vec4(c.rgb * v, c.a); }",
  });
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  /* ================================================================ camera choreography */
  // progress p ∈ [0,1]; keyframes are re-built on resize so the board fills the frame on any aspect.
  let posCurve, lookCurve, keyP;
  function buildPath() {
    const aspect = camera.aspect;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // distance so the board (+ margin) fills the screen
    const dW = (bd.w * 1.08) / 2 / Math.tan(hfov / 2);
    const dH = (bd.h * 1.25) / 2 / Math.tan(vfov / 2);
    const boardDist = Math.max(dW, dH);
    const endZ = Math.min(BZ - 0.6, bd.z + boardDist);
    const narrow = aspect < 0.8;
    const K = [
      // p,     camera position,                               look-at target
      [0.0, [narrow ? 9 : 14, 6.8, narrow ? 40 : 29], [0, 4.4, 0]],
      [0.14, [9, 5.0, 25], [0, 3.6, 3]],
      [0.26, [0, 2.4, 15.5], [0, 2.1, 5]],
      [0.34, [0, 2.05, 7.2], [0, 2.0, 0]],
      [0.42, [0.2, 2.0, 3.6], [2.4, 2.2, -3]],
      [0.53, [1.4, 2.25, 1.2], [PORTRAIT.cx - (narrow ? 0 : 0.9), PORTRAIT.cy, PORTRAIT.z]],
      [0.62, [1.0, 2.3, 1.6], [PORTRAIT.cx - 1.4, 2.4, PORTRAIT.z]],
      [0.74, [0.2, 2.4, Math.max(endZ + 1.2, 1.2)], [0, bd.cy, bd.z]],
      [1.0, [0, bd.cy, endZ], [0, bd.cy, bd.z]],
    ];
    keyP = K.map((k) => k[0]);
    posCurve = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(...k[1])), false, "centripetal");
    lookCurve = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(...k[2])), false, "centripetal");
  }
  // map scroll progress → curve parameter so each keyframe lands on its p
  function curveU(p) {
    const n = keyP.length - 1;
    for (let i = 0; i < n; i++) {
      if (p <= keyP[i + 1]) {
        const local = (p - keyP[i]) / (keyP[i + 1] - keyP[i]);
        return (i + smooth(clamp01(local))) / n;
      }
    }
    return 1;
  }

  /* ---- sizing ---- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 58 : 42;
    camera.updateProjectionMatrix();
    buildPath();
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---- loop ---- */
  const state = { target: 0, p: 0, mx: 0, my: 0, sx: 0, sy: 0 };
  window.addEventListener("pointermove", (e) => {
    state.mx = e.clientX / window.innerWidth - 0.5;
    state.my = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  const pos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  let t = 0;
  const listeners = [];

  function project(v) {
    tmp.copy(v).project(camera);
    return { x: (tmp.x + 1) / 2 * window.innerWidth, y: (1 - tmp.y) / 2 * window.innerHeight, visible: tmp.z < 1 && tmp.z > -1 };
  }
  const anchors = {
    title: new THREE.Vector3(0, UP.y1 + 1.6, UP.z1),
    tutor: new THREE.Vector3(PORTRAIT.cx - 1.5, PORTRAIT.cy + 0.3, PORTRAIT.z + 0.2),
  };
  const boardCorners = [
    new THREE.Vector3(bd.cx - bd.w / 2, bd.cy + bd.h / 2, bd.z),
    new THREE.Vector3(bd.cx + bd.w / 2, bd.cy - bd.h / 2, bd.z),
  ];

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reduceMotion) t += dt;
    // damped follow of the scroll target → buttery camera even with coarse wheel steps
    state.p += (state.target - state.p) * (reduceMotion ? 1 : 1 - Math.pow(0.0015, dt));
    state.sx += (state.mx - state.sx) * 0.05;
    state.sy += (state.my - state.sy) * 0.05;

    const u = curveU(state.p);
    posCurve.getPoint(u, pos);
    lookCurve.getPoint(u, look);
    // subtle pointer parallax, fading out as we lock onto the board
    const par = (1 - smooth(clamp01((state.p - 0.75) / 0.2))) * (reduceMotion ? 0 : 1);
    pos.x += state.sx * 0.6 * par;
    pos.y -= state.sy * 0.3 * par;
    camera.position.copy(pos);
    camera.lookAt(look);

    // floaters drift up and away as the camera locks onto the board
    const away = smooth(clamp01((state.p - 0.66) / 0.14));
    for (const f of floaters) {
      f.mesh.position.y = f.base.y + Math.sin(t * 1.1 + f.phase) * 0.12 + away * 1.6;
      f.mesh.visible = away < 0.999;
      f.mesh.scale.setScalar(1 - away * 0.9);
      if (f.spin) { f.mesh.rotation.x += f.spin[0] * dt; f.mesh.rotation.y += f.spin[1] * dt; }
    }
    particles.rotation.y = t * 0.02;
    // bloom a little softer once we're inside, so the light panels don't flare
    bloom.strength = 0.35 - 0.1 * smooth(clamp01((state.p - 0.3) / 0.1));

    composer.render(dt);

    const a = {
      p: state.p,
      title: project(anchors.title),
      tutor: project(anchors.tutor),
      board: (() => { const tl = project(boardCorners[0]), br = project(boardCorners[1]); return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y, visible: tl.visible && br.visible }; })(),
    };
    for (const fn of listeners) fn(a);
  }

  let paused = false;
  const setRunning = () => renderer.setAnimationLoop(!document.hidden && !paused ? frame : null);
  document.addEventListener("visibilitychange", setRunning);
  setRunning();
  frame();
  // debugging / capture hook: pause the loop and render a settled still at a given progress
  window.__academy = {
    pause(v = true) { paused = v; setRunning(); },
    still(p) { state.target = state.p = clamp01(p); clock.getDelta(); frame(); },
  };

  return {
    setProgress(p) { state.target = clamp01(p); },
    jump(p) { state.target = state.p = clamp01(p); },
    onFrame(fn) { listeners.push(fn); },
  };
}
