// Geometric cut-out patterns for the pot walls.
//
// Every pattern is a tiling of cells. Convex cells are shrunk towards their
// centre by half the bar width, so neighbouring holes always leave a bar of
// wood at least `bar` mm wide between them. Circles and stars are sized
// directly from the pitch and bar. All units are millimetres, y down.

/* global polygonClipping */

export const PATTERNS = [
  { id: "honeycomb", label: "Honeycomb" },
  { id: "triangles", label: "Triangles" },
  { id: "diamonds", label: "Diamonds" },
  { id: "grid", label: "Squares" },
  { id: "bricks", label: "Bricks" },
  { id: "circles", label: "Circles" },
  { id: "stars", label: "Stars" },
  { id: "chevron", label: "Chevron" },
  { id: "shattered", label: "Shattered" },
  { id: "none", label: "Plain" },
];

export const FADES = [
  { id: "none", label: "Even all over" },
  { id: "up", label: "Bigger towards the top" },
  { id: "down", label: "Bigger towards the bottom" },
  { id: "middle", label: "Bigger in the middle" },
];

// ---------- small geometry helpers ----------

export function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function ringPerimeter(r) {
  let p = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    p += Math.hypot(x1 - x0, y1 - y0);
  }
  return p;
}

// Drop a repeated closing point, and make the ring's signed area positive.
export function normalise(r) {
  let ring = r.slice();
  const [a, b] = [ring[0], ring[ring.length - 1]];
  if (ring.length > 1 && a[0] === b[0] && a[1] === b[1]) ring.pop();
  if (ringArea(ring) < 0) ring.reverse();
  return ring;
}

const centroid = (r) => {
  let x = 0, y = 0;
  for (const p of r) {
    x += p[0];
    y += p[1];
  }
  return [x / r.length, y / r.length];
};

const scaleRing = (r, k, [cx, cy]) => r.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

