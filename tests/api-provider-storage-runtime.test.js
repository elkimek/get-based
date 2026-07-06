import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchAISettingsLocalChangedRuntime,
  getOllamaConfigStorageRuntime,
  refreshAIProviderSelectionRuntime,
} from '../js/api-provider-storage-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  if (savedWindow) {
    Object.defineProperty(globalThis, 'window', savedWindow);
  } else {
    delete globalThis.window;
  }
});

describe('api provider storage runtime adapter', () => {
  it('delegates provider UI refresh hooks and Ollama config reads', () => {
    const updateChatHeaderModel = vi.fn();
    const refreshWebSearchToggle = vi.fn();
    const getOllamaConfig = vi.fn(() => ({ model: 'llama-test', url: 'http://ollama.test' }));
    setRuntimeWindow({ updateChatHeaderModel, refreshWebSearchToggle, getOllamaConfig });

    expect(refreshAIProviderSelectionRuntime()).toBe(true);
    expect(getOllamaConfigStorageRuntime()).toEqual({ model: 'llama-test', url: 'http://ollama.test' });
    expect(updateChatHeaderModel).toHaveBeenCalledTimes(1);
    expect(refreshWebSearchToggle).toHaveBeenCalledTimes(1);
    expect(getOllamaConfig).toHaveBeenCalledTimes(1);
  });

  it('dispatches the local AI settings change event', () => {
    const dispatchEvent = vi.fn();
    class TestCustomEvent {
      constructor(type) {
        this.type = type;
      }
    }
    setRuntimeWindow({ CustomEvent: TestCustomEvent, dispatchEvent });

    expect(dispatchAISettingsLocalChangedRuntime()).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'labcharts-ai-settings-local-changed' }));
  });

  it('uses safe fallbacks when browser runtime hooks are missing', () => {
    delete globalThis.window;

    expect(refreshAIProviderSelectionRuntime()).toBe(false);
    expect(dispatchAISettingsLocalChangedRuntime()).toBe(false);
    expect(getOllamaConfigStorageRuntime()).toEqual({});
  });

  it('keeps counted api provider storage globals behind the adapter', () => {
    const storageSrc = readFileSync(new URL('../js/api-provider-storage.js', import.meta.url), 'utf8');
    const runtimeSrc = readFileSync(new URL('../js/api-provider-storage-runtime.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(storageSrc).toContain("from './api-provider-storage-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(storageSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(runtimeSrc)).toBe(false);
    expect(swSrc).toContain("'/js/api-provider-storage-runtime.js'");
  });
});
