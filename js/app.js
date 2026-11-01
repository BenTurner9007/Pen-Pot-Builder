import { CONFIG } from "./config.js";
import { PATTERNS, FADES } from "./patterns.js";
import { buildPot, patternIcon } from "./pot.js";
import { createViewer, FINISHES } from "./viewer3d.js";
import { loadFonts } from "./text.js";

const $ = (s) => document.querySelector(s);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- State (also round-tripped through the share link) ----------
const params = new URLSearchParams(location.search);
const num = (k, fallback) => (params.has(k) && Number.isFinite(+params.get(k)) ? +params.get(k) : fallback);
const first = CONFIG.sizes[0];
const state = {
  w: clamp(num("w", first.w), CONFIG.minSize, CONFIG.maxSize),
  d: clamp(num("d", first.d), CONFIG.minSize, CONFIG.maxSize),
  h: clamp(num("h", first.h), CONFIG.minSize, CONFIG.maxSize),
  material: params.get("mat") || "",
  thickness: num("t", CONFIG.defaultThickness || 3),
  pattern: PATTERNS.some((p) => p.id === params.get("pat")) ? params.get("pat") : "honeycomb",
  cell: clamp(num("cs", 14), 8, 40),
  bar: clamp(num("bw", 3), 2, 10),
  border: clamp(num("bd", 7), 3, 25),
  fade: FADES.some((f) => f.id === params.get("fade")) ? params.get("fade") : "none",
  whole: params.get("whole") !== "0",
  seed: num("seed", 1) | 0 || 1,
  sides: ["all", "fb", "front"].includes(params.get("sides")) ? params.get("sides") : "all",
  name: (params.get("txt") || "").slice(0, 28),
  nameMm: [6, 9, 13].includes(num("ts", 9)) ? num("ts", 9) : 9,
  namePos: ["top", "middle", "bottom"].includes(params.get("tp")) ? params.get("tp") : "middle",
  qty: clamp(num("q", 1) | 0, 1, CONFIG.maxQuantity),
};

// Plywood offered and its sheet prices (data/materials.json, built from the
// supplier's price list by scripts/build-materials.py).
const [MATERIALS] = await Promise.all([fetch("data/materials.json").then((r) => r.json()), loadFonts()]);
const materialByName = (name) => MATERIALS.materials.find((m) => m.name === name) || MATERIALS.materials[0];

// Etsy mode: design here, buy on Etsy (see CONFIG.etsy).
const ETSY = !!CONFIG.etsy?.enabled || params.get("etsy") === "1";

// ---------- Branding ----------
document.title = `${CONFIG.businessName} – Pen Pot Builder`;
$("#brand-name").textContent = CONFIG.businessName;
$("#brand-tagline").textContent = CONFIG.tagline;
$("#footer-name").textContent = CONFIG.businessName;

// ---------- Step 1: size and wood ----------
const sizeChips = $("#sizes");
sizeChips.innerHTML =
  CONFIG.sizes
    .map((s) => `<button type="button" class="chip" role="radio" data-id="${s.id}">${escapeHtml(s.label)} <span class="chip-dim">${s.w}×${s.d}×${s.h}</span></button>`)
    .join("") + `<button type="button" class="chip" role="radio" data-id="custom">Custom</button>`;
const sizeOf = () => CONFIG.sizes.find((s) => s.w === state.w && s.d === state.d && s.h === state.h);
let customOpen = !sizeOf();
function syncSize() {
  const preset = sizeOf();
  for (const b of sizeChips.querySelectorAll(".chip")) {
    b.setAttribute("aria-checked", b.dataset.id === (customOpen || !preset ? "custom" : preset.id));
  }
  $(".custom-size").hidden = !customOpen && !!preset;
  for (const k of ["w", "d", "h"]) {
    const el = $(`#size-${k}`);
    el.min = CONFIG.minSize;
    el.max = CONFIG.maxSize;
    if (document.activeElement !== el) el.value = state[k];
  }
}
sizeChips.addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (b.dataset.id === "custom") customOpen = true;
  else {
    customOpen = false;
    Object.assign(state, (({ w, d, h }) => ({ w, d, h }))(CONFIG.sizes.find((s) => s.id === b.dataset.id)));
  }
  syncSize();
  update();
});
for (const k of ["w", "d", "h"]) {
  $(`#size-${k}`).addEventListener("change", (e) => {
    state[k] = clamp(Math.round(+e.target.value || state[k]), CONFIG.minSize, CONFIG.maxSize);
    e.target.value = state[k];
    update();
  });
}

