// Interactive 3D preview of the pen pot: every piece extruded to the real
// material thickness and put together as it will be glued, with the name
// engraved, a ruler and a few pencils for scale. Model units are millimetres.

import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

// Wood looks, keyed by the "look" of each material in data/materials.json.
export const FINISHES = {
  poplar: { top: "#ecdcbf", edge: "#8a6a45", grain: "#dccaa6", roughness: 0.85 },
  birch: { top: "#ead7b2", edge: "#6e4426", grain: "#d9c095", roughness: 0.85 },
  maple: { top: "#f1e3c8", edge: "#7d5a37", grain: "#e2d0ad", roughness: 0.8 },
  ceiba: { top: "#e6d2b5", edge: "#8d6b4b", grain: "#d6bf9c", roughness: 0.9 },
};
const DEFAULT_FINISH = "birch";
const ENGRAVE = "#3a2414";

function grainTexture(base, grain) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = grain;
  // Loose, wavy streaks read as wood grain without an image file.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y0 = rnd() * 512, amp = 2 + rnd() * 6, f = 0.004 + rnd() * 0.01;
    g.globalAlpha = 0.12 + rnd() * 0.22;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y0 + Math.sin(x * f + i) * amp);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Flat ruler along the front: mm ticks, numbered every centimetre.
function rulerMesh(lengthMm) {
  const pxPerMm = 8, depthMm = 14;
  const c = document.createElement("canvas");
  c.width = Math.ceil(lengthMm * pxPerMm);
  c.height = depthMm * pxPerMm;
  const g = c.getContext("2d");
  g.fillStyle = "#f6efe2";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#2e2723";
  for (let mm = 0; mm <= lengthMm; mm += 1) {
    const major = mm % 10 === 0, mid = mm % 5 === 0;
    const len = major ? 6 : mid ? 4 : 2.2;
    g.fillRect(Math.min(mm * pxPerMm, c.width - 2), 0, major ? 2 : 1, len * pxPerMm);
    if (major) {
      g.font = `600 ${4.2 * pxPerMm}px Arial, sans-serif`;
      g.textAlign = mm === 0 ? "left" : mm >= lengthMm - 1 ? "right" : "center";
      g.fillText(`${mm / 10}`, mm * pxPerMm, 11 * pxPerMm);
    }
  }
  g.textAlign = "right";
  g.font = `${3.2 * pxPerMm}px Arial, sans-serif`;
  g.fillText("cm", c.width - 2, 13.4 * pxPerMm);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geo = new THREE.BoxGeometry(lengthMm, 1, depthMm);
  const plain = new THREE.MeshStandardMaterial({ color: "#e9dfcd", roughness: 0.6 });
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const mesh = new THREE.Mesh(geo, [plain, plain, top, plain, plain, plain]);
  mesh.receiveShadow = true;
  return { mesh, depthMm };
}

