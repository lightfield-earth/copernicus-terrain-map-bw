// Build the grayscale Copernicus GLO-30 terrain map style, for printing on paper that people draw on
// with colored pens (terrain-bw.lightfield.earth).
//
//   node build_style.mjs
//
// Reads base_style.json and applies the same visibility fixes as ../copernicus-terrain-map/build_style.mjs
// (bridges, airports, military areas, hiking trails, the hillshade), then converts every color to a
// neutral gray (GRAYSCALE below) and applies print overrides (PRINT below).
//
// The rule: the map has zero chroma. Any colored pixel on a scanned sheet is then ink, which is what
// lets the pen annotations be segmented off later. Keep it that way when tuning: grays only.
import fs from "node:fs";

const HERE = new URL(".", import.meta.url).pathname;
const base = JSON.parse(fs.readFileSync(HERE + "base_style.json", "utf8"));

const HILL_TILES = "https://tiles.lightfield.earth/hillshade_tiles_planet_z12_webp/{z}/{x}/{y}.webp";
const TRAIL_COLOR = "hsl(25, 36%, 34%)";   // warm brown; the base ships neon coral/blue/green for paths

const clone = (o) => JSON.parse(JSON.stringify(o));
const scaleW = (w, f) => typeof w === "number" ? w * f
  : (w && Array.isArray(w.stops) ? { base: w.base ?? 1, stops: w.stops.map(([z, v]) => [z, v * f]) } : w);

// Hiking trails (footways/paths/steps/cycleways/bridleways) are hidden in the base style. Match the
// path LINE layers by id (their *outline casings stay hidden).
const isTrailLine = (l) => /^(Footway|Cycleway|Steps|Bridleway) path$|^(Footway|Cycleway|Bridleway) bridge$|^Pedestrian road$/.test(l.id);
const isAirport = (l) => l["source-layer"] === "aeroway" || l["source-layer"] === "aerodrome_label";

// City streets: the base draws minor/service roads white with a ~0.5 px light-gray casing, which
// vanishes on the white canvas + hillshade. Keep them white but give them a warm-gray edge, and ease
// them in instead of popping. The data sets the fade starts: minor streets first exist in the z12
// tiles, service roads (driveways, parking aisles) in z13. Bridges get the same treatment as their roads.
const STREET_CASING = "hsl(30, 6%, 62%)";     // was hsl(0, 0%, 73%)
const STREET_EARLY  = "hsl(30, 5%, 74%)";     // single-line minor street before the casing appears
const CASING_EXTRA  = 0.4;                    // px added to casing width (~0.2 px more edge per side)
const fade = (z0, z1) => ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 1];

// Duplicate bay labels: besides one centered English-named point, the tiles carry dozens of coastal
// fragments of Hudson Bay ("Baie d'Hudson", 31 points) and Baffin Bay ("Baie de Baffin", 10), each
// with name:en set, so "Hudson Bay" was printed 8+ times. Verified across all z3 and z5 tiles: these
// are the only heavy repeats worldwide. Drop the fragments by their (French) name.
const DUPLICATE_WATER_NAMES = ["Baie d'Hudson", "Baie de Baffin"];
const STREET_FILL   = { "Minor road": 12, "Minor bridge": 12, "Service road": 13, "Service bridge": 13 };
const STREET_CASING_START = { "Minor road outline": 12.5, "Street bridge outline": 12.5,
                              "Service road link outline": 13, "Service bridge outline": 13 };

