/* ==========================================================================
   hero3d.js — real-time WebGL hero: a 3D coordinate space with a cube,
   a square pyramid and a sphere, plus y = x² drawn on the back "graph paper".
   Rendered every frame at devicePixelRatio (capped at 2), so it stays sharp
   on Retina / 4K. Pauses itself when off-screen or in a background tab.
   ========================================================================== */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/RoomEnvironment.js";

const COLORS = {
  gridMinor: 0xe2e8f0,
  gridMajor: 0xcbd5e1,
  axisX: 0x0284c7,
  axisY: 0x334155,
  axisZ: 0x14b8a6,
  cube: 0x2dd4bf, cubeEdge: 0x0f766e,
  pyramid: 0x38bdf8, pyramidEdge: 0x075985,
  sphere: 0xfbbf24, sphereEdge: 0xb45309,
  curve: 0x0284c7,
};

const SHAPES_INFO = {
  cube: { name: "Cube", formula: "V = s³", fact: "6 faces · 12 edges · 8 vertices" },
  pyramid: { name: "Square pyramid", formula: "V = ⅓ Bh", fact: "5 faces · 8 edges · 5 vertices" },
  sphere: { name: "Sphere", formula: "V = ⁴⁄₃ πr³", fact: "Every point is r from the centre" },
};

/** Draws crisp text into a texture (sized to the text) for axis labels. */
function labelSprite(text, color, size = 0.42, italic = true) {
  const font = `${italic ? "italic " : ""}500 150px "STIX Two Text", Georgia, serif`;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = font;
  c.width = Math.max(256, Math.ceil(g.measureText(text).width + 48));
  c.height = 256;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, c.width / 2, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size * (c.width / c.height), size, 1);
  return s;
}

/** Floor (xz) or wall (xy) grid; every `majorEvery`-th line is darker. */
function gridLines(w, d, step, majorEvery, plane) {
  const minor = [], major = [];
  const push = (arr, v) => { const k = Math.round(v / step); (k % majorEvery === 0 ? major : minor).push(...arr); };
  const hw = w / 2;
  if (plane === "xz") {
    const hd = d / 2;
    for (let x = -hw; x <= hw + 1e-6; x += step) push([x, 0, -hd, x, 0, hd], x);
    for (let z = -hd; z <= hd + 1e-6; z += step) push([-hw, 0, z, hw, 0, z], z);
  } else {
    for (let x = -hw; x <= hw + 1e-6; x += step) push([x, 0, 0, x, d, 0], x);
    for (let y = 0; y <= d + 1e-6; y += step) push([-hw, y, 0, hw, y, 0], y);
  }
  const mk = (pts, color) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
  };
  const grp = new THREE.Group();
  grp.add(mk(minor, COLORS.gridMinor), mk(major, COLORS.gridMajor));
  return grp;
}

function axis(from, to, color, radius = 0.028) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len - 0.28, 16), mat);
  shaft.position.y = (len - 0.28) / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.6, 0.3, 24), mat);
  head.position.y = len - 0.15;
  grp.add(shaft, head);
  grp.position.copy(from);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return grp;
}

function solid(geometry, color, edgeColor, edgeThreshold = 1) {
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.3,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, edgeThreshold),
    new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.85 })
  );
  mesh.add(edges);
  return mesh;
}

