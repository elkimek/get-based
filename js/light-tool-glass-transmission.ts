import {renderHTML as renderCameraToolHTML} from './components/LightCameraPresentation.svelte.html.js';
// Two-sample visible-light transmission workflow for windows and glass.

import { queryRequired, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  getAimingGuideView,
  getRequired2DContext,
  lockCameraForMeasurement,
} from './light-tool-camera.js';
import {
  clearCameraToolCloser,
  getSaveMeasurement,
  installLightToolModalDelegates,
  queryOptionalLightToolElement,
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

let glassReadings: { inside: number | null; outside: number | null } = { inside: null, outside: null };

export async function openGlassTransmission(opts: { roomId?: unknown } = {}, deps: Parameters<typeof getSaveMeasurement>[0] = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = renderCameraToolHTML({kind: 'shell', view: {tool: 'glass-transmission', guide: getAimingGuideView('glass-transmission')}});
  let closed = false;
  const activeGlassStreams = new Set<MediaStream>();
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

  let lastGlassLock: import('./light-tool-camera.js').CameraLockResult | null = null;
  const measure = async (which: 'inside' | 'outside') => {
    let stream: MediaStream | null = null;
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
      const samples: number[] = [];
      for (let sample = 0; sample < 8; sample++) {
        if (closed) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          sum += 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
        }
        samples.push(sum / (data.length / 4));
        await new Promise(resolve => setTimeout(resolve, 125));
      }
      const meanLuma = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      if (closed) return;
      glassReadings[which] = meanLuma;
      const readingEl = queryOptionalLightToolElement(overlay, `#glass-reading-${which}`);
      if (readingEl) readingEl.textContent = `${Math.round(meanLuma / 255 * 100)}% camera level`;
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
    queryRequired(overlay, '#glass-result').innerHTML = renderCameraToolHTML({kind: 'glass-reading', transmission, lock: lastGlassLock});
    const glassSave = queryRequired<HTMLButtonElement>(overlay, '#glass-save');
    glassSave.disabled = false;
    glassSave.onclick = async () => {
      await saveMeasurement('glass-transmission', transmission, {
        confidence: lastGlassLock?.exposure === 'manual' ? 0.45 : 0.25,
        extra: {
          inside: glassReadings.inside,
          outside: glassReadings.outside,
          lockMode: lastGlassLock?.exposure || 'auto',
          method: 'two-sample-camera-ratio',
          unit: 'relative-camera-response',
        },
        roomId,
      });
      showNotification(`Glass transmission saved: ${(transmission * 100).toFixed(0)}%`);
      closeGlassOverlay();
    };
  }
}