// Bridges: every regular road/rail layer filters OUT brunnel=bridge, and the base style hides every
// bridge layer, so each bridge segment left a gap (no road crossed the Mississippi at St. Louis,
// interchanges broke into fragments). Un-hide them, but take paint/layout/zoom range from the road
// layer each one continues ("twin"): the base bridge layers have their own minzooms, wider widths and
// solid-black casings that would bulge/outline or still gap at some zooms. Only the bridge filter is kept.
// Bridge layers without a twin (Link bridge*: no such class in OpenMapTiles; Path bridge outlines:
// trail casings stay hidden) are left as-is.
const BRIDGE_TWIN = {
  "Street bridge outline": "Minor road outline",
  "Highway link bridge": "Highway road link",
  "Highway link bridge outline": "Highway link outline",
  "Service bridge": "Service road",
  "Service bridge outline": "Service road link outline",
  "Major rail bridge": "Major rail",
  "Major rail bridge hatching": "Major rail hatching",
  "Footway bridge": "Footway path",
  "Cycleway bridge": "Cycleway path",
  "Bridleway bridge": "Bridleway path",
};
const baseById = Object.fromEntries(base.layers.map((l) => [l.id, l]));
const withBridge = (l) => {
  if (l["source-layer"] !== "transportation" || !/ bridge\b/.test(l.id)) return l;
  const twin = baseById[BRIDGE_TWIN[l.id] ?? l.id.replace(" bridge", " road")];
  if (!twin || twin.type !== l.type) return l;
  const { minzoom, maxzoom, ...own } = clone(l);
  // the base's Secondary + Tertiary bridge outlines share one secondary+tertiary filter; with twin
  // colors the later (gray tertiary) casing would paint over secondary bridges, so split them by class
  const cls = l.id.match(/^(Secondary|Tertiary) bridge outline$/)?.[1].toLowerCase();
  if (cls) own.filter = ["all", ["==", "brunnel", "bridge"], ["==", "class", cls]];
  return { ...own, ...(twin.minzoom !== undefined && { minzoom: twin.minzoom }),
           ...(twin.maxzoom !== undefined && { maxzoom: twin.maxzoom }),
           layout: { ...clone(twin.layout || {}), visibility: "visible" }, paint: clone(twin.paint || {}) };
};

// Hillshade sits directly above the background, beneath all landuse/water/roads/labels (the old
// notebook added it before "Residential", the first layer after the background). 256 px tiles as before.
const hillshade = { id: "hillshade", type: "raster", source: "hillshade",
  paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 } };

const out = [];
for (const l0 of base.layers.map(withBridge)) {
  if (l0.id === "Residential") out.push(hillshade);
  // Military bases: the base "Landuse pattern" hatch is too low-contrast over the terrain and can't be
  // recolored from the style. Emit a crisp red boundary at its slot instead (military only, so
  // cemetery/quarry stay omitted); a faint tint is added to the Military fill below.
  if (l0.id === "Landuse pattern") {
    out.push({ id: "Military boundary", type: "line", source: "openmaptiles", "source-layer": "landuse",
      // the tileset only emits the `military` landuse class from z9; fade in across z9->10.5
      minzoom: 8, filter: ["all", ["==", "class", "military"]],
      paint: { "line-color": "hsl(0, 60%, 48%)",
               "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0, 10.5, 0.8],
               "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 12, 1.8] } });
  }
  const l = clone(l0);
  l.paint = l.paint || {};
  // Trails: un-hide, recolor to a warm brown, thicken ~30%, and ease in from z13 (their names already
  // show from z11 via "Road labels", which otherwise float over an empty trail). Dash patterns are kept.
  if (isTrailLine(l)) {
    l.layout = { ...(l.layout || {}), visibility: "visible" };
    l.minzoom = Math.max(13, l.minzoom ?? 0);
    l.paint["line-color"] = TRAIL_COLOR;
    l.paint["line-opacity"] = 0.95;
    l.paint["line-width"] = scaleW(l.paint["line-width"] ?? 1, 1.3);
  }
  // City streets (see STREET_* above). Minor streets: one warm-gray line fading in over z12-12.6, turning
  // white as the casing fades in over z12.5-13.2. Service roads: fill and casing fade in over z13-13.6.
  if (l.id in STREET_FILL) {
    const z0 = STREET_FILL[l.id];
    l.paint["line-opacity"] = fade(z0, z0 + 0.6);
    if (z0 === 12) l.paint["line-color"] = { stops: [[12.5, STREET_EARLY], [13.2, "hsl(0, 0%, 100%)"]] };
  }
  if (l.id in STREET_CASING_START) {
    const z0 = STREET_CASING_START[l.id];
    l.minzoom = 12;
    l.paint["line-color"] = STREET_CASING;
    l.paint["line-opacity"] = fade(z0, z0 + (z0 === 13 ? 0.6 : 0.7));
    const stops = l.paint["line-width"].stops;
    l.paint["line-width"] = { base: l.paint["line-width"].base ?? 1.2,
      stops: [[12, 1.8 + CASING_EXTRA], ...stops.filter(([z]) => z > 12).map(([z, w]) => [z, w + CASING_EXTRA])] };
  }
  if (l["source-layer"] === "water_name") l.filter = [...l.filter, ["!in", "name", ...DUPLICATE_WATER_NAMES]];
  // Airports (runways, taxiways, aprons, airport labels) are hidden in the base style.
  if (isAirport(l)) l.layout = { ...(l.layout || {}), visibility: "visible" };
  // aeroway geometry exists from z10; the base gates it at z11. Pull to z10 and fade in to z10.8.
  if (l.id === "Runway" || l.id === "Taxiway" || l.id === "Aeroway") {
    l.minzoom = 10;
    l.paint[l.type === "fill" ? "fill-opacity" : "line-opacity"] = ["interpolate", ["linear"], ["zoom"], 10, 0, 10.8, 1];
  }
  // Military area fill: un-hide as a faint pink tint (not an opaque blanket over the hillshade),
  // paired with the "Military boundary" line above. Data-limited to z9+.
  if (l.id === "Military") {
    l.minzoom = 8;
    l.layout = { ...(l.layout || {}), visibility: "visible" };
    l.paint["fill-color"] = "hsl(0, 55%, 68%)";
    l.paint["fill-opacity"] = ["interpolate", ["linear"], ["zoom"], 9, 0, 10.5, 0.13];
  }
  out.push(l);
}
if (!out.includes(hillshade)) throw new Error('base style has no "Residential" layer to put the hillshade under');

// ---- GRAYSCALE ----
// Every paint color becomes the neutral gray of the same relative luminance (so the base style's light/
// dark hierarchy survives), alpha kept. Applied recursively, so zoom stops and expressions are covered.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function parseColor(str) {
  let m = str.match(/^hsla?\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\s*\)$/);
  if (m) {
    const [h, sat, l] = [+m[1] / 360, +m[2] / 100, +m[3] / 100];
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
    const hue = (t) => { t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3), m[4] === undefined ? 1 : +m[4]];
  }
  m = str.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] === undefined ? 1 : +m[4]];
  m = str.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).concat(1);
  return null;
}
function toGray(str) {
  const c = parseColor(str);
  if (!c) return str;
  const v = Math.round(255 * delin(0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])));
  return c[3] === 1 ? `rgb(${v}, ${v}, ${v})` : `rgba(${v}, ${v}, ${v}, ${c[3]})`;
}
const grayAll = (v) => typeof v === "string" ? toGray(v)
  : Array.isArray(v) ? v.map(grayAll)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, grayAll(x)])) : v;