// Material and thickness: only the thicknesses the supplier sells in each material.
$("#material").innerHTML = MATERIALS.materials.map((m) => `<option>${escapeHtml(m.name)}</option>`).join("");
$("#material").value = materialByName(state.material).name;
function fillThicknesses() {
  const m = materialByName($("#material").value);
  const keep = +$("#thickness").value || state.thickness;
  $("#thickness").innerHTML = m.thicknesses.map((t) => `<option value="${t.mm}">${t.mm} mm</option>`).join("");
  // Keep the chosen thickness if this material has it, else the nearest.
  const best = m.thicknesses.reduce((a, t) => (Math.abs(t.mm - keep) < Math.abs(a.mm - keep) ? t : a));
  $("#thickness").value = String(best.mm);
}
fillThicknesses();
$("#material").addEventListener("change", () => {
  fillThicknesses();
  update();
});
$("#thickness").addEventListener("change", update);
const thickness = () => +$("#thickness").value;
const material = () => materialByName($("#material").value);

// ---------- Step 2: pattern ----------
$("#patterns").innerHTML = PATTERNS.map(
  (p) => `<button type="button" class="pattern-btn" role="radio" data-id="${p.id}" title="${p.label}">${patternIcon(p.id)}<span>${p.label}</span></button>`
).join("");
$("#patterns").addEventListener("click", (e) => {
  const b = e.target.closest(".pattern-btn");
  if (!b) return;
  state.pattern = b.dataset.id;
  update();
});
$("#fade").innerHTML = FADES.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");

const ranges = {
  cell: { el: "#cell", out: "#cell-out" },
  bar: { el: "#bar", out: "#bar-out" },
  border: { el: "#border", out: "#border-out" },
};
for (const [k, r] of Object.entries(ranges)) {
  const el = $(r.el);
  el.value = state[k];
  el.addEventListener("input", () => {
    state[k] = +el.value;
    $(r.out).textContent = `${state[k]} mm`;
    update();
  });
}
$("#fade").value = state.fade;
$("#fade").addEventListener("change", (e) => {
  state.fade = e.target.value;
  update();
});
$("#whole").checked = state.whole;
$("#whole").addEventListener("change", (e) => {
  state.whole = e.target.checked;
  update();
});
document.querySelectorAll('input[name="sides"]').forEach((r) => {
  r.checked = r.value === state.sides;
  r.addEventListener("change", () => {
    state.sides = r.value;
    update();
  });
});
$("#shuffle").addEventListener("click", () => {
  state.seed = (state.seed * 7919 + 13) % 99991 || 1;
  update();
});

// ---------- Step 3: name ----------
$("#name").value = state.name;
$("#name-size").value = String(state.nameMm);
$("#name-pos").value = state.namePos;
$("#name").addEventListener("input", (e) => {
  state.name = e.target.value.slice(0, 28);
  update();
});
$("#name-size").addEventListener("change", (e) => {
  state.nameMm = +e.target.value;
  update();
});
$("#name-pos").addEventListener("change", (e) => {
  state.namePos = e.target.value;
  update();
});

// ---------- Build and live preview ----------
let pot = null;
let viewer = null;
let rebuildTimer = 0;

