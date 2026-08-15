// @ts-check
// light-tool-camera.js — Shared camera/runtime helpers for Light tools.

import { escapeAttr, escapeHTML } from './utils.js';

/** @param {HTMLCanvasElement} canvas */
export function getRequired2DContext(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Camera measurement requires a 2D canvas context');
  return context;
}

// Per-tool "where to aim the camera" guide. Spelt out because the
// difference between "what hits you" tools (lux, sleep darkness, eye-
// level audit) and "what the source emits" tools (flicker, CCT,
// spectrum, glass transmission) is the difference between a useful
// reading and a misleading one — and there's no way to recover from a
// fixed user-facing webcam (skin tones bias spectrum classifier toward
// "warm" regardless of actual ceiling source; rolling-shutter bands attenuate
// when reflected; "bedroom" measurements done from a desk webcam are
// actually office measurements with a bedroom label).
const _AIMING_GUIDES = {
  lux: {
    mode: 'AT the point you want to check',
    body: 'Hold the phone at <b>eye height</b> where you normally sit, work, or read. Keep the light sensor uncovered and point its side toward the light field you want to check (usually the screen/front side). If you choose the camera fallback, face the camera into the room rather than directly at a bulb.',
    webcam: 'A laptop may not expose a light sensor. Its camera can make a relative estimate, but a phone light sensor or real lux meter is preferable.',
  },
  flicker: {
    mode: 'AT the source',
    body: 'Point the camera <b>directly at the bulb / fixture</b> from ~30–50 cm, so the source fills a noticeable chunk of the frame. Rolling-shutter bands are harder to see after light reflects off walls or skin.',
    webcam: '⚠ A user-facing webcam under-reads flicker — modulation amplitude attenuates when bouncing off your face. Use a phone for a real read.',
  },
  cct: {
    mode: 'AT the source',
    body: 'Point the camera <b>directly at the fixture or a white wall lit by it</b> from ~30–50 cm. White paper or a grey card under the source also works.',
    webcam: '⚠ A user-facing webcam can be skewed by skin, clothing, automatic white balance, and the display. Use a phone aimed at a neutral surface when possible.',
  },
  spectrum: {
    mode: 'AT the source',
    body: 'Point the camera <b>directly at the bulb or LED panel</b> so it dominates the frame. The classifier reads the RGB profile of whatever it sees.',
    webcam: '⚠ A user-facing webcam mostly sees the person and display, so its RGB balance may not represent the room source. Use a phone aimed at the source when possible.',
  },
  darkness: {
    mode: 'FROM your sleeping position',
    body: 'Place the phone <b>face-up on your pillow or bedside table</b> at night, lens facing the ceiling. Check the light field at your sleeping position with the room set as you normally sleep (door, hallway light, alarm clock, and curtains included).',
    webcam: '⚠ A monitor webcam in a different room can\'t measure your bedroom darkness. This one needs to be physically on the bed.',
  },
  'glass-transmission': {
    mode: 'TWO-STEP — same direction both times',
    body: 'Step 1: hold the camera <b>against the closed window</b> (looking out at the sky / scene). Step 2: same direction, but with the window open or stepping outside, so only the glass changes between readings.',
    webcam: 'Webcam can\'t do this — it can\'t physically move outside.',
  },
  audit: {
    mode: 'FROM your position, at eye height',
    body: 'Hold the phone <b>at eye height, facing forward</b> while you walk through each room. The pause-detection captures the lighting where you actually look — not the floor or ceiling.',
    webcam: 'Walking with a phone is the whole point — a fixed webcam misses the inter-room comparison this tool exists to provide.',
  },
};

let aimingGuideDelegatesInstalled = false;

function _handleAimingGuideClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionEl = target.closest('[data-aiming-guide-action]');
  if (!(actionEl instanceof HTMLElement)) return;
  const action = actionEl.dataset.aimingGuideAction || '';
  if (action !== 'dismiss') return;
  const toolKey = actionEl.dataset.tool || '';
  if (!toolKey) return;
  event.preventDefault();
  dismissAimingGuide(toolKey);
}

