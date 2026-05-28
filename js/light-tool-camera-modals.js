// light-tool-camera-modals.js — Camera-backed Light tool modal flows.

import { escapeHTML, showNotification } from './utils.js';
import {
  aimingGuideHTML,
  lockCameraForMeasurement,
  cameraLockStatusLine,
  computeRowBanding,
  loadLuxCalibration,
  saveLuxCalibration,
} from './light-tool-camera.js';

function getSaveMeasurement(deps = {}) {
  const fn = deps.saveMeasurement || (typeof window !== 'undefined' ? window.saveMeasurement : null);
  if (typeof fn !== 'function') throw new Error('saveMeasurement dependency is required');
  return fn;
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


export async function openLuxMeter(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Lux meter">
    <div class="modal-header">
      <h3>Lux Meter</h3>
      <button class="modal-close" onclick="window._closeLuxMeter()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('lux')}
      <p class="modal-body-hint" id="lux-source-line">Initializing…</p>
      <div class="lux-dial">
        <div class="lux-dial-value" id="lux-value">—</div>
        <div class="lux-dial-unit">lux</div>
        <div class="lux-dial-zone" id="lux-zone">—</div>
      </div>
      <div class="lux-zones">
        ${LUX_ZONES.slice(0, 6).map(z => `<div class="lux-zone-marker">≤ ${z.max} <span>${z.label}</span></div>`).join('')}
      </div>
      <details id="lux-calibration-panel" style="margin-top:14px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0">
        <summary style="padding:8px 12px;cursor:pointer;font-size:12px;color:var(--text-secondary);user-select:none">⚙ Calibrate against a known reference</summary>
        <div style="padding:0 12px 12px 12px;font-size:12px;color:var(--text-muted)">
          <p style="margin:4px 0 8px 0">Aim the camera at a light source whose lux you know — from a real meter, a second phone with an ambient-light sensor, or an indoor reading you trust. Enter the reference value below; we'll compute the factor that maps the camera's raw luma to that lux value and save it for future readings.</p>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
            <label for="lux-cal-reference" style="font-size:12px;color:var(--text-muted)">Known reading (lux)</label>
            <input type="number" id="lux-cal-reference" class="ctx-input" min="0" step="any" placeholder="e.g. 400" style="flex:1;max-width:140px">
            <button class="import-btn import-btn-secondary" id="lux-cal-apply" style="font-size:12px;padding:6px 10px">Apply</button>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;font-size:11px">
            <span>Current factor:</span>
            <strong id="lux-cal-current" style="font-family:monospace">—</strong>
            <button class="import-btn import-btn-secondary" id="lux-cal-reset" style="font-size:11px;padding:4px 8px;margin-left:auto">Reset to 1.00×</button>
          </div>
        </div>
      </details>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeLuxMeter()">Done</button>
        <button class="import-btn import-btn-primary" id="lux-save">Save reading</button>
      </div>
    </div>
  </div>`;
  let closed = false;
  window._closeLuxMeter = () => {
    closed = true;
    _luxState.running = false;
    if (_luxState.sensor) { try { _luxState.sensor.stop(); } catch (e) {} _luxState.sensor = null; }
    if (_luxState.stream) { try { _luxState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _luxState.stream = null; }
    _luxState.video = null;
    overlay.remove();
  };
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeLuxMeter()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let currentLux = null;
  // Snapshot of the LATEST raw camera luma (before calibration multiply).
  // The calibration UI needs this to compute a factor against a reference;
  // can't divide by currentLux because that already includes the active
  // factor.
  let currentRawLuma = null;
  const valueEl = overlay.querySelector('#lux-value');
  const zoneEl = overlay.querySelector('#lux-zone');
  const sourceLine = overlay.querySelector('#lux-source-line');
  const calCurrentEl = overlay.querySelector('#lux-cal-current');
  _luxState.running = true;
  _luxState.calibration = loadLuxCalibration();
  if (calCurrentEl) calCurrentEl.textContent = `${_luxState.calibration.toFixed(2)}×`;

  // Try AmbientLightSensor first (modern Chrome on Android with permission).
  // When ALS is available the calibration panel hides — there's nothing to
  // calibrate, the sensor reading is authoritative.
  let usingALS = false;
  let usingManualEntry = false;
  let cameraFallbackStarted = false;
  const calibrationPanel = overlay.querySelector('#lux-calibration-panel');
  const startCameraFallback = async (introHTML = '') => {
    if (closed || cameraFallbackStarted) return;
    cameraFallbackStarted = true;
    usingALS = false;
    try {
      if (introHTML) sourceLine.innerHTML = introHTML;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } });
      if (closed) {
        try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        return;
      }
      _luxState.stream = stream;
      const lock = await lockCameraForMeasurement(stream);
      if (closed) return;
      sourceLine.innerHTML = `Camera estimate (calibration ${_luxState.calibration.toFixed(2)}×, ±30%). ${cameraLockStatusLine(lock)}`;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (closed) return;
      _luxState.video = video;
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!_luxState.running || closed) return;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            // Luma approx — Rec.709 weights
            sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          }
          const meanLuma = sum / (data.length / 4);
          currentRawLuma = meanLuma;
          // Crude mapping: 0–255 luma → 0–10000 lux at default calibration.
          // Per-device calibration via the "Calibrate" panel below.
          currentLux = Math.max(0, meanLuma * 40 * _luxState.calibration);
          renderLux(currentLux);
        } catch (e) {
          /* video not ready yet */
        }
        if (_luxState.running && !closed) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      if (closed) return;
      usingManualEntry = true;
      sourceLine.innerHTML = '<b>Camera access denied.</b> Enter a lux value manually below — read it from a real meter, a second phone with an ambient-light sensor, or pick the closest zone from the scale.';
      // Camera path is unavailable — replace the live dial with a numeric
      // input so the user can still save a reading. Calibration panel is
      // irrelevant without a camera feed, hide it.
      const dial = overlay.querySelector('.lux-dial');
      if (dial) {
        dial.innerHTML = `
          <div style="display:flex;align-items:baseline;justify-content:center;gap:8px;padding:8px 0">
            <input type="number" id="lux-manual-input" class="ctx-input" min="0" max="200000" step="1" placeholder="e.g. 400" inputmode="numeric" style="width:140px;font-size:20px;text-align:center;padding:8px 10px" />
            <span style="color:var(--text-muted);font-size:14px">lux</span>
          </div>
          <div class="lux-dial-zone" id="lux-zone" style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:4px">—</div>`;
        const manualInput = overlay.querySelector('#lux-manual-input');
        const newZoneEl = overlay.querySelector('#lux-zone');
        if (manualInput) {
          manualInput.addEventListener('input', () => {
            const v = parseFloat(manualInput.value);
            if (Number.isFinite(v) && v >= 0) {
              currentLux = v;
              const z = luxZone(v);
              if (newZoneEl) {
                newZoneEl.textContent = z.label;
                newZoneEl.style.color = z.color;
              }
            } else {
              currentLux = null;
              if (newZoneEl) { newZoneEl.textContent = '—'; newZoneEl.style.color = ''; }
            }
          });
        }
      }
      if (calibrationPanel) calibrationPanel.style.display = 'none';
    }
  };
  if ('AmbientLightSensor' in window) {
    try {
      const sensor = new window.AmbientLightSensor({ frequency: 4 });
      sensor.addEventListener('reading', () => {
        currentLux = sensor.illuminance;
        renderLux(currentLux);
      });
      // The Generic Sensor spec throws SecurityError ASYNCHRONOUSLY via
      // sensor.onerror when permission is denied (Chromium-Android with
      // ALS permission off, browsers in Permissions-Policy=(),
      // privacy-mode iframes). Without this listener the sensor object
      // exists, start() succeeds, but `reading` events never fire and
      // the user sees a spinning "—" forever. Catch the async error
      // and fall back to the camera path same as a synchronous throw.
      sensor.addEventListener('error', () => {
        try { sensor.stop(); } catch (e) {}
        _luxState.sensor = null;
        currentLux = null;
        renderLux(null);
        void startCameraFallback('<b>Ambient light sensor blocked</b> by browser permissions. Retrying with camera estimate…');
      });
      sensor.start();
      _luxState.sensor = sensor;
      usingALS = true;
      sourceLine.textContent = 'Reading from your phone\'s ambient light sensor.';
      // ALS is the authoritative source — no calibration needed.
      if (calibrationPanel) calibrationPanel.style.display = 'none';
    } catch (e) {
      // Synchronous construction error — fall through to camera path
    }
  }

  // Fallback: camera-based estimate
  if (!usingALS) {
    await startCameraFallback();
  }

  function renderLux(v) {
    if (v == null) { valueEl.textContent = '—'; zoneEl.textContent = '—'; return; }
    valueEl.textContent = v < 100 ? v.toFixed(0) : Math.round(v).toLocaleString();
    const z = luxZone(v);
    zoneEl.textContent = z.label;
    zoneEl.style.color = z.color;
  }

  // Calibration panel handlers (camera path only — ALS panel was hidden above).
  const calApplyBtn = overlay.querySelector('#lux-cal-apply');
  const calResetBtn = overlay.querySelector('#lux-cal-reset');
  const calRefInput = overlay.querySelector('#lux-cal-reference');
  if (calApplyBtn) {
    calApplyBtn.addEventListener('click', () => {
      if (currentRawLuma == null || currentRawLuma < 0.5) {
        showNotification('Camera not reading yet — wait a moment, then try again.', 'error');
        return;
      }
      const refLux = parseFloat(calRefInput?.value);
      if (!Number.isFinite(refLux) || refLux <= 0) {
        showNotification('Enter a positive lux value from your reference.', 'error');
        return;
      }
      // factor: target lux = rawLuma × 40 × factor → factor = ref / (rawLuma × 40)
      const newFactor = refLux / Math.max(currentRawLuma * 40, 0.001);
      // Sanity-clamp to a 0.1× – 10× range so a typo doesn't permanently
      // break readings; that's already 100× of dynamic range covering
      // basically any reasonable phone-camera offset from the default.
      const clamped = Math.min(10, Math.max(0.1, newFactor));
      _luxState.calibration = clamped;
      saveLuxCalibration(clamped);
      if (calCurrentEl) calCurrentEl.textContent = `${clamped.toFixed(2)}×`;
      sourceLine.innerHTML = `Camera estimate (calibration ${clamped.toFixed(2)}×, ±30%). Calibrated against ${refLux} lux reference.`;
      showNotification(`Lux meter calibrated · factor ${clamped.toFixed(2)}×`);
    });
  }
  if (calResetBtn) {
    calResetBtn.addEventListener('click', () => {
      _luxState.calibration = 1.0;
      saveLuxCalibration(1.0);
      if (calCurrentEl) calCurrentEl.textContent = `1.00×`;
      sourceLine.innerHTML = `Camera estimate (calibration 1.00×, ±30%). Reset to default.`;
      showNotification('Lux calibration reset to 1.00×');
    });
  }

  overlay.querySelector('#lux-save').addEventListener('click', async () => {
    if (currentLux == null) {
      if (usingManualEntry) showNotification('Enter a lux value first.', 'error');
      return;
    }
    const source = usingALS ? 'AmbientLightSensor' : usingManualEntry ? 'manual-entry' : 'camera-estimate';
    const confidence = usingALS ? 0.85 : usingManualEntry ? 0.9 : 0.55;
    await saveMeasurement('lux', currentLux, {
      confidence,
      extra: { source, calibrationFactor: _luxState.calibration },
      roomId,
    });
    showNotification(`Lux reading saved: ${Math.round(currentLux)}`);
    window._closeLuxMeter();
  });

}

