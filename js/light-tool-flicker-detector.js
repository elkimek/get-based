// @ts-check
// Camera-backed rolling-shutter flicker detector.

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

let flickerState = /** @type {{ running: boolean, stream: MediaStream | null }} */ ({
  running: false,
  stream: null,
});

export async function openFlickerDetector(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Flicker detector">
    <div class="modal-header">
      <h3>Flicker Detector</h3>
      <button class="modal-close" ${lightToolModalActionAttrs('close-flicker')} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('flicker')}
      <p class="modal-body-hint">Rolling-shutter bands can reveal some modulated lights. No bands does not prove a light is flicker-free, and this camera cannot report a reliable flicker frequency.</p>
      <video id="flicker-video" autoplay playsinline muted style="width:100%;border-radius:var(--radius-sm);background:#000;max-height:240px"></video>
      <div class="flicker-result" id="flicker-result">Hold camera on a light for 5 seconds…</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-flicker')}>Done</button>
        <button class="import-btn import-btn-primary" id="flicker-save">Save reading</button>
      </div>
    </div>
    </div>`;
  let closed = false;
  const closeFlickerOverlay = () => {
    if (closed) return;
    closed = true;
    flickerState.running = false;
    if (flickerState.stream) {
      try { flickerState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      flickerState.stream = null;
    }
    clearCameraToolCloser('close-flicker', closeFlickerOverlay);
    removeModalOverlay(overlay);
  };
  registerCameraToolCloser('close-flicker', closeFlickerOverlay);
  installLightToolModalDelegates(overlay);
  openAppendedModalOverlay(overlay, closeFlickerOverlay);

  let lastResult = null;
  const resultEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#flicker-result'));
  const video = /** @type {HTMLVideoElement} */ (queryRequired(overlay, '#flicker-video'));
  flickerState.running = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', frameRate: { ideal: 240, min: 60 }, width: 320, height: 240 },
    });
    if (closed) {
      try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      return;
    }
    flickerState.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (closed) return;
    const lock = await lockCameraForMeasurement(stream, { shortExposure: true });
    if (closed) return;
    const lockNote = cameraLockStatusLine(lock);
    if (lockNote) resultEl.innerHTML = `Hold camera on a light for 5 seconds…<br>${lockNote}`;
    if (lock.frameRate && lock.frameRate < 60) {
      resultEl.innerHTML += `<br><small style="color:var(--orange)">⚠ camera running at ${Math.round(lock.frameRate)} fps. Frame rate, rolling-shutter timing, and exposure limit what this screen can detect.</small>`;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = getRequired2DContext(canvas);
    const frameSamples = [];
    const bandingSamples = [];
    const startTime = performance.now();
    const tick = () => {
      if (!flickerState.running) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const { frameMean, bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      frameSamples.push({ t: performance.now() - startTime, v: frameMean * canvas.height });
      bandingSamples.push({ t: performance.now() - startTime, banding: bandingRatio, stripes });
      if (frameSamples.length > 240) frameSamples.shift();
      if (bandingSamples.length > 240) bandingSamples.shift();
      if (frameSamples.length >= 60) renderFlicker(frameSamples, bandingSamples, lock);
      if (flickerState.running && !closed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (error) {
    if (closed) return;
    resultEl.innerHTML = 'Camera access denied — banding screen unavailable. <br><span style="font-size:11px;color:var(--text-muted)">To re-enable this qualitative camera check, open your browser\'s site settings and allow camera access. Use a purpose-built meter for flicker frequency and modulation.</span>';
  }

  function renderFlicker(frameSamples, bandingSamples, lock) {
    const recent = frameSamples.slice(-120);
    if (recent.length < 30) return;
    const values = recent.map(sample => sample.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const frameRatio = mean ? (max - min) / mean : 0;

    const recentBanding = bandingSamples.slice(-60);
    const peakBanding = recentBanding.reduce((maximum, sample) => Math.max(maximum, sample.banding), 0);
    const peakStripes = recentBanding.reduce((maximum, sample) => Math.max(maximum, sample.stripes), 0);

    let score;
    let label;
    const autoExposureActive = !lock || lock.exposure !== 'manual';
    if (peakBanding > 0.18) {
      score = 3;
      label = 'Strong rolling-shutter banding';
    } else if (peakBanding > 0.10) {
      score = 2;
      label = 'Clear rolling-shutter banding';
    } else if (peakBanding > 0.04 || frameRatio > 0.12) {
      score = 1;
      label = 'Some banding detected';
    } else if (autoExposureActive) {
      score = 0;
      label = 'No banding detected (camera auto mode)';
    } else {
      score = 0;
      label = 'No rolling-shutter banding detected';
    }

    lastResult = {
      score,
      label,
      bandingRatio: peakBanding,
      stripes: peakStripes,
      frameRatio,
      method: 'rolling-shutter-camera-screen',
      exposureLock: lock?.exposure || 'auto',
      frameRate: lock?.frameRate || null,
    };
    resultEl.innerHTML = `<strong class="flicker-score-${score}">${escapeHTML(label)}</strong><br><small style="color:var(--text-muted)">banding proxy ${peakBanding.toFixed(3)} · frame change ${frameRatio.toFixed(3)}${peakStripes >= 2 ? ` · ${peakStripes} stripes/frame` : ''} · no frequency estimate</small>`;
  }

  queryRequired(overlay, '#flicker-save').addEventListener('click', async () => {
    if (!lastResult) {
      showNotification('Wait for a camera result before saving.', 'error');
      return;
    }
    await saveMeasurement('flicker', lastResult.score, {
      confidence: lastResult.exposureLock === 'manual' ? 0.55 : 0.35,
      extra: lastResult,
      roomId,
    });
    showNotification(`Flicker score saved: ${lastResult.label}`);
    closeFlickerOverlay();
  });
}
