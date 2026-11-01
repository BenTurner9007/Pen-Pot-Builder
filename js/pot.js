// Builds a finger-jointed, open-topped pen pot: four walls standing on a base,
// with a geometric pattern cut through the walls and an optional engraved
// name. All units are millimetres; panel coordinates have y pointing down,
// with y = 0 at the rim.
//
// Joints. Each vertical corner is split into an odd number of equal fingers;
// the front and back own the even ones (so they hold all four corners), the
// sides the odd ones. Each bottom edge between the corners is split the same
// way; the base owns the even fingers and the walls the odd ones. Every
// notch is cut `fit` mm narrower at its inner ends, so a laser kerf can be
// allowed for.

/* global polygonClipping */
import { patternHoles, ringArea, ringPerimeter, normalise } from "./patterns.js";
import { nestPieces } from "./nest.js";
import { textRings } from "./text.js";

export const COLOURS = { cut: "#ff0000", engrave: "#000000", sheet: "#999999" };

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

// Odd number of equal fingers, each about `target` mm long.
function fingers(a, b, target) {
  const L = b - a;
  let n = Math.max(3, Math.round(L / target));
  if (n % 2 === 0) n += L / n > target ? 1 : -1;
  n = Math.max(3, n);
  return Array.from({ length: n }, (_, k) => [a + (k * L) / n, a + ((k + 1) * L) / n]);
}

// Narrow a notch at its inner ends (not where it meets the panel's edge).
const shrink = ([a, b], lo, hi, fit) => [a > lo + 1e-6 ? a + fit : a, b < hi - 1e-6 ? b - fit : b];

function outlineFrom(w, h, notches) {
  const result = polygonClipping.difference([rect(0, 0, w, h)], ...notches.map((r) => [r]));
  // Notches never meet, so the panel stays one piece with no holes.
  const biggest = result.reduce((a, p) => (Math.abs(ringArea(p[0])) > Math.abs(ringArea(a[0])) ? p : a));
  return normalise(biggest[0]);
}

/** A wall: `len` wide, H tall. `ownsCorners` is true for front and back. */
function wallOutline(len, H, T, ownsCorners, o) {
  const notches = [];
  fingers(0, H, o.fingerMm).forEach((seg, k) => {
    const owned = k % 2 === 0 ? ownsCorners : !ownsCorners;
    if (owned) return;
    const [a, b] = shrink(seg, 0, H, o.fit);
    notches.push(rect(0, a, T, b), rect(len - T, a, len, b));
  });
  fingers(T, len - T, o.fingerMm).forEach((seg, k) => {
    if (k % 2) return; // odd fingers are the wall's tabs
    const [a, b] = shrink(seg, 0, len, o.fit);
    notches.push(rect(a, H - T, b, H));
  });
  return outlineFrom(len, H, notches);
}

function baseOutline(W, D, T, o) {
  const notches = [
    rect(0, 0, T - o.fit, T), rect(W - T + o.fit, 0, W, T),
    rect(0, D - T, T - o.fit, D), rect(W - T + o.fit, D - T, W, D),
  ];
  fingers(T, W - T, o.fingerMm).forEach((seg, k) => {
    if (k % 2 === 0) return; // even fingers are the base's tabs
    const [a, b] = shrink(seg, 0, W, o.fit);
    notches.push(rect(a, 0, b, T), rect(a, D - T, b, D));
  });
  fingers(T, D - T, o.fingerMm).forEach((seg, k) => {
    if (k % 2 === 0) return;
    const [a, b] = shrink(seg, 0, D, o.fit);
    notches.push(rect(0, a, T, b), rect(W - T, a, W, b));
  });
  return outlineFrom(W, D, notches);
}

// Name text as filled outlines (even-odd rings merged into proper polygons).
function nameOutlines(text, area, sizeMm, position) {
  if (!text) return null;
  let size = sizeMm;
  let { width } = textRings(text, 0, 0, size, { weight: "bold" });
  const room = area.x1 - area.x0 - 4;
  if (width > room) {
    size *= room / width;
    width = room;
  }
  const bandH = size * 1.9;
  const y0 =
    position === "top" ? area.y0 : position === "bottom" ? area.y1 - bandH : (area.y0 + area.y1) / 2 - bandH / 2;
  const band = { x0: area.x0, x1: area.x1, y0, y1: y0 + bandH };
  const baseline = y0 + bandH / 2 + size * 0.36;
  const { rings } = textRings(text, (area.x0 + area.x1) / 2 - width / 2, baseline, size, { weight: "bold" });
  if (!rings.length) return null;
  const polys = polygonClipping.xor(...rings.map((r) => [[...r, r[0]]]));
  return { band, polys, size };
}

