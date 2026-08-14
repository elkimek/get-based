// @ts-check
// Long-exposure sleep-darkness measurement workflow.

import { escapeHTML, queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
  cameraLockStatusLine,
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
      <p class="modal-body-hint">Set the room as you actually sleep. The camera check is qualitative; enter a meter reading below for lux.</p>
      <div class="dark-status" id="dark-status">Press Start when ready.</div>
      <details style="margin-top:14px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px">
        <summary style="cursor:pointer;color:var(--text-secondary);font-size:12px">Enter a lux-meter reading instead</summary>
        <div style="display:flex;gap:8px;align-items:end;margin-top:10px;flex-wrap:wrap">
          <label class="ctx-label" style="margin:0;flex:1;min-width:160px">Reading at the pillow (photopic lux)
            <input type="number" id="dark-meter-input" class="ctx-input" min="0" max="10000" step="0.01" inputmode="decimal" placeholder="e.g. 0.2" />
          </label>
          <button class="import-btn import-btn-secondary" id="dark-meter-save">Save meter reading</button>
        </div>
        <small style="display:block;margin-top:7px;color:var(--text-muted)">Photopic lux is not melanopic EDI; source spectrum still matters.</small>
      </details>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-dark')}>Cancel</button>
        <button class="import-btn import-btn-primary" id="dark-start">Start 30-second read</button>
        <button class="import-btn import-btn-primary" id="dark-save" disabled>Save camera check</button>
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
  const saveBtn = /** @type {HTMLButtonElement} */ (queryRequired(overlay, '#dark-save'));

  startBtn.addEventListener('click', async () => {
    if (darknessState.stream) {
      try { darknessState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      darknessState.stream = null;
    }
    result = null;
    saveBtn.disabled = true;
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
      try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      if (darknessState.stream === stream) darknessState.stream = null;
      darknessState.running = false;

      const meanLuma = lumas.reduce((sum, value) => sum + value, 0) / Math.max(1, lumas.length);
      const sortedPeaks = peaks.slice().sort((left, right) => left - right);
      const peakLuma = sortedPeaks[Math.floor(sortedPeaks.length * 0.95)] || 0;
      const cameraLevel = Math.min(100, Math.max(0, meanLuma / 255 * 100));
      const peakLevel = Math.min(100, Math.max(0, peakLuma / 255 * 100));
      let label;
      let className;
      if (cameraLevel < 3 && peakLevel < 8) {
        label = 'Very dark camera frame';
        className = 'ok';
      } else if (cameraLevel < 10 && peakLevel < 25) {
        label = 'Low light visible to the camera';
        className = 'ok';
      } else if (peakLevel >= 45 && cameraLevel < 15) {
        label = 'Bright points or brief spikes detected';
        className = 'warn';
      } else if (cameraLevel < 30) {
        label = 'Room light is clearly visible to the camera';
        className = 'warn';
      } else {
        label = 'Bright camera frame';
        className = 'over';
      }
      result = {
        method: 'camera-relative',
        cameraLevel,
        peakCameraLevel: peakLevel,
        meanLuma,
        peakLuma,
        lockMode: lock.exposure,
        isoLocked: lock.iso != null,
        levelLabel: label,
        cls: className,
      };
      const calibrationNote = lock.iso != null && lock.exposure === 'manual'
        ? `<small style="color:var(--text-muted)">Camera exposure held for this qualitative check. Device-specific low-light response still prevents an absolute lux reading.</small>`
        : `<small style="color:var(--orange)">Camera exposure could not be fully fixed. Treat this only as a check for obvious light or bright points. ${cameraLockStatusLine(lock)}</small>`;
      statusEl.innerHTML = `<strong class="dark-status-${className}">${escapeHTML(label)}</strong>` +
        `<br><small style="color:var(--text-muted)">Camera level ${cameraLevel.toFixed(0)}% · peak ${peakLevel.toFixed(0)}%. Not lux and not a melatonin estimate.</small>` +
        `<br>${calibrationNote}`;
      startBtn.textContent = 'Read again';
      startBtn.disabled = false;
      saveBtn.disabled = false;
    } catch (error) {
      darknessState.running = false;
      if (darknessState.stream) {
        try { darknessState.stream.getTracks().forEach(track => track.stop()); } catch (stopError) {}
        darknessState.stream = null;
      }
      statusEl.innerHTML = 'Camera access denied — the qualitative camera check is unavailable. <br><span style="font-size:11px;color:var(--text-muted)">Use the meter-entry option above for a numerical photopic-lux reading.</span>';
      startBtn.disabled = false;
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!result) {
      showNotification('Run the camera check first.', 'error');
      return;
    }
    await saveMeasurement('darkness', result.cameraLevel, {
      confidence: result.isoLocked && result.lockMode === 'manual' ? 0.4 : 0.25,
      extra: result,
      roomId,
    });
    showNotification('Qualitative sleep-light check saved.');
    closeDarknessOverlay();
  });

  queryRequired(overlay, '#dark-meter-save').addEventListener('click', async () => {
    const input = /** @type {HTMLInputElement} */ (queryRequired(overlay, '#dark-meter-input'));
    const lux = Number(input.value);
    if (!Number.isFinite(lux) || lux < 0 || lux > 10000) {
      showNotification('Enter a valid lux-meter reading between 0 and 10,000.', 'error');
      return;
    }
    await saveMeasurement('darkness', lux, {
      confidence: 0.9,
      extra: { method: 'meter-entry', source: 'meter-entry', unit: 'photopic-lux', context: 'sleep' },
      roomId,
    });
    showNotification('Sleep-time lux-meter reading saved.');
    closeDarknessOverlay();
  });
}
