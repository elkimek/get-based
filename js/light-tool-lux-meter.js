// @ts-check
// Lux meter camera and AmbientLightSensor workflow.

import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
  cameraLockStatusLine,
  getRequired2DContext,
  loadLuxCalibration,
  lockCameraForMeasurement,
  saveLuxCalibration,
} from './light-tool-camera.js';
import { getUtilsRuntimeValue } from './utils-runtime.js';
import {
  clearCameraToolCloser,
  getSaveMeasurement,
  installLightToolModalDelegates,
  lightToolModalActionAttrs,
  queryOptionalLightToolElement,
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

const LUX_ZONES = [
  { max: 10, label: 'Darkness', color: 'var(--text-muted)' },
  { max: 100, label: 'Low indoor', color: 'var(--text-secondary)' },
  { max: 500, label: 'Office', color: 'var(--text-primary)' },
  { max: 1000, label: 'Bright indoor', color: 'var(--accent)' },
  { max: 10000, label: 'Overcast outdoor', color: 'var(--green)' },
  { max: 100000, label: 'Outdoor daylight', color: 'var(--orange)' },
  { max: Infinity, label: 'Direct sun', color: 'var(--orange)' },
];

function luxZone(lux) {
  for (const zone of LUX_ZONES) if (lux <= zone.max) return zone;
  return LUX_ZONES[LUX_ZONES.length - 1];
}

let luxState = /** @type {{ running: boolean, sensor: { stop: () => void } | null, stream: MediaStream | null, video: HTMLVideoElement | null, calibration: number }} */ ({
  running: false,
  sensor: null,
  stream: null,
  video: null,
  calibration: 1,
});

export async function openLuxMeter(opts = {}, deps = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = `<div class="modal light-tool-modal" role="dialog" aria-label="Lux meter">
    <div class="modal-header">
      <h3>Lux Meter</h3>
      <button class="modal-close" ${lightToolModalActionAttrs('close-lux')} aria-label="Close">×</button>
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
        ${LUX_ZONES.slice(0, 6).map(zone => `<div class="lux-zone-marker">≤ ${zone.max} <span>${zone.label}</span></div>`).join('')}
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
        <button class="import-btn import-btn-secondary" ${lightToolModalActionAttrs('close-lux')}>Done</button>
        <button class="import-btn import-btn-primary" id="lux-save">Save reading</button>
      </div>
    </div>
  </div>`;
  let closed = false;
  const closeLuxMeterOverlay = () => {
    if (closed) return;
    closed = true;
    luxState.running = false;
    if (luxState.sensor) {
      try { luxState.sensor.stop(); } catch (error) {}
      luxState.sensor = null;
    }
    if (luxState.stream) {
      try { luxState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      luxState.stream = null;
    }
    luxState.video = null;
    clearCameraToolCloser('close-lux', closeLuxMeterOverlay);
    removeModalOverlay(overlay);
  };
  registerCameraToolCloser('close-lux', closeLuxMeterOverlay);
  installLightToolModalDelegates(overlay);
  openAppendedModalOverlay(overlay, closeLuxMeterOverlay);

  let currentLux = null;
  let currentRawLuma = null;
  const valueEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-value'));
  const zoneEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-zone'));
  const sourceLine = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-source-line'));
  const calCurrentEl = /** @type {HTMLElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-current'));
  luxState.running = true;
  luxState.calibration = loadLuxCalibration();
  if (calCurrentEl) calCurrentEl.textContent = `${luxState.calibration.toFixed(2)}×`;

  let usingALS = false;
  let usingManualEntry = false;
  let cameraFallbackStarted = false;
  const calibrationPanel = /** @type {HTMLElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-calibration-panel'));
  const startCameraFallback = async (introHTML = '') => {
    if (closed || cameraFallbackStarted) return;
    cameraFallbackStarted = true;
    usingALS = false;
    try {
      if (introHTML) sourceLine.innerHTML = introHTML;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } });
      if (closed) {
        try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
        return;
      }
      luxState.stream = stream;
      const lock = await lockCameraForMeasurement(stream);
      if (closed) return;
      sourceLine.innerHTML = `Camera estimate (calibration ${luxState.calibration.toFixed(2)}×, ±30%). ${cameraLockStatusLine(lock)}`;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (closed) return;
      luxState.video = video;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const context = getRequired2DContext(canvas);
      const tick = () => {
        if (!luxState.running || closed) return;
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let index = 0; index < data.length; index += 4) {
            sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
          }
          const meanLuma = sum / (data.length / 4);
          currentRawLuma = meanLuma;
          currentLux = Math.max(0, meanLuma * 40 * luxState.calibration);
          renderLux(currentLux);
        } catch (error) {
          // The video may not have produced a frame yet.
        }
        if (luxState.running && !closed) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (error) {
      if (closed) return;
      usingManualEntry = true;
      sourceLine.innerHTML = '<b>Camera access denied.</b> Enter a lux value manually below — read it from a real meter, a second phone with an ambient-light sensor, or pick the closest zone from the scale.';
      const dial = /** @type {HTMLElement | null} */ (queryOptionalLightToolElement(overlay, '.lux-dial'));
      if (dial) {
        dial.innerHTML = `
          <div style="display:flex;align-items:baseline;justify-content:center;gap:8px;padding:8px 0">
            <input type="number" id="lux-manual-input" class="ctx-input" min="0" max="200000" step="1" placeholder="e.g. 400" inputmode="numeric" style="width:140px;font-size:20px;text-align:center;padding:8px 10px" />
            <span style="color:var(--text-muted);font-size:14px">lux</span>
          </div>
          <div class="lux-dial-zone" id="lux-zone" style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:4px">—</div>`;
        const manualInput = /** @type {HTMLInputElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-manual-input'));
        const newZoneEl = /** @type {HTMLElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-zone'));
        manualInput?.addEventListener('input', () => {
          const value = parseFloat(manualInput.value);
          if (Number.isFinite(value) && value >= 0) {
            currentLux = value;
            const zone = luxZone(value);
            if (newZoneEl) {
              newZoneEl.textContent = zone.label;
              newZoneEl.style.color = zone.color;
            }
          } else {
            currentLux = null;
            if (newZoneEl) {
              newZoneEl.textContent = '—';
              newZoneEl.style.color = '';
            }
          }
        });
      }
      if (calibrationPanel) calibrationPanel.style.display = 'none';
    }
  };

  const AmbientLightSensorCtor = getUtilsRuntimeValue('AmbientLightSensor');
  if (typeof AmbientLightSensorCtor === 'function') {
    try {
      const sensor = new AmbientLightSensorCtor({ frequency: 4 });
      sensor.addEventListener('reading', () => {
        currentLux = sensor.illuminance;
        renderLux(currentLux);
      });
      sensor.addEventListener('error', () => {
        try { sensor.stop(); } catch (error) {}
        luxState.sensor = null;
        currentLux = null;
        renderLux(null);
        void startCameraFallback('<b>Ambient light sensor blocked</b> by browser permissions. Retrying with camera estimate…');
      });
      sensor.start();
      luxState.sensor = sensor;
      usingALS = true;
      sourceLine.textContent = 'Reading from your phone\'s ambient light sensor.';
      if (calibrationPanel) calibrationPanel.style.display = 'none';
    } catch (error) {
      // Synchronous construction failure falls through to the camera.
    }
  }

  if (!usingALS) await startCameraFallback();

  function renderLux(value) {
    if (value == null) {
      valueEl.textContent = '—';
      zoneEl.textContent = '—';
      return;
    }
    valueEl.textContent = value < 100 ? value.toFixed(0) : Math.round(value).toLocaleString();
    const zone = luxZone(value);
    zoneEl.textContent = zone.label;
    zoneEl.style.color = zone.color;
  }

  const calApplyBtn = /** @type {HTMLButtonElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-apply'));
  const calResetBtn = /** @type {HTMLButtonElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-reset'));
  const calRefInput = /** @type {HTMLInputElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-reference'));
  calApplyBtn?.addEventListener('click', () => {
    if (currentRawLuma == null || currentRawLuma < 0.5) {
      showNotification('Camera not reading yet — wait a moment, then try again.', 'error');
      return;
    }
    const refLux = parseFloat(calRefInput?.value || '');
    if (!Number.isFinite(refLux) || refLux <= 0) {
      showNotification('Enter a positive lux value from your reference.', 'error');
      return;
    }
    const newFactor = refLux / Math.max(currentRawLuma * 40, 0.001);
    const clamped = Math.min(10, Math.max(0.1, newFactor));
    luxState.calibration = clamped;
    saveLuxCalibration(clamped);
    if (calCurrentEl) calCurrentEl.textContent = `${clamped.toFixed(2)}×`;
    sourceLine.innerHTML = `Camera estimate (calibration ${clamped.toFixed(2)}×, ±30%). Calibrated against ${refLux} lux reference.`;
    showNotification(`Lux meter calibrated · factor ${clamped.toFixed(2)}×`);
  });
  calResetBtn?.addEventListener('click', () => {
    luxState.calibration = 1;
    saveLuxCalibration(1);
    if (calCurrentEl) calCurrentEl.textContent = '1.00×';
    sourceLine.innerHTML = 'Camera estimate (calibration 1.00×, ±30%). Reset to default.';
    showNotification('Lux calibration reset to 1.00×');
  });

  queryRequired(overlay, '#lux-save').addEventListener('click', async () => {
    if (currentLux == null) {
      if (usingManualEntry) showNotification('Enter a lux value first.', 'error');
      return;
    }
    const source = usingALS ? 'AmbientLightSensor' : usingManualEntry ? 'manual-entry' : 'camera-estimate';
    const confidence = usingALS ? 0.85 : usingManualEntry ? 0.9 : 0.55;
    await saveMeasurement('lux', currentLux, {
      confidence,
      extra: { source, calibrationFactor: luxState.calibration },
      roomId,
    });
    showNotification(`Lux reading saved: ${Math.round(currentLux)}`);
    closeLuxMeterOverlay();
  });
}
