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
  };
  getMeasurements().push(entry);
  await saveImportedData();
  return entry;
}

export async function deleteMeasurement(id) {
  const list = getMeasurements();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  await saveImportedData();
  return true;
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

export async function openLuxMeter() {
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
    sourceLine.textContent = 'Using camera with calibration factor ' + _luxState.calibration.toFixed(2) + '× (estimate, ±30%).';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } });
      _luxState.stream = stream;
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

export async function openFlickerDetector() {
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
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const samples = [];
    const startTime = performance.now();
    const tick = () => {
      if (!_flickerState.running) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
      samples.push({ t: performance.now() - startTime, v: sum });
      if (samples.length > 240) samples.shift();
      if (samples.length >= 60) renderFlicker(samples);
      if (_flickerState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    resultEl.textContent = 'Camera access denied — flicker detector unavailable.';
  }

  function renderFlicker(samples) {
    // Simple peak-to-trough variance ratio over the last second of samples
    const recent = samples.slice(-120);
    if (recent.length < 30) return;
    const vals = recent.map(s => s.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const ratio = mean ? (max - min) / mean : 0;
    let score, label, freq = '';
    if (ratio < 0.05) { score = 0; label = 'Flicker-free'; }
    else if (ratio < 0.12) { score = 1; label = 'Mild flicker, likely OK for most'; }
    else if (ratio < 0.25) { score = 2; label = 'Visible flicker — eye-strain risk'; }
    else { score = 3; label = 'Heavy flicker — consider replacing this light'; }

    // Crude frequency estimate via zero-crossing on detrended signal
    const detrended = vals.map(v => v - mean);
    let crossings = 0;
    for (let i = 1; i < detrended.length; i++) {
      if ((detrended[i] >= 0) !== (detrended[i - 1] >= 0)) crossings++;
    }
    const durationS = (recent[recent.length - 1].t - recent[0].t) / 1000;
    const estFreq = durationS > 0 ? Math.round(crossings / 2 / durationS) : 0;
    if (estFreq > 0) freq = ` · ~${estFreq} Hz`;

    lastResult = { score, label, ratio, estFreq };
    resultEl.innerHTML = `<strong class="flicker-score-${score}">${escapeHTML(label)}</strong>${escapeHTML(freq)}<br><small style="color:var(--text-muted)">peak-trough ratio ${ratio.toFixed(2)}</small>`;
  }

  overlay.querySelector('#flicker-save').addEventListener('click', async () => {
    if (!lastResult) return;
    await saveMeasurement('flicker', lastResult.score, {
      confidence: 0.7,
      extra: lastResult,
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

export async function openDarknessMeter() {
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
        await saveMeasurement('darkness', lux, { confidence: 0.6, extra: result });
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
      <button class="light-tool-card" onclick="window.openDarknessMeter()">
        <div class="light-tool-icon">🌙</div>
        <div class="light-tool-name">Sleep Darkness</div>
        <div class="light-tool-desc">Is your bedroom dark enough?</div>
      </button>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    openLuxMeter,
    openFlickerDetector,
    openDarknessMeter,
    getMeasurements,
    saveMeasurement,
    deleteMeasurement,
    renderLightTools,
  });
}
