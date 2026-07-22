import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureApiProviderStorageRuntimeDeps,
  dispatchAISettingsLocalChangedRuntime,
  encryptedSetProviderItemRuntime,
  refreshAIProviderSelectionRuntime,
} from '../js/api-provider-storage-runtime.js';
import { clearKeyCache, getCachedKey, updateKeyCache } from '../js/crypto-key-cache.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';

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
  it('shares cached provider keys without depending on the crypto orchestrator', () => {
    const key = 'labcharts-provider-runtime-cache-test';
    localStorage.setItem(key, 'stored');

    expect(getCachedKey(key)).toBe('stored');
    updateKeyCache(key, 'cached');
    expect(getCachedKey(key)).toBe('cached');
    clearKeyCache();
    expect(getCachedKey(key)).toBe('stored');

    localStorage.removeItem(key);
  });

  it('fails closed when encrypted storage has not been configured', async () => {
    const key = 'labcharts-provider-runtime-secret-test';
    const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: null });
    localStorage.removeItem(key);
    localStorage.removeItem('labcharts-encryption-enabled');

    try {
      await expect(encryptedSetProviderItemRuntime(key, 'must-not-leak'))
        .rejects.toThrow('Encrypted provider storage is not configured.');
      expect(localStorage.getItem(key)).toBeNull();

      localStorage.setItem('labcharts-encryption-enabled', 'true');
      await expect(encryptedSetProviderItemRuntime(key, 'must-not-leak'))
        .rejects.toThrow('Encrypted provider storage is not configured.');
      expect(localStorage.getItem(key)).toBeNull();
    } finally {
      configureApiProviderStorageRuntimeDeps(previous);
      localStorage.removeItem(key);
      localStorage.removeItem('labcharts-encryption-enabled');
    }
  });

  it('delegates provider secret writes to the configured encrypted writer', async () => {
    const encryptedSetItem = vi.fn().mockResolvedValue(undefined);
    const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem });

    try {
      await encryptedSetProviderItemRuntime('labcharts-provider-key', 'secret');
      expect(encryptedSetItem).toHaveBeenCalledWith('labcharts-provider-key', 'secret');
    } finally {
      configureApiProviderStorageRuntimeDeps(previous);
    }
  });

  it('delegates provider UI refresh hooks', () => {
    const updateChatHeaderModel = vi.fn();
    const refreshWebSearchToggle = vi.fn();
    const previous = configureChatRuntimeCallbacks({ updateChatHeaderModel, refreshWebSearchToggle });

    try {
      expect(refreshAIProviderSelectionRuntime()).toBe(true);
      expect(updateChatHeaderModel).toHaveBeenCalledTimes(1);
      expect(refreshWebSearchToggle).toHaveBeenCalledTimes(1);
    } finally {
      configureChatRuntimeCallbacks(previous);
    }
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
    const previous = configureChatRuntimeCallbacks({
      refreshWebSearchToggle: null,
      updateChatHeaderModel: null,
    });
    delete globalThis.window;

    try {
      expect(refreshAIProviderSelectionRuntime()).toBe(false);
      expect(dispatchAISettingsLocalChangedRuntime()).toBe(false);
    } finally {
      configureChatRuntimeCallbacks(previous);
    }
  });

  it('keeps counted api provider storage globals behind the adapter', () => {
    const storageSrc = readFileSync(new URL('../js/api-provider-storage.js', import.meta.url), 'utf8');
    const runtimeSrc = readFileSync(new URL('../js/api-provider-storage-runtime.js', import.meta.url), 'utf8');
    const cryptoSrc = readFileSync(new URL('../js/crypto.js', import.meta.url), 'utf8');
    const appShellHooksSrc = readFileSync(new URL('../js/app-shell-hooks.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(storageSrc).toContain("from './api-provider-storage-runtime.js'");
    expect(storageSrc).toContain("from './crypto-key-cache.js'");
    expect(storageSrc).not.toContain("from './crypto.js'");
    expect(cryptoSrc).toContain("from './crypto-key-cache.js'");
    expect(cryptoSrc).toContain("export { getCachedKey, updateKeyCache } from './crypto-key-cache.js'");
    expect(appShellHooksSrc).toContain("from './api-provider-storage-runtime.js'");
    expect(appShellHooksSrc).toContain('configureApiProviderStorageRuntimeDeps({ encryptedSetItem })');
    expect(/\bwindow(?:\.|\s*\[)/.test(storageSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(runtimeSrc)).toBe(false);
    expect(swSrc).toContain("'/js/api-provider-storage-runtime.js'");
    expect(swSrc).toContain("'/js/crypto-key-cache.js'");
  });
});