// A hexagonal pencil, 175 mm long, standing on its end.
function pencil(colour) {
  const g = new THREE.Group();
  const bodyLen = 155, r = 3.6;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, bodyLen, 6),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 })
  );
  body.position.y = bodyLen / 2;
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.9, r, 17, 6), new THREE.MeshStandardMaterial({ color: "#e7c99a", roughness: 0.8 }));
  wood.position.y = bodyLen + 8.5;
  const lead = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 12), new THREE.MeshStandardMaterial({ color: "#333", roughness: 0.4 }));
  lead.position.y = bodyLen + 18.5;
  for (const m of [body, wood, lead]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// Shape coordinates are y-down panel millimetres; three.js shapes are y-up.
function shapesFrom(polys, H) {
  const pt = ([x, y]) => new THREE.Vector2(x, H - y);
  return polys.map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.map(pt));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(pt)));
    return shape;
  });
}

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 10000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight("#fffaf0", "#8a7a66", 1.4));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  // A soft light from inside-front so the far wall's pattern still reads.
  const fill = new THREE.DirectionalLight("#fff8ee", 0.6);
  scene.add(fill);

  const model = new THREE.Group();
  scene.add(model);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let running = false;
  const loop = () => {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);

  function clear() {
    model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) {
        m.map?.dispose();
        m.dispose();
      }
    });
    model.clear();
  }

  let lastSpan = 0;

  /**
   * @param {object} pot  buildPot() result
   * @param {{material:string, pencils:boolean}} opts
   */
  function show(pot, opts = {}) {
    clear();
    const { w: W, d: D, h: H, t: T } = pot.meta;
    const finish = FINISHES[opts.material] || FINISHES[DEFAULT_FINISH];
    const grain = grainTexture(finish.top, finish.grain);
    grain.repeat.set(1 / 120, 1 / 120);
    const cap = new THREE.MeshStandardMaterial({ map: grain, roughness: finish.roughness, side: THREE.DoubleSide });
    const side = new THREE.MeshStandardMaterial({ color: finish.edge, roughness: 0.95 });
    const engraveMat = new THREE.MeshBasicMaterial({ color: ENGRAVE, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

    const pot3d = new THREE.Group();
    const byId = Object.fromEntries(pot.pieces.map((p) => [p.id, p]));
    const add = (p, place) => {
      const geo = new THREE.ExtrudeGeometry(shapesFrom([p.poly], p.h), { depth: T, bevelEnabled: false, curveSegments: 1 });
      const mesh = new THREE.Mesh(geo, [cap, side]);
      mesh.castShadow = mesh.receiveShadow = true;
      place(mesh);
      pot3d.add(mesh);
      if (p.engrave.length) {
        const e = new THREE.Mesh(new THREE.ShapeGeometry(shapesFrom(p.engrave, p.h)), engraveMat);
        e.position.z = T + 0.05;
        mesh.add(e);
      }
    };
    // World: x across the width, y up, z towards the viewer (front at z = D).
    add(byId.front, (m) => m.position.set(0, 0, D - T));
    add(byId.back, (m) => m.position.set(0, 0, 0));
    add(byId.left, (m) => { m.rotation.y = -Math.PI / 2; m.position.set(T, 0, 0); });
    add(byId.right, (m) => { m.rotation.y = -Math.PI / 2; m.position.set(W, 0, 0); });
    add(byId.base, (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, T, 0); });
    // Double skin: the inner pot stands on the base, `off` in from the outside.
    const ip = pot.meta.innerPot;
    if (ip) {
      const { off, w: iw, d: id } = ip;
      add(byId["inner-front"], (m) => m.position.set(off, T, off + id - T));
      add(byId["inner-back"], (m) => m.position.set(off, T, off));
      add(byId["inner-left"], (m) => { m.rotation.y = -Math.PI / 2; m.position.set(off + T, T, off); });
      add(byId["inner-right"], (m) => { m.rotation.y = -Math.PI / 2; m.position.set(off + iw, T, off); });
    }
    pot3d.position.set(-W / 2, 0, -D / 2);
    model.add(pot3d);

    if (opts.pencils !== false) {
      const inner = pot.meta.inner;
      const spots = [
        { x: -0.22, z: -0.18, c: "#e7b416", tilt: [0.10, 0.06] },
        { x: 0.2, z: -0.05, c: "#2f5d8a", tilt: [-0.08, 0.1] },
        { x: -0.02, z: 0.22, c: "#b9581f", tilt: [0.04, -0.12] },
      ];
      for (const s of spots) {
        const p = pencil(s.c);
        p.position.set(s.x * inner.w, T, s.z * inner.d);
        p.rotation.set(s.tilt[0] * (60 / Math.max(40, inner.d)), 0, s.tilt[1] * (60 / Math.max(40, inner.w)));
        model.add(p);
      }
    }

    const { mesh: ruler, depthMm } = rulerMesh(Math.ceil(W / 10) * 10 + 10);
    ruler.position.set(0, 0.5, D / 2 + depthMm / 2 + 10);
    model.add(ruler);

    const tallest = opts.pencils !== false ? Math.max(H, 175) : H;
    const span = Math.max(W, D, tallest * 1.1, 120);
    sun.position.set(-span * 0.8, span * 1.6, span * 1.1);
    fill.position.set(span * 0.6, span * 0.4, span * 1.2);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 5 });
    sun.shadow.camera.updateProjectionMatrix();
    ground.scale.set(span * 6, span * 6, 1);

    // Only re-aim the camera when the pot changes size noticeably, so tweaking
    // the pattern doesn't throw the view about.
    if (!lastSpan || Math.abs(span - lastSpan) / lastSpan > 0.15) {
      controls.target.set(0, tallest * 0.42, 0);
      camera.position.set(span * 0.75, span * 0.95, span * 1.75);
      controls.minDistance = span * 0.4;
      controls.maxDistance = span * 6;
      lastSpan = span;
    }
    controls.update();
    resize();
    if (!running) {
      running = true;
      loop();
    }
  }

  return {
    show,
    start() {
      if (running || !model.children.length) return;
      running = true;
      resize();
      loop();
    },
    stop() {
      running = false;
    },
    snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    },
  };
}
