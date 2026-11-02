// Tiled patterns: Arabesque, Japanese, floral and more.
//
// Each tiling is a repeating set of regions that fill the plane exactly
// (a partition), defined around one lattice point. A hole is a region shrunk
// ("eroded") by half the bar width on every side, so the wood left between
// any two neighbouring holes is exactly the bar width. Regions are given as
// functions of the erosion distance d, so curved ones (made of circles) can be
// eroded exactly by changing their radii. Straight-edged ones use a mitred
// inset, falling back to a general erosion when a shape is too spiky for that.
// Millimetres, y down.

/* global polygonClipping */

const SQ3 = Math.sqrt(3);

// ---------- geometry helpers ----------

export function area(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function tidy(r) {
  const ring = r.slice();
  const [a, b] = [ring[0], ring[ring.length - 1]];
  if (ring.length > 1 && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) ring.pop();
  if (area(ring) < 0) ring.reverse();
  return ring;
}
const close = (r) => [...r, r[0]];
// A circle to cut away: drawn just outside the true circle (circumscribed),
// so polygon corners never make the wood thinner than the bar.
const cutDisc = (c, r, n = 72) => disc(c, r / Math.cos(Math.PI / n), n);
const disc = ([cx, cy], r, n = 72) =>
  r <= 0 ? null : Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k * 2 * Math.PI) / n), cy + r * Math.sin((k * 2 * Math.PI) / n)]);

// Polygon-clipping results to simple rings. A result with an island inside
// it would cut the island free, so those are left solid instead.
const rings = (multi) => multi.filter((poly) => poly.length === 1).map((poly) => tidy(poly[0])).filter((r) => r.length >= 3 && area(r) > 0.3);
const P = (r) => [close(r)];
// The clipping library can trip over exactly-touching edges. Try again with
// the cutting shapes nudged by a micron; failing that, leave the shape solid
// (never a broken page, and never a thin bar).
function safely(op, first, rest) {
  try {
    return rings(op(first, ...rest));
  } catch {
    try {
      const nudge = (poly) => poly.map((r) => r.map(([x, y]) => [x + 1.3e-3, y + 0.7e-3]));
      return rings(op(first, ...rest.map(nudge)));
    } catch (err) {
      console.warn("pattern shape skipped", err);
      return [];
    }
  }
}
const intersect = (...rs) => (rs.some((r) => !r) ? [] : safely(polygonClipping.intersection, P(rs[0]), rs.slice(1).map(P)));
const subtract = (r, ...cut) => (!r ? [] : safely(polygonClipping.difference, P(r), cut.filter(Boolean).map(P)));