function potOptions() {
  return {
    w: state.w, d: state.d, h: state.h, t: thickness(),
    pattern: state.pattern, cell: state.cell, bar: state.bar, border: state.border,
    fade: state.fade, whole: state.whole, seed: state.seed, sides: state.sides,
    name: state.name.trim(), nameMm: state.nameMm, namePos: state.namePos,
    fingerMm: CONFIG.fingerMm, fit: CONFIG.jointFitMm || 0, minHoleMm: CONFIG.minHoleMm,
  };
}

const look = () => FINISHES[material().look] || FINISHES.birch;

function rebuild() {
  try {
    pot = buildPot(potOptions());
  } catch (err) {
    console.error(err);
    setStatus("Couldn’t build that design. Try a different size or pattern.", "error");
    return;
  }
  setStatus("");
  const m = pot.meta;
  $("#stage-size").textContent = `${m.w} × ${m.d} × ${m.h} mm · ${m.t} mm ${material().name.toLowerCase()}`;
  $("#plan").innerHTML = pot.preview({ wood: look().top, edge: look().edge });
  try {
    viewer ??= createViewer($("#viewer"));
    viewer.show(pot, { material: material().look, pencils: $("#pencils").checked });
    if ($("#viewer").hidden) viewer.stop();
  } catch (err) {
    // No WebGL: the flat plan still works.
    console.error(err);
    $("#tab-3d").hidden = true;
    selectTab("plan");
  }
  renderNotes();
}

function update() {
  syncUi();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 60);
}

function syncUi() {
  syncSize();
  for (const b of document.querySelectorAll(".pattern-btn")) b.setAttribute("aria-checked", b.dataset.id === state.pattern);
  for (const [k, r] of Object.entries(ranges)) $(r.out).textContent = `${state[k]} mm`;
  const plain = state.pattern === "none";
  for (const id of ["#cell", "#bar", "#fade", "#whole"]) $(id).disabled = plain;
  $("#shuffle-row").hidden = state.pattern !== "shattered";
}

function renderNotes() {
  const m = pot.meta, t = m.t;
  const notes = [];
  if (t < 3) notes.push(`${t} mm wood is thin for a pen pot; 3 mm or more is much sturdier.`);
  if (m.inner.w < 35 || m.inner.d < 35) notes.push("Inside is quite narrow: pens will be a squeeze.");
  $("#size-note").textContent = notes.join(" ");
  $("#size-note").classList.toggle("warn", notes.length > 0);

  const pn = [];
  if (state.pattern !== "none") {
    if (state.bar < t) pn.push(`Wood between shapes is thinner than the ${t} mm wood, so the bars will be delicate.`);
    if (m.holes === 0) pn.push("No shapes fit: try a smaller shape size or border.");
    else if (m.holes > 600) pn.push(`${m.holes} cut-outs: lovely, but slow to cut.`);
  }
  $("#pattern-note").textContent = pn.join(" ");
  $("#pattern-note").classList.toggle("warn", pn.length > 0);

  const pat = PATTERNS.find((p) => p.id === state.pattern).label;
  const sides = { all: "all four sides", fb: "front and back", front: "the front" }[state.sides];
  $("#summary").innerHTML = [
    `<li><b>${m.w} × ${m.d} × ${m.h} mm</b> outside, ${m.inner.w} × ${m.inner.d} mm inside</li>`,
    `<li>${escapeHtml(material().name)}, ${t} mm</li>`,
    `<li>${state.pattern === "none" ? "Plain walls" : `${pat} on ${sides} (${m.holes} cut-outs)`}</li>`,
    ...(state.name.trim() ? [`<li>“${escapeHtml(state.name.trim())}” on the front</li>`] : []),
  ].join("");
}

function selectTab(which) {
  const is3d = which === "3d";
  $("#tab-3d").setAttribute("aria-selected", is3d);
  $("#tab-plan").setAttribute("aria-selected", !is3d);
  $("#viewer").hidden = !is3d;
  $("#plan").hidden = is3d;
  $("#stage-hint").hidden = !is3d;
  $(".stage-pencils").hidden = !is3d;
  if (is3d) viewer?.start();
  else viewer?.stop();
}
$("#tab-3d").addEventListener("click", () => selectTab("3d"));
$("#tab-plan").addEventListener("click", () => selectTab("plan"));
$("#pencils").addEventListener("change", rebuild);

