import {renderHTML as renderCameraToolHTML} from './components/LightCameraPresentation.svelte.html.js';
// Camera-backed warm/cool appearance workflow.

import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  getAimingGuideView,
  computeRowBanding,
  getRequired2DContext,
  lockCameraForMeasurement,
} from './light-tool-camera.js';
import {
  clearCameraToolCloser,
  getSaveMeasurement,
  installLightToolModalDelegates,
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

let cctState: { running: boolean; stream: MediaStream | null } = {
  running: false,
  stream: null,
};

export async function openCCTMeter(opts: { roomId?: unknown } = {}, deps: Parameters<typeof getSaveMeasurement>[0] = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = renderCameraToolHTML({kind: 'shell', view: {tool: 'cct', guide: getAimingGuideView('cct')}});
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

  let currentCCT: number | null = null;
  let currentMelanopic: number | null = null;
  let currentPWMActive = false;
  let measurementConfidence = 0.2;
  let whiteBalanceMode = 'auto';
  const valueEl = queryRequired<HTMLElement>(overlay, '#cct-value');
  const toneEl = queryRequired<HTMLElement>(overlay, '#cct-tone');
  const coherenceEl = queryRequired<HTMLElement>(overlay, '#cct-coherence');
  const video = queryRequired<HTMLVideoElement>(overlay, '#cct-video');
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
    whiteBalanceMode = lock.whiteBalance;
    measurementConfidence = lock.whiteBalance === 'manual' ? 0.35 : 0.2;
    if (lock.whiteBalance !== 'manual') {
      coherenceEl.innerHTML = renderCameraToolHTML({kind: 'cct-auto'});
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = getRequired2DContext(canvas);
    const bandingPeaks: number[] = [];
    const tick = () => {
      if (!cctState.running) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < data.length; index += 4) {
        red += data[index]!;
        green += data[index + 1]!;
        blue += data[index + 2]!;
      }
      const pixels = data.length / 4;
      red /= pixels;
      green /= pixels;
      blue /= pixels;
      const sum = red + green + blue || 1;
      const normalizedRed = red / sum;
      const normalizedBlue = blue / sum;
      const ratio = normalizedBlue / Math.max(normalizedRed, 0.01);
      const cct = Math.round((1800 + Math.min(5200, ratio * 4500)) / 100) * 100;
      const melanopic = normalizedBlue;
      const { bandingRatio, stripes } = computeRowBanding(data, canvas.width, canvas.height);
      bandingPeaks.push(bandingRatio);
      if (bandingPeaks.length > 60) bandingPeaks.shift();
      const peakBanding = bandingPeaks.reduce((maximum, value) => Math.max(maximum, value), 0);
      currentCCT = cct;
      currentMelanopic = melanopic;
      currentPWMActive = peakBanding > 0.10 && stripes >= 2;
      valueEl.textContent = `~${cct} K`;
      toneEl.textContent = cctTone(cct);
      if (lock.whiteBalance === 'manual') {
        coherenceEl.innerHTML = renderCameraToolHTML({kind: 'cct-reading', melanopic, banding: peakBanding > 0.10 && stripes >= 2});
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
      confidence: measurementConfidence,
      extra: {
        // Keep the legacy key so existing exports and older consumers do not
        // lose the recorded value.  `cameraBlueRatioProxy` + `method` are the
        // authoritative fields: a phone RGB ratio is not a melanopic metric.
        cameraBlueRatioProxy: currentMelanopic,
        melanopic: currentMelanopic,
        bandingDetected: currentPWMActive,
        pwmActive: currentPWMActive, // legacy export key; this is camera banding, not a PWM diagnosis
        method: 'camera-rgb-proxy',
        whiteBalanceMode,
        estimateRoundedToK: 100,
      },
      roomId,
    });
    showNotification(`Color temp saved: ${currentCCT} K`);
    closeCCTOverlay();
  });
}

function cctTone(kelvin: number) {
  if (kelvin < 2200) return 'Candle';
  if (kelvin < 3000) return 'Warm white (incandescent / warm LED)';
  if (kelvin < 4000) return 'Soft white';
  if (kelvin < 5000) return 'Cool white / fluorescent';
  if (kelvin < 6000) return 'Daylight';
  return 'Overcast / blue-shifted';
}