// Shrink a convex ring (positive area) by d on every side, or null if it
// vanishes. Done as the intersection of the inward-shifted edge half-planes,
// so short edges simply disappear instead of turning the shape inside out.
function insetConvex(ring, d) {
  let out = ring;
  const n = ring.length;
  for (let i = 0; i < n && out.length >= 3; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-9) continue;
    const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
    // Left normal points inside for a positive-area ring.
    const px = x0 - dy * d, py = y0 + dx * d;
    const side = ([x, y]) => dx * (y - py) - dy * (x - px); // >= 0 is inside
    const next = [];
    for (let k = 0; k < out.length; k++) {
      const a = out[k], b = out[(k + 1) % out.length];
      const sa = side(a), sb = side(b);
      if (sa >= 0) next.push(a);
      if ((sa >= 0) !== (sb >= 0)) {
        const t = sa / (sa - sb);
        next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out = next;
  }
  return out.length >= 3 && ringArea(out) > 0.5 ? out : null;
}

// Keep the part of a convex ring on the near side of the bisector between p and q.
function clipHalfPlane(ring, p, q) {
  const nx = q[0] - p[0], ny = q[1] - p[1];
  const c = (nx * (p[0] + q[0])) / 2 + (ny * (p[1] + q[1])) / 2;
  const side = ([x, y]) => nx * x + ny * y - c; // <= 0 is p's side
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const sa = side(a), sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const polygonRing = (cx, cy, r, n, rot = 0) =>
  Array.from({ length: n }, (_, k) => {
    const a = rot + (k * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

// ---------- tilings ----------
// Each returns { convex: rings to inset, fixed: rings already sized }.

function cellsFor(kind, area, s, bar, rnd) {
  const cx = (area.x0 + area.x1) / 2, cy = (area.y0 + area.y1) / 2;
  const halfW = (area.x1 - area.x0) / 2 + s * 2, halfH = (area.y1 - area.y0) / 2 + s * 2;
  const convex = [], fixed = [];
  const nx = (step) => Math.ceil(halfW / step) + 1;
  const ny = (step) => Math.ceil(halfH / step) + 1;

  switch (kind) {
    case "honeycomb": {
      const R = s / Math.sqrt(3), dy = 1.5 * R;
      for (let j = -ny(dy); j <= ny(dy); j++)
        for (let i = -nx(s); i <= nx(s); i++)
          convex.push(polygonRing(cx + i * s + (Math.abs(j) % 2 ? s / 2 : 0), cy + j * dy, R, 6, -Math.PI / 2));
      break;
    }
    case "triangles": {
      const h = (s * Math.sqrt(3)) / 2;
      for (let j = -ny(h); j <= ny(h); j++) {
        const yt = cy + j * h - h / 2, yb = yt + h;
        for (let k = -nx(s / 2); k <= nx(s / 2); k++) {
          const x = cx + (k * s) / 2;
          convex.push(
            (k + j) % 2 === 0
              ? [[x - s / 2, yb], [x + s / 2, yb], [x, yt]]
              : [[x - s / 2, yt], [x + s / 2, yt], [x, yb]]
          );
        }
      }
      break;
    }
    case "diamonds": {
      const w = s, h = s * 1.6;
      for (let j = -ny(h); j <= ny(h); j++)
        for (let i = -nx(w); i <= nx(w); i++)
          for (const [ox, oy] of [[0, 0], [w / 2, h / 2]]) {
            const x = cx + i * w + ox, y = cy + j * h + oy;
            convex.push([[x, y - h / 2], [x + w / 2, y], [x, y + h / 2], [x - w / 2, y]]);
          }
      break;
    }
    case "grid": {
      for (let j = -ny(s); j <= ny(s); j++)
        for (let i = -nx(s); i <= nx(s); i++) {
          const x = cx + i * s, y = cy + j * s;
          convex.push([[x - s / 2, y - s / 2], [x + s / 2, y - s / 2], [x + s / 2, y + s / 2], [x - s / 2, y + s / 2]]);
        }
      break;
    }
    case "bricks": {
      const w = s * 2, h = s;
      for (let j = -ny(h); j <= ny(h); j++)
        for (let i = -nx(w); i <= nx(w); i++) {
          const x = cx + i * w + (Math.abs(j) % 2 ? w / 2 : 0), y = cy + j * h;
          convex.push([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]]);
        }
      break;
    }
    case "circles": {
      const dy = (s * Math.sqrt(3)) / 2, r = (s - bar) / 2;
      if (r <= 0) break;
      const seg = Math.max(24, Math.min(72, Math.round(r * 6)));
      for (let j = -ny(dy); j <= ny(dy); j++)
        for (let i = -nx(s); i <= nx(s); i++)
          fixed.push(polygonRing(cx + i * s + (Math.abs(j) % 2 ? s / 2 : 0), cy + j * dy, r, seg));
      break;
    }
    case "stars": {
      // Eight-point stars (two overlapping squares) with a small square
      // between each four, as in Islamic tile work.
      const R = (s - bar) / 2, r = R * (Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8));
      if (R <= 0) break;
      const d = (s * Math.SQRT2) / 2 - R - bar; // half-diagonal of the small square
      for (let j = -ny(s); j <= ny(s); j++)
        for (let i = -nx(s); i <= nx(s); i++) {
          const x = cx + i * s, y = cy + j * s;
          fixed.push(Array.from({ length: 16 }, (_, k) => {
            const a = (k * Math.PI) / 8, rr = k % 2 ? r : R;
            return [x + rr * Math.cos(a), y + rr * Math.sin(a)];
          }));
          if (d > 1.2) fixed.push(polygonRing(x + s / 2, y + s / 2, d, 4, Math.PI / 4));
        }
      break;
    }
    case "chevron": {
      // Columns of parallelograms leaning alternately up and down.
      const w = s, h = s * 0.6, k = s * 0.6;
      for (let i = -nx(w); i <= nx(w); i++) {
        const even = Math.abs(i) % 2 === 0, xl = cx + i * w - w / 2;
        const slope = even ? k : -k, off = even ? 0 : k;
        for (let j = -ny(h) - 2; j <= ny(h) + 2; j++) {
          const y0 = cy + j * h + off - k / 2;
          convex.push([[xl, y0], [xl + w, y0 + slope], [xl + w, y0 + slope + h], [xl, y0 + h]]);
        }
      }
      break;
    }
    case "shattered": {
      // Voronoi cells around jittered grid points: random but evenly sized.
      const pts = new Map();
      const I = nx(s) + 1, J = ny(s) + 1;
      for (let j = -J; j <= J; j++)
        for (let i = -I; i <= I; i++)
          pts.set(`${i},${j}`, [cx + (i + (rnd() - 0.5) * 0.8) * s, cy + (j + (rnd() - 0.5) * 0.8) * s]);
      for (let j = -J + 1; j < J; j++)
        for (let i = -I + 1; i < I; i++) {
          const p = pts.get(`${i},${j}`);
          let cell = [[p[0] - 2 * s, p[1] - 2 * s], [p[0] + 2 * s, p[1] - 2 * s], [p[0] + 2 * s, p[1] + 2 * s], [p[0] - 2 * s, p[1] + 2 * s]];
          for (let dj = -2; dj <= 2; dj++)
            for (let di = -2; di <= 2; di++) {
              const q = (di || dj) && pts.get(`${i + di},${j + dj}`);
              if (q) cell = clipHalfPlane(cell, p, q);
            }
          if (cell.length >= 3) convex.push(cell);
        }
      break;
    }
  }
  return { convex, fixed };
}

// How much each cell is scaled for the fade, from its height in the area.
function fadeScale(fade, y, area) {
  const t = Math.min(1, Math.max(0, (y - area.y0) / Math.max(1, area.y1 - area.y0))); // 0 top, 1 bottom
  const MIN = 0.3;
  if (fade === "up") return 1 - (1 - MIN) * t;
  if (fade === "down") return MIN + (1 - MIN) * t;
  if (fade === "middle") return 1 - (1 - MIN) * Math.abs(2 * t - 1);
  return 1;
}

const insideRect = (ring, w) => ring.every(([x, y]) => x >= w.x0 - 1e-6 && x <= w.x1 + 1e-6 && y >= w.y0 - 1e-6 && y <= w.y1 + 1e-6);
const overlapsRect = (ring, w) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 > w.x0 && x0 < w.x1 && y1 > w.y0 && y0 < w.y1;
};
const rectRing = (w) => [[w.x0, w.y0], [w.x1, w.y0], [w.x1, w.y1], [w.x0, w.y1], [w.x0, w.y0]];

// Too small to cut cleanly, or so thin it would burn: drop it.
const tooSmall = (ring, minMm) => {
  const a = Math.abs(ringArea(ring));
  return a < minMm * minMm || (2 * a) / ringPerimeter(ring) < minMm / 2;
};

/**
 * Holes for one wall.
 * @param {string} kind     a PATTERNS id
 * @param {{x0,y0,x1,y1}} area  the region the pattern is centred and faded over
 * @param {Array<{x0,y0,x1,y1}>} windows  where holes may go (area minus any name plate)
 * @param {{cell:number, bar:number, fade:string, whole:boolean, seed:number, minHoleMm:number}} o
 * @returns {number[][][]} hole rings (positive area, not closed)
 */
export function patternHoles(kind, area, windows, o) {
  return patternLayers(kind, area, windows, o, [0])[0];
}

/**
 * The same holes at several sizes, for layered walls: layer i has every
 * hole shrunk by steps[i] mm (steps[0] should be 0, the biggest). Each cell
 * is kept or dropped by its biggest version, so the layers line up hole for
 * hole. A smaller version that gets too small to cut is left out of its layer.
 * @returns {number[][][][]} one list of hole rings per step
 */
export function patternLayers(kind, area, windows, o, steps = [0]) {
  if (kind === "none" || !windows.length) return steps.map(() => []);
  const s = Math.max(4, o.cell), bar = Math.max(0.5, o.bar);
  const { convex, fixed } = cellsFor(kind, area, s, bar, mulberry32(o.seed || 1));
  const makers = []; // step -> ring or null, one per cell
  for (const cell of convex) {
    const ring = normalise(cell);
    const c = centroid(ring);
    const k = fadeScale(o.fade, c[1], area);
    const scaled = k === 1 ? ring : scaleRing(ring, k, c);
    makers.push((step) => insetConvex(scaled, bar / 2 + step));
  }
  for (const cell of fixed) {
    const ring = normalise(cell);
    const c = centroid(ring);
    const k = fadeScale(o.fade, c[1], area);
    const scaled = k === 1 ? ring : scaleRing(ring, k, c);
    // Circles and stars: shrink about the centre so the edge moves in by about
    // `step` (exactly, for a circle).
    const inr = (2 * Math.abs(ringArea(scaled))) / ringPerimeter(scaled);
    makers.push((step) => {
      if (!step) return scaled;
      const f = 1 - step / inr;
      return f > 0.1 ? scaleRing(scaled, f, c) : null;
    });
  }

  const out = steps.map(() => []);
  for (const make of makers) {
    const big = make(steps[0]);
    if (!big) continue;
    const versions = steps.map((st, i) => (i === 0 ? big : make(st)));
    for (const w of windows) {
      if (insideRect(big, w)) {
        versions.forEach((r, i) => r && out[i].push(r));
        break;
      }
      if (o.whole || !overlapsRect(big, w)) continue;
      // Cut the shape off at the border, as if the pattern ran on underneath.
      versions.forEach((r, i) => {
        if (!r || !overlapsRect(r, w)) return;
        for (const poly of polygonClipping.intersection([[...r, r[0]]], [rectRing(w)])) out[i].push(normalise(poly[0]));
      });
    }
  }
  return out.map((list) => list.filter((r) => r.length >= 3 && !tooSmall(r, o.minHoleMm ?? 2)));
}
