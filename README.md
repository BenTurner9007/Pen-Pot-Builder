# Pen Pot Builder

A website where customers design a laser-cut wooden pen pot with geometric
cut-outs and send it to you to make. It is the sister site of the Contour Map
Designer (`laser-website`), with the same look, the same owner-only SVG
download, the same Kitronik material costing and the same request form and Etsy mode.

**What customers do**

1. **Pick a size and wood**: Classic 80 × 80 × 100, Slim, Tall, Brush pot,
   Desk tidy, or custom (45–250 mm, outside dimensions). Wood and thickness
   come from the Kitronik price list, because the finger joints are drawn for
   the real thickness. Then **Single wall** or **Double skin (pot in a pot)**:
   a second pot glued inside the first, its cut-outs a little smaller (the
   **3D step**, 1–5 mm) so every shape gets a stepped, layered edge.
2. **Choose a pattern**: Honeycomb, Triangles, Diamonds, Squares, Bricks,
   Circles, Stars (Islamic eight-point stars), Chevron, Shattered (random
   Voronoi cells, with a Shuffle button) or Plain. Settings:
   - shape size and **wood between** shapes (the narrowest bar of wood)
   - plain border round each wall
   - size across the pot: even, bigger towards the top, the bottom or the middle
   - which sides: all four, front and back, or front only
   - whole shapes only, or let the pattern run to the border
3. **Add a name** (optional): engraved on a plain band across the front,
   in three sizes and three positions. Long names shrink to fit.
4. **Preview and send**: a live **3D model** (real thickness, wood finish,
   pencils and a ruler for scale) and the **flat pieces**, then a share link
   and a request form with a quantity.

Customers cannot download the SVG; they send you the design and you download it.

## What you receive

- A **share link** (reference `PP-XXXXXX`) that reopens the exact design.
- A **production SVG** at real size (mm), downloaded by you in owner mode:
  - the five pieces (front, back, two sides, base) **laid out on cutting
    sheets** (600 × 400 mm by default), one Inkscape layer per sheet, each
    piece in its own labelled group. For a quantity above 1, every pot's
    pieces are nested together (`Pot 3 Front` …)
  - **red** = cut, **black** = engrave (name), **grey** = sheet edge (don't cut)
  - text is already outlines (Noto Sans Bold), so no fonts are needed
  - order details in the SVG `<metadata>`
- **Work out material cost** (owner mode): lays the pieces out on every sheet
  size Kitronik sells in the chosen wood and thickness and prices each, ex and
  inc VAT, cheapest highlighted, with the value of the wood actually used, the
  cost per pot and the total cut length.

### Double skin

The outer pot is the normal finger-jointed pot (four walls and a base). The
inner pot is four more walls with finger-jointed corners and **no base**: it
stands on the outer pot's base, flush with the rim, and is glued in. It is
`innerGapMm` (0.4 mm in total) smaller than the space inside, so it slides in.
Its holes are made from the same shapes as the outer holes, shrunk by the
step, so they line up exactly. Where a shrunk hole would be too small to cut
it is left solid, which shows as plain wood behind that outer hole. The name
is engraved on the outer front only. A double pot is 9 pieces; the SVG labels
them `Outer front`, `Inner front` and so on, and the inside is 4 × the
thickness narrower than the outside.

### How the joints work

Each vertical corner is split into an odd number of fingers: the front and
back own the corners, the sides slot between. The base has fingers on all four
edges that show through the bottom of the walls. Fingers are about 10 mm long
(`fingerMm`) and never shorter than 2.5 × the wood thickness. The geometry has
been checked: every point of every joint belongs to exactly one piece.

If your joints come out loose, set `jointFitMm` in `js/config.js` to half your
laser kerf (e.g. `0.08` for a 0.16 mm kerf). Cut a test pot first.

## Owner mode (downloading the SVG)

Exactly as on the contour site, and **the same key works on both** (same hash,
same browser storage):

1. Open the site once with `?owner=<your key>`. An "Owner mode" badge appears.
2. Open any design link a customer sends, click **Create my layout**, then
   **Download SVG (owner)** and **Work out material cost**.
3. Click **turn off** in the badge to leave owner mode.

Only a SHA-256 hash of the key is stored (`ownerKeyHash`). Change it with
`printf %s 'your-new-key' | sha256sum`. This keeps the button away from
customers; it is not strong security.

## Etsy mode

Link to the site with `?etsy=1` (or set `etsy.enabled`). "Send request"
becomes **Save my design**, giving a code like `PP-XMIVUY` to paste into the
Etsy personalisation box. Same as the contour site.

## Setting it up

Edit [`js/config.js`](js/config.js): `businessName`, `tagline`, `orderEmail`,
`web3formsKey` or `formEndpoint`, `etsy`, `sizes`, `minSize`/`maxSize`,
`defaultThickness`, `fingerMm`, `jointFitMm`, `minHoleMm`, `ownerKeyHash`,
`sheet`, `maxQuantity`.

### Materials and prices

`data/materials.json` is the same file as the contour site, built from
Kitronik's price list. To update:

```
pip install openpyxl
python3 scripts/build-materials.py path/to/new.xlsx
```

## Publishing on GitHub Pages

Plain HTML, CSS and JavaScript, no build step. **Settings → Pages**, deploy
from this branch, `/ (root)`. To try locally: `python3 -m http.server` and
open <http://localhost:8000> (opening `index.html` from disk won't work).

## Project layout

```
index.html            page structure
css/style.css         styling (shared look with the contour site)
js/config.js          business settings
js/app.js             form, live preview, share link, owner mode, costing, requests
js/pot.js             pieces, finger joints, name plate, SVG output
js/patterns.js        the geometric patterns
js/viewer3d.js        3D preview (three.js)
js/nest.js            packs pieces onto cutting sheets (from the contour site)
js/text.js            text to outlines (from the contour site)
data/materials.json   plywood, thicknesses and sheet prices
fonts/engrave/        Noto Sans (SIL OFL)
vendor/               three.js r169, polygon-clipping 0.15.7, opentype.js 1.3.4
```
