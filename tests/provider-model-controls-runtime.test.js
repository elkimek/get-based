import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  callProviderModelSmokeTestRuntime,
  clearProviderE2EESessionRuntime,
  refreshProviderModelUiRuntime,
} from '../js/provider-model-controls-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
});

describe('provider model controls runtime adapter', () => {
  it('delegates provider model runtime hooks at call time', async () => {
    const clearE2EESession = vi.fn();
    const updateChatHeaderModel = vi.fn();
    const refreshWebSearchToggle = vi.fn();
    const callClaudeAPI = vi.fn(async () => ({ content: 'ok' }));
    setRuntimeWindow({
      clearE2EESession,
      updateChatHeaderModel,
      refreshWebSearchToggle,
      callClaudeAPI,
    });

    expect(clearProviderE2EESessionRuntime()).toBe(true);
    expect(refreshProviderModelUiRuntime()).toBe(true);
    await expect(callProviderModelSmokeTestRuntime()).resolves.toEqual({ content: 'ok' });

    expect(clearE2EESession).toHaveBeenCalledTimes(1);
    expect(updateChatHeaderModel).toHaveBeenCalledTimes(1);
    expect(refreshWebSearchToggle).toHaveBeenCalledTimes(1);
    expect(callClaudeAPI).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 1,
    });
  });

  it('uses safe no-op fallbacks when browser hooks are missing', () => {
    delete globalThis.window;

    expect(clearProviderE2EESessionRuntime()).toBe(false);
    expect(refreshProviderModelUiRuntime()).toBe(false);
    expect(() => callProviderModelSmokeTestRuntime()).toThrow('AI provider runtime is unavailable.');
  });

  it('keeps provider-model-controls.js browser globals behind the adapter', () => {
    const controlsSrc = readFileSync(new URL('../js/provider-model-controls.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(controlsSrc).toContain("from './provider-model-controls-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(controlsSrc)).toBe(false);
    expect(swSrc).toContain("'/js/provider-model-controls-runtime.js'");
  });
});
