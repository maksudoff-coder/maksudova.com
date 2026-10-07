/* ==========================================================================
   hero3d.js — full-screen real-time WebGL fly-through
   Exterior (Math Academy) → through the door → classroom with the tutor's
   framed portrait → zoom onto the smart blackboard.

   Everything is modelled procedurally (no downloaded meshes) and rendered at
   devicePixelRatio capped at 2, so it is sharp on Retina / 4K screens.
   ========================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/RoomEnvironment.js";

const PAL = {
  bg: 0xfaf9f6,
  ground: 0xf3f4f6,
  path: 0xe7e5e0,
  wall: 0xfbfaf7,
  trim: 0xe5e7eb,
  dark: 0x334155,
  wood: 0xe8dcc8,
  woodDark: 0xc9b38f,
  teal: 0x14b8a6,
  blue: 0x0284c7,
  amber: 0xf59e0b,
  leaf: 0x99d5c9,
  board: 0x173c3a,
};

// Building footprint: x ∈ [-9, 9], z ∈ [-6, 6], ground floor 5 m tall.
const B = { x: 9, z: 6, h: 5, wall: 0.3 };
export const BOARD = { w: 8, h: 3.4, cx: 0, cy: 2.45, z: -B.z + B.wall / 2 + 0.06 };
const PORTRAIT = { cx: 6.55, cy: 2.55, z: -B.z + B.wall / 2 + 0.08, maxW: 2.2, maxH: 2.5 };

/* ---------------------------------------------------------------- helpers */
function phys(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, metalness: 0, ...o });
}
function box(w, h, d, mat, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
/** Box spanning [x0,x1]×[y0,y1]×[z0,z1]. */
function span(x0, x1, y0, y1, z0, z1, mat, opts) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts);
}
function textSprite(text, color, size, font = 'italic 500 190px "STIX Two Text", Georgia, serif') {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = font;
  c.width = Math.max(256, Math.ceil(g.measureText(text).width + 60));
  c.height = 256;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, c.width / 2, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(size * (c.width / c.height), size, 1);
  return s;
}
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ---------------------------------------------------------------- textures */
function boardTexture() {
  const c = document.createElement("canvas");
  c.width = 2048; c.height = 870;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "#1d4a47");
  grad.addColorStop(1, "#143634");
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 2;
  for (let x = 0; x <= c.width; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y <= c.height; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  // faint chalk dust
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function placeholderPortrait() {
  const c = document.createElement("canvas");
  c.width = 800; c.height = 1000;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, "#ccfbf1"); grad.addColorStop(1, "#e0f2fe");
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  // soft silhouette
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

/* ================================================================ scene */
export async function initAcademy({ canvas, photoUrl = "assets/tutor-maksudova.jpg", onPhoto, reduceMotion = false }) {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (_) {}

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.bg);
  scene.fog = new THREE.Fog(PAL.bg, 45, 120);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.15, 260);

  /* ---- light: bright architectural daylight ---- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe5e7eb, 0.9));
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.4);
  sun.position.set(18, 30, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 90 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7); // no shadows → also lights the interior
  fill.position.set(-10, 12, 18);
  scene.add(fill);
  for (const [x, z] of [[-4.5, 2], [4.5, 2], [0, 0.5]]) {
    const p = new THREE.PointLight(0xffffff, 14, 14, 2);
    p.position.set(x, 4.5, z);
    scene.add(p);
  }

  /* ---- materials ---- */
  const M = {
    ground: phys(PAL.ground, { roughness: 0.95 }),
    path: phys(PAL.path, { roughness: 0.9 }),
    wall: phys(PAL.wall, { roughness: 0.82 }),
    trim: phys(PAL.trim, { roughness: 0.6 }),
    dark: phys(PAL.dark, { roughness: 0.35, metalness: 0.5 }),
    teal: phys(PAL.teal, { roughness: 0.3, clearcoat: 0.6 }),
    blue: phys(PAL.blue, { roughness: 0.3, clearcoat: 0.6 }),
    amber: phys(PAL.amber, { roughness: 0.32, clearcoat: 0.6 }),
    wood: phys(PAL.wood, { roughness: 0.6, clearcoat: 0.3 }),
    woodDark: phys(PAL.woodDark, { roughness: 0.55, clearcoat: 0.3 }),
    leaf: phys(PAL.leaf, { roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd5f1f4, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.26,
      envMapIntensity: 1.4, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    }),
    light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1 }),
  };

  const world = new THREE.Group();
  scene.add(world);
  const add = (...o) => o.forEach((x) => world.add(x));

  /* ---- ground, plaza, path ---- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);
  const plaza = span(-15, 15, 0, 0.04, -9, 18, M.path, { cast: false });
  add(plaza);
  const walk = span(-2.2, 2.2, 0, 0.06, 6, 60, phys(0xffffff, { roughness: 0.85 }), { cast: false });
  add(walk);
  // paving lines on the walkway
  for (let z = 8; z < 60; z += 2) add(span(-2.2, 2.2, 0.061, 0.065, z, z + 0.04, M.trim, { cast: false }));

  /* ---- building shell ---- */
  const { x: BX, z: BZ, h: BH, wall: T } = B;
  // back + sides
  add(span(-BX, BX, 0, BH, -BZ, -BZ + T, M.wall));
  add(span(-BX, -BX + T, 0, BH, -BZ, BZ, M.wall));
  add(span(BX - T, BX, 0, BH, -BZ, BZ, M.wall));
  // front: piers, glass curtain wall, door portal
  const DOOR = 1.7, DOOR_H = 3.5;
  add(span(-BX, -BX + 1.6, 0, BH, BZ - T, BZ, M.wall));
  add(span(BX - 1.6, BX, 0, BH, BZ - T, BZ, M.wall));
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -BX + 1.6 : DOOR, x1 = side < 0 ? -DOOR : BX - 1.6;
    const g = span(x0, x1, 0.05, BH, BZ - 0.18, BZ - 0.12, M.glass, { cast: false, receive: false });
    g.renderOrder = 2;
    add(g);
    for (let x = x0; x <= x1 + 1e-3; x += (x1 - x0) / 4) add(span(x - 0.04, x + 0.04, 0, BH, BZ - 0.22, BZ - 0.06, M.dark, { receive: false }));
    add(span(x0, x1, 2.46, 2.54, BZ - 0.22, BZ - 0.06, M.dark, { receive: false }));
  }
  add(span(-DOOR, DOOR, DOOR_H, BH, BZ - T, BZ, M.wall)); // header
  // teal portal frame + canopy
  add(span(-DOOR - 0.25, -DOOR, 0, DOOR_H + 0.25, BZ - 0.1, BZ + 0.35, M.teal));
  add(span(DOOR, DOOR + 0.25, 0, DOOR_H + 0.25, BZ - 0.1, BZ + 0.35, M.teal));
  add(span(-2.8, 2.8, DOOR_H + 0.25, DOOR_H + 0.42, BZ - 0.1, BZ + 2.6, M.teal));
  // roof slab with overhang
  add(span(-BX - 0.6, BX + 0.6, BH, BH + 0.4, -BZ - 0.6, BZ + 0.6, M.trim));
  // upper volume with glass band and vertical fins
  const UP = { x: 6.2, z0: -4.5, z1: 3.6, y0: BH + 0.4, y1: BH + 3.6 };
  add(span(-UP.x, UP.x, UP.y0, UP.y1, UP.z0, UP.z1 - 0.2, M.wall));
  const band = span(-UP.x + 0.6, UP.x - 0.6, UP.y0 + 0.7, UP.y1 - 0.6, UP.z1 - 0.22, UP.z1, M.glass, { cast: false, receive: false });
  band.renderOrder = 2;
  add(band);
  for (let x = -UP.x + 0.6; x <= UP.x - 0.6 + 1e-3; x += 0.95) add(span(x - 0.05, x + 0.05, UP.y0 + 0.4, UP.y1, UP.z1 - 0.1, UP.z1 + 0.35, M.wall));
  add(span(-UP.x - 0.3, UP.x + 0.3, UP.y1, UP.y1 + 0.3, UP.z0 - 0.3, UP.z1 + 0.5, M.trim));
  add(span(-UP.x, UP.x, UP.y0 + 0.3, UP.y0 + 0.42, UP.z1 - 0.2, UP.z1 + 0.02, M.teal)); // accent line

  /* ---- exterior: geometric sculptures + trees ---- */
  const plinth = (x, z, w) => span(x - w, x + w, 0, 0.5, z - w, z + w, M.trim);
  const bigSphere = new THREE.Mesh(new THREE.SphereGeometry(1.5, 64, 48), M.amber);
  bigSphere.position.set(-12, 2.0, 12); bigSphere.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.06, 16, 120), M.dark);
  ring.position.copy(bigSphere.position); ring.rotation.set(1.1, 0.3, 0.2); ring.castShadow = true;
  add(plinth(-12, 12, 1.4), bigSphere, ring);
  const bigPyr = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.2, 4), M.blue);
  bigPyr.position.set(12.5, 2.1, 11); bigPyr.rotation.y = Math.PI / 4; bigPyr.castShadow = true;
  add(plinth(12.5, 11, 1.6), bigPyr);
  const bigCube = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), M.teal);
  bigCube.position.set(13, 2.3, -1.5); bigCube.rotation.set(0.62, 0.78, 0); bigCube.castShadow = true;
  add(plinth(13, -1.5, 1.3), bigCube);
  const tree = (x, z, s = 1) => {
    const trunk = box(0.22 * s, 1.4 * s, 0.22 * s, M.woodDark, x, 0.7 * s, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 * s, 1), M.leaf);
    crown.position.set(x, 2.3 * s, z); crown.castShadow = true;
    return [trunk, crown];
  };
  for (const [x, z, s] of [[-6.5, 15, 1], [-17, 4, 1.2], [17, 5, 1.1], [-18, -6, 1], [18, -7, 1.3], [-9, 22, 1.1], [24, 22, 1], [-22, 14, 1.2], [20, 15, 1]]) add(...tree(x, z, s));

  /* ---- classroom interior ---- */
  add(span(-BX + T, BX - T, 0, 0.03, -BZ + T, BZ - T, M.wood, { cast: false }));
  add(span(-BX + T, BX - T, BH - 0.02, BH, -BZ + T, BZ - T, M.wall, { cast: false })); // ceiling
  for (const [x, z] of [[-4.5, 2.5], [0, 2.5], [4.5, 2.5], [-4.5, -2], [0, -2], [4.5, -2]]) add(span(x - 1.1, x + 1.1, BH - 0.06, BH - 0.02, z - 0.35, z + 0.35, M.light, { cast: false, receive: false }));
  // skirting + teal accent stripe on the back wall
  add(span(-BX + T, BX - T, 0, 0.14, -BZ + T, -BZ + T + 0.03, M.trim, { cast: false }));
  add(span(-BX + T, BX - T, 4.25, 4.32, -BZ + T, -BZ + T + 0.03, M.teal, { cast: false }));

  // smart blackboard
  const bd = BOARD;
  add(span(bd.cx - bd.w / 2 - 0.16, bd.cx + bd.w / 2 + 0.16, bd.cy - bd.h / 2 - 0.16, bd.cy + bd.h / 2 + 0.16, -BZ + T, -BZ + T + 0.08, M.dark));
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(bd.w, bd.h), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.92, metalness: 0, envMapIntensity: 0.2 }));
  boardMesh.position.set(bd.cx, bd.cy, bd.z + 0.04);
  boardMesh.receiveShadow = true;
  add(boardMesh);
  add(span(bd.cx - bd.w / 2, bd.cx + bd.w / 2, bd.cy - bd.h / 2 - 0.26, bd.cy - bd.h / 2 - 0.18, -BZ + T, -BZ + T + 0.22, M.trim)); // chalk tray

  // number line above the board
  for (let i = -5; i <= 5; i++) {
    add(span(i * 0.7 - 0.012, i * 0.7 + 0.012, 4.42, 4.6, -BZ + T, -BZ + T + 0.02, M.dark, { cast: false }));
  }
  add(span(-3.6, 3.6, 4.5, 4.52, -BZ + T, -BZ + T + 0.02, M.dark, { cast: false }));

  // desks + chairs
  const desk = (x, z) => {
    const out = [span(x - 0.75, x + 0.75, 0.74, 0.79, z - 0.4, z + 0.4, M.wood)];
    for (const [dx, dz] of [[-0.68, -0.33], [0.68, -0.33], [-0.68, 0.33], [0.68, 0.33]]) out.push(span(x + dx - 0.025, x + dx + 0.025, 0, 0.74, z + dz - 0.025, z + dz + 0.025, M.dark, { receive: false }));
    out.push(span(x - 0.28, x + 0.28, 0.44, 0.48, z + 0.62, z + 1.1, M.teal));
    out.push(span(x - 0.28, x + 0.28, 0.48, 0.95, z + 1.08, z + 1.12, M.teal));
    out.push(span(x - 0.02, x + 0.02, 0, 0.44, z + 0.84, z + 0.88, M.dark, { receive: false }));
    return out;
  };
  for (const z of [3.0, 0.6, -1.8]) for (const x of [-5.4, -2.6, 2.6, 5.4]) add(...desk(x, z));
  // teacher's desk
  add(span(-6.6, -4.6, 0.78, 0.84, -4.4, -3.6, M.woodDark), span(-6.55, -4.65, 0, 0.78, -4.35, -4.25, M.wall));
  // bookshelf on the left wall
  add(span(-BX + T, -BX + T + 0.4, 0, 2.2, -1, 2.2, M.wood));
  for (let i = 0; i < 14; i++) {
    const c = [M.teal, M.blue, M.amber, M.trim][i % 4];
    add(span(-BX + T + 0.05, -BX + T + 0.35, 1.2, 1.2 + 0.4 + (i % 3) * 0.08, -0.9 + i * 0.21, -0.9 + i * 0.21 + 0.17, c));
  }

  /* ---- the tutor's framed portrait (photo texture or placeholder) ---- */
  const portrait = new THREE.Group();
  portrait.position.set(PORTRAIT.cx, PORTRAIT.cy, PORTRAIT.z);
  add(portrait);
  const photoMat = new THREE.MeshPhysicalMaterial({ map: placeholderPortrait(), roughness: 0.45, clearcoat: 0.4 });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), photoMat);
  photo.position.z = 0.085;
  portrait.add(photo);
  const frameMat = phys(0xd8c3a0, { roughness: 0.45, clearcoat: 0.5 });
  const matMat = phys(0xffffff, { roughness: 0.9 });
  const frameParts = new THREE.Group();
  portrait.add(frameParts);
  const portraitSize = { w: 1, h: 1 };

  function fitPortrait(aspect) {
    // keep the image proportions; fit inside maxW × maxH
    let h = PORTRAIT.maxH, w = h * aspect;
    if (w > PORTRAIT.maxW) { w = PORTRAIT.maxW; h = w / aspect; }
    portraitSize.w = w; portraitSize.h = h;
    photo.scale.set(w, h, 1);
    frameParts.clear();
    const m = 0.12, f = 0.1, d = 0.1; // passe-partout, frame width, depth
    frameParts.add(box(w + 2 * m, h + 2 * m, 0.03, matMat, 0, 0, 0.035, { cast: false }));
    const W = w + 2 * m + 2 * f, H = h + 2 * m + 2 * f;
    frameParts.add(box(W, f, d, frameMat, 0, H / 2 - f / 2, 0.05));
    frameParts.add(box(W, f, d, frameMat, 0, -H / 2 + f / 2, 0.05));
    frameParts.add(box(f, H - 2 * f, d, frameMat, -W / 2 + f / 2, 0, 0.05));
    frameParts.add(box(f, H - 2 * f, d, frameMat, W / 2 - f / 2, 0, 0.05));
  }
  fitPortrait(0.8);

  new THREE.TextureLoader().load(
    photoUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      photoMat.map = tex;
      photoMat.needsUpdate = true;
      fitPortrait(tex.image.width / tex.image.height);
      onPhoto && onPhoto(true);
    },
    undefined,
    () => onPhoto && onPhoto(false)
  );

  /* ---- floating math objects + symbols + particles (inside the room) ---- */
  const floaters = [];
  const addFloater = (mesh, x, y, z, spin) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    add(mesh);
    floaters.push({ mesh, base: new THREE.Vector3(x, y, z), spin, phase: Math.random() * 6.28 });
  };
  const edge = (geo, color) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
  const cubeGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const cube = new THREE.Mesh(cubeGeo, phys(0x2dd4bf, { roughness: 0.25, clearcoat: 0.8 })); cube.add(edge(cubeGeo, 0x0f766e));
  const pyrGeo = new THREE.ConeGeometry(0.5, 0.85, 4);
  const pyr = new THREE.Mesh(pyrGeo, phys(0x38bdf8, { roughness: 0.25, clearcoat: 0.8 })); pyr.add(edge(pyrGeo, 0x075985));
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), phys(0xfbbf24, { roughness: 0.25, clearcoat: 0.8 }));
  const tor = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 24, 64), phys(0xa78bfa, { roughness: 0.3, clearcoat: 0.8 }));
  addFloater(cube, -3.8, 3.1, 0.2, [0.4, 0.6, 0]);
  addFloater(pyr, 3.6, 3.5, 1.4, [0, 0.8, 0]);
  addFloater(sph, -1.6, 3.7, -2.8, [0, 0.3, 0]);
  addFloater(tor, 1.9, 3.0, -3.2, [0.7, 0.4, 0]);
  const symbols = [["π", "#0d9488", -5.6, 3.6, 1.8], ["∑", "#0284c7", 5.4, 3.9, -0.6], ["√x", "#0f766e", -0.6, 4.1, 0.9], ["∞", "#0284c7", -6.4, 2.8, -2.8], ["x²", "#b45309", 4.6, 2.9, 3.2], ["Δ", "#0d9488", 0.9, 3.4, 2.6]];
  for (const [t, col, x, y, z] of symbols) {
    const s = textSprite(t, col, 0.55);
    s.position.set(x, y, z);
    add(s);
    floaters.push({ mesh: s, base: new THREE.Vector3(x, y, z), spin: null, phase: Math.random() * 6.28 });
  }
  const N = 260, pp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pp[i * 3] = (Math.random() - 0.5) * 16; pp[i * 3 + 1] = 0.6 + Math.random() * 4; pp[i * 3 + 2] = (Math.random() - 0.5) * 10.5; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x14b8a6, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
  add(particles);

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
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
    new THREE.Vector3(bd.cx - bd.w / 2, bd.cy + bd.h / 2, bd.z + 0.05),
    new THREE.Vector3(bd.cx + bd.w / 2, bd.cy - bd.h / 2, bd.z + 0.05),
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
      if (f.mesh.isSprite) f.mesh.material.opacity = 1 - away;
      else f.mesh.scale.setScalar(1 - away * 0.9);
      if (f.spin) { f.mesh.rotation.x += f.spin[0] * dt; f.mesh.rotation.y += f.spin[1] * dt; }
    }
    particles.rotation.y = t * 0.02;

    renderer.render(scene, camera);

    const a = {
      p: state.p,
      title: project(anchors.title),
      tutor: project(anchors.tutor),
      board: (() => { const tl = project(boardCorners[0]), br = project(boardCorners[1]); return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y, visible: tl.visible && br.visible }; })(),
    };
    for (const fn of listeners) fn(a);
  }

  let running = true;
  const setRunning = () => renderer.setAnimationLoop(running && !document.hidden ? frame : null);
  document.addEventListener("visibilitychange", setRunning);
  setRunning();
  frame();

  return {
    setProgress(p) { state.target = clamp01(p); },
    jump(p) { state.target = state.p = clamp01(p); },
    onFrame(fn) { listeners.push(fn); },
  };
}