function installAimingGuideDelegates() {
  if (aimingGuideDelegatesInstalled || typeof document === 'undefined') return;
  aimingGuideDelegatesInstalled = true;
  document.addEventListener('click', _handleAimingGuideClick);
}

// Returns a small expandable info card for the tool modal. Persists per-
// tool dismissal in localStorage so users who've internalized the
// guidance don't have to dismiss it on every open.
export function aimingGuideHTML(toolKey) {
  const g = _AIMING_GUIDES[toolKey];
  if (!g) return '';
  const dismissed = (typeof localStorage !== 'undefined' && localStorage.getItem(`labcharts-aim-guide-${toolKey}`) === 'dismissed');
  // Hide entirely once dismissed — re-enable via a small "?" affordance
  // up by the modal title (added below per tool).
  if (dismissed) return '';
  return `<div class="tool-aiming-guide" data-tool="${escapeHTML(toolKey)}">
    <div class="tool-aiming-guide-head">
      <span class="tool-aiming-guide-icon">📐</span>
      <span class="tool-aiming-guide-mode">${escapeHTML(g.mode)}</span>
      <button type="button" class="tool-aiming-guide-dismiss" data-aiming-guide-action="dismiss" data-tool="${escapeAttr(toolKey)}" aria-label="Dismiss aiming guide">×</button>
    </div>
    <div class="tool-aiming-guide-body">${g.body}</div>
    ${g.webcam ? `<div class="tool-aiming-guide-webcam">${g.webcam}</div>` : ''}
  </div>`;
}

export function dismissAimingGuide(toolKey) {
  try { localStorage.setItem(`labcharts-aim-guide-${toolKey}`, 'dismissed'); } catch (_) {}
  // Hide the currently-rendered guide without re-rendering the whole modal.
  let el = /** @type {HTMLElement | null} */ (null);
  for (const candidate of document.querySelectorAll('.tool-aiming-guide')) {
    if (candidate instanceof HTMLElement && candidate.dataset.tool === String(toolKey)) {
      el = candidate;
      break;
    }
  }
  if (el) el.style.display = 'none';
}

if (typeof window !== 'undefined') installAimingGuideDelegates();