function setStatus(text, kind = "") {
  $("#status").textContent = text;
  $("#status").className = `status ${kind}`;
}

// ---------- Share link ----------
const makeRef = () => "PP-" + Date.now().toString(36).toUpperCase().slice(-6);
const sharedRef = /^PP-[A-Z0-9]{1,8}$/.test(params.get("ref") || "") ? params.get("ref") : null;

function shareLink(ref) {
  const p = new URLSearchParams({
    ref,
    w: state.w, d: state.d, h: state.h,
    mat: $("#material").value, t: thickness(),
    pat: state.pattern, cs: state.cell, bw: state.bar, bd: state.border,
    fade: state.fade, whole: state.whole ? "1" : "0", sides: state.sides,
    ...(state.pattern === "shattered" ? { seed: state.seed } : {}),
    ...(state.name.trim() ? { txt: state.name.trim(), ts: state.nameMm, tp: state.namePos } : {}),
    ...(state.qty > 1 ? { q: state.qty } : {}),
  });
  return `${location.origin}${location.pathname}?${p}`;
}

// ---------- Step 4: the result dialog ----------
let lastResult = null;
// The design a shared link opened with keeps its reference until it is changed.
const openedWith = JSON.stringify(potOptions());

$("#generate").addEventListener("click", () => {
  clearTimeout(rebuildTimer);
  rebuild();
  if (!pot) return;
  const unchanged = JSON.stringify(potOptions()) === openedWith;
  const ref = (unchanged && sharedRef) || (lastResult && lastResult.key === JSON.stringify(potOptions()) ? lastResult.ref : makeRef());
  lastResult = { pot, ref, key: JSON.stringify(potOptions()), link: "" };
  lastResult.link = shareLink(ref);
  showResult();
});

function renderStats() {
  const m = lastResult.pot.meta;
  $("#scale-note").innerHTML =
    `<b>${m.w} × ${m.d} × ${m.h} mm</b> outside, <b>${m.inner.w} × ${m.inner.d} × ${m.inner.h} mm</b> inside. ` +
    `Five pieces of ${m.t} mm ${escapeHtml(material().name.toLowerCase())} that slot together with finger joints.`;
  $("#stats").innerHTML = [
    `<li>Reference <b>${lastResult.ref}</b></li>`,
    `<li>Cut-outs <b>${m.holes}</b></li>`,
    `<li>Wood <b>${(m.areaMm2 / 100).toFixed(0)} cm²</b></li>`,
    `<li>Cut length <b>${m.cutM.toFixed(1)} m</b></li>`,
  ].join("");
}

function showResult() {
  $("#preview").innerHTML = lastResult.pot.preview({ wood: look().top, edge: look().edge });
  $("#quantity").value = state.qty;
  $("#quantity").max = CONFIG.maxQuantity;
  $("#send-request").disabled = false;
  $("#send-request").textContent = ETSY ? "Save my design" : "Send request";
  $("#etsy-done").hidden = true;
  renderStats();
  $("#order-status").textContent = "";
  $("#owner-note").textContent = "";
  $("#cost-table").innerHTML = "";
  $("#result").showModal();
}

$("#quantity").addEventListener("change", (e) => {
  state.qty = clamp(Math.round(+e.target.value) || 1, 1, CONFIG.maxQuantity);
  e.target.value = state.qty;
  $("#cost-table").innerHTML = "";
  if (lastResult) lastResult.link = shareLink(lastResult.ref);
});

