// light-tools.js — In-browser measurement tools for the Light lens.
//
// All tools run fully on-device. Camera frames are processed in-browser and
// never leave the user's device. The first 3 tools ship in Phase 1c:
//
//   Tool 1: Lux Meter           — AmbientLightSensor (Chrome Android) or
//                                  camera fallback with one-shot calibration.
//   Tool 2: Flicker Detector    — getUserMedia at the highest-available frame
//                                  rate, FFT on intensity to find PWM peaks.
//   Tool 6: Sleep Darkness Meter — long-exposure (high gain, multi-frame
//                                  averaged) reading at the pillow position.
//
// Tools 3 (CCT), 4 (Spectrum classifier), 5 (Glass transmission), 7 (Sunrise
// logger) ship in Phase 1d. Tool 8 (Eye-Level Audit) defers to v1.1.
//
// Measurements persist via importedData.lightMeasurements[] (already migrated
// in profile.js). Each entry stores tool, timestamp, value, confidence,
// optional location label.

import { state } from './state.js';
import { escapeHTML, escapeAttr, formatDate, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { recordTombstone } from './data-merge.js';

// ─── Storage ───────────────────────────────────────────────────────────

export function getMeasurements() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightMeasurements)) state.importedData.lightMeasurements = [];
  return state.importedData.lightMeasurements;
}

