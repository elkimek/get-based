#!/usr/bin/env node
// test-light-tools.js — Pure helpers from light-tools.js:
// computeRowBanding (flicker FFT), cameraLockStatusLine, saveMeasurement
// persistence + spectrum auto-fill, getMeasurementsForRoom, deleteMeasurement.
//
// Run: node tests/test-light-tools.js  (or via npm test)

import './_node-shim.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Light Tools Tests ===\n');

await import('../js/state.js');
const tools = await import('../js/light-tools.js');
  const {
    computeRowBanding,
    cameraLockStatusLine,
    getMeasurements, getMeasurementsForRoom, saveMeasurement, deleteMeasurement,
    normalizeGoldenHourMinutes,
    } = tools;
    const lightToolsSrc = fs.readFileSync(new URL('../js/light-tools.js', import.meta.url), 'utf8');
    const cssFiles = ['styles.css', 'css/category-views.css', 'css/modal-shared.css', 'css/settings.css', 'css/mobile-dashboard.css', 'css/cycle.css', 'css/marker-detail-modal.css', 'css/client-list.css', 'css/wearables.css', 'css/light-sun.css', 'css/chat-panel.css', 'css/redesign-shell.css', 'css/redesign-chat.css'];
    const stylesSrc = cssFiles.map(rel => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8')).join('\n');
    const appearsBefore = (needleA, needleB, from = 0) => {
      const a = lightToolsSrc.indexOf(needleA, from);
      const b = lightToolsSrc.indexOf(needleB, from);
      return a >= 0 && b >= 0 && a < b;
    };

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

    reset({
      lightMeasurements: [
        { id: 'old-lux', tool: 'lux', roomId: 'r1', value: 100, capturedAt: 1000 },
        { id: 'new-lux', tool: 'lux', roomId: 'r1', value: 300, capturedAt: 2000 },
        { id: 'audit-a', tool: 'audit', value: 2, capturedAt: 1000 },
        { id: 'audit-b', tool: 'audit', value: 3, capturedAt: 2000 },
      ],
    });
    const migrated = getMeasurements();
    assert('getMeasurements collapses duplicate non-audit room/tool rows',
      migrated.length === 3 && migrated.some(m => m.id === 'new-lux') && !migrated.some(m => m.id === 'old-lux'));
    assert('getMeasurements preserves audit walkthrough history during collapse',
      migrated.filter(m => m.tool === 'audit').length === 2);
    assert('getMeasurements tombstones collapsed rows for sync',
      window._labState.importedData._deleted?.lightMeasurements?.includes('old-lux'));

    reset();

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

    // ─── 9. Golden-hour duration guard ──────────────────────────────────
    console.log('%c 9. Golden-hour duration clamp ', 'font-weight:bold;color:#f59e0b');

    assert('normalizeGoldenHourMinutes defaults invalid input to 15',
      normalizeGoldenHourMinutes('nope') === 15);
    assert('normalizeGoldenHourMinutes clamps below min',
      normalizeGoldenHourMinutes('-5') === 1);
    assert('normalizeGoldenHourMinutes clamps above max',
      normalizeGoldenHourMinutes('500') === 120);
    assert('normalizeGoldenHourMinutes accepts valid minutes',
      normalizeGoldenHourMinutes('45') === 45);

    // ─── 10. Camera lifecycle regressions ────────────────────────────────
    console.log('%c 10. Camera lifecycle source guards ', 'font-weight:bold;color:#f59e0b');

      assert('Lux assigns close handler before camera fallback can await',
        appearsBefore('window._closeLuxMeter =', 'await startCameraFallback();'));
    assert('Lux AmbientLightSensor error retries the camera fallback',
      /sensor\.addEventListener\('error'[\s\S]{0,500}startCameraFallback/.test(lightToolsSrc));
      assert('Flicker assigns close handler before getUserMedia await',
        appearsBefore('window._closeFlicker =', 'navigator.mediaDevices.getUserMedia', lightToolsSrc.indexOf('export async function openFlickerDetector')));
      assert('CCT assigns close handler before getUserMedia await',
        appearsBefore('window._closeCCT =', 'navigator.mediaDevices.getUserMedia', lightToolsSrc.indexOf('export async function openCCTMeter')));
      assert('Spectrum assigns close handler before getUserMedia await',
        appearsBefore('window._closeSpec =', 'navigator.mediaDevices.getUserMedia', lightToolsSrc.indexOf('export async function openSpectrumClassifier')));
    assert('Glass transmission tracks and stops active streams on close/finally',
      /activeGlassStreams\.add\(stream\)/.test(lightToolsSrc) &&
      /activeGlassStreams\.delete\(stream\)/.test(lightToolsSrc) &&
      /for \(const stream of activeGlassStreams\)[\s\S]{0,160}getTracks\(\)\.forEach/.test(lightToolsSrc));
    assert('Eye-level audit waits for movement before recording another pause',
      /waitingForMovement[\s\S]{0,700}pauseDetections\.push[\s\S]{0,250}waitingForMovement\s*=\s*true/.test(lightToolsSrc));

    // ─── 11. Live measurement anti-jitter layout ───────────────────────
    console.log('%c 11. Live measurement anti-jitter layout ', 'font-weight:bold;color:#f59e0b');

    assert('Light tool overlay is top-anchored so height changes do not recenter',
      /\.light-tool-overlay\.modal-overlay\.show\s*\{[\s\S]{0,140}align-items:\s*flex-start/.test(stylesSrc));
    assert('Live light tool video previews reserve aspect-ratio space before camera metadata',
      /\.light-tool-modal video\s*\{[\s\S]{0,160}aspect-ratio:\s*4\s*\/\s*3/.test(stylesSrc));
    assert('Lux live number reserves tabular-width space',
      /\.lux-dial-value\s*\{[\s\S]{0,220}min-width:\s*6ch[\s\S]{0,220}font-variant-numeric:\s*tabular-nums/.test(stylesSrc));
    assert('Flicker and darkness result boxes reserve stable height',
      /\.flicker-result,\s*\.dark-status\s*\{[\s\S]{0,260}min-height:\s*74px/.test(stylesSrc));
    assert('CCT and spectrum live result boxes reserve stable height',
      /\.cct-result\s*\{[\s\S]{0,160}min-height:\s*116px/.test(stylesSrc) &&
      /\.spec-result\s*\{[\s\S]{0,220}min-height:\s*140px/.test(stylesSrc));
    assert('Glass and audit result boxes reserve stable numeric layout',
      /\.glass-reading\s*\{[\s\S]{0,220}min-width:\s*9ch[\s\S]{0,220}font-variant-numeric:\s*tabular-nums/.test(stylesSrc) &&
      /\.audit-status\s*\{[\s\S]{0,220}min-height:\s*88px/.test(stylesSrc));

  // restore
  if (origSuggest) window.suggestRoomSourceFromSpectrum = origSuggest;
  else delete window.suggestRoomSourceFromSpectrum;

  // Restore
  window._labState.importedData = orig;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
