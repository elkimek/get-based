// test-light-tools.js — Pure helpers from light-tools.js:
// computeRowBanding (flicker FFT), cameraLockStatusLine, saveMeasurement
// persistence + spectrum auto-fill, getMeasurementsForRoom, deleteMeasurement.
// Skips DOM-bound camera/UI tools — those are exercised by Puppeteer flows.
// Run: fetch('tests/test-light-tools.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Light Tools Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const tools = await import('/js/light-tools.js?bust=' + Date.now());
  const {
    computeRowBanding,
    cameraLockStatusLine,
    getMeasurements, getMeasurementsForRoom, saveMeasurement, deleteMeasurement,
  } = tools;

  const orig = window._labState.importedData;
  function reset(seed = {}) {
    window._labState.importedData = Object.assign({ entries: [] }, seed);
  }

  // ─── 1. computeRowBanding shape ──────────────────────────────────────
  console.log('%c 1. computeRowBanding shape ', 'font-weight:bold;color:#f59e0b');

  // Build a uniform-grey 16×16 RGBA frame (luma ≈ 128 everywhere).
  const W = 16, H = 16;
  const flat = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < flat.length; i += 4) {
    flat[i] = flat[i + 1] = flat[i + 2] = 128; flat[i + 3] = 255;
  }
  const flatRes = computeRowBanding(flat, W, H);
  assert('Returns frameMean / frameMax / bandingRatio / stripes / rowMeans',
    Number.isFinite(flatRes.frameMean) &&
    Number.isFinite(flatRes.frameMax) &&
    Number.isFinite(flatRes.bandingRatio) &&
    Number.isInteger(flatRes.stripes) &&
    flatRes.rowMeans instanceof Float32Array);
  assert('frameMean ≈ 128 on uniform grey input', Math.abs(flatRes.frameMean - 128) < 1);
  assert('frameMax ≈ 128 on uniform grey input', Math.abs(flatRes.frameMax - 128) < 1);
  assert('bandingRatio ≈ 0 on uniform input (no PWM signal)', flatRes.bandingRatio < 0.01);
  assert('stripes === 0 on uniform input', flatRes.stripes === 0);
  assert('rowMeans length === H', flatRes.rowMeans.length === H);

  // ─── 2. computeRowBanding detects banding ────────────────────────────
  console.log('%c 2. computeRowBanding detects PWM banding ', 'font-weight:bold;color:#f59e0b');

  // Frame with alternating bright/dark rows = strong banding signal
  const bands = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = (y % 2 === 0) ? 200 : 50;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      bands[i] = bands[i + 1] = bands[i + 2] = v; bands[i + 3] = 255;
    }
  }
  const bandRes = computeRowBanding(bands, W, H);
  assert('frameMean of alternating rows ≈ 125', Math.abs(bandRes.frameMean - 125) < 5);
  assert('Strong banding raises bandingRatio significantly (> 0.4)',
    bandRes.bandingRatio > 0.4, `bandingRatio=${bandRes.bandingRatio.toFixed(3)}`);
  assert('Stripes counted across the frame (>=4 alternations in 16 rows)',
    bandRes.stripes >= 4, `stripes=${bandRes.stripes}`);

  // ─── 3. computeRowBanding edge: dark frame (frameMean ≈ 0) ───────────
  console.log('%c 3. Dark-frame guard ', 'font-weight:bold;color:#f59e0b');

  const dark = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < dark.length; i += 4) dark[i] = 255; // alpha only
  const darkRes = computeRowBanding(dark, W, H);
  assert('frameMean === 0 on all-zero frame', darkRes.frameMean === 0);
  assert('bandingRatio === 0 on all-zero frame (no divide-by-zero)',
    darkRes.bandingRatio === 0);

  // ─── 4. cameraLockStatusLine ─────────────────────────────────────────
  console.log('%c 4. cameraLockStatusLine ', 'font-weight:bold;color:#f59e0b');

  assert('null lock → empty string', cameraLockStatusLine(null) === '');
  assert('undefined lock → empty string', cameraLockStatusLine(undefined) === '');

  const allLocked = cameraLockStatusLine({ exposure: 'manual', whiteBalance: 'manual', focus: 'manual', frameRate: 30 });
  assert('All-manual reports green check + fps',
    /✓ camera locked/.test(allLocked) && /30 fps/.test(allLocked));

  const partial = cameraLockStatusLine({ exposure: 'auto', whiteBalance: 'manual', frameRate: 30 });
  assert('Partial lock surfaces orange warning + which mode',
    /⚠ camera/.test(partial) && /exposure/.test(partial));

  const allAuto = cameraLockStatusLine({ exposure: 'auto', whiteBalance: 'auto' });
  assert('All-auto reports both warnings',
    /exposure/.test(allAuto) && /white-balance/.test(allAuto));

  // ─── 5. getMeasurements lazy init + saveMeasurement ─────────────────
  console.log('%c 5. Measurement persistence ', 'font-weight:bold;color:#f59e0b');

  reset();
  assert('getMeasurements lazily initializes empty list',
    Array.isArray(getMeasurements()) && getMeasurements().length === 0);

  const m1 = await saveMeasurement('lux', 350, { roomId: 'r1', label: 'desk' });
  assert('saveMeasurement returns a stamped entry',
    m1 && m1.id && m1.tool === 'lux' && m1.value === 350);
  assert('Measurement carries capturedAt timestamp',
    Number.isFinite(m1.capturedAt) && m1.capturedAt > 0);
  assert('Measurement carries default confidence (0.7)',
    m1.confidence === 0.7);
  assert('Measurement carries label + roomId',
    m1.label === 'desk' && m1.roomId === 'r1');
  assert('Measurement is in the list after save',
    getMeasurements().length === 1 &&
    getMeasurements()[0].id === m1.id);

  await saveMeasurement('flicker', 2, { roomId: 'r1' });
  await saveMeasurement('cct', 5500, { roomId: 'r2' });
  await saveMeasurement('lux', 100); // portable / no roomId
  assert('All four measurements persist', getMeasurements().length === 4);

  // ─── 6. getMeasurementsForRoom ──────────────────────────────────────
  console.log('%c 6. getMeasurementsForRoom filtering ', 'font-weight:bold;color:#f59e0b');

  const r1 = getMeasurementsForRoom('r1');
  assert('r1 holds lux + flicker (2 entries)', r1.length === 2);
  assert('r1 entries carry the right roomId', r1.every(m => m.roomId === 'r1'));

  const r2 = getMeasurementsForRoom('r2');
  assert('r2 holds the cct entry only', r2.length === 1 && r2[0].tool === 'cct');

  assert('null roomId returns [] (no portable bucket via this getter)',
    getMeasurementsForRoom(null).length === 0);

  // ─── 7. deleteMeasurement ───────────────────────────────────────────
  console.log('%c 7. deleteMeasurement ', 'font-weight:bold;color:#f59e0b');

  const before = getMeasurements().length;
  const ok = await deleteMeasurement(m1.id);
  assert('deleteMeasurement returns true on hit', ok === true);
  assert('Measurement removed from list', getMeasurements().length === before - 1);
  assert('deleteMeasurement on unknown id returns false',
    (await deleteMeasurement('lm_nope')) === false);

  // ─── 8. Spectrum tool auto-fill suggestion fires ─────────────────────
  console.log('%c 8. Spectrum tool fires suggestRoomSourceFromSpectrum ', 'font-weight:bold;color:#f59e0b');

  // Stub the suggestion so we can confirm the call without touching real
  // light-env state.
  let suggestionCalls = 0;
  let lastArgs = null;
  const origSuggest = window.suggestRoomSourceFromSpectrum;
  window.suggestRoomSourceFromSpectrum = async (roomId, value) => {
    suggestionCalls++;
    lastArgs = { roomId, value };
  };

  await saveMeasurement('spectrum', 'fluorescent', { roomId: 'r99' });
  assert('Spectrum + roomId fires the auto-fill hook exactly once',
    suggestionCalls === 1);
  assert('Hook is called with the room + value',
    lastArgs && lastArgs.roomId === 'r99' && lastArgs.value === 'fluorescent');

  // No roomId → no hook
  suggestionCalls = 0;
  await saveMeasurement('spectrum', 'led-warm', {}); // no roomId
  assert('Spectrum without roomId does not fire the hook',
    suggestionCalls === 0);

  // Non-spectrum tool → no hook
  suggestionCalls = 0;
  await saveMeasurement('lux', 500, { roomId: 'r99' });
  assert('Non-spectrum tool does not fire the hook',
    suggestionCalls === 0);

  // restore
  if (origSuggest) window.suggestRoomSourceFromSpectrum = origSuggest;
  else delete window.suggestRoomSourceFromSpectrum;

  // Restore
  window._labState.importedData = orig;

  console.log(`%c Light Tools: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