// ─── Camera AE/AWB lock helper ────────────────────────────────────────
//
// `getUserMedia` defaults to auto-exposure + auto-white-balance + auto-
// focus, which silently neutralizes the signal we're trying to read:
// - Lux: AE compensates for actual brightness → ~constant luma whatever
//   the room.
// - CCT / Spectrum: AWB color-corrects so blue-rich light reads neutral.
// - Flicker: AE smooths brightness fluctuations frame-to-frame.
// - Glass transmission: AE drifts between the two samples → ratio wrong.
//
// Modern browsers expose manual mode via `getCapabilities()` /
// `applyConstraints()`. Older Safari / iOS Chrome may not — we read the
// capability, attempt the lock, and report what actually stuck so the
// caller can show a fallback note. Sleep-darkness uses the longExposure
// option (long shutter + fixed ISO) so dim pixels register at a known
// gain instead of being amplified by auto-gain.
//
// Returns: { exposure: 'manual' | 'auto', whiteBalance: 'manual' | 'auto',
//            focus: 'manual' | 'auto', frameRate: <fps actually delivered> }
/** @typedef {{ exposure: 'manual' | 'auto', whiteBalance: 'manual' | 'auto', focus: 'manual' | 'auto', frameRate: number | null, iso: number | null, exposureTime: number | null }} CameraLockResult */
/** @returns {Promise<CameraLockResult>} */
export async function lockCameraForMeasurement(stream, opts = {}) {
  /** @type {CameraLockResult} */
  const result = { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: null, iso: null, exposureTime: null };
  if (!stream || !stream.getVideoTracks) return result;
  const track = stream.getVideoTracks()[0];
  if (!track) return result;
  const settings = track.getSettings ? track.getSettings() : {};
  result.frameRate = settings.frameRate || null;
  // Some Chromium builds throw when getCapabilities is missing or the
  // track isn't fully started yet — treat as "auto fallback" rather than
  // hard-failing the whole tool.
  let caps = {};
  try { caps = (track.getCapabilities && track.getCapabilities()) || {}; } catch (e) { caps = {}; }
  const advanced = [];
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')) {
    advanced.push({ exposureMode: 'manual' });
    if (Number.isFinite(caps.exposureCompensation?.min)) advanced.push({ exposureCompensation: 0 });
    // Pin shutter to a usable value for flicker detection — short enough
    // that some temporal modulation can show as rolling-shutter stripes
    // rather than being blurred by a long shutter, while still giving
    // signal. 1/120s = 8.33ms is a reasonable middle ground if the camera
    // exposes `exposureTime` (units: 100 µs in the WICG spec).
    if (opts.shortExposure && Number.isFinite(caps.exposureTime?.min)) {
      const target = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, 83)); // ~8.3ms
      advanced.push({ exposureTime: target });
      result.exposureTime = target;
    }
    // Long-exposure path for the sleep-darkness meter: pin shutter to a
    // long fixed value so dim pixels actually register, AND pin ISO/gain
    // when the camera exposes it — without fixed ISO, auto-gain ramps up
    // in darkness and produces a "bright-looking" noisy image, defeating
    // the measurement. Target ~1/30s shutter (333 in 100µs units) which
    // is the longest most phone cameras allow at 30 fps.
    if (opts.longExposure && Number.isFinite(caps.exposureTime?.min)) {
      const target = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, 333));
      advanced.push({ exposureTime: target });
      result.exposureTime = target;
    }
    result.exposure = 'manual';
  }
  // Lock ISO/gain to a known value so absolute pixel brightness is
  // calibrated — only some Android Chromium builds expose this. Without
  // it, we can't translate raw luma to lux at all.
  if (opts.longExposure && Number.isFinite(caps.iso?.min)) {
    const target = Math.max(caps.iso.min, Math.min(caps.iso.max, 400));
    advanced.push({ iso: target });
    result.iso = target;
  } else if (opts.shortExposure && Number.isFinite(caps.iso?.min)) {
    const target = Math.max(caps.iso.min, Math.min(caps.iso.max, 100));
    advanced.push({ iso: target });
    result.iso = target;
  }
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) {
    advanced.push({ whiteBalanceMode: 'manual' });
    // 5500 K (D55) is the closest to "no color cast" for measurements
    // taken against neutral surfaces. CCT/spectrum tools want consistent
    // raw R/G/B regardless of source illumination.
    if (Number.isFinite(caps.colorTemperature?.min)) {
      const target = Math.max(caps.colorTemperature.min, Math.min(caps.colorTemperature.max, 5500));
      advanced.push({ colorTemperature: target });
    }
    result.whiteBalance = 'manual';
  }
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) {
    advanced.push({ focusMode: 'manual' });
    result.focus = 'manual';
  }
  if (advanced.length === 0) return result;
  try {
    await track.applyConstraints({ advanced });
  } catch (e) {
    // Constraint rejected — typically iOS Safari. Report the auto fallback
    // honestly; caller decides whether to warn the user.
    return { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: result.frameRate, iso: null, exposureTime: null };
  }
  // Re-read settings to confirm the lock actually applied — some platforms
  // accept the constraint without honoring it.
  try {
    const after = track.getSettings ? track.getSettings() : {};
    if (after.exposureMode && after.exposureMode !== 'manual') result.exposure = 'auto';
    if (after.whiteBalanceMode && after.whiteBalanceMode !== 'manual') result.whiteBalance = 'auto';
    if (after.focusMode && after.focusMode !== 'manual') result.focus = 'auto';
    if (after.frameRate) result.frameRate = after.frameRate;
  } catch (e) {}
  return result;
}

