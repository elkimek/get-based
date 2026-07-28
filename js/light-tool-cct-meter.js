// @ts-check
// Camera-backed color temperature and melanopic-load workflow.

import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
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

let cctState = /** @type {{ running: boolean, stream: MediaStream | null }} */ ({
  running: false,
  stream: null,
});

export async function openCCTMeter(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Color temperature meter">
    <div class="modal-header">
      <h3>Color Temperature</h3>
      <button class="modal-close" ${lightToolModalActionAttrs('close-cct')} aria-label="Close">×</button>
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
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-cct')}>Done</button>
        <button class="import-btn import-btn-primary" id="cct-save">Save reading</button>
      </div>
    </div>
    </div>`;
  let closed = false;
  const closeCCTOverlay = () => {
    if (closed) return;
    closed = true;
    cctState.running = false;
    if (cctState.stream) {
      try { cctState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      cctState.stream = null;
    }
    clearCameraToolCloser('close-cct', closeCCTOverlay);
    removeModalOverlay(overlay);
  };
  registerCameraToolCloser('close-cct', closeCCTOverlay);
  installLightToolModalDelegates(overlay);
  openAppendedModalOverlay(overlay, closeCCTOverlay);

  let currentCCT = null;
  let currentMelanopic = null;
  let currentPWMActive = false;
  const valueEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#cct-value'));
  const toneEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#cct-tone'));
  const coherenceEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#cct-coherence'));
  const video = /** @type {HTMLVideoElement} */ (queryRequired(overlay, '#cct-video'));
  cctState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 320, height: 240 },
    });
    if (closed) {
      try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      return;
    }
    cctState.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    const lock = await lockCameraForMeasurement(stream);
    if (closed) return;
    if (lock.whiteBalance !== 'manual') {
      coherenceEl.innerHTML = `<span style="color:var(--orange);font-size:11px">⚠ camera auto-white-balance is on — CCT reading is the camera's error, not the source. Try a different browser / phone, or use a meter for accurate readings.</span>`;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = getRequired2DContext(canvas);
    const bandingPeaks = [];
    const tick = () => {
      if (!cctState.running) return;
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
      const sum = red + green + blue || 1;
      const normalizedRed = red / sum;
      const normalizedBlue = blue / sum;
      const ratio = normalizedBlue / Math.max(normalizedRed, 0.01);
      const cct = Math.round(1800 + Math.min(5200, ratio * 4500));
      const melanopic = normalizedBlue;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((maximum, value) => Math.max(maximum, value), 0);
      currentCCT = cct;
      currentMelanopic = melanopic;
      currentPWMActive = peakBanding > 0.10 && stripes >= 2;
      valueEl.textContent = `${cct} K`;
      toneEl.textContent = cctTone(cct);
      if (lock.whiteBalance === 'manual') {
        const melanopicNote = melanopic > 0.32
          ? `<span style="color:var(--orange);font-size:11px">⚠ high melanopic load (${(melanopic * 100).toFixed(0)}%) — daytime use only</span>`
          : melanopic < 0.25
            ? `<span style="color:var(--green);font-size:11px">✓ sleep-safe melanopic load (${(melanopic * 100).toFixed(0)}%)</span>`
            : `<span style="color:var(--text-muted);font-size:11px">mixed melanopic load (${(melanopic * 100).toFixed(0)}%)</span>`;
        const pwmNote = peakBanding > 0.10 && stripes >= 2
          ? '<br><span style="color:var(--orange);font-size:11px">⚠ PWM dimming detected — open Flicker Detector for severity</span>'
          : '';
        coherenceEl.innerHTML = solarCoherence(cct) + `<br>${melanopicNote}${pwmNote}`;
      }
      if (cctState.running && !closed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (error) {
    if (closed) return;
    valueEl.textContent = 'Camera denied';
  }

  queryRequired(overlay, '#cct-save').addEventListener('click', async () => {
    if (currentCCT == null) return;
    await saveMeasurement('cct', currentCCT, {
      confidence: 0.5,
      extra: { melanopic: currentMelanopic, pwmActive: currentPWMActive },
      roomId,
    });
    showNotification(`Color temp saved: ${currentCCT} K`);
    closeCCTOverlay();
  });
}

function cctTone(kelvin) {
  if (kelvin < 2200) return 'Candle';
  if (kelvin < 3000) return 'Warm white (incandescent / warm LED)';
  if (kelvin < 4000) return 'Soft white';
  if (kelvin < 5000) return 'Cool white / fluorescent';
  if (kelvin < 6000) return 'Daylight';
  return 'Overcast / blue-shifted';
}

function solarCoherence(kelvin) {
  const hour = new Date().getHours();
  let solarKelvin;
  if (hour < 6 || hour >= 20) solarKelvin = 2000;
  else if (hour < 8 || hour >= 18) solarKelvin = 3500;
  else if (hour < 10 || hour >= 16) solarKelvin = 5000;
  else solarKelvin = 5500;
  const difference = Math.abs(kelvin - solarKelvin);
  if (difference < 800) return `<span style="color:var(--green)">✓ matches solar time (~${solarKelvin} K)</span>`;
  if (difference < 1500) return `<span style="color:var(--text-secondary)">slight mismatch (solar now ~${solarKelvin} K)</span>`;
  return `<span style="color:var(--orange)">⚠ mismatch — solar is ~${solarKelvin} K right now</span>`;
}
