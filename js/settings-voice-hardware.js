// @ts-check
// settings-voice-hardware.js — shared hardware controls for local voice models.

import { LOCAL_VOICE_BACKENDS } from './voice-model-catalog.js';
import {
  getLocalVoiceModelStatus,
  initialLocalVoiceBackend,
  isMobileVoiceDevice,
  resolveLocalBackend,
} from './voice-local-engine.js';

let webGpuCapabilityPromise;

function selected(value, expected) {
  return value === expected ? ' selected' : '';
}

async function detectWebGpu() {
  const gpu = typeof navigator === 'undefined'
    ? null
    : /** @type {any} */ (navigator).gpu;
  if (!gpu?.requestAdapter) return { available: false, name: '' };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    const info = adapter?.info || {};
    return {
      available: !!adapter,
      name: String(info.description || info.architecture || info.vendor || ''),
    };
  } catch {
    return { available: false, name: '' };
  }
}

function getWebGpuCapability() {
  webGpuCapabilityPromise ||= detectWebGpu();
  return webGpuCapabilityPromise;
}

function performanceScore(value) {
  const realtimeFactor = Number(value?.realtimeFactor);
  return Number.isFinite(realtimeFactor) ? realtimeFactor : Number(value);
}

function autoPerformanceText(kind, model, capability) {
  const performance = getLocalVoiceModelStatus(kind, model)?.performance || {};
  const cpu = performanceScore(performance.wasm);
  const gpu = performanceScore(performance.webgpu);
  const hasCpu = Number.isFinite(cpu) && cpu > 0;
  const hasGpu = Number.isFinite(gpu) && gpu > 0;
  if (hasCpu && hasGpu) {
    const useGpu = resolveLocalBackend('auto', performance) === 'webgpu';
    const chosen = useGpu ? 'graphics processor' : 'main processor';
    const ratio = Math.max(cpu, gpu) / Math.min(cpu, gpu);
    return ratio < 1.15
      ? `Automatic will use the ${chosen}; both options performed about the same.`
      : `Automatic will use the ${chosen}; it was about ${ratio.toFixed(1)}× faster in your tests.`;
  }
  if (hasGpu) return 'Automatic is using the graphics processor. Try the main processor once to compare.';
  if (hasCpu) return 'Automatic is using the main processor. Try the graphics processor once to compare.';
  if (isMobileVoiceDevice()) {
    return capability.available && initialLocalVoiceBackend() === 'webgpu'
      ? 'Automatic will try the graphics processor first on this mobile device and fall back to the main processor if needed.'
      : 'Graphics processing is unavailable here. Local voice may be very slow on this mobile device.';
  }
  return 'Automatic starts with the main processor. Try the graphics processor once to compare.';
}

function renderHardwareRow(settings, kind) {
  const input = kind === 'stt';
  const setting = input ? 'localSttBackend' : 'localTtsBackend';
  const description = input
    ? 'data-voice-hardware-description'
    : 'data-voice-output-hardware-description';
  return `
    <div class="settings-section voice-setting-row" data-voice-visible="${input ? 'input' : 'output'}:browser-local">
      <div class="settings-copy">
        <div class="settings-copy-title">Processing</div>
        <div class="settings-copy-desc" ${description}></div>
      </div>
      <label class="voice-control">
        <span class="sr-only">${input ? 'Transcription' : 'Speech'} processing</span>
        <select class="api-key-input" data-voice-setting="${setting}">
          ${LOCAL_VOICE_BACKENDS.map(option => (
            `<option value="${option.id}"${selected(settings[setting], option.id)}>${option.label}</option>`
          )).join('')}
        </select>
      </label>
    </div>`;
}

export function renderSttHardwareRow(settings) {
  return renderHardwareRow(settings, 'stt');
}

export function renderTtsHardwareRow(settings) {
  return renderHardwareRow(settings, 'tts');
}

async function refreshHardwareDescription(panel, settings, kind) {
  const input = kind === 'stt';
  const setting = input ? 'localSttBackend' : 'localTtsBackend';
  const model = input ? settings.localSttModel : settings.localTtsModel;
  const selector = input
    ? '[data-voice-hardware-description]'
    : '[data-voice-output-hardware-description]';
  const description = panel.querySelector(selector);
  if (!description) return;
  if (settings[setting] === 'wasm') {
    description.textContent = 'Uses your computer’s main processor. This is often fastest on powerful CPUs.';
    return;
  }
  description.textContent = 'Checking graphics support…';
  const capability = await getWebGpuCapability();
  const currentValue = panel.querySelector(`[data-voice-setting="${setting}"]`)?.value;
  if (currentValue !== settings[setting]) return;
  if (settings[setting] === 'webgpu') {
    description.textContent = capability.available
      ? 'Uses your graphics processor. If it is slow or unreliable, choose Automatic.'
      : 'Graphics processing is not available in this browser. Choose Automatic or Main processor.';
  } else {
    description.textContent = capability.available
      ? autoPerformanceText(kind, model, capability)
      : isMobileVoiceDevice()
        ? 'Graphics processing is unavailable here. Local voice may be very slow on this mobile device.'
        : 'Graphics processing is not available in this browser. Automatic will use the main processor.';
  }
}

export function refreshSttHardwareDescription(panel, settings) {
  return refreshHardwareDescription(panel, settings, 'stt');
}

export function refreshTtsHardwareDescription(panel, settings) {
  return refreshHardwareDescription(panel, settings, 'tts');
}

export function localModelStatusText(status, kind = 'stt') {
  if (!status) return 'Not downloaded yet';
  const timing = Number.isFinite(status.lastInferenceMs)
    ? ` · last ${kind === 'tts' ? 'speech generation' : 'transcription'} ${(status.lastInferenceMs / 1000).toFixed(1)}s`
    : '';
  if (status.backend === 'webgpu') return `Ready to use · Graphics processor${timing}`;
  if (status.backend === 'wasm' && status.fallbackReason) {
    return `Ready to use · Main processor (graphics unavailable)${timing}`;
  }
  if (status.backend === 'wasm') return `Ready to use · Main processor${timing}`;
  return 'Ready to use on this device';
}
