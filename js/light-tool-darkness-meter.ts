import {renderHTML as renderCameraToolHTML} from './components/LightCameraPresentation.svelte.html.js';
// Long-exposure sleep-darkness measurement workflow.

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
  registerCameraToolCloser,
} from './light-tool-camera-modal-runtime.js';

import type { CameraLockResult } from './light-tool-camera.js';
export interface DarknessMeterOptions { roomId?: unknown; }
type MeterDependencies = NonNullable<Parameters<typeof getSaveMeasurement>[0]>;
interface DarknessCameraResult {
  method: string; cameraLevel: number; peakCameraLevel: number; meanLuma: number; peakLuma: number;
  lockMode: CameraLockResult['exposure']; isoLocked: boolean; levelLabel: string; cls: string;
}

let darknessState: { running: boolean; stream: MediaStream | null } = {
  running: false,
  stream: null,
};

export async function openDarknessMeter(opts: DarknessMeterOptions = {}, deps: MeterDependencies = {}) {
  const saveMeasurement = getSaveMeasurement(deps);
  const roomId = opts.roomId || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay light-tool-overlay';
  overlay.innerHTML = renderCameraToolHTML({kind: 'shell', view: {tool: 'darkness', guide: getAimingGuideView('darkness')}});
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

  let result: DarknessCameraResult | null = null;
  const statusEl = (queryRequired(overlay, '#dark-status') as HTMLElement);
  const startBtn = (queryRequired(overlay, '#dark-start') as HTMLButtonElement);
  const saveBtn = (queryRequired(overlay, '#dark-save') as HTMLButtonElement);

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
      const lumas: number[] = [];
      const peaks: number[] = [];
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
          const luma = 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
          sum += luma;
          if (luma > max) max = luma;
        }
        lumas.push(sum / (data.length / 4));
        peaks.push(max);
        await new Promise<void>(resolve => setTimeout(resolve, 200));
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
      let label: string;
      let className: string;
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
      statusEl.innerHTML = renderCameraToolHTML({kind: 'darkness-reading', label, cls: className, cameraLevel, peakLevel, lock});
      startBtn.textContent = 'Read again';
      startBtn.disabled = false;
      saveBtn.disabled = false;
    } catch (error) {
      darknessState.running = false;
      if (darknessState.stream) {
        try { darknessState.stream.getTracks().forEach(track => track.stop()); } catch (stopError) {}
        darknessState.stream = null;
      }
      statusEl.innerHTML = renderCameraToolHTML({kind: 'darkness-denied'});
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
    const input = (queryRequired(overlay, '#dark-meter-input') as HTMLInputElement);
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
