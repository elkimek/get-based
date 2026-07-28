// @ts-check
// Two-sample visible-light transmission workflow for windows and glass.

import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
  getRequired2DContext,
  loadLuxCalibration,
  lockCameraForMeasurement,
} from './light-tool-camera.js';
import {
  clearCameraToolCloser,
  getSaveMeasurement,
  installLightToolModalDelegates,
  lightToolModalActionAttrs,
  queryOptionalLightToolElement,
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

/** @type {{ inside: number | null, outside: number | null }} */
let glassReadings = { inside: null, outside: null };

export async function openGlassTransmission(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Glass transmission test">
    <div class="modal-header">
      <h3>Window / Glass Transmission</h3>
      <button class="modal-close" ${lightToolModalActionAttrs('close-glass')} aria-label="Close">×</button>
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
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-glass')}>Done</button>
        <button class="import-btn import-btn-primary" id="glass-save" disabled>Save reading</button>
      </div>
    </div>
    </div>`;
  let closed = false;
  /** @type {Set<MediaStream>} */
  const activeGlassStreams = new Set();
  const closeGlassOverlay = () => {
    if (closed) return;
    closed = true;
    for (const stream of activeGlassStreams) {
      try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
    }
    activeGlassStreams.clear();
    clearCameraToolCloser('close-glass', closeGlassOverlay);
    removeModalOverlay(overlay);
  };
  registerCameraToolCloser('close-glass', closeGlassOverlay);
  installLightToolModalDelegates(overlay);
  openAppendedModalOverlay(overlay, closeGlassOverlay);

  glassReadings = { inside: null, outside: null };

  /** @type {import('./light-tool-camera.js').CameraLockResult | null} */
  let lastGlassLock = null;
  /** @param {'inside' | 'outside'} which */
  const measure = async which => {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 160, height: 120 },
      });
      if (closed) return;
      activeGlassStreams.add(stream);
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (closed) return;
      const lock = await lockCameraForMeasurement(stream);
      if (closed) return;
      lastGlassLock = lock;
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 24;
      const context = getRequired2DContext(canvas);
      const samples = [];
      for (let sample = 0; sample < 8; sample++) {
        if (closed) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
        }
        samples.push(sum / (data.length / 4));
        await new Promise(resolve => setTimeout(resolve, 125));
      }
      const meanLuma = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const luxEstimate = Math.max(0, meanLuma * 40 * loadLuxCalibration());
      if (closed) return;
      glassReadings[which] = luxEstimate;
      const readingEl = queryOptionalLightToolElement(overlay, `#glass-reading-${which}`);
      if (readingEl) readingEl.textContent = `${Math.round(luxEstimate)} lux`;
      computeGlass();
    } catch (error) {
      if (!closed) {
        const readingEl = queryOptionalLightToolElement(overlay, `#glass-reading-${which}`);
        if (readingEl) readingEl.textContent = 'denied';
      }
    } finally {
      if (stream) {
        try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
        activeGlassStreams.delete(stream);
      }
    }
  };
  queryRequired(overlay, '#glass-measure-inside').addEventListener('click', () => measure('inside'));
  queryRequired(overlay, '#glass-measure-outside').addEventListener('click', () => measure('outside'));

  function computeGlass() {
    if (glassReadings.inside == null || glassReadings.outside == null) return;
    const transmission = Math.min(1, glassReadings.inside / Math.max(glassReadings.outside, 1));
    const blocked = (1 - transmission) * 100;
    const lockNote = lastGlassLock && lastGlassLock.exposure !== 'manual'
      ? '<br><small style="color:var(--orange)">⚠ camera auto-exposure was active — re-exposes between samples, the ratio above is approximate. Re-take readings if you need precision.</small>'
      : '';
    queryRequired(overlay, '#glass-result').innerHTML =
      `<strong>Glass transmits ${(transmission * 100).toFixed(0)}% of visible light</strong>` +
      `<br><small>Blocks ~${blocked.toFixed(0)}% of broadband visible. <strong>UV transmission cannot be inferred from this measurement</strong> — Low-E and UV-blocking coatings have very different UV/visible ratios. A handheld UV meter is required to verify UV-A or UV-B blocking.</small>${lockNote}`;
    const glassSave = /** @type {HTMLButtonElement} */ (queryRequired(overlay, '#glass-save'));
    glassSave.disabled = false;
    glassSave.onclick = async () => {
      await saveMeasurement('glass-transmission', transmission, {
        confidence: lastGlassLock?.exposure === 'manual' ? 0.7 : 0.5,
        extra: {
          inside: glassReadings.inside,
          outside: glassReadings.outside,
          lockMode: lastGlassLock?.exposure || 'auto',
        },
        roomId,
      });
      showNotification(`Glass transmission saved: ${(transmission * 100).toFixed(0)}%`);
      closeGlassOverlay();
    };
  }
}
