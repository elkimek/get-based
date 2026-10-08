interface CameraRange { min: number; max: number }
interface CameraModes { exposureMode?: string; whiteBalanceMode?: string; focusMode?: string }
interface CameraCapabilities extends MediaTrackCapabilities {
  exposureMode?: string[]; whiteBalanceMode?: string[]; focusMode?: string[];
  exposureCompensation?: CameraRange; exposureTime?: CameraRange; iso?: CameraRange; colorTemperature?: CameraRange;
}
type CameraConstraint = MediaTrackConstraintSet & {
  exposureMode?: string; whiteBalanceMode?: string; focusMode?: string;
  exposureCompensation?: number; exposureTime?: number; iso?: number; colorTemperature?: number;
};
interface MeasurementTrack {
  getSettings?(): MediaTrackSettings & CameraModes;
  getCapabilities?(): CameraCapabilities;
  applyConstraints(constraints: { advanced: CameraConstraint[] }): Promise<void>;
}
interface MeasurementStream { getVideoTracks?(): MeasurementTrack[] }
interface CameraLockOptions { shortExposure?: boolean; longExposure?: boolean }
export interface CameraLockResult {
  exposure: 'manual' | 'auto'; whiteBalance: 'manual' | 'auto'; focus: 'manual' | 'auto';
  frameRate: number | null; iso: number | null; exposureTime: number | null;
}

// light-tool-camera.ts — Shared camera/runtime helpers for Light tools.

import {renderHTML as renderCameraGuideHTML} from './components/LightCameraGuidePresentation.svelte.html.js';
import {projectAimingGuide} from './light-camera-presentation.js';

export function getRequired2DContext(canvas: HTMLCanvasElement) {
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

let aimingGuideDelegatesInstalled = false;

function _handleAimingGuideClick(event: Event) {
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
export function getAimingGuideView(toolKey: string) {
  const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem(`labcharts-aim-guide-${toolKey}`) === 'dismissed';
  return projectAimingGuide(toolKey, dismissed);
}
export function aimingGuideHTML(toolKey: string) {
  const guide = getAimingGuideView(toolKey);
  return guide ? renderCameraGuideHTML({kind: 'guide', guide}) : '';
}

export function dismissAimingGuide(toolKey: string) {
  try { localStorage.setItem(`labcharts-aim-guide-${toolKey}`, 'dismissed'); } catch (_) {}
  // Hide the currently-rendered guide without re-rendering the whole modal.
  let el: HTMLElement | null = null;
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
export async function lockCameraForMeasurement(stream: MeasurementStream | null | undefined, opts: CameraLockOptions = {}): Promise<CameraLockResult> {
  const result: CameraLockResult = { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: null, iso: null, exposureTime: null };
  if (!stream || !stream.getVideoTracks) return result;
  const track = stream.getVideoTracks()[0];
  if (!track) return result;
  const settings = track.getSettings ? track.getSettings() : {};
  result.frameRate = settings.frameRate || null;
  // Some Chromium builds throw when getCapabilities is missing or the
  // track isn't fully started yet — treat as "auto fallback" rather than
  // hard-failing the whole tool.
  let caps: CameraCapabilities = {};
  try { caps = (track.getCapabilities && track.getCapabilities()) || {}; } catch (e) { caps = {}; }
  const advanced: CameraConstraint[] = [];
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')) {
    advanced.push({ exposureMode: 'manual' });
    if (Number.isFinite(caps.exposureCompensation?.min)) advanced.push({ exposureCompensation: 0 });
    // Pin shutter to a usable value for flicker detection — short enough
    // that some temporal modulation can show as rolling-shutter stripes
    // rather than being blurred by a long shutter, while still giving
    // signal. 1/120s = 8.33ms is a reasonable middle ground if the camera
    // exposes `exposureTime` (units: 100 µs in the WICG spec).
    if (opts.shortExposure && Number.isFinite(caps.exposureTime?.min)) {
      const target = Math.max(caps.exposureTime!.min, Math.min(caps.exposureTime!.max, 83)); // ~8.3ms
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
      const target = Math.max(caps.exposureTime!.min, Math.min(caps.exposureTime!.max, 333));
      advanced.push({ exposureTime: target });
      result.exposureTime = target;
    }
    result.exposure = 'manual';
  }
  // Lock ISO/gain to a known value so absolute pixel brightness is
  // calibrated — only some Android Chromium builds expose this. Without
  // it, we can't translate raw luma to lux at all.
  if (opts.longExposure && Number.isFinite(caps.iso?.min)) {
    const target = Math.max(caps.iso!.min, Math.min(caps.iso!.max, 400));
    advanced.push({ iso: target });
    result.iso = target;
  } else if (opts.shortExposure && Number.isFinite(caps.iso?.min)) {
    const target = Math.max(caps.iso!.min, Math.min(caps.iso!.max, 100));
    advanced.push({ iso: target });
    result.iso = target;
  }
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) {
    advanced.push({ whiteBalanceMode: 'manual' });
    // 5500 K (D55) is the closest to "no color cast" for measurements
    // taken against neutral surfaces. CCT/spectrum tools want consistent
    // raw R/G/B regardless of source illumination.
    if (Number.isFinite(caps.colorTemperature?.min)) {
      const target = Math.max(caps.colorTemperature!.min, Math.min(caps.colorTemperature!.max, 5500));
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
export function cameraLockStatusLine(lock: Partial<CameraLockResult> | null | undefined) {
  return lock ? renderCameraGuideHTML({kind: 'lock', lock}) : '';
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
export function computeRowBanding(data: ArrayLike<number>, W: number, H: number) {
  const rowMeans = new Float32Array(H);
  let frameSum = 0;
  let frameMax = 0;
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    const base = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = base + x * 4;
      const luma = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
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
    const d = rowMeans[y]! - frameMean;
    varSum += d * d;
  }
  const rowStddev = Math.sqrt(varSum / H);
  const bandingRatio = frameMean > 1 ? rowStddev / frameMean : 0;
  let crossings = 0;
  for (let y = 1; y < H; y++) {
    if ((rowMeans[y]! >= frameMean) !== (rowMeans[y - 1]! >= frameMean)) crossings++;
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

export function saveLuxCalibration(factor: number) {
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
