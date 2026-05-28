// sun-body-silhouette.js — Anatomical body-region picker for sun sessions.

import { escapeAttr } from './utils.js';
import { buildBody, buildLandmarks, buildDetails } from './silhouette-paths.js';

// Anatomical regions for the silhouette picker. Limbs split into front/back
// so front-of-legs and back-of-legs are independent — matters for
// realistic photobiology (e.g. sunbathing face-up exposes only front).
// Fractions sum to ~0.95 — the missing ~0.05 is scalp + anatomical seams
// (clavicle / shoulder transitions) that the picker doesn't expose as
// individually selectable regions.
export const BODY_REGIONS = [
  // `face` / `thyroid-throat` are kept as front-side keys (no `-front`
  // suffix) for backward-compat with sessions saved before the back-side
  // split. New back-side keys are explicit `*-back`.
  { key: 'face',                label: 'Face',                  fraction: 0.04 },
  { key: 'face-back',           label: 'Back of head',          fraction: 0.02 },
  { key: 'thyroid-throat',      label: 'Thyroid / throat',      fraction: 0.01 },
  { key: 'thyroid-throat-back', label: 'Nape',                  fraction: 0.01 },
  { key: 'breast-chest',        label: 'Upper chest',           fraction: 0.06 },
  { key: 'arms-front',          label: 'Arms (front)',          fraction: 0.05 },
  { key: 'arms-back',           label: 'Arms (back)',           fraction: 0.05 },
  { key: 'torso-front',         label: 'Torso (front)',         fraction: 0.13 },
  { key: 'torso-back',          label: 'Torso (back)',          fraction: 0.13 },
  { key: 'abdomen',             label: 'Abdomen',               fraction: 0.07 },
  { key: 'genitals',            label: 'Genitals',              fraction: 0.01 },
  { key: 'glutes',              label: 'Glutes',                fraction: 0.05 },
  { key: 'legs-front',          label: 'Legs (front)',          fraction: 0.15 },
  { key: 'legs-back',           label: 'Legs (back)',           fraction: 0.15 },
  { key: 'feet-front',          label: 'Feet (front)',          fraction: 0.01 },
  { key: 'feet-back',           label: 'Feet (back)',           fraction: 0.01 },
];

// Resolve the active profile's sex; defaults to 'male' if unset so we
// don't render an empty picker for first-time users.
function _activeProfileSex() {
  try {
    const id = (typeof window !== 'undefined' && window.getActiveProfileId) ? window.getActiveProfileId() : null;
    if (!id) return 'male';
    const profiles = (typeof window !== 'undefined' && window.getProfiles) ? window.getProfiles() : [];
    const p = profiles.find(p => p.id === id);
    const s = (p?.sex || '').toString().toLowerCase();
    if (s.startsWith('f')) return 'female';
    return 'male';
  } catch (e) {
    return 'male';
  }
}

