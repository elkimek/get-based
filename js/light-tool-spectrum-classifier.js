// @ts-check
// Camera-backed RGB, melanopic-load, and PWM spectrum classification.

import { escapeHTML, queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
  cameraLockStatusLine,
  computeRowBanding,
  getRequired2DContext,
  lockCameraForMeasurement,
} from './light-tool-camera.js';
import {
  clearCameraToolCloser,
  getSaveMeasurement,
  installLightToolModalDelegates,
  lightToolModalActionAttrs,
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

let spectrumState = /** @type {{ running: boolean, stream: MediaStream | null }} */ ({
  running: false,
  stream: null,
});

export async function openSpectrumClassifier(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Spectrum classifier">
    <div class="modal-header">
      <h3>What kind of light is this?</h3>
      <button class="modal-close" ${lightToolModalActionAttrs('close-spec')} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('spectrum')}
      <p class="modal-body-hint">We classify by RGB pattern and flicker.</p>
      <video id="spec-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:200px"></video>
      <div class="spec-result" id="spec-result">Reading…</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-spec')}>Done</button>
        <button class="import-btn import-btn-primary" id="spec-save">Save reading</button>
      </div>
    </div>
    </div>`;
  let closed = false;
  const closeSpectrumOverlay = () => {
    if (closed) return;
    closed = true;
    spectrumState.running = false;
    if (spectrumState.stream) {
      try { spectrumState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      spectrumState.stream = null;
    }
    clearCameraToolCloser('close-spec', closeSpectrumOverlay);
    removeModalOverlay(overlay);
  };
  registerCameraToolCloser('close-spec', closeSpectrumOverlay);
  installLightToolModalDelegates(overlay);
  openAppendedModalOverlay(overlay, closeSpectrumOverlay);

  let result = null;
  const resultEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#spec-result'));
  const video = /** @type {HTMLVideoElement} */ (queryRequired(overlay, '#spec-video'));
  spectrumState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    if (closed) {
      try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      return;
    }
    spectrumState.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    if (closed) return;
    if (lock.whiteBalance !== 'manual' || lock.exposure !== 'manual') {
      resultEl.innerHTML = `<span style="color:var(--orange);font-size:12px">⚠ camera auto-mode partially active — classification reliability is reduced. ${cameraLockStatusLine(lock)}</span>`;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = getRequired2DContext(canvas);
    const bandingPeaks = [];
    const tick = () => {
      if (!spectrumState.running) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < data.length; index += 4) {
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
      }
      const pixels = data.length / 4;
      red /= pixels;
      green /= pixels;
      blue /= pixels;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((maximum, value) => Math.max(maximum, value), 0);
      result = classifyLight({ r: red, g: green, b: blue, peakBanding, stripes });
      if (lock.whiteBalance !== 'manual') {
        result = {
          ...result,
          confidence: result.confidence * 0.7,
          reason: result.reason + ' (camera auto-WB → low confidence)',
        };
      }
      const circadianBadge = result.circadian === 'sleep-safe'
        ? '<span style="color:var(--green);font-size:11px">✓ sleep-safe spectrum</span>'
        : result.circadian === 'day-only'
          ? '<span style="color:var(--orange);font-size:11px">⚠ day-only — high melanopic load</span>'
          : '<span style="color:var(--text-muted);font-size:11px">mixed melanopic load</span>';
      resultEl.innerHTML = `<strong>${escapeHTML(result.label)}</strong> <span style="color:var(--text-muted)">· ${(result.confidence * 100).toFixed(0)}% confidence</span><br><small style="color:var(--text-secondary)">${escapeHTML(result.reason)}</small><br>${circadianBadge} <span style="color:var(--text-muted);font-size:11px">· melanopic ratio ${(result.melanopic * 100).toFixed(0)}%</span>`;
      if (spectrumState.running && !closed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (error) {
    if (closed) return;
    video.style.display = 'none';
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
    overlay.querySelectorAll('[data-spec-manual]').forEach(button => {
      button.addEventListener('click', () => {
        const label = button.getAttribute('data-spec-manual');
        result = {
          label,
          confidence: 0.7,
          reason: 'manual selection (camera denied)',
          melanopic: null,
          circadian: 'unknown',
        };
        overlay.querySelectorAll('[data-spec-manual]').forEach(candidate => candidate.classList.remove('selected'));
        button.classList.add('selected');
      });
    });
  }

  queryRequired(overlay, '#spec-save').addEventListener('click', async () => {
    if (!result) {
      showNotification('Pick a light type first (or grant camera access).', 'error');
      return;
    }
    await saveMeasurement('spectrum', result.label, {
      confidence: result.confidence,
      extra: result,
      roomId,
    });
    showNotification(`Light type saved: ${result.label}`);
    closeSpectrumOverlay();
  });
}

function classifyLight({ r, g, b, peakBanding, stripes }) {
  const sum = r + g + b || 1;
  const normalizedRed = r / sum;
  const normalizedGreen = g / sum;
  const normalizedBlue = b / sum;
  const melanopic = normalizedBlue;
  const circadian = melanopic < 0.25 ? 'sleep-safe' : melanopic > 0.32 ? 'day-only' : 'mixed';
  const heavyPWM = peakBanding > 0.10 && stripes >= 2;

  if (heavyPWM && normalizedGreen > 0.36) {
    return { label: 'Fluorescent / CFL', confidence: 0.75, reason: 'PWM banding + green spike — fluorescent signature.', melanopic, circadian };
  }
  if (normalizedRed > 0.40 && normalizedBlue < 0.20) {
    return { label: 'Incandescent / halogen', confidence: 0.8, reason: 'Red-rich, low blue — filament-style emitter, sleep-safe.', melanopic, circadian };
  }
  if (normalizedBlue > 0.36 && !heavyPWM) {
    return { label: 'Cool LED (4000K+)', confidence: 0.75, reason: 'Blue-rich, near-flicker-free — daytime / focus light.', melanopic, circadian };
  }
  if (normalizedBlue > 0.36 && heavyPWM) {
    return { label: 'Cool LED with PWM dimming', confidence: 0.75, reason: 'Blue-rich + visible PWM stripes — eye-strain risk on dim setting.', melanopic, circadian };
  }
  if (normalizedRed > 0.32 && normalizedBlue < 0.30 && !heavyPWM) {
    return { label: 'Warm LED (2700–3000K)', confidence: 0.75, reason: 'Slight red lift, near-flicker-free — evening-friendly.', melanopic, circadian };
  }
  if (normalizedRed > 0.32 && normalizedBlue < 0.30 && heavyPWM) {
    return { label: 'Warm LED with PWM dimming', confidence: 0.7, reason: 'Warm + PWM stripes — replace with flicker-free for evening rooms.', melanopic, circadian };
  }
  if (Math.abs(normalizedRed - 0.33) < 0.05 && Math.abs(normalizedBlue - 0.33) < 0.05) {
    return { label: 'Daylight or full-spectrum', confidence: 0.65, reason: 'Balanced RGB — natural or full-spectrum source.', melanopic, circadian };
  }
  return { label: 'Mixed / unclassified', confidence: 0.4, reason: 'Pattern doesn\'t match a known signature.', melanopic, circadian };
}