export async function saveMeasurement(tool, value, opts = {}) {
  const id = `lm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    tool,
    value,
    capturedAt: Date.now(),
    confidence: opts.confidence ?? 0.7,
    label: opts.label || null,
    notes: opts.notes || '',
    extra: opts.extra || null,
    roomId: opts.roomId || null,
  };
  getMeasurements().push(entry);
  await saveImportedData();
  // Re-render the Light & Sun page if the user is on it so per-room
  // detail panels pick up the new reading + recompute severity dots.
  // Skip when any modal is still open — the tool may not have torn down
  // its camera/RAF loop yet, and a navigate would yank DOM out from under
  // it (orphan video element, detached interval handlers). The next user
  // navigation picks up the new measurement on its own.
  if (typeof window !== 'undefined' && window.navigate && state.currentView === 'light') {
    setTimeout(() => {
      if (document.querySelector('.modal-overlay.show')) return;
      window.navigate('light');
    }, 50);
  }
  return entry;
}

// Filter the global measurement list down to a single room. Used by the
// room detail panel + room severity derivation.
export function getMeasurementsForRoom(roomId) {
  if (!roomId) return [];
  return getMeasurements().filter(m => m.roomId === roomId);
}

export async function deleteMeasurement(id) {
  const list = getMeasurements();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return false;
  recordTombstone(state.importedData, 'lightMeasurements', id);
  list.splice(idx, 1);
  await saveImportedData();
  return true;
}

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
// caller can show a fallback note. Tools that benefit from auto mode
// (sleep-darkness uses long-exposure auto-gain) just skip this helper.
//
// Returns: { exposure: 'manual' | 'auto', whiteBalance: 'manual' | 'auto',
//            focus: 'manual' | 'auto', frameRate: <fps actually delivered> }
export async function lockCameraForMeasurement(stream, opts = {}) {
  const result = { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: null };
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
    // that PWM banding at 100 Hz+ shows up as visible stripes (not blurred
    // by a long shutter), but long enough that ambient indoor light gives
    // signal. 1/120s = 8.33ms is a reasonable middle ground if the camera
    // exposes `exposureTime` (units: 100 µs in the WICG spec).
    if (opts.shortExposure && Number.isFinite(caps.exposureTime?.min)) {
      const target = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, 83)); // ~8.3ms
      advanced.push({ exposureTime: target });
    }
    result.exposure = 'manual';
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
    return { exposure: 'auto', whiteBalance: 'auto', focus: 'auto', frameRate: result.frameRate };
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

// ─── Tool 1: Lux Meter ─────────────────────────────────────────────────

const LUX_ZONES = [
  { max: 10,     label: 'Darkness',          color: 'var(--text-muted)' },
  { max: 100,    label: 'Low indoor',        color: 'var(--text-secondary)' },
  { max: 500,    label: 'Office',            color: 'var(--text-primary)' },
  { max: 1000,   label: 'Bright indoor',     color: 'var(--accent)' },
  { max: 10000,  label: 'Overcast outdoor',  color: 'var(--green)' },
  { max: 100000, label: 'Outdoor daylight',  color: 'var(--orange)' },
  { max: Infinity, label: 'Direct sun',       color: 'var(--orange)' },
];

function luxZone(lux) {
  for (const z of LUX_ZONES) if (lux <= z.max) return z;
  return LUX_ZONES[LUX_ZONES.length - 1];
}

let _luxState = { running: false, sensor: null, stream: null, video: null, calibration: 1.0 };

function loadLuxCalibration() {
  try { return parseFloat(localStorage.getItem('labcharts-lux-calibration')) || 1.0; }
  catch (e) { return 1.0; }
}

function saveLuxCalibration(factor) {
  try { localStorage.setItem('labcharts-lux-calibration', String(factor)); }
  catch (e) {}
}

export async function openLuxMeter(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Lux meter">
    <div class="modal-header">
      <h3>Lux Meter</h3>
      <button class="modal-close" onclick="window._closeLuxMeter()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint" id="lux-source-line">Initializing…</p>
      <div class="lux-dial">
        <div class="lux-dial-value" id="lux-value">—</div>
        <div class="lux-dial-unit">lux</div>
        <div class="lux-dial-zone" id="lux-zone">—</div>
      </div>
      <div class="lux-zones">
        ${LUX_ZONES.slice(0, 6).map(z => `<div class="lux-zone-marker">≤ ${z.max} <span>${z.label}</span></div>`).join('')}
      </div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeLuxMeter()">Done</button>
        <button class="import-btn import-btn-primary" id="lux-save">Save reading</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  let currentLux = null;
  const valueEl = overlay.querySelector('#lux-value');
  const zoneEl = overlay.querySelector('#lux-zone');
  const sourceLine = overlay.querySelector('#lux-source-line');
  _luxState.running = true;
  _luxState.calibration = loadLuxCalibration();

  // Try AmbientLightSensor first (modern Chrome on Android with permission)
  let usingALS = false;
  if ('AmbientLightSensor' in window) {
    try {
      const sensor = new window.AmbientLightSensor({ frequency: 4 });
      sensor.addEventListener('reading', () => {
        currentLux = sensor.illuminance;
        renderLux(currentLux);
      });
      sensor.start();
      _luxState.sensor = sensor;
      usingALS = true;
      sourceLine.textContent = 'Reading from your phone\'s ambient light sensor.';
    } catch (e) {
      // Fall through to camera path
    }
  }

  // Fallback: camera-based estimate
  if (!usingALS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } });
      _luxState.stream = stream;
      const lock = await lockCameraForMeasurement(stream);
      sourceLine.innerHTML = `Camera estimate (calibration ${_luxState.calibration.toFixed(2)}×, ±30%). ${cameraLockStatusLine(lock)}`;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      _luxState.video = video;
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const ctx = canvas.getContext('2d');
      const tick = () => {
        if (!_luxState.running) return;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            // Luma approx — Rec.709 weights
            sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          }
          const meanLuma = sum / (data.length / 4);
          // Crude mapping: 0–255 luma → 0–10000 lux at default calibration.
          // Real-world calibration via the "Calibrate" button under settings.
          currentLux = Math.max(0, meanLuma * 40 * _luxState.calibration);
          renderLux(currentLux);
        } catch (e) {
          /* video not ready yet */
        }
        if (_luxState.running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      sourceLine.textContent = 'Camera access denied. Manual lux entry only.';
    }
  }

  function renderLux(v) {
    if (v == null) { valueEl.textContent = '—'; zoneEl.textContent = '—'; return; }
    valueEl.textContent = v < 100 ? v.toFixed(0) : Math.round(v).toLocaleString();
    const z = luxZone(v);
    zoneEl.textContent = z.label;
    zoneEl.style.color = z.color;
  }

  overlay.querySelector('#lux-save').addEventListener('click', async () => {
    if (currentLux == null) return;
    await saveMeasurement('lux', currentLux, {
      confidence: usingALS ? 0.85 : 0.55,
      extra: { source: usingALS ? 'AmbientLightSensor' : 'camera-estimate' },
      roomId,
    });
    showNotification(`Lux reading saved: ${Math.round(currentLux)}`);
    window._closeLuxMeter();
  });

  window._closeLuxMeter = () => {
    _luxState.running = false;
    if (_luxState.sensor) { try { _luxState.sensor.stop(); } catch (e) {} _luxState.sensor = null; }
    if (_luxState.stream) { try { _luxState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _luxState.stream = null; }
    _luxState.video = null;
    overlay.remove();
  };
}

// ─── Tool 2: Flicker Detector ──────────────────────────────────────────

let _flickerState = { running: false, stream: null };

export async function openFlickerDetector(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Flicker detector">
    <div class="modal-header">
      <h3>Flicker Detector</h3>
      <button class="modal-close" onclick="window._closeFlicker()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Aim your phone camera at the light you want to test. Banding stripes indicate PWM flicker.</p>
      <video id="flicker-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:240px"></video>
      <div class="flicker-result" id="flicker-result">Hold camera on a light for 5 seconds…</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeFlicker()">Done</button>
        <button class="import-btn import-btn-primary" id="flicker-save">Save reading</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  let lastResult = null;
  const resultEl = overlay.querySelector('#flicker-result');
  const video = overlay.querySelector('#flicker-video');
  _flickerState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    _flickerState.stream = stream;
    video.srcObject = stream;
    await video.play();
    // Lock exposure short + manual so PWM banding is visible — auto mode
    // smooths the brightness fluctuations that ARE the signal we're after.
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    const lockNote = cameraLockStatusLine(lock);
    if (lockNote) resultEl.innerHTML = `Hold camera on a light for 5 seconds…<br>${lockNote}`;
    if (lock.frameRate && lock.frameRate < 60) {
      // Below 60 fps the Nyquist limit puts a 30 Hz ceiling on detectable
      // PWM. Phone cameras often clamp to 30 fps regardless of `ideal: 240`.
      // Tell the user up-front rather than reporting "Flicker-free" for a
      // 200 Hz PWM lamp the camera literally can't see.
      resultEl.innerHTML += `<br><small style="color:var(--orange)">⚠ camera running at ${Math.round(lock.frameRate)} fps — PWM above ${Math.round(lock.frameRate / 2)} Hz won't show up. Try a different camera if available.</small>`;
    }
    // Two-channel detection:
    //   1. Frame-luma variance (detects PWM up to fps/2 Hz only — useless
    //      above ~30 Hz on a 60 fps camera). Kept for slow flicker /
    //      mains-frequency 50/60 Hz visibility.
    //   2. Intra-frame ROW banding from rolling shutter. The sensor reads
    //      out top-to-bottom over ~15-33 ms; a PWM source modulates the
    //      light during that readout, painting horizontal stripes onto
    //      the frame. Detecting variance ROW-WISE (column means per row,
    //      then stddev across rows) reveals PWM at 100 Hz – 25 kHz that
    //      frame-rate sampling literally cannot see. Standard technique
    //      used by commercial PWM-detection apps + still photography.
    //
    // Use 64x48 capture so we have enough rows to see banding cleanly.
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    const frameSamples = [];
    const bandingSamples = [];
    const startTime = performance.now();
    const tick = () => {
      if (!_flickerState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Compute per-row mean luma — that's the rolling-shutter signal.
      const W = canvas.width, H = canvas.height;
      const rowMeans = new Float32Array(H);
      let frameSum = 0;
      for (let y = 0; y < H; y++) {
        let rowSum = 0;
        const base = y * W * 4;
        for (let x = 0; x < W; x++) {
          const i = base + x * 4;
          rowSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const m = rowSum / W;
        rowMeans[y] = m;
        frameSum += m;
      }
      const frameMean = frameSum / H;
      // Banding ratio: stddev of row means, normalized by frame mean.
      // High value = strong horizontal stripes = PWM during readout.
      let varSum = 0;
      for (let y = 0; y < H; y++) {
        const d = rowMeans[y] - frameMean;
        varSum += d * d;
      }
      const rowStddev = Math.sqrt(varSum / H);
      const bandingRatio = frameMean > 1 ? rowStddev / frameMean : 0;
      // Crude readout-time-derived frequency: count zero-crossings of the
      // detrended row-mean signal across the frame. If the camera's
      // rolling-shutter readout is ~25ms (typical phone), N stripes mean
      // a PWM frequency of N / 0.025s = N * 40 Hz. Without per-device
      // calibration this is rough; we surface "fast/slow" not exact Hz.
      let crossings = 0;
      for (let y = 1; y < H; y++) {
        if ((rowMeans[y] >= frameMean) !== (rowMeans[y - 1] >= frameMean)) crossings++;
      }
      const stripes = Math.floor(crossings / 2);
      // Frame-luma channel (legacy)
      const frameLumaSum = frameMean * H;
      frameSamples.push({ t: performance.now() - startTime, v: frameLumaSum });
      bandingSamples.push({ t: performance.now() - startTime, banding: bandingRatio, stripes });
      if (frameSamples.length > 240) frameSamples.shift();
      if (bandingSamples.length > 240) bandingSamples.shift();
      if (frameSamples.length >= 60) renderFlicker(frameSamples, bandingSamples, lock);
      if (_flickerState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    resultEl.textContent = 'Camera access denied — flicker detector unavailable.';
  }

  function renderFlicker(frameSamples, bandingSamples, lock) {
    const recent = frameSamples.slice(-120);
    if (recent.length < 30) return;

    // Channel 1: frame-luma variance over last second (slow flicker, mains 50/60 Hz).
    const vals = recent.map(s => s.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const frameRatio = mean ? (max - min) / mean : 0;

    // Channel 2: intra-frame row banding — the strong signal for fast PWM.
    // Take the maximum banding ratio across recent frames (banding flickers
    // in/out as PWM phase aligns with readout). Single-frame max is more
    // robust than mean: a strong stripe pattern in any one frame is real.
    const recentBanding = bandingSamples.slice(-60);
    const peakBanding = recentBanding.reduce((m, s) => Math.max(m, s.banding), 0);
    const peakStripes = recentBanding.reduce((m, s) => Math.max(m, s.stripes), 0);

    // Combined score — banding dominates because it sees the PWM range
    // that frame-luma can't (>30 Hz on a 60 fps camera).
    let score, label;
    const aeActive = !lock || lock.exposure !== 'manual';
    if (peakBanding > 0.18) { score = 3; label = 'Heavy flicker — consider replacing this light'; }
    else if (peakBanding > 0.10) { score = 2; label = 'Visible flicker — eye-strain risk'; }
    else if (peakBanding > 0.04 || frameRatio > 0.12) { score = 1; label = 'Mild flicker, likely OK for most'; }
    else if (aeActive) { score = 0; label = 'Below detection threshold (camera in auto mode)'; }
    else { score = 0; label = 'Flicker-free (no rolling-shutter banding detected)'; }

    // Frequency estimate from stripe count + assumed 25ms readout
    let freq = '';
    if (peakStripes >= 2) {
      const estHz = peakStripes * 40; // N / 0.025s
      freq = ` · ~${estHz} Hz (rolling-shutter banding)`;
    }

    lastResult = {
      score, label,
      bandingRatio: peakBanding,
      stripes: peakStripes,
      frameRatio,
    };
    resultEl.innerHTML = `<strong class="flicker-score-${score}">${escapeHTML(label)}</strong>${escapeHTML(freq)}<br><small style="color:var(--text-muted)">banding ${peakBanding.toFixed(3)} · frame-luma ${frameRatio.toFixed(3)}${peakStripes >= 2 ? ` · ${peakStripes} stripes/frame` : ''}</small>`;
  }

  overlay.querySelector('#flicker-save').addEventListener('click', async () => {
    if (!lastResult) return;
    await saveMeasurement('flicker', lastResult.score, {
      confidence: 0.7,
      extra: lastResult,
      roomId,
    });
    showNotification(`Flicker score saved: ${lastResult.label}`);
    window._closeFlicker();
  });

  window._closeFlicker = () => {
    _flickerState.running = false;
    if (_flickerState.stream) { try { _flickerState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _flickerState.stream = null; }
    overlay.remove();
  };
}

// ─── Tool 6: Sleep Darkness Meter ─────────────────────────────────────

let _darkState = { running: false, stream: null };

export async function openDarknessMeter(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Sleep darkness meter">
    <div class="modal-header">
      <h3>Sleep Darkness Meter</h3>
      <button class="modal-close" onclick="window._closeDark()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Place your phone face-up where your eyes will be. Lights as you'll sleep.</p>
      <div class="dark-status" id="dark-status">Press Start when ready.</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeDark()">Cancel</button>
        <button class="import-btn import-btn-primary" id="dark-start">Start 30-second read</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  let result = null;
  const statusEl = overlay.querySelector('#dark-status');
  const startBtn = overlay.querySelector('#dark-start');

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    statusEl.textContent = 'Reading… leave the phone face-up and don\'t cover the camera.';
    _darkState.running = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 160, height: 120 },
      });
      _darkState.stream = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 24;
      const ctx = canvas.getContext('2d');
      const lumas = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 30000 && _darkState.running) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        lumas.push(sum / (data.length / 4));
        await new Promise(r => setTimeout(r, 200));
      }
      const meanLuma = lumas.reduce((a, b) => a + b, 0) / Math.max(1, lumas.length);
      // Rough lux estimate at near-darkness (camera noise floor ~2 luma → ~0.1 lux)
      const lux = Math.max(0, meanLuma * 0.5);
      let label, cls;
      if (lux < 0.3) { label = 'Excellent — true darkness'; cls = 'ok'; }
      else if (lux < 1) { label = 'Good — minor light leak, melatonin mostly preserved'; cls = 'ok'; }
      else if (lux < 5) { label = 'Light leak detected — likely 20–30% melatonin attenuation'; cls = 'warn'; }
      else { label = 'Bright — melatonin amplitude significantly suppressed'; cls = 'over'; }
      result = { lux, label, cls };
      statusEl.innerHTML = `<strong class="dark-status-${cls}">${escapeHTML(label)}</strong><br><small style="color:var(--text-muted)">Estimated ${lux.toFixed(2)} lux at sleep position</small>`;
      startBtn.textContent = 'Save reading';
      startBtn.disabled = false;
      startBtn.onclick = async () => {
        await saveMeasurement('darkness', lux, { confidence: 0.6, extra: result, roomId });
        showNotification('Sleep darkness reading saved.');
        window._closeDark();
      };
    } catch (e) {
      statusEl.textContent = 'Camera access denied — darkness meter unavailable.';
      startBtn.disabled = false;
    }
  });

  window._closeDark = () => {
    _darkState.running = false;
    if (_darkState.stream) { try { _darkState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _darkState.stream = null; }
    overlay.remove();
  };
}