// Path geometry — anatomically grouped tap targets. Each entry returns the
// SVG `d=` for that region. Coordinates are within a 100×200 viewBox.
// Region paths are NOT filled by default; the silhouette body provides the
// visual outline, regions only color when selected.
//
// Front and back arms / legs use the same SVG geometry but are mapped to
// distinct keys (arms-front vs arms-back, legs-front vs legs-back) so the
// two silhouette views can be toggled independently — clicking front-legs
// no longer also selects the back of the legs.
function _silhouetteRegionPaths(sex) {
  // Tap zones aligned to the er.svg figures (per-sex because female and
  // male silhouettes differ in shoulder/torso width). Coordinates in the
  // picker's 100×210 viewBox. The figure occupies a different x-range per
  // sex: female ≈ 22–78 (cellWScaled ~56), male ≈ 16–84 (~68). Per-region
  // bounds were measured from the tinted render at typical body landmarks
  // (face top, jawline, shoulders, ribcage, navel, iliac crest, knees).
  //
  // The parametric clipPath (from silhouette-paths.js) still hugs the gold
  // wash to a body shape, so these rects only need to cover roughly the
  // right anatomical zone — the clipPath does the visual cleanup.

  const isF = sex === 'female';

  // Per-sex band widths. Outer = outermost body silhouette (arms outline);
  // shoulder/chest = upper torso width; waist = narrowest mid-body;
  // hip = pelvis/glutes; legs split at center.
  const outerL = isF ? 22 : 16;     // outer arm-line, left
  const outerR = isF ? 78 : 84;     // outer arm-line, right
  const shoulderL = isF ? 32 : 27;  // shoulder cap inside the arm
  const shoulderR = isF ? 68 : 73;
  const torsoL = isF ? 36 : 30;
  const torsoR = isF ? 64 : 70;
  const waistL = isF ? 38 : 32;
  const waistR = isF ? 62 : 68;
  const hipL = isF ? 34 : 28;
  const hipR = isF ? 66 : 72;
  const center = 50;

  // Vertical landmarks measured directly off the rendered Shutterstock
  // licensed vector via the picker's 100×220 viewBox (overlaid grid).
  // Values supplied by the user reading the on-figure grid:
  //   face   6–31, throat 31–39, breast 42–66, torso 67–90,
  //   genitals 107–114, legs 115–189.
  // The 3-unit gap (39→42) is the clavicle/upper-chest band; intentionally
  // unselected to keep breast-chest tight on the bust band.
  const yHairTop  = 6;
  const yChinTop  = 31;     // face ends / throat begins
  const yShldrTop = 39;     // throat ends
  const yChestTop = 42;     // breast / pec band begins
  const yChestBot = 66;     // under-bust / under-pec
  const yNavel    = 90;     // torso ends / abdomen begins
  const yPubicTop = 107;    // abdomen ends / genitals begin
  const yCrotch   = 114;    // genitals end / legs begin
  const yAnkle    = 189;    // legs end
  const ySole     = 200;

  // Region templates as `M x1 y1 L x2 y1 L x2 y2 L x1 y2 Z`.
  const rect = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;

  // Arms — both sides of figure. Upper arm is narrow (shoulder cap to
  // under-chest), lower arm/wrist widens because hands rest on the hips
  // in this pose, so the hand bump pokes inward of the upper arm line.
  const armsPath =
    // Upper arm (shoulder cap straight down to under-chest)
    rect(outerL, yShldrTop, shoulderL, yChestBot) + ' ' +
    rect(shoulderR, yShldrTop, outerR, yChestBot) + ' ' +
    // Lower arm + hand-on-hip — extends inward to body edge
    rect(outerL, yChestBot, torsoL, yCrotch) + ' ' +
    rect(torsoR, yChestBot, outerR, yCrotch);

  // Legs — split at center, crotch to ankle.
  const legsPath =
    rect(hipL, yCrotch, center, yAnkle) + ' ' +
    rect(center, yCrotch, hipR, yAnkle);

  // Feet — strip across the bottom of each foot. Independent front/back
  // keys so selecting tops-of-feet doesn't also select heels/soles.
  const feetPath =
    rect(hipL, yAnkle, center, ySole) + ' ' +
    rect(center, yAnkle, hipR, ySole);

  const front = {
    // Head sits centered around x=50 on both sexes; tighten so the face
    // rect doesn't extend past the visible head into hair / shoulder.
    'face':           rect(40, yHairTop, 60, yChinTop),
    'thyroid-throat': rect(waistL + 4, yChinTop, waistR - 4, yShldrTop),
    // Breast / chest sits on the bust / pec band only — clavicle area
    // (yShldrTop..yChestTop) intentionally unselected so the highlight
    // doesn't drift above the breasts.
    'breast-chest':   rect(shoulderL, yChestTop, shoulderR, yChestBot),
    'arms-front':     armsPath,
    'torso-front':    rect(torsoL, yChestBot, torsoR, yNavel),
    'abdomen':        rect(waistL, yNavel, waistR, yPubicTop),
    'genitals':       rect(waistL + 4, yPubicTop, waistR - 4, yCrotch),
    'legs-front':     legsPath,
    'feet-front':     feetPath,
  };
  const back = {
    'face-back':           rect(40, yHairTop, 60, yChinTop),
    'thyroid-throat-back': rect(waistL + 4, yChinTop, waistR - 4, yShldrTop),
    'arms-back':           armsPath,
    'torso-back':          rect(shoulderL, yShldrTop, shoulderR, yPubicTop),
    'glutes':              rect(hipL, yPubicTop, hipR, yCrotch),
    'legs-back':           legsPath,
    'feet-back':           feetPath,
  };
  return { front, back };
}

// Backdrop renderer flag. When true, renders the licensed stock-illustration
// figure (`er.svg` — vector 6-figure F/M × front/side/back, background-
// stripped from a Shutterstock EPS) instead of the parametric Klimt-fresco
// silhouette in `silhouette-paths.js`.
//
// Kept as a flag rather than deleted because the parametric path is the
// fallback if the licensed asset ever needs to be pulled (license dispute,
// runtime fetch failure, or future fork wanting a fully-self-contained
// build). It's not a prototype anymore — it's the production renderer with
// a tested escape hatch. ~660 LoC of dead-on-paper-but-load-bearing code in
// silhouette-paths.js is the price of keeping that escape hatch warm.
const STOCK_FIGURE_PROTOTYPE = true;