// Does any pair of non-adjacent edges cross?
function selfCrosses(r) {
  const n = r.length;
  const cross = (a, b, c, d) => {
    const o = (p, q, s) => Math.sign((q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true;
    }
  return false;
}

// Mitred inset of a straight-edged ring, or null if an edge flips or the
// result crosses itself (the shape is too spiky for this distance).
function insetMiter(ring, d) {
  const n = ring.length;
  const lines = ring.map((p, i) => {
    const q = ring[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dx = (q[0] - p[0]) / len, dy = (q[1] - p[1]) / len;
    return { px: p[0] - dy * d, py: p[1] + dx * d, dx, dy };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
    out.push([a.px + a.dx * t, a.py + a.dy * t]);
  }
  for (let i = 0; i < n; i++) {
    const p = out[i], q = out[(i + 1) % n], l = lines[i];
    if ((q[0] - p[0]) * l.dx + (q[1] - p[1]) * l.dy <= 1e-6) return null;
  }
  return selfCrosses(out) || area(out) < 0.3 ? null : out;
}

// General erosion: the ring minus a band of half-width d along its edges.
function erodeGeneric(ring, d) {
  const n = ring.length, cut = [];
  const rv = d / Math.cos(Math.PI / 12); // circumscribed, so the bar is never thinner
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-9) continue;
    const nx = (-(q[1] - p[1]) / len) * d, ny = ((q[0] - p[0]) / len) * d;
    cut.push([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]);
    cut.push(disc(p, rv, 12));
  }
  return subtract(ring, ...cut);
}

const erode = (ring, d) => {
  const r = tidy(ring);
  const m = insetMiter(r, d);
  return m ? [m] : erodeGeneric(r, d);
};
// Straight-edged region: erode it on demand.
const straight = (ring) => (d) => erode(ring, d);

const regularPolygon = ([cx, cy], R, n, rot) =>
  Array.from({ length: n }, (_, k) => [cx + R * Math.cos(rot + (k * 2 * Math.PI) / n), cy + R * Math.sin(rot + (k * 2 * Math.PI) / n)]);
const star8 = ([cx, cy], R) => {
  const r = R * (Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8));
  return Array.from({ length: 16 }, (_, k) => {
    const a = (k * Math.PI) / 8, rr = k % 2 ? r : R;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
};
const add = ([a, b], [c, e]) => [a + c, b + e];
const mul = ([a, b], k) => [a * k, b * k];

// ---------- the tilings ----------
// Each returns { v1, v2, regions }: lattice vectors and region functions
// (d -> rings) around the lattice point at the origin. `s` is the shape size.

const TILINGS = {
  // ----- Arabesque -----
  // Eight-point stars with the crosses between them (khatam).
  starcross(s) {
    const q = s * 2, R = q / 2, r = R * (Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8));
    const star = star8([0, 0], R);
    // The cross is bounded by a quarter of each of the four stars round it
    // (built point by point: cutting it out would meet at touching tips).
    const cross = [];
    for (const [c, a0] of [[[q, 0], 180], [[q, q], 270], [[0, q], 360], [[0, 0], 90]])
      for (let k = 0; k < 4; k++) {
        const a = ((a0 - k * 22.5) * Math.PI) / 180, rr = k % 2 ? r : R;
        cross.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]);
      }
    return { v1: [q, 0], v2: [0, q], regions: [straight(star), straight(cross)] };
  },

  // Moroccan quatrefoils, with the four-pointed stars between them.
  quatrefoil(s) {
    const q = s * 1.8, E = q / 2, e = 0.42 * E, rho = 0.58 * E;
    const lobes = (c, r, mk = disc) => [[e, 0], [-e, 0], [0, e], [0, -e]].map((o) => mk(add(c, o), r, 48));
    const union = (rs) => {
      const ok = rs.filter(Boolean);
      return ok.length ? safely(polygonClipping.union, P(ok[0]), ok.slice(1).map(P)) : [];
    };
    return {
      v1: [q, 0],
      v2: [0, q],
      regions: [
        (d) => union(lobes([0, 0], rho - d)),
        (d) => subtract([[0, 0], [q, 0], [q, q], [0, q]], ...[[0, 0], [q, 0], [q, q], [0, q]].flatMap((c) => lobes(c, rho + d, cutDisc))),
      ],
    };
  },

  // Six-point stars in hexagons, with rhombi between them.
  hexstars(s) {
    const R = s * 1.1, ri = R / SQ3;
    const V = (k) => [R * Math.cos(-Math.PI / 2 + (k * Math.PI) / 3), R * Math.sin(-Math.PI / 2 + (k * Math.PI) / 3)];
    const star = [];
    for (let k = 0; k < 6; k++) {
      star.push(V(k));
      const a = -Math.PI / 2 + (k * Math.PI) / 3 + Math.PI / 6;
      star.push([ri * Math.cos(a), ri * Math.sin(a)]);
    }
    const regions = [straight(star)];
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3 + Math.PI / 6;
      const dir = [Math.cos(a), Math.sin(a)];
      const other = mul(dir, R * SQ3); // the neighbouring hexagon's centre
      regions.push(straight([V(k), mul(dir, ri), V(k + 1), add(other, mul(dir, -ri))]));
    }
    return { v1: [SQ3 * R, 0], v2: [(SQ3 * R) / 2, 1.5 * R], regions };
  },

  // ----- Japanese -----
  // Asanoha (hemp leaf): each triangle split into three at its centre.
  asanoha(s) {
    const a = s * 2, h = (a * SQ3) / 2;
    const regions = [];
    for (const tri of [[[0, 0], [a, 0], [a / 2, -h]], [[a, 0], [a / 2, -h], [1.5 * a, -h]]]) {
      const c = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
      for (let k = 0; k < 3; k++) regions.push(straight([tri[k], tri[(k + 1) % 3], c]));
    }
    return { v1: [a, 0], v2: [a / 2, -h], regions };
  },

  // Kagome (woven bamboo): hexagons and triangles.
  kagome(s) {
    const a = s * 0.8;
    return {
      v1: [2 * a, 0],
      v2: [a, a * SQ3],
      regions: [
        straight(regularPolygon([0, 0], a, 6, 0)),
        straight([[a, 0], [1.5 * a, (a * SQ3) / 2], [a / 2, (a * SQ3) / 2]]),
        straight([[a / 2, (a * SQ3) / 2], [0, a * SQ3], [-a / 2, (a * SQ3) / 2]]),
      ],
    };
  },

  // Seigaiha (blue ocean waves): overlapping scales of three rings each.
  seigaiha(s) {
    const R = s * 1.3, v1 = [2 * R, 0], v2 = [R, R / 2];
    // Scales in later (lower) rows sit in front.
    const front = [];
    for (let j = 1; j <= 4; j++)
      for (let i = -4; i <= 4; i++) {
        const c = add(mul(v1, i), mul(v2, j));
        if (Math.hypot(...c) < 2 * R - 1e-6) front.push(c);
      }
    const band = (rIn, rOut) => (d) =>
      subtract(disc([0, 0], rOut - d, 96), rIn > 0 ? cutDisc([0, 0], rIn + d, 96) : null, ...front.map((c) => cutDisc(c, R + d, 96)));
    return { v1, v2, regions: [band(0, R / 3), band(R / 3, (2 * R) / 3), band((2 * R) / 3, R)] };
  },

  // Shippo (seven treasures): overlapping circles; lenses and curved squares.
  shippo(s) {
    const q = s * 1.6, rho = q / Math.SQRT2;
    return {
      v1: [q, 0],
      v2: [0, q],
      regions: [
        (d) => intersect(disc([0, 0], rho - d), disc([q, 0], rho - d)),
        (d) => intersect(disc([0, 0], rho - d), disc([0, q], rho - d)),
        (d) => subtract(disc([0, 0], rho - d), ...[[q, 0], [-q, 0], [0, q], [0, -q]].map((c) => cutDisc(c, rho + d))),
      ],
    };
  },

  // ----- Floral -----
  // Four-petal flowers: the shippo lenses on their own.
  petals(s) {
    const t = TILINGS.shippo(s);
    return { ...t, regions: t.regions.slice(0, 2) };
  },

  // Six-petal rosettes from the flower of life.
  rosettes(s) {
    const a = s * 2, v1 = [a, 0], v2 = [a / 2, (a * SQ3) / 2];
    const petal = (q) => (d) => {
      const m = mul(q, 0.5), len = Math.hypot(...q), n = [-q[1] / len, q[0] / len];
      return intersect(disc(add(m, mul(n, (a * SQ3) / 2)), a - d), disc(add(m, mul(n, (-a * SQ3) / 2)), a - d));
    };
    return { v1, v2, regions: [petal(v1), petal(v2), petal(add(v2, mul(v1, -1)))] };
  },

  // ----- More -----
  // Tumbling blocks: each hexagon split into three rhombi.
  cubes(s) {
    const R = s * 0.9;
    const V = (k) => [R * Math.cos(-Math.PI / 2 + (k * Math.PI) / 3), R * Math.sin(-Math.PI / 2 + (k * Math.PI) / 3)];
    return {
      v1: [SQ3 * R, 0],
      v2: [(SQ3 * R) / 2, 1.5 * R],
      regions: [0, 2, 4].map((k) => straight([[0, 0], V(k), V(k + 1), V(k + 2)])),
    };
  },

  // Basketweave: pairs of slats, alternately across and upright.
  basketweave(s) {
    const q = s * 1.4, h = q / 2;
    const rect = (x, y, w, hh) => straight([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]]);
    return {
      v1: [2 * q, 0],
      v2: [0, 2 * q],
      regions: [
        rect(0, 0, q, h), rect(0, h, q, h), // across
        rect(q, 0, h, q), rect(q + h, 0, h, q), // upright
        rect(0, q, h, q), rect(h, q, h, q),
        rect(q, q, q, h), rect(q, q + h, q, h),
      ],
    };
  },

  // Waves: rows of wavy bricks, one wave long. The wavy edges are offset
  // along their normals, which is exact while the offset is less than the
  // tightest bend of the wave; beyond that the brick is left solid.
  waves(s) {
    const lam = s * 1.6, h = s * 0.9, A = h * 0.25, N = 32;
    const f = (x) => A * Math.sin((2 * Math.PI * x) / lam);
    const df = (x) => ((A * 2 * Math.PI) / lam) * Math.cos((2 * Math.PI * x) / lam);
    const tightest = (lam * lam) / (4 * Math.PI * Math.PI * A);
    const edge = (y0, d) =>
      Array.from({ length: N + 1 }, (_, k) => {
        const x = (lam * k) / N, g = df(x), n = Math.hypot(1, g);
        const dd = d + Math.sign(d) * 0.02; // a hair extra: the edge is sampled, not smooth
        return [x - (g * dd) / n, y0 + f(x) + dd / n];
      });
    return {
      v1: [lam, 0],
      v2: [0, h],
      regions: [
        (d) => {
          if (d >= tightest * 0.95) return [];
          const top = edge(0, d), bottom = edge(h, -d).reverse();
          // Trim the ends back by d too.
          return intersect(tidy([...top, ...bottom]), [[d, -h], [lam - d, -h], [lam - d, 2 * h], [d, 2 * h]]);
        },
      ],
    };
  },
};

