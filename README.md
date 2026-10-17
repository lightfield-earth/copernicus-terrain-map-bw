# copernicus-terrain-map-bw

A grayscale version of the Copernicus GLO-30 terrain map ([terrain.lightfield.earth](https://terrain.lightfield.earth)),
styled for printing on paper that workshop participants draw on with colored pens. Live at
https://terrain-bw.lightfield.earth.

This is the general-purpose grayscale style. Regional maps build on it by loading its `style.json`
rather than copying it: see `../victoria-terrain-map` (victoria.lightfield.earth). Keep `style.json`
and `sprites/` at these paths, since those maps depend on them.

The design rule: **the map has zero chroma.** Every color is a neutral gray, so on a scanned sheet any
colored pixel is ink, which is what lets pen annotations be segmented off and digitized later. The build
refuses to write a style containing a non-gray color. Participants should use colored pens, not black ones
or pencil.

The print pipeline (equal-area projection, sheet extent, print resolution) lives in
`../../printed-maps/`.

## Files

- `base_style.json`: the white-canvas OpenMapTiles basemap style, copied from `copernicus-terrain-map`
- `build_style.mjs`: builds `style.json`: the color map's visibility fixes (bridges, airports, military
  areas, trails, hillshade), then a grayscale pass (each color becomes the gray of equal luminance), then
  print overrides (`PRINT`: water fill, darker shorelines/streams/place labels, italic water labels)
- `style.json`: generated; do not edit by hand
- `make_sprite.py`: writes `sprites/`, a grayscale copy of the shared basemap sprite (road shields, icons)
- `index.html`: the page; loads `style.json` and adds the controls and logo
- `tile-retry.js`: retries failed tile, glyph and sprite requests so the map never keeps holes
- `vendor/maplibre-gl-4.7.1/`: self-hosted MapLibre GL JS

## Updating the style

```sh
node build_style.mjs          # rewrites style.json
python3 -m http.server 8011   # preview at http://127.0.0.1:8011
```

Tune for the zooms the print uses (about z10–13) and judge from a test print, not the screen: printers
darken mid-grays. Commit `build_style.mjs` and the regenerated `style.json` together, then push to `main`
(GitHub Pages serves the repo root).

Tiles are served from `tiles.lightfield.earth` (see the private `lightfield-earth/tiles-worker` repo).