// Source SVG grid (viewBox 3082.45 × 4890.47, 3 cols × 2 rows:
// front/side/back × F/M). Per-cell width/height because the female
// silhouettes are narrower than the male ones — a uniform cellW would
// either crop or undersize. Coordinates measured from the rendered SVG
// via connected-component bbox + ~15-unit padding.
// Picker viewBox is 100×220 per view; we letterbox the image cell to fit.
//
// `mask` is a raster pre-render of `src`. Browsers render true-vector SVG
// inside <mask>/<image> elements without honoring transparent backgrounds
// (treats them as opaque), so the mask needs to be raster for the
// figure-shape clipping to actually clip.
//
// The color-coded region map for hit-testing + selection-overlay is
// generated at runtime from `src` itself (`_loadRegionMap`), so there
// is no static `regionMap` PNG. Generating from the live SVG ensures
// region boundaries align 1:1 with the actual rendered figure pixels.
const STOCK_IMG = {
  src: '/er.svg',
  mask: '/er-mask.png',
  cells: {
    'female-front': { sx: 232, sy: 200, cw: 542, ch: 2089 },
    'female-side':  { sx: 1275, sy: 214, cw: 358, ch: 2076 },
    'female-back':  { sx: 2241, sy: 207, cw: 550, ch: 2120 },
    'male-front':   { sx: 162, sy: 2623, cw: 672, ch: 2108 },
    'male-side':    { sx: 1319, sy: 2653, cw: 373, ch: 2061 },
    'male-back':    { sx: 2135, sy: 2611, cw: 683, ch: 2127 },
  },
  imgW: 3082.45,
  imgH: 4890.47,
};

// Region color palette — MUST match scripts/gen-regionmap.py exactly.
// One unique RGB triple per region key; transparent means "no region".
const REGION_COLOR_RGB = {
  'face':                [255,   0,   0],
  'face-back':           [192,   0,  64],
  'thyroid-throat':      [  0, 255,   0],
  'thyroid-throat-back': [  0, 192,  64],
  'breast-chest':        [  0,   0, 255],
  'arms-front':          [255, 255,   0],
  'torso-front':         [255,   0, 255],
  'abdomen':             [  0, 255, 255],
  'genitals':            [255, 128,   0],
  'legs-front':          [128,   0, 255],
  'feet-front':          [255,   0, 128],
  'arms-back':           [128, 255,   0],
  'torso-back':          [  0, 128, 255],
  'glutes':              [128, 128, 255],
  'legs-back':           [255, 128, 255],
  'feet-back':           [128, 255, 255],
};
const _REGION_BY_RGB_INT = (() => {
  const m = new Map();
  for (const [key, [r, g, b]] of Object.entries(REGION_COLOR_RGB)) {
    m.set((r << 16) | (g << 8) | b, key);
  }
  return m;
})();

// Region map loader — generates the color-coded region map at runtime by
// rasterizing er.svg into a canvas and walking each row of the resulting
// alpha mask. This guarantees the region boundaries align 1:1 with the
// actual figure pixels (the `scripts/gen-regionmap.py` offline approach
// drifted by ~5 picker units because Chrome rendered the headless mask
// at a slightly different baseline than the in-app `<image>` element).
// Cached on first call; ~50–80ms one-shot cost on session-log open.
let _regionMapData = null;
let _regionMapPromise = null;
const _REGION_BAND_LANDMARKS = {
  yChinTop: 31, yShldrTop: 39, yChestTop: 42, yChestBot: 66,
  yNavel: 90, yPubicTop: 107, yCrotch: 114, yAnkle: 189, ySole: 200,
};