// Daisies are built directly rather than as a partition: eight petals round
// a centre, sized so every gap is at least the bar.
function daisy(p, bar) {
  const r1 = (p - bar) / 2, rc = r1 * 0.22, r0 = rc + bar, N = 8, w = r1 * 0.3;
  return (d) => {
    const extra = d - bar / 2; // 0 for the outer holes, the 3D step for inner ones
    const out = [];
    const c = disc([0, 0], rc - extra, 32);
    if (c) out.push(c);
    const a0 = r0 + extra, a1 = r1 - extra;
    if (a1 - a0 < 1) return out;
    for (let k = 0; k < N; k++) {
      const ang = (k * 2 * Math.PI) / N, ux = Math.cos(ang), uy = Math.sin(ang);
      const left = [], right = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, r = a0 + (a1 - a0) * t;
        const hw = Math.max(0, Math.min(w * Math.sin(Math.PI * t), r * Math.sin(Math.PI / N) - bar / 2) - extra);
        left.push([r * ux - hw * uy, r * uy + hw * ux]);
        right.unshift([r * ux + hw * uy, r * uy - hw * ux]);
      }
      const ring = tidy([...left, ...right.slice(1, -1)]);
      if (area(ring) > 0.5) out.push(ring);
    }
    return out;
  };
}

export const TILING_IDS = [...Object.keys(TILINGS), "daisies"];

const cache = new Map();

/**
 * The tiling's regions, eroded by d, around one lattice point.
 * @returns {{v1, v2, shapes: number[][][][]}} shapes[i] = rings of region i
 */
export function tiling(kind, s, bar, d) {
  const key = `${kind}|${s}|${bar}|${d.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  let t;
  if (kind === "daisies") {
    const p = s * 2.3;
    t = { v1: [p, 0], v2: [p / 2, (p * SQ3) / 2], regions: [daisy(p, bar)] };
  } else t = TILINGS[kind](s);
  const res = { v1: t.v1, v2: t.v2, shapes: t.regions.map((f) => f(d)) };
  if (cache.size > 400) cache.clear();
  cache.set(key, res);
  return res;
}
