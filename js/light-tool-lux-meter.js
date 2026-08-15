// @ts-check
// Lux meter camera and AmbientLightSensor workflow.

import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  aimingGuideHTML,
  cameraLockStatusLine,
  clearLuxCalibration,
  getRequired2DContext,
  isLuxCalibrationConfirmed,
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
  { max: 10, label: 'Very dim', color: 'var(--text-muted)' },
  { max: 100, label: 'Dim indoor', color: 'var(--text-secondary)' },
  { max: 500, label: 'Typical indoor', color: 'var(--text-primary)' },
  { max: 1000, label: 'Bright indoor', color: 'var(--accent)' },
  { max: 10000, label: 'Overcast outdoor', color: 'var(--green)' },
  { max: 100000, label: 'Outdoor daylight', color: 'var(--orange)' },
  { max: Infinity, label: 'Direct sun', color: 'var(--orange)' },
];

function luxZone(lux) {
  for (const zone of LUX_ZONES) if (lux <= zone.max) return zone;
  return LUX_ZONES[LUX_ZONES.length - 1];
}

let luxState = /** @type {{ running: boolean, sensor: { stop: () => void } | null, stream: MediaStream | null, video: HTMLVideoElement | null, calibration: number, calibrationConfirmed: boolean }} */ ({
  running: false,
  sensor: null,
  stream: null,
  video: null,
  calibration: 1,
  calibrationConfirmed: false,
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
      <div class="lux-source-picker" id="lux-source-picker" role="group" aria-label="Lux measurement source">
        <span class="lux-source-picker-label">Measure with</span>
        <button type="button" class="lux-source-option" id="lux-source-als" aria-pressed="false">
          <span>Phone light sensor</span>
          <small id="lux-source-als-detail">Preferred</small>
        </button>
        <button type="button" class="lux-source-option" id="lux-source-camera" aria-pressed="false">
          <span>Camera</span>
          <small id="lux-source-camera-detail">Approximate fallback</small>
        </button>
      </div>
      <p class="modal-body-hint" id="lux-source-line">Initializing…</p>
      <div class="lux-dial" id="lux-live-dial">
        <div class="lux-dial-value" id="lux-value">—</div>
        <div class="lux-dial-unit" id="lux-unit">lux</div>
        <div class="lux-dial-zone" id="lux-zone">—</div>
      </div>
      <div class="lux-manual-entry" id="lux-manual-entry" hidden>
        <label for="lux-manual-input">Enter a reading from a lux meter</label>
        <div class="lux-manual-entry-row">
          <input type="number" id="lux-manual-input" class="ctx-input" min="0" max="200000" step="1" placeholder="e.g. 400" inputmode="decimal" />
          <span>lux</span>
        </div>
        <div class="lux-dial-zone" id="lux-manual-zone">—</div>
      </div>
      <div class="lux-zones">
        ${LUX_ZONES.slice(0, 6).map(zone => `<div class="lux-zone-marker">≤ ${zone.max} <span>${zone.label}</span></div>`).join('')}
      </div>
      <details id="lux-calibration-panel" style="margin-top:14px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0">
        <summary style="padding:8px 12px;cursor:pointer;font-size:12px;color:var(--text-secondary);user-select:none">⚙ Calibrate against a known reference</summary>
        <div style="padding:0 12px 12px 12px;font-size:12px;color:var(--text-muted)">
          <p style="margin:4px 0 8px 0">Place a real lux meter beside this phone, aim both in the same direction, and enter the reference. Camera lux is withheld until this device has been calibrated.</p>
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
  const unitEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-unit'));
  const zoneEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-zone'));
  const sourceLine = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-source-line'));
  const liveDial = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-live-dial'));
  const manualEntry = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-manual-entry'));
  const manualInput = /** @type {HTMLInputElement} */ (queryRequired(overlay, '#lux-manual-input'));
  const manualZoneEl = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-manual-zone'));
  const alsButton = /** @type {HTMLButtonElement} */ (queryRequired(overlay, '#lux-source-als'));
  const cameraButton = /** @type {HTMLButtonElement} */ (queryRequired(overlay, '#lux-source-camera'));
  const alsDetail = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-source-als-detail'));
  const cameraDetail = /** @type {HTMLElement} */ (queryRequired(overlay, '#lux-source-camera-detail'));
  const calCurrentEl = /** @type {HTMLElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-current'));
  luxState.running = true;
  luxState.calibration = loadLuxCalibration();
  luxState.calibrationConfirmed = isLuxCalibrationConfirmed();
  if (calCurrentEl) calCurrentEl.textContent = luxState.calibrationConfirmed ? `${luxState.calibration.toFixed(2)}×` : 'not calibrated';

  let activeSource = /** @type {'als' | 'camera' | 'manual' | null} */ (null);
  let cameraFallbackStarted = false;
  let cameraRun = 0;
  let cameraExposureHeld = false;
  const calibrationPanel = /** @type {HTMLElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-calibration-panel'));

  const setActiveSource = (source) => {
    activeSource = source;
    const alsActive = source === 'als';
    const cameraActive = source === 'camera';
    alsButton.classList.toggle('active', alsActive);
    cameraButton.classList.toggle('active', cameraActive);
    alsButton.setAttribute('aria-pressed', String(alsActive));
    cameraButton.setAttribute('aria-pressed', String(cameraActive));
    liveDial.hidden = source === 'manual';
    manualEntry.hidden = source !== 'manual';
    if (calibrationPanel) calibrationPanel.style.display = source === 'camera' ? '' : 'none';
  };

  const stopAmbientSensor = () => {
    if (!luxState.sensor) return;
    try { luxState.sensor.stop(); } catch (error) {}
    luxState.sensor = null;
  };

  const stopCamera = () => {
    cameraRun += 1;
    cameraFallbackStarted = false;
    cameraExposureHeld = false;
    if (luxState.stream) {
      try { luxState.stream.getTracks().forEach(track => track.stop()); } catch (error) {}
      luxState.stream = null;
    }
    luxState.video = null;
  };

  const resetReading = () => {
    currentLux = null;
    currentRawLuma = null;
    renderLux(null);
    manualInput.value = '';
    manualZoneEl.textContent = '—';
    manualZoneEl.style.color = '';
  };

  const startCameraFallback = async (introHTML = '') => {
    if (closed || cameraFallbackStarted) return;
    stopAmbientSensor();
    resetReading();
    setActiveSource('camera');
    cameraFallbackStarted = true;
    const thisCameraRun = ++cameraRun;
    try {
      sourceLine.innerHTML = introHTML || 'Starting the camera fallback…';
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } });
      if (closed || activeSource !== 'camera' || thisCameraRun !== cameraRun) {
        try { stream.getTracks().forEach(track => track.stop()); } catch (error) {}
        return;
      }
      luxState.stream = stream;
      const lock = await lockCameraForMeasurement(stream);
      cameraExposureHeld = lock.exposure === 'manual';
      if (closed || activeSource !== 'camera' || thisCameraRun !== cameraRun) return;
      sourceLine.innerHTML = luxState.calibrationConfirmed && cameraExposureHeld
        ? `Device-calibrated camera estimate. Repeatable on this phone, but not meter-grade. ${cameraLockStatusLine(lock)}`
        : `<b>Camera brightness proxy only.</b> ${cameraExposureHeld ? 'Calibrate beside a lux meter before saving an approximate lux value.' : 'This browser could not hold exposure, so camera lux is unavailable.'} ${cameraLockStatusLine(lock)}`;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (closed || activeSource !== 'camera' || thisCameraRun !== cameraRun) return;
      luxState.video = video;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const context = getRequired2DContext(canvas);
      const tick = () => {
        if (!luxState.running || closed || activeSource !== 'camera' || thisCameraRun !== cameraRun) return;
        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let index = 0; index < data.length; index += 4) {
            sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
          }
          const meanLuma = sum / (data.length / 4);
          currentRawLuma = meanLuma;
          if (luxState.calibrationConfirmed && cameraExposureHeld) {
            currentLux = Math.max(0, meanLuma * 40 * luxState.calibration);
            renderLux(currentLux);
          } else {
            currentLux = null;
            renderCameraProxy(meanLuma);
          }
        } catch (error) {
          // The video may not have produced a frame yet.
        }
        if (luxState.running && !closed && activeSource === 'camera' && thisCameraRun === cameraRun) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (error) {
      if (closed || activeSource !== 'camera' || thisCameraRun !== cameraRun) return;
      cameraFallbackStarted = false;
      cameraButton.disabled = true;
      cameraButton.title = 'The browser blocked or could not start the camera';
      cameraDetail.textContent = 'Unavailable here';
      setActiveSource('manual');
      sourceLine.innerHTML = '<b>Camera unavailable.</b> Enter a reading from a real lux meter or a trusted meter app. Do not estimate it from the scale.';
    }
  };

  const AmbientLightSensorCtor = getUtilsRuntimeValue('AmbientLightSensor');
  const ambientSensorSupported = typeof AmbientLightSensorCtor === 'function';
  if (!ambientSensorSupported) {
    alsButton.disabled = true;
    alsButton.title = 'This browser does not expose the phone light sensor';
    alsDetail.textContent = 'Unavailable here';
  }

  const startAmbientSensor = () => {
    if (closed || !ambientSensorSupported) return false;
    stopCamera();
    stopAmbientSensor();
    resetReading();
    setActiveSource('als');
    try {
      const sensor = new AmbientLightSensorCtor({ frequency: 4 });
      sensor.addEventListener('reading', () => {
        if (closed || activeSource !== 'als' || luxState.sensor !== sensor) return;
        const illuminance = Number(sensor.illuminance);
        currentLux = Number.isFinite(illuminance) && illuminance >= 0 ? illuminance : null;
        renderLux(currentLux);
      });
      sensor.addEventListener('error', () => {
        if (closed || activeSource !== 'als' || luxState.sensor !== sensor) return;
        try { sensor.stop(); } catch (error) {}
        luxState.sensor = null;
        alsButton.disabled = true;
        alsButton.title = 'The browser blocked or could not read this sensor';
        alsDetail.textContent = 'Unavailable here';
        currentLux = null;
        renderLux(null);
        void startCameraFallback('<b>Phone light sensor unavailable.</b> Using the camera fallback instead.');
      });
      luxState.sensor = sensor;
      sensor.start();
      sourceLine.textContent = 'Reading lux from your phone\'s light sensor. Keep it uncovered; readings can vary between phone models.';
      return true;
    } catch (error) {
      stopAmbientSensor();
      alsButton.disabled = true;
      alsButton.title = 'The browser blocked or could not start this sensor';
      alsDetail.textContent = 'Unavailable here';
      return false;
    }
  };

  alsButton.addEventListener('click', () => {
    if (activeSource === 'als') return;
    if (!startAmbientSensor()) {
      void startCameraFallback('<b>Phone light sensor unavailable.</b> Using the camera fallback instead.');
    }
  });
  cameraButton.addEventListener('click', () => {
    if (activeSource === 'camera' || activeSource === 'manual') return;
    void startCameraFallback();
  });

  manualInput.addEventListener('input', () => {
    if (activeSource !== 'manual') return;
    const value = parseFloat(manualInput.value);
    if (Number.isFinite(value) && value >= 0) {
      currentLux = value;
      const zone = luxZone(value);
      manualZoneEl.textContent = zone.label;
      manualZoneEl.style.color = zone.color;
    } else {
      currentLux = null;
      manualZoneEl.textContent = '—';
      manualZoneEl.style.color = '';
    }
  });

  if (!startAmbientSensor()) await startCameraFallback();

  function renderLux(value) {
    if (value == null) {
      valueEl.textContent = '—';
      zoneEl.textContent = '—';
      return;
    }
    unitEl.textContent = 'lux';
    valueEl.textContent = value < 100 ? value.toFixed(0) : Math.round(value).toLocaleString();
    const zone = luxZone(value);
    zoneEl.textContent = zone.label;
    zoneEl.style.color = zone.color;
  }

  function renderCameraProxy(rawLuma) {
    valueEl.textContent = `${Math.round(Math.min(100, Math.max(0, rawLuma / 255 * 100)))}%`;
    unitEl.textContent = 'camera level';
    zoneEl.textContent = 'Calibration required for lux';
    zoneEl.style.color = 'var(--text-muted)';
  }

  const calApplyBtn = /** @type {HTMLButtonElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-apply'));
  const calResetBtn = /** @type {HTMLButtonElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-reset'));
  const calRefInput = /** @type {HTMLInputElement | null} */ (queryOptionalLightToolElement(overlay, '#lux-cal-reference'));
  calApplyBtn?.addEventListener('click', () => {
    if (activeSource !== 'camera') return;
    if (!cameraExposureHeld) {
      showNotification('This camera cannot hold exposure in this browser, so a reusable lux calibration would be misleading.', 'error', 7000);
      return;
    }
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
    luxState.calibrationConfirmed = true;
    currentLux = refLux;
    renderLux(currentLux);
    if (calCurrentEl) calCurrentEl.textContent = `${clamped.toFixed(2)}×`;
    sourceLine.innerHTML = `Device-calibrated camera estimate using a ${refLux} lux reference. Approximate only; it stays outside biological scoring.`;
    showNotification(`Lux meter calibrated · factor ${clamped.toFixed(2)}×`);
  });
  calResetBtn?.addEventListener('click', () => {
    if (activeSource !== 'camera') return;
    luxState.calibration = 1;
    luxState.calibrationConfirmed = false;
    clearLuxCalibration();
    currentLux = null;
    if (calCurrentEl) calCurrentEl.textContent = 'not calibrated';
    sourceLine.innerHTML = 'Camera calibration removed. Lux values are withheld until this phone is calibrated again.';
    showNotification('Lux calibration reset to 1.00×');
  });

  queryRequired(overlay, '#lux-save').addEventListener('click', async () => {
    if (currentLux == null) {
      const message = activeSource === 'manual'
        ? 'Enter a lux value first.'
        : activeSource === 'als'
          ? 'Waiting for the phone light sensor to report a reading.'
          : 'Calibrate this camera beside a lux meter before saving.';
      showNotification(message, 'error', 7000);
      return;
    }
    const source = activeSource === 'als' ? 'AmbientLightSensor' : activeSource === 'manual' ? 'manual-entry' : 'camera-estimate';
    const confidence = activeSource === 'als' ? 0.8 : activeSource === 'manual' ? 0.85 : 0.55;
    await saveMeasurement('lux', currentLux, {
      confidence,
      extra: {
        source,
        calibrationFactor: luxState.calibration,
        calibrationConfirmed: source === 'camera-estimate' ? luxState.calibrationConfirmed : undefined,
        measurementKind: 'photopic-illuminance',
        context: opts.context || null,
      },
      roomId,
    });
    showNotification(`Lux reading saved: ${Math.round(currentLux)}`);
    closeLuxMeterOverlay();
  });
}