function _paintRegionMapCell(data, out, W, H, key, cell) {
  const [, view] = key.split('-');
  const isFront = view === 'front';
  const VB_W = STOCK_IMG.imgW, VB_H = STOCK_IMG.imgH;
  const L = _REGION_BAND_LANDMARKS;
  const COLORS = REGION_COLOR_RGB;
  const pad = 30;
  const y0 = Math.max(0, Math.round(cell.sy * H / VB_H) - pad);
  const y1 = Math.min(H, Math.round((cell.sy + cell.ch) * H / VB_H) + pad);
  const x0 = Math.max(0, Math.round(cell.sx * W / VB_W) - pad);
  const x1 = Math.min(W, Math.round((cell.sx + cell.cw) * W / VB_W) + pad);
  for (let my = y0; my < y1; my++) {
    let bodyLeft = -1, bodyRight = -1;
    for (let x = x0; x < x1; x++) {
      if (data[((my * W) + x) * 4 + 3] > 30) {
        if (bodyLeft < 0) bodyLeft = x;
        bodyRight = x;
      }
    }
    if (bodyLeft < 0) continue;
    const bodyWidth = bodyRight - bodyLeft + 1;
    const py = (my * VB_H / H - cell.sy) * 210 / cell.ch;
    if (py < -2 || py > 215) continue;
    const inC = (x, frac) => {
      const e = bodyWidth * frac;
      return bodyLeft + e <= x && x <= bodyRight - e;
    };
    let bandPaint;
    if      (py < L.yChinTop)  bandPaint = () => isFront ? 'face' : 'face-back';
    else if (py < L.yShldrTop) bandPaint = () => isFront ? 'thyroid-throat' : 'thyroid-throat-back';
    else if (py < L.yChestTop) bandPaint = (x) => inC(x, 0.40) ? (isFront ? 'breast-chest' : 'torso-back') : (isFront ? 'arms-front' : 'arms-back');
    else if (py < L.yChestBot) bandPaint = (x) => inC(x, 0.11) ? (isFront ? 'breast-chest' : 'torso-back') : (isFront ? 'arms-front' : 'arms-back');
    else if (py < L.yNavel)    bandPaint = isFront ? (x) => inC(x, 0.11) ? 'torso-front' : 'arms-front'
                                                   : (x) => inC(x, 0.10) ? 'torso-back' : 'arms-back';
    else if (py < L.yPubicTop) bandPaint = isFront ? (x) => inC(x, 0.13) ? 'abdomen' : 'arms-front'
                                                   : (x) => inC(x, 0.12) ? 'torso-back' : 'arms-back';
    else if (py < L.yCrotch)   bandPaint = isFront ? (x) => inC(x, 0.18) ? 'genitals' : 'arms-front'
                                                   : () => 'glutes';
    else if (py < L.yAnkle)    bandPaint = () => isFront ? 'legs-front' : 'legs-back';
    else if (py <= L.ySole + 8) bandPaint = () => isFront ? 'feet-front' : 'feet-back';
    else continue;
    for (let x = bodyLeft; x <= bodyRight; x++) {
      if (data[((my * W) + x) * 4 + 3] <= 30) continue;
      const region = bandPaint(x);
      if (!region) continue;
      const col = COLORS[region];
      const idx = (my * W + x) * 4;
      out[idx] = col[0]; out[idx + 1] = col[1]; out[idx + 2] = col[2]; out[idx + 3] = 255;
    }
  }
}

function _loadRegionMap() {
  if (_regionMapData) return Promise.resolve(_regionMapData);
  if (_regionMapPromise) return _regionMapPromise;
  _regionMapPromise = (async () => {
    const img = new Image();
    img.src = STOCK_IMG.src;
    await img.decode();
    // Render er.svg at 1700×2698 (same resolution as the legacy mask) so
    // body widths in pixels remain dense enough for thin-arm bands. The
    // viewBox aspect ratio is preserved; canvas dimensions are arbitrary.
    const W = 1700, H = 2698;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const src = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    for (const [key, cell] of Object.entries(STOCK_IMG.cells)) {
      // Skip side views — they aren't selectable in the picker.
      if (/-side$/.test(key)) continue;
      _paintRegionMapCell(src.data, out.data, W, H, key, cell);
    }
    _regionMapData = out;
    return _regionMapData;
  })();
  return _regionMapPromise;
}

// Sample the region map at source-viewBox coords (sx, sy) → region key or null.
function _regionAtSource(src_x, src_y) {
  if (!_regionMapData) return null;
  const px = Math.round(src_x * (_regionMapData.width / STOCK_IMG.imgW));
  const py = Math.round(src_y * (_regionMapData.height / STOCK_IMG.imgH));
  if (px < 0 || px >= _regionMapData.width || py < 0 || py >= _regionMapData.height) return null;
  const idx = (py * _regionMapData.width + px) * 4;
  const r = _regionMapData.data[idx];
  const g = _regionMapData.data[idx + 1];
  const b = _regionMapData.data[idx + 2];
  const a = _regionMapData.data[idx + 3];
  if (a < 30) return null;
  return _REGION_BY_RGB_INT.get((r << 16) | (g << 8) | b) || null;
}

// Generate a selection-overlay PNG blob URL — pixels of selected regions
// recolored as semi-transparent accent blue, everything else transparent.
// Caches by serialized selected set so repeated renders don't regenerate.
// Returns null when nothing selected, or the previous cached overlay while
// async generation is pending (caller re-renders once the fresh overlay is
// ready).
//
// Uses blob: URLs rather than data: URLs because Chrome silently drops
// large data URLs inside SVG <image> elements (they appear in the DOM
// but render as nothing).
let _overlayCache = { key: '', url: '' };
let _overlayPending = false;
let _overlayQueued = null;

function _selectedKey(selected) {
  return Array.from(selected).sort().join('|');
}