const pathD = (rings) => rings.map((r) => "M" + r.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("");

/**
 * @param {object} o
 *   w, d, h        outer size of the pot
 *   t              material thickness
 *   pattern, cell, bar, border, fade, whole, seed, sides ("all" | "fb" | "front")
 *   name, nameMm, namePos ("top" | "middle" | "bottom")
 *   fingerMm, fit, minHoleMm
 */
export function buildPot(o) {
  const T = o.t, W = o.w, D = o.d, H = o.h;
  const m = o.border;
  // Fingers no longer than the wood is thick would leave each wall's bottom
  // corner as a loose island, so keep them well over the thickness.
  o = { ...o, fingerMm: Math.max(o.fingerMm, T * 2.5) };
  const patterned = { front: true, back: o.sides !== "front", left: o.sides === "all", right: o.sides === "all" };

  const walls = [
    { id: "front", label: "Front", len: W, corners: true },
    { id: "back", label: "Back", len: W, corners: true },
    { id: "left", label: "Left side", len: D, corners: false },
    { id: "right", label: "Right side", len: D, corners: false },
  ];

  const pieces = walls.map((wall) => {
    const outline = wallOutline(wall.len, H, T, wall.corners, o);
    const area = { x0: T + m, x1: wall.len - T - m, y0: m, y1: H - T - m };
    const ok = area.x1 - area.x0 > 8 && area.y1 - area.y0 > 8;
    let windows = ok ? [area] : [];
    let engrave = [];
    if (wall.id === "front" && ok && o.name) {
      const n = nameOutlines(o.name, area, o.nameMm, o.namePos);
      if (n) {
        engrave = n.polys;
        // Keep a plain band of wood behind the name.
        const gap = o.bar / 2;
        windows = [
          { ...area, y1: n.band.y0 - gap },
          { ...area, y0: n.band.y1 + gap },
        ].filter((w) => w.y1 - w.y0 > 2);
      }
    }
    const holes = patterned[wall.id] && ok ? patternHoles(o.pattern, area, windows, o) : [];
    return { id: wall.id, label: wall.label, w: wall.len, h: H, outline, holes, engrave };
  });
  pieces.push({ id: "base", label: "Base", w: W, h: D, outline: baseOutline(W, D, T, o), holes: [], engrave: [] });

  for (const p of pieces) {
    p.area = Math.abs(ringArea(p.outline)) - p.holes.reduce((n, r) => n + Math.abs(ringArea(r)), 0);
    p.cutMm = ringPerimeter(p.outline) + p.holes.reduce((n, r) => n + ringPerimeter(r), 0);
    p.poly = [p.outline, ...p.holes];
  }

  const meta = {
    w: W, d: D, h: H, t: T,
    inner: { w: +(W - 2 * T).toFixed(1), d: +(D - 2 * T).toFixed(1), h: +(H - T).toFixed(1) },
    pattern: o.pattern,
    holes: pieces.reduce((n, p) => n + p.holes.length, 0),
    cutM: pieces.reduce((n, p) => n + p.cutMm, 0) / 1000,
    areaMm2: pieces.reduce((n, p) => n + p.area, 0),
  };

  // Everything the laser does to one piece, at the piece's own origin.
  const pieceContent = (p) =>
    `<path d="${pathD(p.poly)}" fill="none" stroke="${COLOURS.cut}" stroke-width="0.1" inkscape:label="Cut"/>\n` +
    (p.engrave.length
      ? `<path d="${p.engrave.map((poly) => pathD(poly)).join("")}" fill="${COLOURS.engrave}" fill-rule="evenodd" stroke="none" inkscape:label="Engrave"/>\n`
      : "");

  const copies = (qty) =>
    Array.from({ length: Math.max(1, qty) }, (_, i) =>
      pieces.map((p) => ({ ...p, id: qty > 1 ? `${i + 1}-${p.id}` : p.id, label: qty > 1 ? `Pot ${i + 1} ${p.label}` : p.label }))
    ).flat();

  /** Production SVG: every piece laid flat on cutting sheets. */
  const buildSvg = (sheet, qty = 1) => {
    const { sheets } = nestPieces(copies(qty), sheet);
    const GAP = 40, COLS = 2;
    const cellW = Math.max(...sheets.map((s) => s.w)), cellH = Math.max(...sheets.map((s) => s.h));
    let body = "";
    sheets.forEach((s, k) => {
      const sx = (k % COLS) * (cellW + GAP), sy = Math.floor(k / COLS) * (cellH + GAP);
      const title = `Sheet ${k + 1} of ${sheets.length}${s.oversize ? " (OVERSIZE)" : ""}`;
      body += `<g inkscape:groupmode="layer" inkscape:label="${title}" id="sheet-${k + 1}" transform="translate(${sx} ${sy})">\n`;
      body += `<rect width="${s.w}" height="${s.h}" fill="none" stroke="${COLOURS.sheet}" stroke-width="0.1" inkscape:label="Sheet edge (don't cut)"/>\n`;
      for (const pl of s.placements) {
        const t = `translate(${pl.tx.toFixed(2)} ${pl.ty.toFixed(2)})${pl.deg ? ` rotate(${pl.deg})` : ""}`;
        body += `<g id="piece-${pl.piece.id}" inkscape:label="${pl.piece.label}" transform="${t}">\n${pieceContent(pl.piece)}</g>\n`;
      }
      body += "</g>\n";
    });
    const totalW = Math.min(sheets.length, COLS) * (cellW + GAP) - GAP;
    const totalH = Math.ceil(sheets.length / COLS) * (cellH + GAP) - GAP;
    const metadata = {
      ...meta,
      quantity: qty,
      sheet,
      sheets: sheets.map((s, k) => ({ sheet: k + 1, w: s.w, h: s.h, oversize: s.oversize, pieces: s.placements.map((pl) => pl.piece.id) })),
      colours: { cut: "red", engrave: "black (name)", sheet: "grey (sheet edge, reference only)" },
    };
    const text =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">\n` +
      `<metadata>${JSON.stringify(metadata).replace(/</g, "\\u003c")}</metadata>\n${body}</svg>\n`;
    return { text, sheets: sheets.length, oversize: sheets.filter((s) => s.oversize).length };
  };

  /** Lay the pieces out on each stock sheet size and price it. */
  const buildCost = (stock, spacing, qty = 1) => {
    const all = copies(qty);
    const options = stock.map((s) => {
      const { sheets } = nestPieces(all, { w: s.w, h: s.h, marginMm: spacing.marginMm, gapMm: spacing.gapMm });
      const oversize = sheets.some((x) => x.oversize);
      return { ...s, sheets: sheets.length, oversize, cost: oversize ? null : sheets.length * s.price };
    });
    return { pieces: all.length, areaMm2: meta.areaMm2 * Math.max(1, qty), options };
  };

  return { pieces, meta, buildSvg, buildCost, preview: (opts) => previewSvg(pieces, T, opts) };
}

// Flat plan for the page: the five pieces, labelled, in wood colours.
function previewSvg(pieces, T, { wood = "#e9d6b2", edge = "#7a5634", ink = "#3a2414" } = {}) {
  const [front, back, left, right, base] = pieces;
  const G = 14, LABEL = 9;
  const row1 = [front, back, left, right];
  const placed = [];
  let x = 0;
  for (const p of row1) {
    placed.push({ p, x, y: 0 });
    x += p.w + G;
  }
  const row1H = Math.max(...row1.map((p) => p.h)) + LABEL + G;
  placed.push({ p: base, x: 0, y: row1H });
  const W = x - G, H = row1H + base.h + LABEL;
  const fs = Math.max(4, Math.min(7, W / 70));
  const parts = placed.map(
    ({ p, x, y }) =>
      `<g transform="translate(${x} ${y})">` +
      `<path d="${pathD(p.poly)}" fill="${wood}" fill-rule="evenodd" stroke="${edge}" stroke-width="0.5"/>` +
      (p.engrave.length ? `<path d="${p.engrave.map((poly) => pathD(poly)).join("")}" fill="${ink}" fill-rule="evenodd"/>` : "") +
      `<text x="${p.w / 2}" y="${p.h + LABEL - 1}" text-anchor="middle" font-size="${fs}" fill="currentColor">${p.label}</text></g>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${W + 8} ${H + 8}" role="img" aria-label="The five pieces laid flat">${parts.join("")}</svg>`;
}

/** A tiny swatch of a pattern for the picker. */
export function patternIcon(kind) {
  const area = { x0: 2, y0: 2, x1: 38, y1: 38 };
  const holes = patternHoles(kind, area, [area], { cell: 11, bar: 2, fade: "none", whole: false, seed: 3, minHoleMm: 0.8 });
  return `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><rect x="0.5" y="0.5" width="39" height="39" rx="5" fill="currentColor" opacity=".18"/><path d="${pathD(holes)}" fill="currentColor"/></svg>`;
}