// ─── Tool 2: Flicker Detector ──────────────────────────────────────────

let _flickerState = { running: false, stream: null };

export async function openFlickerDetector(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Flicker detector">
    <div class="modal-header">
      <h3>Flicker Detector</h3>
      <button class="modal-close" onclick="window._closeFlicker()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('flicker')}
      <p class="modal-body-hint">Banding stripes indicate PWM flicker.</p>
      <video id="flicker-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:240px"></video>
      <div class="flicker-result" id="flicker-result">Hold camera on a light for 5 seconds…</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeFlicker()">Done</button>
        <button class="import-btn import-btn-primary" id="flicker-save">Save reading</button>
      </div>
    </div>
    </div>`;
  let closed = false;
  window._closeFlicker = () => {
    closed = true;
    _flickerState.running = false;
    if (_flickerState.stream) { try { _flickerState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _flickerState.stream = null; }
    overlay.remove();
  };
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeFlicker()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let lastResult = null;
  const resultEl = overlay.querySelector('#flicker-result');
  const video = overlay.querySelector('#flicker-video');
  _flickerState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    if (closed) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      return;
    }
    _flickerState.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    // Lock exposure short + manual so PWM banding is visible — auto mode
    // smooths the brightness fluctuations that ARE the signal we're after.
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    if (closed) return;
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
    //   2. Intra-frame ROW banding from rolling shutter via the shared
    //      computeRowBanding() helper — detects PWM at 100 Hz – 25 kHz
    //      that frame-rate sampling literally cannot see.
    //
    // Use 64x48 capture so we have enough rows to see banding cleanly.
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frameSamples = [];
    const bandingSamples = [];
    const startTime = performance.now();
    const tick = () => {
      if (!_flickerState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const { frameMean, bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      // Frame-luma channel (legacy): sum across rows ≈ frameMean × H.
      const frameLumaSum = frameMean * canvas.height;
      frameSamples.push({ t: performance.now() - startTime, v: frameLumaSum });
      bandingSamples.push({ t: performance.now() - startTime, banding: bandingRatio, stripes });
      if (frameSamples.length > 240) frameSamples.shift();
      if (bandingSamples.length > 240) bandingSamples.shift();
      if (frameSamples.length >= 60) renderFlicker(frameSamples, bandingSamples, lock);
      if (_flickerState.running && !closed) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
    if (closed) return;
      resultEl.innerHTML = 'Camera access denied — flicker detector unavailable. <br><span style="font-size:11px;color:var(--text-muted)">This tool needs the camera at 240 fps to detect PWM banding. To re-enable, open your browser\'s site settings and allow camera access.</span>';
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

}

// ─── Tool 6: Sleep Darkness Meter ─────────────────────────────────────

let _darkState = { running: false, stream: null };

export async function openDarknessMeter(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Sleep darkness meter">
    <div class="modal-header">
      <h3>Sleep Darkness Meter</h3>
      <button class="modal-close" onclick="window._closeDark()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('darkness')}
      <p class="modal-body-hint">Lights as you'll actually sleep — door cracked, hallway light on, etc.</p>
      <div class="dark-status" id="dark-status">Press Start when ready.</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="window._closeDark()">Cancel</button>
        <button class="import-btn import-btn-primary" id="dark-start">Start 30-second read</button>
      </div>
    </div>
  </div>`;
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeDark()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

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
      // Lock long shutter + fixed ISO so dim pixels register at a known
      // gain. Without ISO lock, auto-gain compensates darkness and the
      // raw pixel values can't be translated to lux. Surfaces the
      // calibration state honestly when lock partially fails.
      const lock = await lockCameraForMeasurement(stream, { longExposure: true });
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const lumas = [];      // mean per sample
      const peaks = [];      // single-pixel max per sample
      const t0 = performance.now();
      let cancelled = false;
      while (performance.now() - t0 < 30000 && _darkState.running) {
        // The camera stream may have been stopped by _closeDark() while
        // we were sleeping in setTimeout. drawImage on a closed stream
        // throws InvalidStateError; catch it explicitly so the loop
        // exits cleanly instead of silently failing inside an unhandled
        // rejection (which would leave the dialog stuck at "—" forever).
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          cancelled = true;
          break;
        }
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0, max = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += luma;
          if (luma > max) max = luma;
        }
        lumas.push(sum / (data.length / 4));
        peaks.push(max);
        await new Promise(r => setTimeout(r, 200));
      }
      // User cancelled — bail out before computing summary stats so
      // the close button feels responsive and the result variable
      // stays null (the save handler gates on result presence).
      if (cancelled || !_darkState.running) {
        return;
      }
      const meanLuma = lumas.reduce((a, b) => a + b, 0) / Math.max(1, lumas.length);
      // 95th-percentile peak across the 30s window — rejects single-frame
      // noise spikes while still surfacing real bright events (a phone
      // notification, a passing car, an LED standby light briefly visible).
      const sortedPeaks = peaks.slice().sort((a, b) => a - b);
      const peakLuma = sortedPeaks[Math.floor(sortedPeaks.length * 0.95)] || 0;
      // Camera noise floor at near-darkness sits around 2 luma units; the
      // 0.5 lux/luma scale factor is empirical from a Pixel 6 reference
      // measurement (D55 light, locked exposure). Apply the user's
      // device-calibration multiplier so per-device sensor variance is
      // accounted for. Subtract noise floor for the mean-lux estimate so
      // true darkness reads as ≈ 0, not the noise-floor ≈ 1 lux.
      const calFactor = loadLuxCalibration();
      const NOISE_FLOOR_LUMA = 2;
      const meanLux = Math.max(0, (meanLuma - NOISE_FLOOR_LUMA) * 0.5 * calFactor);
      const peakLux = Math.max(0, (peakLuma - NOISE_FLOOR_LUMA) * 0.5 * calFactor);
      // Thresholds anchored to circadian literature:
      //   Brainard 2001:        ≥ 1.5–2 lux at the cornea suppresses
      //                         melatonin in ~30% of sensitive individuals
      //   Phillips 2019:        5–10 lux for 5h shifts circadian phase
      //                         by ~30 min in a population study
      //   Phipps-Nelson 2003:   100 lux for 6.5h is full suppression
      // We grade chronic (mean) and acute (peak) on different scales —
      // acute light spikes are circadian disruptions even when the mean
      // looks fine.
      let label, cls;
      if (meanLux < 0.3 && peakLux < 1) {
        label = 'Excellent — true darkness'; cls = 'ok';
      } else if (meanLux < 1 && peakLux < 5) {
        label = 'Good — minor leak, melatonin mostly preserved'; cls = 'ok';
      } else if (meanLux < 5 && peakLux < 20) {
        label = 'Moderate leak — 20–30% melatonin attenuation likely'; cls = 'warn';
      } else if (peakLux >= 20 && meanLux < 5) {
        label = 'Bright spikes detected — investigate notifications / passing lights'; cls = 'warn';
      } else {
        label = 'Significant — circadian phase shift likely'; cls = 'over';
      }
      result = { meanLux, peakLux, lockMode: lock.exposure, isoLocked: lock.iso != null, calFactor, label, cls };
      // Honesty caveat when ISO couldn't be pinned — pixel values are
      // uncalibrated absolute, only the relative comparison is meaningful.
      const calNote = lock.iso != null
        ? `<small style="color:var(--text-muted)">Locked ISO ${lock.iso}, exposure ${lock.exposure}.</small>`
        : `<small style="color:var(--orange)">⚠ ISO not lockable on this camera — readings are qualitative (good/moderate/bright), not absolute lux. ${cameraLockStatusLine(lock)}</small>`;
      statusEl.innerHTML = `<strong class="dark-status-${cls}">${escapeHTML(label)}</strong>` +
        `<br><small style="color:var(--text-muted)">~${meanLux.toFixed(2)} lux average · ~${peakLux.toFixed(2)} lux peak (95th-pctile)</small>` +
        `<br>${calNote}`;
      startBtn.textContent = 'Save reading';
      startBtn.disabled = false;
      startBtn.onclick = async () => {
        // Save the mean as the headline value (the chronic-exposure number);
        // peak goes into `extra` so detail-modal / AI can surface spike events.
        await saveMeasurement('darkness', meanLux, {
          confidence: lock.iso != null ? 0.7 : 0.45,
          extra: result,
          roomId,
        });
        showNotification('Sleep darkness reading saved.');
        window._closeDark();
      };
    } catch (e) {
      statusEl.innerHTML = 'Camera access denied — darkness meter unavailable. <br><span style="font-size:11px;color:var(--text-muted)">Open your browser\'s site settings to allow camera access. This tool runs a long-exposure capture to detect ambient light below 1 lux — there\'s no useful manual-entry fallback.</span>';
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

export async function openCCTMeter(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Color temperature meter">
    <div class="modal-header">
      <h3>Color Temperature</h3>
      <button class="modal-close" onclick="window._closeCCT()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('cct')}
      <p class="modal-body-hint">Reading updates live.</p>
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
  let closed = false;
  window._closeCCT = () => {
    closed = true;
    _cctState.running = false;
    if (_cctState.stream) { try { _cctState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _cctState.stream = null; }
    overlay.remove();
  };
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeCCT()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let currentCCT = null;
  let currentMelanopic = null;
  let currentPWMActive = false;
  const valueEl = overlay.querySelector('#cct-value');
  const toneEl = overlay.querySelector('#cct-tone');
  const cohEl = overlay.querySelector('#cct-coherence');
  const video = overlay.querySelector('#cct-video');
  _cctState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 320, height: 240 },
    });
    if (closed) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      return;
    }
    _cctState.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    // Manual WB + exposure are the entire game here — auto-WB neutralizes
    // the color cast we're trying to measure. Without the lock, R/B ratio
    // is the camera's residual error, not the source CCT.
    const lock = await lockCameraForMeasurement(stream);
    if (closed) return;
    if (lock.whiteBalance !== 'manual') {
      cohEl.innerHTML = `<span style="color:var(--orange);font-size:11px">⚠ camera auto-white-balance is on — CCT reading is the camera's error, not the source. Try a different browser / phone, or use a meter for accurate readings.</span>`;
    }
    // 64x48 capture so we can also run row-banding detection — flags
    // PWM-dimmed lights whose CCT shifts during the PWM cycle.
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bandingPeaks = [];
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
      // Melanopic ratio (B / R+G+B) — circadian impact independent of CCT.
      // Two LEDs at the same CCT can have very different blue spikes.
      const melanopic = bN;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((m, x) => Math.max(m, x), 0);
      currentCCT = cct;
      currentMelanopic = melanopic;
      currentPWMActive = peakBanding > 0.10 && stripes >= 2;
      valueEl.textContent = `${cct} K`;
      toneEl.textContent = cctTone(cct);
      // Only render the solar-coherence hint when WB lock succeeded —
      // otherwise the CCT value itself is unreliable, so the hint built
      // on top of it would mislead. Same for melanopic / PWM annotations.
      if (lock.whiteBalance === 'manual') {
        const melanopicNote = melanopic > 0.32
          ? `<span style="color:var(--orange);font-size:11px">⚠ high melanopic load (${(melanopic * 100).toFixed(0)}%) — daytime use only</span>`
          : melanopic < 0.25
          ? `<span style="color:var(--green);font-size:11px">✓ sleep-safe melanopic load (${(melanopic * 100).toFixed(0)}%)</span>`
          : `<span style="color:var(--text-muted);font-size:11px">mixed melanopic load (${(melanopic * 100).toFixed(0)}%)</span>`;
        const pwmNote = peakBanding > 0.10 && stripes >= 2
          ? `<br><span style="color:var(--orange);font-size:11px">⚠ PWM dimming detected — open Flicker Detector for severity</span>`
          : '';
        cohEl.innerHTML = solarCoherence(cct) + `<br>${melanopicNote}${pwmNote}`;
      }
      if (_cctState.running && !closed) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
    if (closed) return;
      valueEl.textContent = 'Camera denied';
    }

  overlay.querySelector('#cct-save').addEventListener('click', async () => {
    if (currentCCT == null) return;
    await saveMeasurement('cct', currentCCT, {
      confidence: 0.5,
      extra: { melanopic: currentMelanopic, pwmActive: currentPWMActive },
      roomId,
    });
    showNotification(`Color temp saved: ${currentCCT} K`);
    window._closeCCT();
  });

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