function _renderSelectionOverlay(selected, onReady) {
  if (!_regionMapData || !selected || selected.size === 0) return null;
  const key = _selectedKey(selected);
  if (key === _overlayCache.key) return _overlayCache.url;
  // When a fresh overlay is mid-encode, keep the previous cached URL on
  // screen and remember the latest selected set. Mobile canvas/blob
  // encoding can lag behind rapid taps; queueing the newest set avoids
  // dispatching a stale overlay-ready render that makes regions appear
  // to deselect before the current overlay catches up.
  if (_overlayPending) {
    _overlayQueued = { selected: new Set(selected), onReady };
    return _overlayCache.url || null;
  }
  const selectedInts = new Set();
  for (const reg of selected) {
    const col = REGION_COLOR_RGB[reg];
    if (col) selectedInts.add((col[0] << 16) | (col[1] << 8) | col[2]);
  }
  if (selectedInts.size === 0) return null;
  const inData = _regionMapData.data;
  const W = _regionMapData.width;
  const H = _regionMapData.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(W, H);
  const outData = out.data;
  for (let i = 0; i < inData.length; i += 4) {
    if (inData[i + 3] < 30) continue;
    const ci = (inData[i] << 16) | (inData[i + 1] << 8) | inData[i + 2];
    if (selectedInts.has(ci)) {
      outData[i]     = 79;
      outData[i + 1] = 140;
      outData[i + 2] = 255;
      outData[i + 3] = 200;
    }
  }
  ctx.putImageData(out, 0, 0);
  _overlayPending = true;
  c.toBlob((blob) => {
    _overlayPending = false;
    if (!blob) {
      _overlayQueued = null;
      return;
    }
    if (_overlayCache.url) URL.revokeObjectURL(_overlayCache.url);
    _overlayCache = { key, url: URL.createObjectURL(blob) };
    const queued = _overlayQueued;
    _overlayQueued = null;
    if (queued && _selectedKey(queued.selected) !== key) {
      _renderSelectionOverlay(queued.selected, queued.onReady);
      return;
    }
    if (onReady) onReady(_overlayCache.url);
  }, 'image/png');
  // Same idea as the _overlayPending branch above: return the previous
  // URL so the SVG renders with stale selections until the new blob is
  // ready. Without this the just-tapped region's previously-selected
  // neighbors briefly disappear.
  return _overlayCache.url || null;
}