// ─── Tool 3: CCT Meter ────────────────────────────────────────────────

let _cctState = { running: false, stream: null };

export async function openCCTMeter(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Color temperature meter">
    <div class="modal-header">
      <h3>Color Temperature</h3>
      <button class="modal-close" onclick="window._closeCCT()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Aim your camera at a white wall, paper, or grey card. Reading updates live.</p>
      <video id="cct-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:200px"></video>
      <div class="cct-result">
        <div class="cct-value" id="cct-value">— K</div>
        <div class="cct-tone" id="cct-tone">—</div>
        <div class="cct-coherence" id="cct-coherence"></div>
      </div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeCCT()">Done</button>
        <button class="import-btn import-btn-primary" id="cct-save">Save reading</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  let currentCCT = null;
  const valueEl = overlay.querySelector('#cct-value');
  const toneEl = overlay.querySelector('#cct-tone');
  const cohEl = overlay.querySelector('#cct-coherence');
  const video = overlay.querySelector('#cct-video');
  _cctState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 320, height: 240 },
    });
    _cctState.stream = stream;
    video.srcObject = stream;
    await video.play();
    // Manual WB + exposure are the entire game here — auto-WB neutralizes
    // the color cast we're trying to measure. Without the lock, R/B ratio
    // is the camera's residual error, not the source CCT.
    const lock = await lockCameraForMeasurement(stream);
    if (lock.whiteBalance !== 'manual') {
      cohEl.innerHTML = `<span style="color:var(--orange);font-size:11px">⚠ camera auto-white-balance is on — CCT reading is the camera's error, not the source. Try a different browser / phone, or use a meter for accurate readings.</span>`;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 24;
    const ctx = canvas.getContext('2d');
    const tick = () => {
      if (!_cctState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      const px = data.length / 4;
      r /= px; g /= px; b /= px;
      // Crude CCT estimate from R/B ratio (McCamy approximation, very rough)
      const sum = r + g + b || 1;
      const rN = r / sum, bN = b / sum;
      // Higher b/r ratio → cooler. Map to 1800–7000K.
      const ratio = bN / Math.max(rN, 0.01);
      const cct = Math.round(1800 + Math.min(5200, ratio * 4500));
      currentCCT = cct;
      valueEl.textContent = `${cct} K`;
      toneEl.textContent = cctTone(cct);
      // Only render the solar-coherence hint when WB lock succeeded —
      // otherwise the CCT value itself is unreliable, so the hint built
      // on top of it would mislead.
      if (lock.whiteBalance === 'manual') cohEl.innerHTML = solarCoherence(cct);
      if (_cctState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    valueEl.textContent = 'Camera denied';
  }

  overlay.querySelector('#cct-save').addEventListener('click', async () => {
    if (currentCCT == null) return;
    await saveMeasurement('cct', currentCCT, { confidence: 0.5, roomId });
    showNotification(`Color temp saved: ${currentCCT} K`);
    window._closeCCT();
  });

  window._closeCCT = () => {
    _cctState.running = false;
    if (_cctState.stream) { try { _cctState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _cctState.stream = null; }
    overlay.remove();
  };
}

function cctTone(k) {
  if (k < 2200) return 'Candle';
  if (k < 3000) return 'Warm white (incandescent / warm LED)';
  if (k < 4000) return 'Soft white';
  if (k < 5000) return 'Cool white / fluorescent';
  if (k < 6000) return 'Daylight';
  return 'Overcast / blue-shifted';
}

function solarCoherence(k) {
  // Compare to solar CCT for current local hour (rough)
  const hr = new Date().getHours();
  let solarK;
  if (hr < 6 || hr >= 20) solarK = 2000;
  else if (hr < 8 || hr >= 18) solarK = 3500;
  else if (hr < 10 || hr >= 16) solarK = 5000;
  else solarK = 5500;
  const diff = Math.abs(k - solarK);
  if (diff < 800) return `<span style="color:var(--green)">✓ matches solar time (~${solarK} K)</span>`;
  if (diff < 1500) return `<span style="color:var(--text-secondary)">slight mismatch (solar now ~${solarK} K)</span>`;
  return `<span style="color:var(--orange)">⚠ mismatch — solar is ~${solarK} K right now</span>`;
}

// ─── Tool 4: Spectrum Classifier (simplified) ────────────────────────

let _specState = { running: false, stream: null };

export async function openSpectrumClassifier(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Spectrum classifier">
    <div class="modal-header">
      <h3>What kind of light is this?</h3>
      <button class="modal-close" onclick="window._closeSpec()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Aim at the light source. We classify by RGB pattern and flicker.</p>
      <video id="spec-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:200px"></video>
      <div class="spec-result" id="spec-result">Reading…</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeSpec()">Done</button>
        <button class="import-btn import-btn-primary" id="spec-save">Save reading</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  let result = null;
  const resultEl = overlay.querySelector('#spec-result');
  const video = overlay.querySelector('#spec-video');
  _specState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    _specState.stream = stream;
    video.srcObject = stream;
    await video.play();
    // Manual exposure + WB so the classifier reads the actual emitter,
    // not the camera's auto-corrected output. Auto-mode would map every
    // light source toward neutral grey, defeating classification.
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    if (lock.whiteBalance !== 'manual' || lock.exposure !== 'manual') {
      resultEl.innerHTML = `<span style="color:var(--orange);font-size:12px">⚠ camera auto-mode partially active — classification reliability is reduced. ${cameraLockStatusLine(lock)}</span>`;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const lumaSamples = [];
    const tick = () => {
      if (!_specState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0, luma = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        luma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      const px = data.length / 4;
      r /= px; g /= px; b /= px; luma /= px;
      lumaSamples.push(luma);
      if (lumaSamples.length > 120) lumaSamples.shift();
      result = classifyLight({ r, g, b, lumaSamples });
      // Discount confidence by 30% when WB couldn't be locked — under
      // auto-WB the R/G/B ratios reflect camera correction, not source.
      if (lock.whiteBalance !== 'manual') result = { ...result, confidence: result.confidence * 0.7, reason: result.reason + ' (camera auto-WB → low confidence)' };
      resultEl.innerHTML = `<strong>${escapeHTML(result.label)}</strong> <span style="color:var(--text-muted)">· ${(result.confidence * 100).toFixed(0)}% confidence</span><br><small style="color:var(--text-secondary)">${escapeHTML(result.reason)}</small>`;
      if (_specState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    resultEl.textContent = 'Camera denied.';
  }

  overlay.querySelector('#spec-save').addEventListener('click', async () => {
    if (!result) return;
    await saveMeasurement('spectrum', result.label, { confidence: result.confidence, extra: result, roomId });
    showNotification(`Light type saved: ${result.label}`);
    window._closeSpec();
  });

  window._closeSpec = () => {
    _specState.running = false;
    if (_specState.stream) { try { _specState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _specState.stream = null; }
    overlay.remove();
  };
}

// 5-category v1 classifier — RGB ratio + flicker variance signature
function classifyLight({ r, g, b, lumaSamples }) {
  const sum = r + g + b || 1;
  const rN = r / sum, gN = g / sum, bN = b / sum;
  // Flicker variance over recent samples
  const mean = lumaSamples.reduce((a, b) => a + b, 0) / Math.max(1, lumaSamples.length);
  const variance = lumaSamples.length > 10
    ? Math.max(...lumaSamples) - Math.min(...lumaSamples)
    : 0;
  const flickerRatio = mean ? variance / mean : 0;

  // Decision tree (very simple — the published Phase 1d note)
  if (flickerRatio > 0.20 && gN > 0.36) {
    return { label: 'Fluorescent / CFL', confidence: 0.7, reason: 'High flicker variance + green spike — typical 60 Hz fluorescent signature.' };
  }
  if (rN > 0.40 && bN < 0.20) {
    return { label: 'Incandescent / halogen', confidence: 0.75, reason: 'Red-rich, low blue — filament-style emitter.' };
  }
  if (bN > 0.36 && flickerRatio < 0.10) {
    return { label: 'Cool LED (4000K+)', confidence: 0.7, reason: 'Blue-rich, near-flicker-free — cool LED.' };
  }
  if (rN > 0.32 && bN < 0.30 && flickerRatio < 0.10) {
    return { label: 'Warm LED (2700–3000K)', confidence: 0.7, reason: 'Slight red lift, near-flicker-free — warm LED.' };
  }
  if (Math.abs(rN - 0.33) < 0.05 && Math.abs(bN - 0.33) < 0.05) {
    return { label: 'Daylight or full-spectrum', confidence: 0.6, reason: 'Balanced RGB — natural or full-spectrum source.' };
  }
  return { label: 'Mixed / unclassified', confidence: 0.4, reason: 'Pattern doesn\'t match a known signature.' };
}

// ─── Tool 5: Glass Transmission Test ──────────────────────────────────

let _glassReadings = { inside: null, outside: null };

export async function openGlassTransmission(opts = {}) {
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Glass transmission test">
    <div class="modal-header">
      <h3>Window / Glass Transmission</h3>
      <button class="modal-close" onclick="window._closeGlass()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Two readings: one through the glass, one outside (or in front of the same window without it). We compute the ratio.</p>
      <div class="glass-step" id="glass-step-inside">
        <span>Step 1: <strong>through the glass</strong></span>
        <button class="import-btn import-btn-secondary" id="glass-measure-inside">Measure inside</button>
        <span class="glass-reading" id="glass-reading-inside">—</span>
      </div>
      <div class="glass-step" id="glass-step-outside">
        <span>Step 2: <strong>direct (no glass)</strong></span>
        <button class="import-btn import-btn-secondary" id="glass-measure-outside">Measure outside</button>
        <span class="glass-reading" id="glass-reading-outside">—</span>
      </div>
      <div class="glass-result" id="glass-result"></div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeGlass()">Done</button>
        <button class="import-btn import-btn-primary" id="glass-save" disabled>Save reading</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  _glassReadings = { inside: null, outside: null };

  let _lastGlassLock = null;
  const measure = async (which) => {
    // Reuse the lux-camera path inline. Simpler than spinning up the modal.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 } });
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      // Critical: the through-glass and direct samples MUST use the same
      // exposure/WB or the ratio compares apples to oranges. Auto-mode
      // re-exposes for each scene → ratio reflects camera-AE, not glass.
      const lock = await lockCameraForMeasurement(stream);
      _lastGlassLock = lock;
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 24;
      const ctx = canvas.getContext('2d');
      // Sample over 1s
      const samples = [];
      for (let i = 0; i < 8; i++) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let j = 0; j < data.length; j += 4) sum += 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
        samples.push(sum / (data.length / 4));
        await new Promise(r => setTimeout(r, 125));
      }
      stream.getTracks().forEach(t => t.stop());
      const meanLuma = samples.reduce((a, b) => a + b, 0) / samples.length;
      const luxEst = Math.max(0, meanLuma * 40 * loadLuxCalibration());
      _glassReadings[which] = luxEst;
      overlay.querySelector(`#glass-reading-${which}`).textContent = `${Math.round(luxEst)} lux`;
      computeGlass();
    } catch (e) {
      overlay.querySelector(`#glass-reading-${which}`).textContent = 'denied';
    }
  };
  overlay.querySelector('#glass-measure-inside').addEventListener('click', () => measure('inside'));
  overlay.querySelector('#glass-measure-outside').addEventListener('click', () => measure('outside'));

  function computeGlass() {
    if (_glassReadings.inside == null || _glassReadings.outside == null) return;
    const transmission = Math.min(1, _glassReadings.inside / Math.max(_glassReadings.outside, 1));
    const blocked = (1 - transmission) * 100;
    const lockNote = _lastGlassLock && _lastGlassLock.exposure !== 'manual'
      ? `<br><small style="color:var(--orange)">⚠ camera auto-exposure was active — re-exposes between samples, the ratio above is approximate. Re-take readings if you need precision.</small>`
      : '';
    overlay.querySelector('#glass-result').innerHTML =
      `<strong>Glass transmits ${(transmission * 100).toFixed(0)}% of visible light</strong>` +
      `<br><small>Blocks ~${blocked.toFixed(0)}% of broadband visible. <strong>UV transmission cannot be inferred from this measurement</strong> — Low-E and UV-blocking coatings have very different UV/visible ratios. A handheld UV meter is required to verify UV-A or UV-B blocking.</small>${lockNote}`;
    overlay.querySelector('#glass-save').disabled = false;
    overlay.querySelector('#glass-save').onclick = async () => {
      await saveMeasurement('glass-transmission', transmission, {
        confidence: _lastGlassLock && _lastGlassLock.exposure === 'manual' ? 0.7 : 0.5,
        extra: { inside: _glassReadings.inside, outside: _glassReadings.outside, lockMode: _lastGlassLock?.exposure || 'auto' },
        roomId,
      });
      showNotification(`Glass transmission saved: ${(transmission * 100).toFixed(0)}%`);
      window._closeGlass();
    };
  }

  window._closeGlass = () => overlay.remove();
}

// ─── Tool 7: Sunrise / Sunset Logger ──────────────────────────────────

export function openSunriseLogger() {
  // Pure timer + solar geometry — opens a simple confirmation flow.
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  const hr = new Date().getHours();
  let label = 'Golden hour';
  if (hr >= 5 && hr < 9) label = 'Sunrise window';
  else if (hr >= 16 && hr < 21) label = 'Sunset window';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Golden hour log">
    <div class="modal-header">
      <h3>Golden hour log <span style="font-weight:400;color:var(--text-muted);font-size:13px">— ${escapeHTML(label)}</span></h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Quick log for golden-hour outdoor light. Eye exposure is automatic — circadian channel maxed for the duration.</p>
      <label class="ctx-label">Duration outside (minutes)
        <input type="number" id="sunrise-duration" class="ctx-input" min="1" max="120" value="15" />
      </label>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="sunrise-save">Log session</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#sunrise-save').addEventListener('click', async () => {
    const minutes = parseInt(overlay.querySelector('#sunrise-duration').value, 10) || 15;
    if (window.logCompletedSession) {
      const start = Date.now() - minutes * 60 * 1000;
      await window.logCompletedSession({
        startedAt: start,
        endedAt: Date.now(),
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], glassBetween: false },
        eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: minutes * 60 },
        notes: label,
      });
      const id = window.getSessions().slice(-1)[0]?.id;
      if (id && window.hydrateSession) await window.hydrateSession(id);
    }
    showNotification(`${label} logged: ${minutes} min`);
    overlay.remove();
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// ─── Tool 8: Eye-Level Audit (10-min walkthrough) ─────────────────────

let _auditState = { running: false, stream: null, samples: [] };

export async function openEyeLevelAudit() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Home audit">
    <div class="modal-header">
      <h3>Home audit <span style="font-weight:400;color:var(--text-muted);font-size:13px">— 10 min walkthrough</span></h3>
      <button class="modal-close" onclick="window._closeAudit()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Walk through your home holding the phone at eye level. Pause briefly in each room (~5–10 seconds). Press Done when finished — we'll surface a per-room mini-report.</p>
      <div class="audit-status" id="audit-status">Press Start when ready.</div>
      <ol class="audit-room-list" id="audit-room-list" style="margin-top:12px;list-style:decimal inside;color:var(--text-secondary)"></ol>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeAudit()">Cancel</button>
        <button class="import-btn import-btn-primary" id="audit-toggle">Start audit</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector('#audit-status');
  const listEl = overlay.querySelector('#audit-room-list');
  const toggleBtn = overlay.querySelector('#audit-toggle');
  let pauseDetections = [];

  toggleBtn.addEventListener('click', async () => {
    if (!_auditState.running) {
      // Start
      _auditState.running = true;
      _auditState.samples = [];
      pauseDetections = [];
      toggleBtn.textContent = 'Done';
      statusEl.textContent = 'Recording… walk through each room you spend time in. Pause for ~5 seconds in each.';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 } });
        _auditState.stream = stream;
        const video = document.createElement('video');
        video.srcObject = stream; video.muted = true; video.playsInline = true;
        await video.play();
        // Lock exposure across the whole walkthrough — without this, AE
        // re-exposes when you walk into a brighter / dimmer room, making
        // the per-room luma values incomparable. We want the absolute
        // brightness signal, not the camera-corrected one.
        const lock = await lockCameraForMeasurement(stream);
        if (lock.exposure !== 'manual') {
          statusEl.innerHTML = `Recording… <span style="color:var(--orange);font-size:11px">⚠ camera auto-exposure on — per-room values will be relative, not absolute lux.</span>`;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 24;
        const ctx = canvas.getContext('2d');
        let lastSampleLuma = null;
        let pauseStart = null;
        const tick = async () => {
          if (!_auditState.running) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          const luma = sum / (data.length / 4);
          const t = performance.now();
          _auditState.samples.push({ t, luma });
          // Pause detection: low variance over 5s
          if (lastSampleLuma != null && Math.abs(luma - lastSampleLuma) < 5) {
            if (!pauseStart) pauseStart = t;
            else if (t - pauseStart > 5000) {
              // Mark a pause snapshot
              const lux = Math.max(0, luma * 40 * loadLuxCalibration());
              pauseDetections.push({ at: t, luma, lux });
              listEl.innerHTML = pauseDetections.map((p, i) => `<li>Room ${i + 1}: ~${Math.round(p.lux)} lux</li>`).join('');
              pauseStart = null; // reset until movement
            }
          } else {
            pauseStart = null;
          }
          lastSampleLuma = luma;
          if (_auditState.running) setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        statusEl.textContent = 'Camera access denied — audit unavailable.';
        _auditState.running = false;
      }
    } else {
      // Stop
      _auditState.running = false;
      if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _auditState.stream = null; }
      // Save detections as one bulk measurement
      if (pauseDetections.length > 0) {
        await saveMeasurement('audit', pauseDetections.length, {
          confidence: 0.5,
          extra: { rooms: pauseDetections.map((p, i) => ({ index: i + 1, lux: p.lux })) },
        });
        showNotification(`Audit saved · ${pauseDetections.length} room snapshots.`);
      } else {
        showNotification('No room pauses detected — try holding still longer next time.');
      }
      window._closeAudit();
    }
  });

  window._closeAudit = () => {
    _auditState.running = false;
    if (_auditState.stream) { try { _auditState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _auditState.stream = null; }
    overlay.remove();
  };
}

