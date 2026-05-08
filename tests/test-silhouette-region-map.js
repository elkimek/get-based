// test-silhouette-region-map.js — Region-map correctness.
//
// `_loadRegionMap()` rasterizes er.svg and bakes a color-coded map at
// imgW × imgH where each pixel inside the figure carries the RGB of
// the region key it belongs to (REGION_COLOR_RGB). The picker's click
// handler samples this map to convert click → region.
//
// This test guards:
//   1. The map loads and contains exactly the expected unique colors
//      (transparent + 16 region colors).
//   2. Sampling at landmark-center coordinates returns the expected
//      region key for both sexes (front + back).
//   3. Boundaries between adjacent regions land on the right side of
//      the divider at landmark Y ± 1px.
//
// Run: fetch('tests/test-silhouette-region-map.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; }
    else { fail++; console.error(`FAIL  ${name}` + (detail ? ` — ${detail}` : '')); }
  }

  console.log('%c Silhouette Region Map Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Wait for sun.js wiring to land helpers on window.
  if (typeof window._testLoadRegionMap !== 'function') {
    await import('/js/sun.js?bust=' + Date.now());
  }
  const _loadRegionMap = window._testLoadRegionMap;
  const _regionAtSource = window._testRegionAtSource;
  const REGION_COLOR_RGB = window._testRegionColorRGB;
  const STOCK_IMG = window._testStockImg;
  const L = window._testRegionBandLandmarks;

  assert('Test helpers exposed on window',
    typeof _loadRegionMap === 'function' &&
    typeof _regionAtSource === 'function' &&
    REGION_COLOR_RGB && STOCK_IMG && L);
  if (fail > 0) {
    console.log(`%c ${pass} passed, ${fail} failed, ${pass + fail} total — stopping early`, 'color:#ef4444');
    return;
  }

  // ─── 1. Load the region map ────────────────────────────────────────
  const t0 = performance.now();
  const map = await _loadRegionMap();
  const elapsed = performance.now() - t0;
  assert('Region map loads', !!map && map.data && map.width > 0 && map.height > 0,
    `width=${map?.width} height=${map?.height}`);
  // The audit specifically called out "~50–80ms one-shot cost". Don't
  // pin too tight — Puppeteer headless can spike to several hundred
  // ms. Just bound the catastrophic case.
  assert('Region-map load completes within 5s', elapsed < 5000, `${elapsed.toFixed(0)}ms`);

  // ─── 2. Map contains exactly 16 region colors + transparent ─────────
  // Walk the image data, collecting unique non-transparent RGBs. Should
  // match REGION_COLOR_RGB exactly (16 keys).
  const expected = new Set(Object.values(REGION_COLOR_RGB).map(([r, g, b]) => `${r},${g},${b}`));
  assert('REGION_COLOR_RGB has 16 entries', expected.size === 16, `got ${expected.size}`);

  const seen = new Set();
  const data = map.data;
  // Sample sparsely (every 40 px) — full walk is 60M iterations.
  for (let y = 0; y < map.height; y += 40) {
    for (let x = 0; x < map.width; x += 40) {
      const i = (y * map.width + x) * 4;
      const a = data[i + 3];
      if (a < 30) continue;
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
  }
  // We may not hit every region with sparse sampling, but every color
  // we DO see must be one of the expected 16.
  let strangers = [];
  for (const c of seen) if (!expected.has(c)) strangers.push(c);
  assert('All non-transparent pixels carry a known region color',
    strangers.length === 0, `unexpected RGBs: ${strangers.slice(0, 4).join('; ')}`);
  assert('Sparse sample sees most regions',
    seen.size >= 12, `saw ${seen.size}/16 regions in 40px sample`);

  // ─── 3. Landmark-center sampling per sex × view ─────────────────────
  // For each cell, sample center-x at known band-Y offsets and assert
  // the region key matches the painting logic (sun.js:2974-2985).
  // Coords are in source-viewBox space (cell.sx + offsetX, cell.sy + offsetY).
  for (const [cellKey, cell] of Object.entries(STOCK_IMG.cells)) {
    if (/-side$/.test(cellKey)) continue;  // side views aren't selectable
    const [sex, view] = cellKey.split('-');
    const isFront = view === 'front';
    const cx = cell.sx + cell.cw / 2;
    // Picker landmarks (yChinTop, yShldrTop, ...) are in the 0–210
    // picker-unit space. Conversion to source viewBox y:
    //   source_y = cell.sy + (picker_y / 210) * cell.ch
    // (See _paintRegionMapCell in sun.js: `py = (my*VB_H/H - cell.sy) * 210 / cell.ch`.)
    const yAt = (landmarkPy) => cell.sy + (landmarkPy / 210) * cell.ch;

    // Slightly above yChinTop = face / face-back.
    {
      const y = yAt(L.yChinTop - 2);
      const r = _regionAtSource(cx, y);
      const expected = isFront ? 'face' : 'face-back';
      assert(`${cellKey} above yChinTop = ${expected}`, r === expected, `got=${r}`);
    }
    // Between yChinTop and yShldrTop = thyroid-throat / thyroid-throat-back.
    {
      const y = yAt((L.yChinTop + L.yShldrTop) / 2);
      const r = _regionAtSource(cx, y);
      const expected = isFront ? 'thyroid-throat' : 'thyroid-throat-back';
      assert(`${cellKey} between yChinTop+yShldrTop = ${expected}`, r === expected, `got=${r}`);
    }
    // Mid-thigh (between yCrotch and yAnkle) = legs-front / legs-back.
    // Center-x falls in the inter-leg gap (transparent), so offset 20%
    // toward one leg.
    {
      const y = yAt((L.yCrotch + L.yAnkle) / 2);
      const r = _regionAtSource(cx + cell.cw * 0.20, y);
      const expected = isFront ? 'legs-front' : 'legs-back';
      assert(`${cellKey} mid-thigh = ${expected}`, r === expected, `got=${r}`);
    }
    // Just above ySole = feet-front / feet-back. Foot placement varies
    // by sex/view (female feet narrower than male), so sweep a few
    // x offsets in the foot region and accept any hit.
    {
      const y = yAt(L.ySole - 2);
      const expected = isFront ? 'feet-front' : 'feet-back';
      let hit = null;
      for (const f of [0.1, 0.15, 0.2, 0.25, 0.3, -0.1, -0.15, -0.2, -0.25, -0.3]) {
        const r = _regionAtSource(cx + cell.cw * f, y);
        if (r === expected) { hit = r; break; }
      }
      assert(`${cellKey} just above ySole = ${expected}`, hit === expected, `swept ±30%, no hit`);
    }
  }

  // ─── 4. Boundary at yChinTop ± 1 — ensure the divider is correct ────
  // For male-front: 1px above yChinTop should be 'face', 1px below
  // should be 'thyroid-throat'.
  const malefront = STOCK_IMG.cells['male-front'];
  const cx = malefront.sx + malefront.cw / 2;
  const yChinPx = malefront.sy + (L.yChinTop / 210) * malefront.ch;
  // 1 picker-y unit = (cell.ch / 210) source-y units. Use ±2 picker
  // units so we clear the canvas-rounding zone at the divider.
  const dy = malefront.ch / 210;
  const above = _regionAtSource(cx, yChinPx - dy * 2);
  const below = _regionAtSource(cx, yChinPx + dy * 2);
  assert('male-front: 2 picker-units above yChinTop = face',
    above === 'face', `got=${above}`);
  assert('male-front: 2 picker-units below yChinTop = thyroid-throat',
    below === 'thyroid-throat', `got=${below}`);

  // ─── 5. Outside any cell returns null ──────────────────────────────
  const outside = _regionAtSource(0, 0);
  assert('Sampling at (0,0) outside any cell returns null', outside === null, `got=${outside}`);

  console.log(`%c ${pass} passed, ${fail} failed, ${pass + fail} total`,
    fail === 0 ? 'color:#22c55e' : 'color:#ef4444');
})();