// Render the two-view silhouette picker as an SVG. `selected` is a Set of
// region keys; each region path fills with accent when selected. Sex
// follows the active profile (Settings → Profile) — there is no in-modal
// toggle.
export function renderBodySilhouette(selected) {
  const sex = _activeProfileSex();
  const { front, back } = _silhouetteRegionPaths(sex);
  const bodyFront = buildBody(sex, 'front');
  const bodyBack = buildBody(sex, 'back');
  const frontLandmarks = buildLandmarks(sex, 'front');
  const backLandmarks = buildLandmarks(sex, 'back');
  const frontDetails = buildDetails(sex, 'front');
  const backDetails = buildDetails(sex, 'back');

  // Stock-figure prototype — compute the SVG <image> placement so each
  // view shows just the matching cell of the source grid, scaled to fit
  // a 100×210 figure area (top of the 100×220 view, leaving y 210–220 for
  // the italic-serif label).
  let renderStockImage = () => '';
  // Per-view alpha mask using the er.svg image itself — selection rects
  // are masked to figure-shape so the blue wash fills the body exactly,
  // no rectangular overflow past the silhouette.
  let renderFigureMask = () => '';
  if (STOCK_FIGURE_PROTOTYPE) {
    // Per-cell scale so each figure fits 210 high regardless of source
    // figure dimensions (female cells are narrower than male).
    const placement = (view) => {
      const cell = STOCK_IMG.cells[`${sex}-${view}`];
      if (!cell) return null;
      const scale = 210 / cell.ch;
      const fullW = STOCK_IMG.imgW * scale;
      const fullH = STOCK_IMG.imgH * scale;
      const cellWScaled = cell.cw * scale;
      const xOffset = (100 - cellWScaled) / 2;
      const imgX = xOffset - cell.sx * scale;
      const imgY = -cell.sy * scale;
      return { imgX, imgY, fullW, fullH };
    };
    renderStockImage = (view) => {
      const p = placement(view);
      if (!p) return '';
      return `<image href="${STOCK_IMG.src}" x="${p.imgX.toFixed(2)}" y="${p.imgY.toFixed(2)}" width="${p.fullW.toFixed(2)}" height="${p.fullH.toFixed(2)}" preserveAspectRatio="none" pointer-events="none"/>`;
    };
    renderFigureMask = (view, maskId) => {
      const p = placement(view);
      if (!p) return '';
      // Mask uses the image's own alpha — figure pixels = visible (alpha 1),
      // transparent background = hidden. The mask must match the figure's
      // exact placement so the cut-out aligns 1:1.
      return `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="210" mask-type="alpha"><image href="${STOCK_IMG.mask}" x="${p.imgX.toFixed(2)}" y="${p.imgY.toFixed(2)}" width="${p.fullW.toFixed(2)}" height="${p.fullH.toFixed(2)}" preserveAspectRatio="none"/></mask>`;
    };
    // Expose placement() so click handler / overlay rendering can use it.
    renderStockImage._placement = placement;
  }
  // Selection overlay generated from the region map — pixel-perfect tint
  // of selected regions. Returns null if region map hasn't loaded yet, or
  // a previous overlay while the next blob is encoding; in both cases the
  // caller re-renders when ready (renderBodySilhouette is sync; bind binds
  // the load promise + rebakes via dispatchEvent('sun-overlay-ready')).
  const selOverlayUrl = _renderSelectionOverlay(selected, () => {
    try { window.dispatchEvent(new CustomEvent('sun-overlay-ready')); } catch (e) {}
  });
  const overlayMatchesSelection = !!selOverlayUrl && _overlayCache.key === _selectedKey(selected);
  const overlayState = selected?.size
    ? (overlayMatchesSelection ? 'ready' : 'pending')
    : 'none';
  const renderSelectionImage = (view) => {
    if (!selOverlayUrl || !STOCK_FIGURE_PROTOTYPE) return '';
    const p = renderStockImage._placement && renderStockImage._placement(view);
    if (!p) return '';
    return `<image href="${selOverlayUrl}" x="${p.imgX.toFixed(2)}" y="${p.imgY.toFixed(2)}" width="${p.fullW.toFixed(2)}" height="${p.fullH.toFixed(2)}" preserveAspectRatio="none" pointer-events="none"/>`;
  };

  const renderRegion = (regions, viewKey) =>
    Object.entries(regions).map(([region, d]) => {
      const isSel = selected.has(region);
      const label = (BODY_REGIONS.find(r => r.key === region)?.label) || region;
      const cls = `sun-silhouette-region${isSel ? ' selected' : ''}`;
      // Avoid "Arms (front) (front)" — label already encodes the side
      // for split regions; only append (viewKey) for ambiguous regions
      // that exist on both views (face / thyroid / abdomen / etc).
      const labelHasSide = /\((front|back)\)/.test(label);
      const aria = labelHasSide ? label : `${label} (${viewKey})`;
      return `<path d="${d}" data-region="${region}" data-view="${viewKey}" class="${cls}" role="button" tabindex="0" aria-pressed="${isSel}" aria-label="${escapeAttr(aria)}"><title>${label}${isSel ? ' (selected)' : ''}</title></path>`;
    }).join('');

  const renderLandmarks = (paths) =>
    paths.map(d => `<path d="${d}" class="sun-silhouette-landmark" />`).join('');

  const renderDetails = (paths) =>
    paths.map(d => `<path d="${d}" class="sun-silhouette-detail" />`).join('');

  // Per-view clip paths so the female front silhouette (with bust bulge) and
  // the back silhouette (without) each clip their own region overlays
  // correctly. clipPathUnits defaults to userSpaceOnUse — the back-view
  // clipPath is referenced from inside the translated <g> so its coords
  // resolve against that group's local space.
  const clipFrontId = `sun-silhouette-clip-${sex}-front`;
  const clipBackId = `sun-silhouette-clip-${sex}-back`;

  // Two columns: front 0–100, back 100–200 (translated). Region tap targets
  // overlay the body silhouette and are clipped to its shape so the gold
  // selection wash hugs the figure. A small radial-gold gradient lives in
  // <defs> so we can paint individual selected regions with a soft sun-pool
  // effect via CSS class match — this is what gives the "sunlight on skin"
  // feel rather than a flat fill.
  const svg = `<svg viewBox="0 0 200 220" class="sun-silhouette${STOCK_FIGURE_PROTOTYPE ? ' sun-silhouette-stock' : ''}" data-sex="${sex}" data-selection-overlay="${overlayState}" role="group" aria-label="Body region picker — tap or press Enter on each region you want to toggle">
    <defs>
      <clipPath id="${clipFrontId}"><path d="${bodyFront.d}" /></clipPath>
      <clipPath id="${clipBackId}"><path d="${bodyBack.d}" /></clipPath>
      <!-- Cell clip — restricts the stock image AND the region tap zones
           to a 100×210 rectangle. Used in place of the parametric body
           clipPath so the entire rect (including outer arm columns) is
           hit-testable, then a figure-shape alpha mask trims the visible
           selection fill to the actual silhouette. -->
      <clipPath id="sun-silhouette-cell-clip"><rect x="0" y="0" width="100" height="210"/></clipPath>
      ${STOCK_FIGURE_PROTOTYPE ? renderFigureMask('front', 'sun-fig-mask-front') : ''}
      ${STOCK_FIGURE_PROTOTYPE ? renderFigureMask('back', 'sun-fig-mask-back') : ''}
    </defs>

    <g class="sun-silhouette-view sun-silhouette-front">
      ${STOCK_FIGURE_PROTOTYPE
        ? `<g clip-path="url(#sun-silhouette-cell-clip)">${renderStockImage('front')}${renderSelectionImage('front')}</g>`
        : `<path d="${bodyFront.d}" class="sun-silhouette-outline"/>${renderLandmarks(frontLandmarks)}${renderDetails(frontDetails)}`}
      ${STOCK_FIGURE_PROTOTYPE
        ? `<rect x="0" y="0" width="100" height="210" fill="transparent" data-click-view="front" style="cursor:pointer"/>`
        : ''}
      <g clip-path="url(#sun-silhouette-cell-clip)" ${STOCK_FIGURE_PROTOTYPE ? 'mask="url(#sun-fig-mask-front)"' : ''}>${renderRegion(front, 'front')}</g>
      <text x="50" y="218" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">front</text>
    </g>
    <g class="sun-silhouette-view sun-silhouette-back" transform="translate(100 0)">
      ${STOCK_FIGURE_PROTOTYPE
        ? `<g clip-path="url(#sun-silhouette-cell-clip)">${renderStockImage('back')}${renderSelectionImage('back')}</g>`
        : `<path d="${bodyBack.d}" class="sun-silhouette-outline"/>${renderLandmarks(backLandmarks)}${renderDetails(backDetails)}`}
      ${STOCK_FIGURE_PROTOTYPE
        ? `<rect x="0" y="0" width="100" height="210" fill="transparent" data-click-view="back" style="cursor:pointer"/>`
        : ''}
      <g clip-path="url(#sun-silhouette-cell-clip)" ${STOCK_FIGURE_PROTOTYPE ? 'mask="url(#sun-fig-mask-back)"' : ''}>${renderRegion(back, 'back')}</g>
      <text x="50" y="218" text-anchor="middle" class="sun-silhouette-label" aria-hidden="true">back</text>
    </g>
  </svg>`;

  return svg;
}