// Short status line for the tool UI — tells the user when the camera is
// running in degraded auto-mode so a low-confidence reading is expected.
export function cameraLockStatusLine(lock) {
  if (!lock) return '';
  const allManual = lock.exposure === 'manual' && lock.whiteBalance === 'manual';
  if (allManual) {
    const fps = lock.frameRate ? ` · ${Math.round(lock.frameRate)} fps` : '';
    return `<span style="color:var(--green);font-size:11px">✓ camera locked${fps}</span>`;
  }
  const auto = [];
  if (lock.exposure !== 'manual') auto.push('exposure');
  if (lock.whiteBalance !== 'manual') auto.push('white-balance');
  return `<span style="color:var(--orange);font-size:11px">⚠ camera ${auto.join(' + ')} on auto — reading may drift</span>`;
}

// ─── Shared row-banding analyzer ───────────────────────────────────────
//
// The intra-frame rolling-shutter banding signal: a CMOS sensor reads out
// rows top-to-bottom over ~15-33 ms. A temporally modulated source can vary during
// that readout, painting horizontal stripes. Detecting variance ROW-WISE
// (per-row mean luma, then stddev across rows) can reveal modulation that
// frame-to-frame sampling misses. Camera readout timing is device-specific,
// so stripe count is not converted into a frequency.
//
// Returns:
//   frameMean   — mean luma across the whole frame (0–255 scale)
//   frameMax    — max single-pixel luma (catches bright spikes)
//   bandingRatio — stddev of row means / frame mean (camera banding strength)
//   stripes     — zero-crossings of detrended row signal across the frame;
//                 useful as a banding-strength feature, not frequency
//   rowMeans    — Float32Array of per-row mean luma (debugging / future use)
//
// Used by flicker, spectrum, CCT, and (peripherally) sleep-darkness tools.
// W and H must match the canvas the data was read from.
export function computeRowBanding(data, W, H) {
  const rowMeans = new Float32Array(H);
  let frameSum = 0;
  let frameMax = 0;
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    const base = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = base + x * 4;
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      rowSum += luma;
      if (luma > frameMax) frameMax = luma;
    }
    const m = rowSum / W;
    rowMeans[y] = m;
    frameSum += m;
  }
  const frameMean = frameSum / H;
  let varSum = 0;
  for (let y = 0; y < H; y++) {
    const d = rowMeans[y] - frameMean;
    varSum += d * d;
  }
  const rowStddev = Math.sqrt(varSum / H);
  const bandingRatio = frameMean > 1 ? rowStddev / frameMean : 0;
  let crossings = 0;
  for (let y = 1; y < H; y++) {
    if ((rowMeans[y] >= frameMean) !== (rowMeans[y - 1] >= frameMean)) crossings++;
  }
  const stripes = Math.floor(crossings / 2);
  return { frameMean, frameMax, bandingRatio, stripes, rowMeans };
}


// Device-local, one-point camera calibration used only to display an
// approximate camera lux estimate. It is not meter calibration and camera
// values remain excluded from biological screening calculations.
export function loadLuxCalibration() {
  try { return parseFloat(localStorage.getItem('labcharts-lux-calibration') || '') || 1.0; }
  catch (e) { return 1.0; }
}

export function saveLuxCalibration(factor) {
  try {
    localStorage.setItem('labcharts-lux-calibration', String(factor));
    localStorage.setItem('labcharts-lux-calibration-confirmed', 'true');
  }
  catch (e) {}
}

export function isLuxCalibrationConfirmed() {
  try { return localStorage.getItem('labcharts-lux-calibration-confirmed') === 'true'; }
  catch (e) { return false; }
}

export function clearLuxCalibration() {
  try {
    localStorage.removeItem('labcharts-lux-calibration');
    localStorage.removeItem('labcharts-lux-calibration-confirmed');
  } catch (e) {}
}