// ─── Tools page render ────────────────────────────────────────────────

export function renderLightTools() {
  return `<div class="light-tools-section">
    <h3 class="light-section-title">Light tools</h3>
    <p class="light-section-hint">Measurements run on your device. Camera frames never leave your phone.</p>
    <div class="light-tools-grid">
      <button class="light-tool-card" onclick="window.openLuxMeter()">
        <div class="light-tool-icon">📏</div>
        <div class="light-tool-name">Lux Meter</div>
        <div class="light-tool-desc">How bright is this room?</div>
      </button>
      <button class="light-tool-card" onclick="window.openFlickerDetector()">
        <div class="light-tool-icon">⚡</div>
        <div class="light-tool-name">Flicker Detector</div>
        <div class="light-tool-desc">Is this light flickering?</div>
      </button>
      <button class="light-tool-card" onclick="window.openCCTMeter()">
        <div class="light-tool-icon">🎨</div>
        <div class="light-tool-name">Color Temp</div>
        <div class="light-tool-desc">Warm or cool? Matches solar time?</div>
      </button>
      <button class="light-tool-card" onclick="window.openSpectrumClassifier()">
        <div class="light-tool-icon">🔬</div>
        <div class="light-tool-name">What is this light?</div>
        <div class="light-tool-desc">LED, fluorescent, daylight, or incandescent?</div>
      </button>
      <button class="light-tool-card" onclick="window.openGlassTransmission()">
        <div class="light-tool-icon">🪟</div>
        <div class="light-tool-name">Glass Transmission</div>
        <div class="light-tool-desc">How much does this window cut?</div>
      </button>
      <button class="light-tool-card" onclick="window.openDarknessMeter()">
        <div class="light-tool-icon">🌙</div>
        <div class="light-tool-name">Sleep Darkness</div>
        <div class="light-tool-desc">Is your bedroom dark enough?</div>
      </button>
      <button class="light-tool-card" onclick="window.openSunriseLogger()">
        <div class="light-tool-icon">🌅</div>
        <div class="light-tool-name">Golden hour log</div>
        <div class="light-tool-desc">Quick log for sunrise / sunset sessions.</div>
      </button>
      <button class="light-tool-card" onclick="window.openEyeLevelAudit()">
        <div class="light-tool-icon">🚶</div>
        <div class="light-tool-name">Home audit (10 min)</div>
        <div class="light-tool-desc">Walk through, pause in each room. Get a per-room snapshot.</div>
      </button>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    openLuxMeter,
    openFlickerDetector,
    openDarknessMeter,
    openCCTMeter,
    openSpectrumClassifier,
    openGlassTransmission,
    openSunriseLogger,
    openEyeLevelAudit,
    getMeasurements,
    getMeasurementsForRoom,
    saveMeasurement,
    deleteMeasurement,
    renderLightTools,
  });
}
