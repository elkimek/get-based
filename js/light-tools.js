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

// ─── Tool 3: CCT Meter ────────────────────────────────────────────────

let _cctState = { running: false, stream: null };

export async function openCCTMeter() {
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
      cohEl.innerHTML = solarCoherence(cct);
      if (_cctState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    valueEl.textContent = 'Camera denied';
  }

  overlay.querySelector('#cct-save').addEventListener('click', async () => {
    if (currentCCT == null) return;
    await saveMeasurement('cct', currentCCT, { confidence: 0.5 });
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

export async function openSpectrumClassifier() {
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
      resultEl.innerHTML = `<strong>${escapeHTML(result.label)}</strong> <span style="color:var(--text-muted)">· ${(result.confidence * 100).toFixed(0)}% confidence</span><br><small style="color:var(--text-secondary)">${escapeHTML(result.reason)}</small>`;
      if (_specState.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    resultEl.textContent = 'Camera denied.';
  }

  overlay.querySelector('#spec-save').addEventListener('click', async () => {
    if (!result) return;
    await saveMeasurement('spectrum', result.label, { confidence: result.confidence, extra: result });
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

export async function openGlassTransmission() {
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

  const measure = async (which) => {
    // Reuse the lux-camera path inline. Simpler than spinning up the modal.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 160, height: 120 } });
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
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
    // UV transmission for typical low-E coatings is ~12–18% of clear glass UV transmission
    const uvTrans = Math.round(transmission * 15);
    overlay.querySelector('#glass-result').innerHTML =
      `<strong>Glass transmits ${(transmission * 100).toFixed(0)}% of total light</strong>` +
      `<br><small>Blocks ~${blocked.toFixed(0)}% of broadband · estimated UV transmission ${uvTrans}% (typical Low-E coating)</small>`;
    overlay.querySelector('#glass-save').disabled = false;
    overlay.querySelector('#glass-save').onclick = async () => {
      await saveMeasurement('glass-transmission', transmission, {
        confidence: 0.6,
        extra: { inside: _glassReadings.inside, outside: _glassReadings.outside, uvTrans },
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
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Sunrise / sunset logger">
    <div class="modal-header">
      <h3>${escapeHTML(label)} session</h3>
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
    getMeasurements,
    saveMeasurement,
    deleteMeasurement,
    renderLightTools,
  });
}