// Bind silhouette tap + keyboard handlers — call once after inserting the
// SVG into the DOM. `onChange(selected)` fires after each toggle so the
// caller can re-render or update derived UI (e.g. exposure-fraction readout).
//
// Keyboard: each region has tabindex=0; Enter / Space toggle selection.
// Re-render preserves focus on the toggled region so SR users hear the
// new aria-pressed state without losing their place.
export function bindBodySilhouette(rootEl, selected, onChange) {
  const rerender = (focusRegion, focusView) => {
    rootEl.innerHTML = renderBodySilhouette(selected);
    if (focusRegion) {
      const next = rootEl.querySelector(`[data-region="${CSS.escape(focusRegion)}"][data-view="${CSS.escape(focusView)}"]`);
      if (next) try { next.focus(); } catch (e) {}
    }
  };

  const toggleRegion = (regionKey, focusAfter) => {
    if (!regionKey) return;
    if (selected.has(regionKey)) selected.delete(regionKey); else selected.add(regionKey);
    rerender(regionKey, focusAfter);
    if (onChange) onChange(selected);
  };

  // Kick off region map preload, re-render once it's available so the
  // selection overlay can appear (first render before load shows figures
  // only — subsequent toggles after load get the canvas-tinted overlay).
  // Guard the rerender so it only fires while this binding's rootEl is
  // still in the DOM — otherwise stale modal closures keep ticking after
  // close and the listener leak previously caused an overlay ping-pong
  // between concurrent selection sets (cache trample → ~10 Hz blob churn).
  const _alive = () => rootEl.isConnected;
  if (STOCK_FIGURE_PROTOTYPE && !_regionMapData) {
    _loadRegionMap().then(() => { if (_alive()) rerender(); }).catch(() => {});
  }
  // The blob-encoded overlay arrives async; rerender once ready so the
  // tint appears on the figure. Listener is removed both lazily (next
  // dispatch after rootEl detaches) AND eagerly via a MutationObserver
  // on the parent — so cleanup happens at modal-close time even if no
  // overlay-ready event fires before the next open. The lazy path is
  // kept as a fallback for cases where the parent observer loses track
  // (e.g., rootEl moved to a new parent).
  const _onOverlayReady = () => {
    if (!_alive()) {
      window.removeEventListener('sun-overlay-ready', _onOverlayReady);
      return;
    }
    rerender();
  };
  window.addEventListener('sun-overlay-ready', _onOverlayReady);
  if (typeof document !== 'undefined' && document.body && typeof MutationObserver === 'function') {
    // Subtree observation — modal-close typically removes a grandparent
    // overlay (rootEl's immediate parent stays attached to it), so we
    // need to watch the whole document for childList changes and check
    // connectivity on every fire. The callback is short — short-circuit
    // when still connected.
    const detachObs = new MutationObserver(() => {
      if (!rootEl.isConnected) {
        window.removeEventListener('sun-overlay-ready', _onOverlayReady);
        detachObs.disconnect();
      }
    });
    detachObs.observe(document.body, { childList: true, subtree: true });
  }

  // Map a click on the SVG to a region key via the region map. Falls
  // back to per-region path detection if the map hasn't loaded yet.
  const _resolveRegionFromEvent = (e) => {
    if (!_regionMapData) return null;
    const svg = rootEl.querySelector('svg.sun-silhouette');
    if (!svg) return null;
    // Convert clientX/Y into the SVG's local (viewBox) coordinate space.
    let pt;
    try { pt = svg.createSVGPoint(); } catch (err) { return null; }
    const touch = e.changedTouches?.[0] || e.touches?.[0] || null;
    pt.x = touch ? touch.clientX : e.clientX;
    pt.y = touch ? touch.clientY : e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    // Determine view (front/back) and view-local picker coords.
    const view = local.x < 100 ? 'front' : 'back';
    const px = view === 'front' ? local.x : local.x - 100;
    const py = local.y;
    if (py < 0 || py > 210 || px < 0 || px > 100) return null;
    // Map view-local picker coords to source-viewBox coords via the cell.
    const sex = svg.getAttribute('data-sex') || 'male';
    const cell = STOCK_IMG.cells[`${sex}-${view}`];
    if (!cell) return null;
    const scale = 210 / cell.ch;
    const cellWScaled = cell.cw * scale;
    const xOffset = (100 - cellWScaled) / 2;
    const src_x = cell.sx + (px - xOffset) / scale;
    const src_y = cell.sy + py / scale;
    return _regionAtSource(src_x, src_y);
  };

  const activateFromEvent = (e) => {
    // Region-map sampling is the source of truth — try it first whenever
    // the click landed inside the figure SVG. Fall back to per-region
    // path matching for keyboard / a11y entry points.
    const fromMap = _resolveRegionFromEvent(e);
    if (fromMap) {
      const view = e.target.closest('[data-click-view]')?.dataset.clickView
        || (e.target.closest('.sun-silhouette-back') ? 'back' : 'front');
      toggleRegion(fromMap, view);
      return true;
    }
    const t = e.target.closest('[data-region]');
    if (!t) return false;
    toggleRegion(t.dataset.region, t.dataset.view);
    return true;
  };

  let lastPointerActivation = 0;
  rootEl.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!e.target.closest('svg.sun-silhouette')) return;
    if (!activateFromEvent(e)) return;
    lastPointerActivation = Date.now();
    e.preventDefault();
  }, { passive: false });
  rootEl.addEventListener('touchend', (e) => {
    if (Date.now() - lastPointerActivation < 80) return;
    if (!e.target.closest('svg.sun-silhouette')) return;
    if (!activateFromEvent(e)) return;
    lastPointerActivation = Date.now();
    e.preventDefault();
  }, { passive: false });

  rootEl.addEventListener('click', (e) => {
    if (Date.now() - lastPointerActivation < 700) {
      e.preventDefault();
      return;
    }
    activateFromEvent(e);
  });
  rootEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest('[data-region]');
    if (!t) return;
    e.preventDefault();
    toggleRegion(t.dataset.region, t.dataset.view);
  });
}

export function resetBodySilhouetteState() {
  if (_overlayCache.url && typeof URL !== 'undefined') {
    try { URL.revokeObjectURL(_overlayCache.url); } catch (_) {}
  }
  _overlayCache = { key: '', url: '' };
  _overlayPending = false;
  _overlayQueued = null;
  // _regionMapData decode is expensive (canvas + getImageData on a full
  // figure SVG) and the result is profile-agnostic, so we keep it warm.
}

export {
  _loadRegionMap as _testLoadRegionMap,
  _regionAtSource as _testRegionAtSource,
  REGION_COLOR_RGB as _testRegionColorRGB,
  STOCK_IMG as _testStockImg,
  _REGION_BAND_LANDMARKS as _testRegionBandLandmarks,
};