for (const l of out) if (l.paint) l.paint = grayAll(l.paint);

// ---- PRINT ----
// Overrides for the printed sheet. Set on top of the grayscale pass, as grays (`g(L)` = L% lightness).
const g = (pct) => `hsl(0, 0%, ${pct}%)`;
const WATER_TEXT = { layout: { "text-font": ["Open Sans Italic", "Noto Sans Italic"] },
                     paint: { "text-color": g(32), "text-halo-color": g(100), "text-halo-width": 1.2 } };
const PLACE_TEXT = { paint: { "text-color": g(18), "text-halo-color": g(100), "text-halo-width": 1.5 } };
const STREAM = g(52);
const PRINT = {
  // Water: the base style has no water fill, only a pale shoreline, so lakes (Sooke Lake) vanished
  // into the white land. A light fill (added below) plus a darker shoreline; pens still read on it.
  "Water fill": { paint: { "fill-color": g(94) } },
  "Water": { paint: { "line-color": g(50), "line-width": 0.75 } },
  "River": { paint: { "line-color": STREAM } },
  "River intermittent": { paint: { "line-color": STREAM } },
  "Other waterway": { paint: { "line-color": STREAM, "line-width": { base: 1.2, stops: [[10, 0.5], [13, 0.9], [20, 4]] } } },
  "Other waterway intermittent": { paint: { "line-color": STREAM } },
  "River labels": WATER_TEXT, "Lakeline labels": WATER_TEXT,
  // Point water names (seas, straits, narrows) were a fixed 10 px, smaller than any bay or inlet name
  // ("Salish Sea" under "Saanich Inlet"). The tiles class seas and narrows alike as `strait`, with no size
  // attribute, so match the 12 px line labels rather than guess which is big.
  "Ocean labels": { layout: { ...WATER_TEXT.layout, "text-size": 12 }, paint: WATER_TEXT.paint },
  "City labels": PLACE_TEXT, "Town labels": PLACE_TEXT, "Village labels": PLACE_TEXT,
  "Other labels": { paint: { ...PLACE_TEXT.paint, "text-color": g(25) } },
  "National park labels": { paint: { "text-color": g(28), "text-halo-color": g(100), "text-halo-width": 1.2 } },
  "Military boundary": { paint: { "line-dasharray": [3, 2] } },
  "Dam": { paint: { "fill-color": g(72) } },   // the brown fill went to a dark blob (Sooke Lake's dams)
};
// Roads: the luminance mapping scrambled the class order (secondary's yellow came out darker than
// primary's orange) and every casing landed near the same mid-gray. Step them evenly by class instead:
// below z11 (no casings) one line per class, darkest for highways; from z11 a fill and casing pair.
// Widths stay the base style's. Minor/service streets keep their STREET_* treatment above.
const ROAD_GRAYS = {   // [single line below z11, fill, casing]
  Highway:   [45, 58, 28],
  Trunk:     [55, 70, 34],
  Primary:   [62, 82, 40],
  Secondary: [70, 92, 46],
  Tertiary:  [76, 100, 55],
};
for (const l of out) {
  const m = l.id.match(/^(Highway|Trunk|Primary|Secondary|Tertiary) (road|bridge|road link|link bridge|link)( outline)?$/);
  if (!m) continue;
  const [low, fill, casing] = ROAD_GRAYS[m[1]];
  l.paint["line-color"] = m[3] ? { stops: [[10.9, "rgba(255, 255, 255, 0)"], [11, g(casing)]] }
                               : { stops: [[10.9, g(low)], [11, g(fill)]] };
}

