import {renderHTML as renderCameraToolHTML} from './components/LightCameraPresentation.svelte.html.js';
// Camera-backed RGB pattern and rolling-shutter banding screen.

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
interface SpectrumSample { r: number; g: number; b: number; peakBanding: number; stripes: number }
interface SpectrumCameraResult {
  label: string; confidence: number; reason: string; melanopic: number;
  circadian: 'blue-poor' | 'blue-rich' | 'mixed';
}
interface SpectrumManualResult {
  label: string | null; confidence: number; reason: string; melanopic: null; circadian: 'unknown';
}
type SpectrumResult = SpectrumCameraResult | SpectrumManualResult;


let spectrumState: { running: boolean; stream: MediaStream | null } = ({
  running: false,
  stream: null,
});

export async function openSpectrumClassifier(opts: { roomId?: unknown } = {}, deps: Parameters<typeof getSaveMeasurement>[0] = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = renderCameraToolHTML({kind: 'shell', view: {tool: 'spectrum', guide: getAimingGuideView('spectrum')}});
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

  let result: SpectrumResult | null = null;
  const resultEl = (queryRequired<HTMLElement>(overlay, '#spec-result'));
  const video = (queryRequired<HTMLVideoElement>(overlay, '#spec-video'));
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
      resultEl.innerHTML = renderCameraToolHTML({kind: 'spectrum-auto', lock});
    }
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = getRequired2DContext(canvas);
    const bandingPeaks: number[] = [];
    const tick = () => {
      if (!spectrumState.running) return;
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
      resultEl.innerHTML = renderCameraToolHTML({kind: 'spectrum-reading', result});
      if (spectrumState.running && !closed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (error) {
    if (closed) return;
    video.style.display = 'none';
    resultEl.innerHTML = renderCameraToolHTML({kind: 'spectrum-denied'});
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
      extra: {
        ...result,
        // Preserve `melanopic` for old exports/readers without pretending it
        // is CIE melanopic EDI. New code should prefer the explicit proxy.
        cameraBlueRatioProxy: result.melanopic,
        method: result.melanopic == null ? 'manual-classification' : 'camera-rgb-proxy',
      },
      roomId,
    });
    showNotification(`Light type saved: ${result.label}`);
    closeSpectrumOverlay();
  });
}

function classifyLight({ r, g, b, peakBanding, stripes }: SpectrumSample): SpectrumCameraResult {
  const sum = r + g + b || 1;
  const normalizedRed = r / sum;
  const normalizedGreen = g / sum;
  const normalizedBlue = b / sum;
  const melanopic = normalizedBlue;
  const circadian = melanopic < 0.25 ? 'blue-poor' : melanopic > 0.32 ? 'blue-rich' : 'mixed';
  const hasBanding = peakBanding > 0.10 && stripes >= 2;

  if (hasBanding && normalizedGreen > 0.36) {
    return { label: 'Green-biased source with banding', confidence: 0.55, reason: 'Camera RGB is green-biased and rolling-shutter bands are visible; source technology is not identified.', melanopic, circadian };
  }
  if (normalizedRed > 0.40 && normalizedBlue < 0.20) {
    return { label: 'Very warm-looking source', confidence: 0.55, reason: 'Red-rich, low-blue camera pattern; construction and missing wavelengths remain unknown.', melanopic, circadian };
  }
  if (normalizedBlue > 0.36 && !hasBanding) {
    return { label: 'Cool-looking source', confidence: 0.5, reason: 'Blue-rich camera pattern with no rolling-shutter bands detected.', melanopic, circadian };
  }
  if (normalizedBlue > 0.36 && hasBanding) {
    return { label: 'Cool-looking source with banding', confidence: 0.55, reason: 'Blue-rich camera pattern plus rolling-shutter bands; modulation method is not identified.', melanopic, circadian };
  }
  if (normalizedRed > 0.32 && normalizedBlue < 0.30 && !hasBanding) {
    return { label: 'Warm-looking source', confidence: 0.5, reason: 'Warm camera-RGB pattern with no rolling-shutter bands detected.', melanopic, circadian };
  }
  if (normalizedRed > 0.32 && normalizedBlue < 0.30 && hasBanding) {
    return { label: 'Warm-looking source with banding', confidence: 0.55, reason: 'Warm camera-RGB pattern plus rolling-shutter bands; source technology is not identified.', melanopic, circadian };
  }
  if (Math.abs(normalizedRed - 0.33) < 0.05 && Math.abs(normalizedBlue - 0.33) < 0.05) {
    return { label: 'Balanced camera RGB — source unknown', confidence: 0.35, reason: 'Balanced phone RGB cannot distinguish daylight, white LEDs, or a full spectrum.', melanopic, circadian };
  }
  return { label: 'Mixed / unclassified', confidence: 0.3, reason: 'Camera pattern does not support a more specific description.', melanopic, circadian };
}