export async function openSpectrumClassifier(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Spectrum classifier">
    <div class="modal-header">
      <h3>What kind of light is this?</h3>
      <button class="modal-close" onclick="window._closeSpec()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('spectrum')}
      <p class="modal-body-hint">We classify by RGB pattern and flicker.</p>
      <video id="spec-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:200px"></video>
      <div class="spec-result" id="spec-result">Reading…</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="window._closeSpec()">Done</button>
        <button class="import-btn import-btn-primary" id="spec-save">Save reading</button>
      </div>
    </div>
    </div>`;
  let closed = false;
  window._closeSpec = () => {
    closed = true;
    _specState.running = false;
    if (_specState.stream) { try { _specState.stream.getTracks().forEach(t => t.stop()); } catch (e) {} _specState.stream = null; }
    overlay.remove();
  };
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeSpec()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  let result = null;
  const resultEl = overlay.querySelector('#spec-result');
  const video = overlay.querySelector('#spec-video');
  _specState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    if (closed) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      return;
    }
    _specState.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    // Manual exposure + WB so the classifier reads the actual emitter,
    // not the camera's auto-corrected output. Auto-mode would map every
    // light source toward neutral grey, defeating classification.
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    if (closed) return;
    if (lock.whiteBalance !== 'manual' || lock.exposure !== 'manual') {
      resultEl.innerHTML = `<span style="color:var(--orange);font-size:12px">⚠ camera auto-mode partially active — classification reliability is reduced. ${cameraLockStatusLine(lock)}</span>`;
    }
    // 64x48 capture so the row-banding analyzer has enough rows to see
    // PWM stripes — the spectrum classifier shares the rolling-shutter
    // signal with the flicker tool instead of using its own crude
    // frame-luma variance (which can't see anything above fps/2).
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bandingPeaks = [];   // recent banding ratios — peak across last second wins
    const tick = () => {
      if (!_specState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      const px = data.length / 4;
      r /= px; g /= px; b /= px;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((m, x) => Math.max(m, x), 0);
      result = classifyLight({ r, g, b, peakBanding, stripes });
      // Discount confidence by 30% when WB couldn't be locked — under
      // auto-WB the R/G/B ratios reflect camera correction, not source.
      if (lock.whiteBalance !== 'manual') result = { ...result, confidence: result.confidence * 0.7, reason: result.reason + ' (camera auto-WB → low confidence)' };
      const circadianBadge = result.circadian === 'sleep-safe' ? `<span style="color:var(--green);font-size:11px">✓ sleep-safe spectrum</span>`
        : result.circadian === 'day-only' ? `<span style="color:var(--orange);font-size:11px">⚠ day-only — high melanopic load</span>`
        : `<span style="color:var(--text-muted);font-size:11px">mixed melanopic load</span>`;
      resultEl.innerHTML = `<strong>${escapeHTML(result.label)}</strong> <span style="color:var(--text-muted)">· ${(result.confidence * 100).toFixed(0)}% confidence</span><br><small style="color:var(--text-secondary)">${escapeHTML(result.reason)}</small><br>${circadianBadge} <span style="color:var(--text-muted);font-size:11px">· melanopic ratio ${(result.melanopic * 100).toFixed(0)}%</span>`;
      if (_specState.running && !closed) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
    if (closed) return;
      // Replace the dead video preview with a permission-request CTA so the
    // user can either retry the prompt or open browser site-settings.
    // Without the camera there's no signal to classify — manual pick from
    // the four spectrum types is the only fallback.
    if (video) video.style.display = 'none';
    resultEl.innerHTML = `
      <div style="padding:14px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);">
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:6px">Camera access denied</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">This tool reads the bulb's RGB profile to classify the source. To re-enable, open your browser's site settings and allow camera access for this page, then reopen the tool.</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Or pick the closest match manually:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button class="ctx-btn-option" data-spec-manual="Warm LED (2700–3000K)">Warm LED</button>
          <button class="ctx-btn-option" data-spec-manual="Cool LED (4000K+)">Cool LED</button>
          <button class="ctx-btn-option" data-spec-manual="Fluorescent">Fluorescent</button>
          <button class="ctx-btn-option" data-spec-manual="Incandescent / halogen">Incandescent</button>
          <button class="ctx-btn-option" data-spec-manual="Daylight">Daylight</button>
        </div>
      </div>`;
    overlay.querySelectorAll('[data-spec-manual]').forEach(btn => {
      btn.addEventListener('click', () => {
        const label = btn.getAttribute('data-spec-manual');
        result = { label, confidence: 0.7, reason: 'manual selection (camera denied)', melanopic: null, circadian: 'unknown' };
        overlay.querySelectorAll('[data-spec-manual]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  overlay.querySelector('#spec-save').addEventListener('click', async () => {
    if (!result) {
      showNotification('Pick a light type first (or grant camera access).', 'error');
      return;
    }
    await saveMeasurement('spectrum', result.label, { confidence: result.confidence, extra: result, roomId });
    showNotification(`Light type saved: ${result.label}`);
    window._closeSpec();
  });

}

// Spectrum classifier — RGB ratio + rolling-shutter PWM banding +
// melanopic indicator. The melanopic ratio is a coarse approximation
// of the SPD's stimulation of the ipRGCs (intrinsically photosensitive
// retinal ganglion cells) that drive circadian phase. Phone-camera blue
// channels peak around 450-470 nm, close to the melanopsin peak at 480
// nm — close enough for a relative comparison across light sources.
// Returns label + confidence + reason + melanopic (0–1) + circadian
// classification (sleep-safe / mixed / day-only).
function classifyLight({ r, g, b, peakBanding, stripes }) {
  const sum = r + g + b || 1;
  const rN = r / sum, gN = g / sum, bN = b / sum;
  // Melanopic ratio: B / (R+G+B). Sleep-safe sources keep this below ~25%
  // (incandescent ~12%, warm LED ~22%, candle ~6%). Day-only sources sit
  // above ~32% (cool LED 36%, daylight ~33%, fluorescent often 30%+).
  const melanopic = bN;
  const circadian = melanopic < 0.25 ? 'sleep-safe' : melanopic > 0.32 ? 'day-only' : 'mixed';
  // Heavy banding (>0.10 ratio, ≥2 stripes) means PWM is active. Used
  // to disambiguate fluorescent (typically 100 Hz mains-doubled) from
  // similar-RGB cool LEDs.
  const heavyPWM = peakBanding > 0.10 && stripes >= 2;

  if (heavyPWM && gN > 0.36) {
    return { label: 'Fluorescent / CFL', confidence: 0.75, reason: 'PWM banding + green spike — fluorescent signature.', melanopic, circadian };
  }
  if (rN > 0.40 && bN < 0.20) {
    return { label: 'Incandescent / halogen', confidence: 0.8, reason: 'Red-rich, low blue — filament-style emitter, sleep-safe.', melanopic, circadian };
  }
  if (bN > 0.36 && !heavyPWM) {
    return { label: 'Cool LED (4000K+)', confidence: 0.75, reason: 'Blue-rich, near-flicker-free — daytime / focus light.', melanopic, circadian };
  }
  if (bN > 0.36 && heavyPWM) {
    return { label: 'Cool LED with PWM dimming', confidence: 0.75, reason: 'Blue-rich + visible PWM stripes — eye-strain risk on dim setting.', melanopic, circadian };
  }
  if (rN > 0.32 && bN < 0.30 && !heavyPWM) {
    return { label: 'Warm LED (2700–3000K)', confidence: 0.75, reason: 'Slight red lift, near-flicker-free — evening-friendly.', melanopic, circadian };
  }
  if (rN > 0.32 && bN < 0.30 && heavyPWM) {
    return { label: 'Warm LED with PWM dimming', confidence: 0.7, reason: 'Warm + PWM stripes — replace with flicker-free for evening rooms.', melanopic, circadian };
  }
  if (Math.abs(rN - 0.33) < 0.05 && Math.abs(bN - 0.33) < 0.05) {
    return { label: 'Daylight or full-spectrum', confidence: 0.65, reason: 'Balanced RGB — natural or full-spectrum source.', melanopic, circadian };
  }
  return { label: 'Mixed / unclassified', confidence: 0.4, reason: 'Pattern doesn\'t match a known signature.', melanopic, circadian };
}

// ─── Tool 5: Glass Transmission Test ──────────────────────────────────

let _glassReadings = { inside: null, outside: null };

export async function openGlassTransmission(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Glass transmission test">
    <div class="modal-header">
      <h3>Window / Glass Transmission</h3>
      <button class="modal-close" onclick="window._closeGlass()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('glass-transmission')}
      <p class="modal-body-hint" style="color:var(--orange);background:rgba(255,160,80,0.08);border-left:3px solid var(--orange);padding:8px 10px;border-radius:4px;font-size:11px;margin-bottom:8px">⚠ Aim at the same patch of sky / light source for both readings. North-window through the glass vs. east-window without it measures scene difference, not glass transmission.</p>
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
  let closed = false;
  const activeGlassStreams = new Set();
  window._closeGlass = () => {
    closed = true;
    for (const stream of activeGlassStreams) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    }
    activeGlassStreams.clear();
    overlay.remove();
  };
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay, () => window._closeGlass()); } catch (e) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (e) {}

  _glassReadings = { inside: null, outside: null };

  let _lastGlassLock = null;
  const measure = async (which) => {
    // Reuse the lux-camera path inline. Simpler than spinning up the modal.
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 } });
      if (closed) return;
      activeGlassStreams.add(stream);
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      if (closed) return;
      // Critical: the through-glass and direct samples MUST use the same
      // exposure/WB or the ratio compares apples to oranges. Auto-mode
      // re-exposes for each scene → ratio reflects camera-AE, not glass.
      const lock = await lockCameraForMeasurement(stream);
      if (closed) return;
      _lastGlassLock = lock;
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Sample over 1s
      const samples = [];
      for (let i = 0; i < 8; i++) {
        if (closed) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let j = 0; j < data.length; j += 4) sum += 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
        samples.push(sum / (data.length / 4));
        await new Promise(r => setTimeout(r, 125));
      }
      const meanLuma = samples.reduce((a, b) => a + b, 0) / samples.length;
      const luxEst = Math.max(0, meanLuma * 40 * loadLuxCalibration());
      if (closed) return;
      _glassReadings[which] = luxEst;
      const readingEl = overlay.querySelector(`#glass-reading-${which}`);
      if (readingEl) readingEl.textContent = `${Math.round(luxEst)} lux`;
      computeGlass();
    } catch (e) {
      if (!closed) {
        const readingEl = overlay.querySelector(`#glass-reading-${which}`);
        if (readingEl) readingEl.textContent = 'denied';
      }
    } finally {
      if (stream) {
        try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        activeGlassStreams.delete(stream);
      }
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

}

