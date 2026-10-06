import type { PrivacyConnectionView } from './settings-privacy-contract.js';
import { getPrivacyConnectionView } from './settings-privacy-view.js';
import type { LocalAiModel } from './local-ai-provider-shared.js';
type LocalAiRuntimeWindow = Window & {
  _lastOllamaModelDetails?: LocalAiModel[];
  _lastIsOllamaServer?: unknown;
  CustomEvent: typeof CustomEvent;
};

// provider-local-ai-runtime.js - Browser runtime adapters for Local AI settings hooks.

import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as LocalAiRuntimeWindow)
    : null;
}

export function updatePrivacyStatusCardFromRuntime(isAvailable?: boolean) {
  const update = getSettingsModuleFunction('updatePrivacyStatusCard');
  if (!update) return;
  if (typeof isAvailable === 'boolean') update(isAvailable);
  else update();
}

export function cacheLocalAiModelDetails(modelDetails: LocalAiModel[], isOllamaServer: boolean) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._lastOllamaModelDetails = modelDetails;
  runtime._lastIsOllamaServer = isOllamaServer;
  if (typeof runtime.dispatchEvent === 'function' && typeof runtime.CustomEvent === 'function') {
    runtime.dispatchEvent(new runtime.CustomEvent('labcharts-ai-settings-local-changed'));
  }
}

export function getCachedLocalAiModelDetails() {
  const runtime = getRuntimeWindow();
  const modelDetails = Array.isArray(runtime?._lastOllamaModelDetails)
    ? runtime._lastOllamaModelDetails
    : [];
  return {
    modelDetails,
    isOllamaServer: !!runtime?._lastIsOllamaServer,
  };
}

export function clearCachedLocalAiModelDetails() {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._lastOllamaModelDetails = [];
  runtime._lastIsOllamaServer = false;
}

// The application uses the component view. The DOM adapter retains the public
// provider control contract for callers that supply their own native form.
export function getPIIConnectionViewFromRuntime(): PrivacyConnectionView | null {
  const component = getPrivacyConnectionView();
  if (component) return component;
  const dot = document.getElementById('pii-local-dot');
  const text = document.getElementById('pii-local-status-text');
  const dropdown = document.getElementById('pii-model-dropdown');
  const select = document.getElementById('pii-model-select') as HTMLSelectElement | null;
  if (!dot || !text) return null;
  return {
    isCurrent: () => document.getElementById('pii-local-dot') === dot && document.getElementById('pii-local-status-text') === text,
    update(next) {
      if (next.message !== undefined) text.textContent = next.message;
      if (next.status !== undefined) {
        dot.className = 'local-ai-status-dot';
        if (next.status === 'connected' || next.status === 'disconnected') dot.classList.add(next.status);
      }
      if (next.models !== undefined && dropdown && select) {
        dropdown.style.display = next.models.length ? 'block' : 'none';
        select.replaceChildren(...next.models.map(model => {
          const option = document.createElement('option'); option.value = model; option.textContent = model;
          option.selected = model === next.selectedModel; return option;
        }));
      }
    },
  };
}