// Water fill sits just above the hillshade, so it also blanks the DEM's noise over open water.
out.splice(out.indexOf(hillshade) + 1, 0, { id: "Water fill", type: "fill", source: "openmaptiles",
  "source-layer": "water", filter: ["all", ["==", "$type", "Polygon"], ["!=", "brunnel", "tunnel"]], paint: {} });
for (const l of out) {
  const patch = PRINT[l.id];
  if (!patch) continue;
  l.paint = { ...l.paint, ...(patch.paint || {}) };
  l.layout = { ...(l.layout || {}), ...(patch.layout || {}) };
}

// Bake each vector source's TileJSON into the style (tiles/zoom range/bounds/attribution). With a
// `url`, MapLibre must fetch the TileJSON, which the tile server builds from the archive on B2,
// before it can request a single vector tile: ~300 ms on every cold page load.
async function inlineTileJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TileJSON ${url}: HTTP ${res.status}`);
  const tj = await res.json();
  return { type: "vector", tiles: tj.tiles, minzoom: tj.minzoom, maxzoom: tj.maxzoom, bounds: tj.bounds,
           ...(tj.attribution && { attribution: tj.attribution }) };
}
const vectorSources = {};
for (const [id, src] of Object.entries(base.sources)) {
  vectorSources[id] = src.type === "vector" && src.url ? await inlineTileJSON(src.url) : src;
}

// Hidden layers (visibility: none) draw nothing but are still parsed and downloaded; drop them
// from the built style (base_style.json keeps them for editing).
const isHidden = (l) => l.layout?.visibility === "none";

const style = {
  version: 8,
  name: "Copernicus GLO-30 Terrain (grayscale print)",
  metadata: { "lightfield:generated-by": "build_style.mjs" },
  // the grayscale sprite (make_sprite.py) is served next to the page; index.html makes this absolute
  glyphs: base.glyphs, sprite: "./sprites/sprite",
  sources: {
    ...vectorSources,
    hillshade: { type: "raster", tiles: [HILL_TILES], tileSize: 256, minzoom: 0, maxzoom: 12,
                 attribution: "Hillshade: Copernicus GLO-30" },
  },
  layers: out.filter((l) => !isHidden(l)),
};

// Enforce the zero-chroma rule: refuse to write a style with any non-neutral color in it.
const chromatic = JSON.stringify(style.layers).match(/(hsla?|rgba?)\([^)]*\)|#[0-9a-f]{6}\b/gi)?.filter((c) => {
  const p = parseColor(c);
  return !p || Math.max(...p.slice(0, 3)) - Math.min(...p.slice(0, 3)) > 1 / 255;
}) ?? [];
if (chromatic.length) throw new Error(`non-gray colors in style: ${[...new Set(chromatic)].join(", ")}`);

fs.writeFileSync(HERE + "style.json", JSON.stringify(style, null, 2) + "\n");
console.log(`style.json written: ${style.layers.length} layers, sources: ${Object.keys(style.sources).join(", ")}`);
