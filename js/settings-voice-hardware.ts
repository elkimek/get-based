import type { VoiceKind, VoiceModelStatus } from '../types/voice-local.js';
import { getVoiceSettings } from './voice-settings-storage.js';
type VoiceSettings = ReturnType<typeof getVoiceSettings>;
interface WebGpuCapability { available: boolean; name: string }
interface VoiceGpuNavigator { gpu?: { requestAdapter?: (options: { powerPreference: string }) => Promise<{ info?: { description?: unknown; architecture?: unknown; vendor?: unknown } } | null> } }

// settings-voice-hardware.js — shared hardware controls for local voice models.

import { getVoiceSettingsView } from './settings-voice-view-runtime.js';
import type { VoiceOption } from './settings-voice-contract.js';
import { LOCAL_VOICE_BACKENDS } from './voice-model-catalog.js';
import {
  getLocalVoiceModelStatus,
  initialLocalVoiceBackend,
  isAndroidDevice,
  isMobileVoiceDevice,
  resolveLocalBackend,
} from './voice-local-engine.js';

let webGpuCapabilityPromise: Promise<WebGpuCapability> | undefined;

async function detectWebGpu() {
  const gpu = typeof navigator === 'undefined'
    ? null
    : (navigator as Navigator & VoiceGpuNavigator).gpu;
  if (!gpu?.requestAdapter) return { available: false, name: '' };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    const info: { description?: unknown; architecture?: unknown; vendor?: unknown } = adapter?.info || {};
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

function performanceScore(value: unknown) {
  const realtimeFactor = Number((value as { realtimeFactor?: unknown } | null | undefined)?.realtimeFactor);
  return Number.isFinite(realtimeFactor) ? realtimeFactor : Number(value);
}

function autoPerformanceText(kind: VoiceKind, model: string, capability: WebGpuCapability) {
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

export function getHardwareOptions(): VoiceOption[] {
  return LOCAL_VOICE_BACKENDS.map(option => ({ id: option.id, label: option.id === 'webgpu' && isAndroidDevice() ? 'Graphics processor (GPU · experimental)' : option.label }));
}

async function refreshHardwareDescription(panel: HTMLElement, settings: VoiceSettings, kind: VoiceKind) {
  const input = kind === 'stt';
  const setting = input ? 'localSttBackend' : 'localTtsBackend';
  const model = input ? settings.localSttModel : settings.localTtsModel;
  const view = getVoiceSettingsView(panel);
  if (!view) return;
  const describe = (text: string) => view.setHardwareDescription(kind, text);
  if (settings[setting] === 'wasm') {
    describe(isAndroidDevice()
      ? 'Uses your device’s main processor. This is the stable choice on Android.'
      : 'Uses your computer’s main processor. This is often fastest on powerful CPUs.');
    return;
  }
  if (isAndroidDevice()) {
    describe(settings[setting] === 'webgpu'
      ? 'Experimental on Android. Mobile graphics processing may be slower or crash when browser memory is limited.'
      : 'Automatic uses the main processor on Android for speed and stability.');
    return;
  }
  describe('Checking graphics support…');
  const capability = await getWebGpuCapability();
  const currentValue = panel.querySelector<HTMLSelectElement>(`[data-voice-setting="${setting}"]`)?.value;
  const current = getVoiceSettings();
  if ((input ? current.localSttModel : current.localTtsModel) !== model || currentValue !== settings[setting] || getVoiceSettingsView(panel) !== view) return;
  if (settings[setting] === 'webgpu') {
    describe(capability.available
      ? 'Uses your graphics processor. If it is slow or unreliable, choose Automatic.'
      : 'Graphics processing is not available in this browser. Choose Automatic or Main processor.');
  } else {
    describe(capability.available
      ? autoPerformanceText(kind, model, capability)
      : isMobileVoiceDevice()
        ? 'Graphics processing is unavailable here. Local voice may be very slow on this mobile device.'
        : 'Graphics processing is not available in this browser. Automatic will use the main processor.');
  }
}

export function refreshSttHardwareDescription(panel: HTMLElement, settings: VoiceSettings) {
  return refreshHardwareDescription(panel, settings, 'stt');
}

export function refreshTtsHardwareDescription(panel: HTMLElement, settings: VoiceSettings) {
  return refreshHardwareDescription(panel, settings, 'tts');
}

export function localModelStatusText(status: Pick<VoiceModelStatus, 'backend' | 'fallbackReason' | 'lastInferenceMs'> | null | undefined, kind = 'stt') {
  if (!status) return 'Not downloaded yet';
  const timing = Number.isFinite(status.lastInferenceMs)
    ? ` · last ${kind === 'tts' ? 'speech generation' : 'transcription'} ${(status.lastInferenceMs! / 1000).toFixed(1)}s`
    : '';
  if (status.backend === 'webgpu') return `Ready to use · Graphics processor${timing}`;
  if (status.backend === 'wasm' && status.fallbackReason) {
    return `Ready to use · Main processor (graphics unavailable)${timing}`;
  }
  if (status.backend === 'wasm') return `Ready to use · Main processor${timing}`;
  return 'Ready to use on this device';
}
