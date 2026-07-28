// @ts-check
// Long-exposure sleep-darkness measurement workflow.

import { escapeHTML, queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
  cameraLockStatusLine,
  getRequired2DContext,
  loadLuxCalibration,
  lockCameraForMeasurement,
} from './light-tool-camera.js';
import {
  clearCameraToolCloser,
  getSaveMeasurement,
  installLightToolModalDelegates,
  lightToolModalActionAttrs,
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

let darknessState = /** @type {{ running: boolean, stream: MediaStream | null }} */ ({
  running: false,
  stream: null,
});

export async function openDarknessMeter(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Sleep darkness meter">
    <div class="modal-header">
      <h3>Sleep Darkness Meter</h3>
      <button class="modal-close" ${lightToolModalActionAttrs('close-dark')} aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${aimingGuideHTML('darkness')}
      <p class="modal-body-hint">Lights as you'll actually sleep — door cracked, hallway light on, etc.</p>
      <div class="dark-status" id="dark-status">Press Start when ready.</div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-dark')}>Cancel</button>
        <button class="import-btn import-btn-primary" id="dark-start">Start 30-second read</button>
      </div>
    </div>
  </div>`;
  let closed = false;
  const closeDarknessOverlay = () => {
    if (closed) return;
    closed = true;
    darknessState.running = false;
    if (darknessState.stream) {
      try { darknessState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      darknessState.stream = null;
    }
    clearCameraToolCloser('close-dark', closeDarknessOverlay);
    removeModalOverlay(overlay);
  };
  registerCameraToolCloser('close-dark', closeDarknessOverlay);
  installLightToolModalDelegates(overlay);
  openAppendedModalOverlay(overlay, closeDarknessOverlay);

  let result = null;
  const statusEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#dark-status'));
  const startBtn = /** @type {HTMLButtonElement} */ (queryRequired(overlay, '#dark-start'));

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    statusEl.textContent = 'Reading… leave the phone face-up and don\'t cover the camera.';
    darknessState.running = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 160, height: 120 },
      });
      if (closed) {
        try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
        return;
      }
      darknessState.stream = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (closed) return;
      const lock = await lockCameraForMeasurement(stream, { longExposure: true });
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 24;
      const context = getRequired2DContext(canvas);
      const lumas = [];
      const peaks = [];
      const startTime = performance.now();
      let cancelled = false;
      while (performance.now() - startTime < 30000 && darknessState.running) {
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (error) {
          cancelled = true;
          break;
        }
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        let max = 0;
        for (let index = 0; index < data.length; index += 4) {
          const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
          sum += luma;
          if (luma > max) max = luma;
        }
        lumas.push(sum / (data.length / 4));
        peaks.push(max);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (cancelled || !darknessState.running) return;

      const meanLuma = lumas.reduce((sum, value) => sum + value, 0) / Math.max(1, lumas.length);
      const sortedPeaks = peaks.slice().sort((left, right) => left - right);
      const peakLuma = sortedPeaks[Math.floor(sortedPeaks.length * 0.95)] || 0;
      const calFactor = loadLuxCalibration();
      const noiseFloorLuma = 2;
      const meanLux = Math.max(0, (meanLuma - noiseFloorLuma) * 0.5 * calFactor);
      const peakLux = Math.max(0, (peakLuma - noiseFloorLuma) * 0.5 * calFactor);
      let label;
      let className;
      if (meanLux < 0.3 && peakLux < 1) {
        label = 'Excellent — true darkness';
        className = 'ok';
      } else if (meanLux < 1 && peakLux < 5) {
        label = 'Good — minor leak, melatonin mostly preserved';
        className = 'ok';
      } else if (meanLux < 5 && peakLux < 20) {
        label = 'Moderate leak — 20–30% melatonin attenuation likely';
        className = 'warn';
      } else if (peakLux >= 20 && meanLux < 5) {
        label = 'Bright spikes detected — investigate notifications / passing lights';
        className = 'warn';
      } else {
        label = 'Significant — circadian phase shift likely';
        className = 'over';
      }
      result = {
        meanLux,
        peakLux,
        lockMode: lock.exposure,
        isoLocked: lock.iso != null,
        calFactor,
        label,
        cls: className,
      };
      const calibrationNote = lock.iso != null
        ? `<small style="color:var(--text-muted)">Locked ISO ${lock.iso}, exposure ${lock.exposure}.</small>`
        : `<small style="color:var(--orange)">⚠ ISO not lockable on this camera — readings are qualitative (good/moderate/bright), not absolute lux. ${cameraLockStatusLine(lock)}</small>`;
      statusEl.innerHTML = `<strong class="dark-status-${className}">${escapeHTML(label)}</strong>` +
        `<br><small style="color:var(--text-muted)">~${meanLux.toFixed(2)} lux average · ~${peakLux.toFixed(2)} lux peak (95th-pctile)</small>` +
        `<br>${calibrationNote}`;
      startBtn.textContent = 'Save reading';
      startBtn.disabled = false;
      startBtn.onclick = async () => {
        await saveMeasurement('darkness', meanLux, {
          confidence: lock.iso != null ? 0.7 : 0.45,
          extra: result,
          roomId,
        });
        showNotification('Sleep darkness reading saved.');
        closeDarknessOverlay();
      };
    } catch (error) {
      statusEl.innerHTML = 'Camera access denied — darkness meter unavailable. <br><span style="font-size:11px;color:var(--text-muted)">Open your browser\'s site settings to allow camera access. This tool runs a long-exposure capture to detect ambient light below 1 lux — there\'s no useful manual-entry fallback.</span>';
      startBtn.disabled = false;
    }
  });
}
