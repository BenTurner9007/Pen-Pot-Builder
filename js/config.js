// Business settings. Edit these before publishing the site.
export const CONFIG = {
  businessName: "TurnerMadeUK",
  tagline: "Laser-cut pen pots with geometric cut-outs",

  // Where requests are emailed when no form endpoint is set.
  orderEmail: "bturner9007@gmail.com",

  // Send requests straight from the page (no email app). Get a free access
  // key at https://web3forms.com by entering orderEmail; requests then arrive
  // there with the customer's address as reply-to. 250 a month free.
  web3formsKey: "",

  // Alternative: a Formspree endpoint, e.g. "https://formspree.io/f/abcdwxyz".
  // If neither is set, "Send request" opens the customer's email app instead.
  formEndpoint: "",

  // Etsy mode: the site becomes a design tool and the order is placed on
  // Etsy. "Send request" becomes "Save my design", which gives the customer
  // a code to paste into the Etsy personalisation box. Turn it on for
  // everyone here, or just for Etsy visitors by linking with ?etsy=1.
  etsy: {
    enabled: false,
    listingUrl: "",
  },

  // Pot sizes offered (outside dimensions, millimetres).
  sizes: [
    { id: "classic", label: "Classic", w: 80, d: 80, h: 100 },
    { id: "slim", label: "Slim", w: 65, d: 65, h: 110 },
    { id: "tall", label: "Tall", w: 75, d: 75, h: 130 },
    { id: "brush", label: "Brush pot", w: 95, d: 95, h: 120 },
    { id: "tidy", label: "Desk tidy", w: 150, d: 80, h: 90 },
  ],
  // Limits for custom sizes.
  minSize: 45,
  maxSize: 250,

  // Materials, thicknesses and sheet prices come from data/materials.json
  // (built from the Kitronik price list by scripts/build-materials.py).
  // Thickness pre-selected (nearest available is used).
  defaultThickness: 3,

  // Finger joints: target finger length, and how much each notch is cut
  // narrower at its inner ends to allow for the laser kerf (half your kerf,
  // e.g. 0.08 for a 0.16 mm kerf). 0 cuts exactly to size.
  fingerMm: 10,
  jointFitMm: 0,

  // Holes smaller than about this across are dropped (too small to cut cleanly).
  minHoleMm: 2,

  // SHA-256 of your private owner key. Open the site once with ?owner=<key>
  // and that browser will show "Download SVG" on every layout. Customers
  // never see the button. Change the key with: printf %s 'new-key' | sha256sum
  // (Same key as the contour map site.)
  ownerKeyHash: "7cadbf249dcd2fafe249b54ce1fa0ca11fd43127bdf1e75716da65d5fb92819c",

  // Your cutting sheets, for the laid-out SVG download (millimetres).
  sheet: { w: 600, h: 400, marginMm: 5, gapMm: 2 },

  // Most pots per request.
  maxQuantity: 50,
};