// ---------- Owner mode: only the shop owner's browser can download the SVG ----------
// Same storage key and hash as the contour map site, so one key works for both.
const OWNER_STORE = "tm-owner-key-hash";
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function setOwnerMode(on) {
  for (const el of document.querySelectorAll(".owner-only")) el.hidden = !on;
  $("#owner-badge").hidden = !on;
}
async function initOwnerMode() {
  const store = {
    get: () => { try { return localStorage.getItem(OWNER_STORE); } catch { return null; } },
    set: (v) => { try { v ? localStorage.setItem(OWNER_STORE, v) : localStorage.removeItem(OWNER_STORE); } catch { /* private mode */ } },
  };
  let hash = store.get();
  const key = params.get("owner");
  if (key && crypto.subtle) {
    hash = await sha256(key);
    params.delete("owner");
    history.replaceState(null, "", `${location.pathname}${params.size ? "?" + params : ""}`);
  }
  const ok = !!CONFIG.ownerKeyHash && hash === CONFIG.ownerKeyHash;
  store.set(ok ? hash : null);
  setOwnerMode(ok);
  $("#owner-exit").addEventListener("click", () => {
    store.set(null);
    setOwnerMode(false);
  });
}
initOwnerMode();

$("#download").addEventListener("click", () => {
  const btn = $("#download");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Laying out pieces…";
  // Let the button update before the work starts.
  setTimeout(() => {
    try {
      const { text, sheets, oversize } = lastResult.pot.buildSvg(CONFIG.sheet, state.qty);
      const blob = new Blob([text], { type: "image/svg+xml" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: `pen-pot-${lastResult.ref}${state.qty > 1 ? `-x${state.qty}` : ""}.svg`,
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const s = CONFIG.sheet;
      $("#owner-note").textContent =
        `${state.qty} pot${state.qty > 1 ? "s" : ""} on ${sheets} cutting sheet${sheets > 1 ? "s" : ""} of ${s.w} × ${s.h} mm` +
        (oversize ? ` – ${oversize} piece${oversize > 1 ? "s are" : " is"} bigger than a sheet (marked OVERSIZE).` : ".");
    } catch (err) {
      console.error(err);
      $("#owner-note").textContent = "Couldn’t build the SVG – please try again.";
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }, 50);
});

$("#copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lastResult.link);
    $("#copy-link").textContent = "Link copied ✓";
  } catch {
    prompt("Copy this link:", lastResult.link);
  }
  setTimeout(() => ($("#copy-link").textContent = "Copy share link"), 2000);
});

// ---------- Owner: material cost ----------
// Lays the pieces out on every sheet size the supplier sells in the chosen
// material and thickness, and prices each option.
const money = (v) => `£${v.toFixed(2)}`;
$("#cost-btn").addEventListener("click", () => {
  const btn = $("#cost-btn");
  btn.disabled = true;
  btn.textContent = "Laying out pieces…";
  setTimeout(() => {
    try {
      const m = material();
      const t = m.thicknesses.find((x) => x.mm === thickness()) || m.thicknesses[0];
      const qty = state.qty;
      const { pieces, areaMm2, options } = lastResult.pot.buildCost(t.sheets, CONFIG.sheet, qty);
      const priced = options.filter((x) => x.cost != null);
      const cheapest = priced.reduce((a, x) => (!a || x.cost < a.cost ? x : a), null);
      // Area actually used, priced at the cheapest rate per m² on offer.
      const perM2 = Math.min(...t.sheets.map((s) => s.price / ((s.w * s.h) / 1e6)));
      const usedCost = (areaMm2 / 1e6) * perM2;
      const vat = 1 + MATERIALS.vat;
      $("#cost-table").innerHTML =
        `<p class="cost-title">${escapeHtml(m.name)}, ${t.mm} mm · ${qty > 1 ? `${qty} pots, ` : ""}${pieces} pieces, ${(areaMm2 / 1e6).toFixed(3)} m² of wood</p>` +
        `<table><thead><tr><th>Sheet</th><th>Code</th><th>Each</th><th>Sheets</th><th>Cost ex VAT</th><th>inc VAT</th></tr></thead><tbody>` +
        options
          .map((x) =>
            `<tr class="${x === cheapest ? "best" : ""}"><td>${x.w} × ${x.h}</td><td><a href="${x.url}" target="_blank" rel="noopener">${x.code}</a></td><td>${money(x.price)}</td>` +
            (x.cost == null ? `<td colspan="3">a piece is bigger than this sheet</td>` : `<td>${x.sheets}</td><td>${money(x.cost)}</td><td>${money(x.cost * vat)}</td>`) +
            `</tr>`
          )
          .join("") +
        `</tbody></table>` +
        (cheapest
          ? `<p class="cost-note">Cheapest: <b>${cheapest.sheets} × ${cheapest.w} × ${cheapest.h}</b> for <b>${money(cheapest.cost)}</b> ex VAT (${money(cheapest.cost * vat)} inc VAT)` +
            `${qty > 1 ? `, ${money(cheapest.cost / qty)} a pot` : ""}. ` +
            `The wood the pieces actually use is worth about ${money(usedCost)} ex VAT, if you count offcuts as reusable. ` +
            `Cut length ${(lastResult.pot.meta.cutM * qty).toFixed(1)} m. ${MATERIALS.supplier} prices, 1+ quantity.</p>`
          : `<p class="cost-note">No ${MATERIALS.supplier} sheet in this material is big enough for the largest piece.</p>`);
    } catch (err) {
      console.error(err);
      $("#cost-table").innerHTML = `<p class="status error">Couldn’t work out the cost – please try again.</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Work out material cost";
    }
  }, 50);
});

// ---------- Sending the request ----------
function designSummary(fd) {
  const m = lastResult.pot.meta;
  const pat = PATTERNS.find((p) => p.id === state.pattern).label;
  const sides = { all: "all four sides", fb: "front and back", front: "front only" }[state.sides];
  return [
    `Reference: ${lastResult.ref}`,
    `Quantity: ${state.qty}`,
    `Size: ${m.w} × ${m.d} × ${m.h} mm outside (${m.inner.w} × ${m.inner.d} × ${m.inner.h} mm inside)`,
    `Wood: ${material().name}, ${m.t} mm`,
    state.pattern === "none"
      ? "Pattern: plain walls"
      : `Pattern: ${pat}, ${state.cell} mm shapes, ${state.bar} mm between, ${state.border} mm border, ` +
        `${FADES.find((f) => f.id === state.fade).label.toLowerCase()}, ${state.whole ? "whole shapes" : "runs to border"}, on ${sides} (${m.holes} cut-outs)`,
    ...(state.name.trim() ? [`Name: "${state.name.trim()}" (${$("#name-size").selectedOptions[0].text.toLowerCase()}, ${state.namePos})`] : []),
    `Open the design: ${lastResult.link}`,
    "",
    `Notes: ${fd.notes || "-"}`,
  ].join("\n");
}

$("#order").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  state.qty = clamp(Math.round(+fd.quantity) || 1, 1, CONFIG.maxQuantity);
  lastResult.link = shareLink(lastResult.ref);
  const summary = designSummary(fd);
  const status = $("#order-status");
  const subject = `Pen pot request ${lastResult.ref}`;
  if (ETSY) return saveForEtsy(fd, summary);

  // Send from the page when a form service is set up (Web3Forms or Formspree).
  const service = CONFIG.web3formsKey
    ? {
        url: "https://api.web3forms.com/submit",
        body: {
          access_key: CONFIG.web3formsKey,
          subject,
          from_name: `${CONFIG.businessName} website`,
          name: fd.name,
          email: fd.email,
          replyto: fd.email,
          message: summary,
          botcheck: !!fd.botcheck,
        },
      }
    : CONFIG.formEndpoint
      ? { url: CONFIG.formEndpoint, body: { name: fd.name, email: fd.email, _subject: subject, message: summary } }
      : null;
  if (service) {
    const btn = $("#send-request");
    btn.disabled = true;
    status.textContent = "Sending…";
    status.className = "status";
    try {
      const res = await fetch(service.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(service.body),
      });
      const reply = await res.json().catch(() => ({}));
      if (!res.ok || reply.success === false) throw new Error(reply.message || res.status);
      status.textContent = `Thanks ${fd.name}! We’ve got your design (${lastResult.ref}) and will be in touch soon.`;
      status.className = "status ok";
      btn.textContent = "Request sent ✓"; // stays disabled so it isn't sent twice
    } catch {
      status.textContent = `Couldn’t send just now. Please try again, or copy the share link and email it to ${CONFIG.orderEmail}.`;
      status.className = "status error";
      btn.disabled = false;
    }
    return;
  }

  const body = `Hi,\n\nI'd like a laser-cut pen pot of this design.\n\n${summary}\n\nName: ${fd.name}\nEmail: ${fd.email}\n`;
  location.href = `mailto:${CONFIG.orderEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  status.textContent = "Your email app should open with your design link and details filled in – just press send.";
  status.className = "status ok";
});

// ---------- Etsy mode ----------
// The order and payment happen on Etsy; this only saves the design and gives
// the customer a code to paste into the Etsy personalisation box.
let etsyCopyText = "";

if (ETSY) {
  $("#order-title").textContent = "Order on Etsy";
  $("#etsy-intro").hidden = false;
  $("#email-field").hidden = true;
  $("#email-field input").required = false;
  $("#name-field input").required = false;
  $("#name-field span").textContent = "Your name (optional, helps us match your order)";
  $(".qty").hidden = true; // quantity is chosen on Etsy
  $("#send-request").textContent = "Save my design";
  const buy = $("#etsy-buy");
  if (CONFIG.etsy?.listingUrl) buy.href = CONFIG.etsy.listingUrl;
  else buy.hidden = true;
}

async function saveForEtsy(fd, summary) {
  const btn = $("#send-request");
  const status = $("#order-status");
  const ref = lastResult.ref;
  btn.disabled = true;
  status.className = "status";
  let saved = false;
  // With a form service, the design is emailed to the shop under its code,
  // so the short code is all the customer needs to paste into Etsy.
  if (CONFIG.web3formsKey || CONFIG.formEndpoint) {
    status.textContent = "Saving your design…";
    const message = `${summary}\n\nEtsy mode: the customer will order and pay on Etsy, quoting ${ref}.`;
    const body = CONFIG.web3formsKey
      ? { access_key: CONFIG.web3formsKey, subject: `Etsy design ${ref}`, from_name: `${CONFIG.businessName} website`, name: fd.name || "Etsy customer", message, botcheck: !!fd.botcheck }
      : { name: fd.name || "Etsy customer", _subject: `Etsy design ${ref}`, message };
    try {
      const res = await fetch(CONFIG.web3formsKey ? "https://api.web3forms.com/submit" : CONFIG.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const reply = await res.json().catch(() => ({}));
      saved = res.ok && reply.success !== false;
    } catch {
      saved = false;
    }
  }
  // Without one (or if saving failed), the customer pastes the full design link.
  etsyCopyText = saved ? ref : `${ref} ${lastResult.link}`;
  $("#etsy-code").textContent = ref;
  $("#etsy-copy").textContent = saved ? "Copy code" : "Copy code and design link";
  $("#etsy-help").textContent = saved
    ? "Paste this code into the personalisation box when you buy on Etsy. We have your design saved under it."
    : "Paste this into the personalisation box when you buy on Etsy. It includes your design link, so we can make exactly what you designed." +
      (etsyCopyText.length > 1000 ? " If it doesn't fit, send it to us in an Etsy message instead." : "");
  status.textContent = "";
  $("#etsy-done").hidden = false;
  btn.textContent = "Design saved ✓";
}

$("#etsy-copy").addEventListener("click", async () => {
  const btn = $("#etsy-copy");
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(etsyCopyText);
    btn.textContent = "Copied ✓";
  } catch {
    prompt("Copy this:", etsyCopyText);
  }
  setTimeout(() => (btn.textContent = label), 2000);
});

// ---------- Go ----------
syncUi();
rebuild();