export async function initHero3D({ canvas, container, tip, reduceMotion = false }) {
  // fonts first, so the axis labels render in the math face
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]); } catch (_) {}

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0xf8fafc, 16, 30);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 25 });
  scene.add(sun);

  // ---- world (everything rotates together) --------------------------------
  const world = new THREE.Group();
  scene.add(world);

  world.add(gridLines(10, 10, 0.5, 2, "xz"));
  const wall = gridLines(10, 5, 0.5, 2, "xy");
  wall.position.z = -5;
  world.add(wall);

  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.12 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -0.002;
  shadowPlane.receiveShadow = true;
  world.add(shadowPlane);

  world.add(axis(new THREE.Vector3(-5.2, 0.01, 0), new THREE.Vector3(5.6, 0.01, 0), COLORS.axisX));
  world.add(axis(new THREE.Vector3(0, 0.01, 5.2), new THREE.Vector3(0, 0.01, -5.6), COLORS.axisZ));
  world.add(axis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4.6, 0), COLORS.axisY));
  const lx = labelSprite("x", "#0284c7"); lx.position.set(5.95, 0.25, 0); world.add(lx);
  const lz = labelSprite("z", "#0d9488"); lz.position.set(0, 0.25, -5.95); world.add(lz);
  const ly = labelSprite("y", "#334155"); ly.position.set(0.32, 4.75, 0); world.add(ly);
  for (const n of [-4, -2, 2, 4]) {
    const t = labelSprite(String(n), "#94a3b8", 0.32, false);
    t.position.set(n, 0.2, 0.35);
    world.add(t);
  }

  // ---- y = x² on the back wall, with a point that travels along it --------
  const pts = [];
  for (let x = -2.6; x <= 2.6001; x += 0.05) pts.push(new THREE.Vector3(x, 0.62 * x * x + 0.15, -4.98));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 200, 0.035, 12, false),
    new THREE.MeshStandardMaterial({ color: COLORS.curve, roughness: 0.35 })
  );
  world.add(tube);
  const traveler = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16), new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.3 }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 40), new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  traveler.add(halo);
  world.add(traveler);
  const curveLabel = labelSprite("y = x²", "#0284c7", 0.5);
  curveLabel.position.set(3.3, 4.35, -4.9);
  world.add(curveLabel);

  // ---- the three solids -----------------------------------------------------
  const cube = solid(new THREE.BoxGeometry(1.5, 1.5, 1.5), COLORS.cube, COLORS.cubeEdge);
  const pyramidGeo = new THREE.ConeGeometry(1.15, 1.8, 4, 1);
  pyramidGeo.rotateY(Math.PI / 4);
  const pyramid = solid(pyramidGeo, COLORS.pyramid, COLORS.pyramidEdge);
  const sphereGeo = new THREE.SphereGeometry(0.95, 64, 48);
  const sphere = solid(sphereGeo, COLORS.sphere, COLORS.sphereEdge, 90); // threshold 90° → no mesh seams
  // latitude / longitude guides on the sphere
  const ringMat = new THREE.LineBasicMaterial({ color: COLORS.sphereEdge, transparent: true, opacity: 0.7 });
  const circle = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, 0.955, 0.955).getPoints(96));
  const eq = new THREE.LineLoop(circle, ringMat); eq.rotation.x = Math.PI / 2; sphere.add(eq);
  const mer = new THREE.LineLoop(circle, ringMat); sphere.add(mer);

  const solids = [
    { key: "cube", mesh: cube, base: new THREE.Vector3(-1.7, 0.75, 2.3), phase: 0, spin: 0.25 },
    { key: "pyramid", mesh: pyramid, base: new THREE.Vector3(2.6, 0.9, -0.3), phase: 2.1, spin: -0.3 },
    { key: "sphere", mesh: sphere, base: new THREE.Vector3(-0.3, 0.95, -2.4), phase: 4.2, spin: 0.2 },
  ];
  for (const s of solids) { s.mesh.position.copy(s.base); s.mesh.userData.key = s.key; s.hover = 0; world.add(s.mesh); }
  cube.rotation.y = 0.5;

  // ---- interaction ----------------------------------------------------------
  const state = {
    yaw: -0.5, pitch: 0, targetYaw: -0.5, targetPitch: 0,
    dragYaw: 0, dragVel: 0, dragging: false, lastX: 0,
    px: 0, py: 0, scroll: 0, hovered: null, mouse: new THREE.Vector2(-9, -9), hasMouse: false,
  };
  const ray = new THREE.Raycaster();

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    state.px = ((e.clientX - r.left) / r.width) * 2 - 1;
    state.py = ((e.clientY - r.top) / r.height) * 2 - 1;
    state.mouse.set(state.px, -state.py);
    state.hasMouse = e.pointerType === "mouse";
    if (state.dragging) {
      const dx = e.clientX - state.lastX;
      state.lastX = e.clientX;
      state.dragYaw += dx * 0.008;
      state.dragVel = dx * 0.008;
    }
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", (e) => {
    state.dragging = true; state.lastX = e.clientX; state.dragVel = 0;
    if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId);
  });
  const endDrag = () => { state.dragging = false; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => { state.hasMouse = false; state.mouse.set(-9, -9); if (!state.dragging) { state.px = 0; state.py = 0; } });

  // tap on touch devices: show the info tip for the tapped shape
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    state.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    pick(true);
  });

  function showTip(s) {
    if (!tip) return;
    if (!s) { tip.classList.remove("is-on"); return; }
    const info = SHAPES_INFO[s.key];
    tip.innerHTML = `<b>${info.name}</b> · <span class="math">${info.formula}</span><br>${info.fact}`;
    tip.classList.add("is-on");
  }

  function pick(force) {
    if (!state.hasMouse && !force) return;
    ray.setFromCamera(state.mouse, camera);
    const hit = ray.intersectObjects(solids.map((s) => s.mesh), false)[0];
    const s = hit ? solids.find((x) => x.mesh === hit.object) : null;
    if (s !== state.hovered) {
      state.hovered = s;
      canvas.style.cursor = s ? "pointer" : "";
      showTip(s);
    }
  }

  // ---- sizing ---------------------------------------------------------------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole scene in frame on narrow (portrait) containers
    camera.fov = camera.aspect < 1 ? 46 : camera.aspect < 1.25 ? 40 : 34;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---- loop -----------------------------------------------------------------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let t = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reduceMotion) t += dt;

    // inertia after a drag
    if (!state.dragging) { state.dragYaw += state.dragVel; state.dragVel *= 0.94; }
    state.targetYaw = -0.5 + state.dragYaw + state.px * 0.18 + state.scroll * 0.7;
    state.targetPitch = state.py * 0.05;
    state.yaw += (state.targetYaw - state.yaw) * 0.08;
    state.pitch += (state.targetPitch - state.pitch) * 0.08;
    world.rotation.y = state.yaw;

    // camera: gentle orbit height + scroll-driven lift
    const dist = camera.aspect < 1 ? 16.5 : 14;
    const camH = 6.6 + state.pitch * 10 + state.scroll * 3.5;
    camera.position.set(0, camH, dist - state.scroll * 1.5);
    camera.lookAt(0, 1.5 + state.scroll * 0.4, 0);

    for (const s of solids) {
      const bob = Math.sin(t * 1.3 + s.phase) * 0.14;
      s.mesh.position.set(s.base.x, s.base.y + 0.18 + bob + state.scroll * 0.8, s.base.z);
      s.mesh.rotation.y += s.spin * dt * (reduceMotion ? 0 : 1);
      const target = state.hovered === s ? 1 : 0;
      s.hover += (target - s.hover) * 0.15;
      s.mesh.scale.setScalar(1 + s.hover * 0.1);
    }

    // point travelling along the parabola
    const u = (Math.sin(t * 0.6) + 1) / 2;
    curve.getPointAt(u, tmp);
    traveler.position.copy(tmp);
    halo.lookAt(camera.position);
    halo.scale.setScalar(1 + Math.sin(t * 4) * 0.12);

    pick(false);

    // tooltip follows the hovered shape
    if (state.hovered && tip) {
      tmp.copy(state.hovered.mesh.position).add(new THREE.Vector3(0, 1.1, 0));
      world.localToWorld(tmp);
      tmp.project(camera);
      tip.style.left = ((tmp.x + 1) / 2) * container.clientWidth + "px";
      tip.style.top = ((1 - tmp.y) / 2) * container.clientHeight + "px";
    }

    renderer.render(scene, camera);
  }

  // run only while visible
  let inView = true;
  const setRunning = () => renderer.setAnimationLoop(inView && !document.hidden ? frame : null);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; clock.getDelta(); setRunning(); }, { rootMargin: "100px" }).observe(container);
  document.addEventListener("visibilitychange", setRunning);
  setRunning();
  frame();

  return {
    setScroll(v) { state.scroll = v; },
  };
}
