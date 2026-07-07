import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  getApiLocationOriginRuntime,
  getApiLocationPathnameRuntime,
  getOllamaConfigRuntime,
  setApiLocationHrefRuntime,
  showOpenRouterInsufficientBalanceDialogRuntime,
} from '../js/api-runtime.js';

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

describe('api runtime adapter', () => {
  it('delegates browser location reads and redirects', () => {
    const runtime = {
      location: {
        origin: 'https://getbased.test',
        pathname: '/app',
        href: 'https://getbased.test/app',
      },
    };
    setRuntimeWindow(runtime);

    expect(getApiLocationOriginRuntime()).toBe('https://getbased.test');
    expect(getApiLocationPathnameRuntime()).toBe('/app');
    expect(setApiLocationHrefRuntime('https://openrouter.ai/auth')).toBe(true);
    expect(runtime.location.href).toBe('https://openrouter.ai/auth');
  });

  it('delegates Ollama config and OpenRouter balance dialog access', () => {
    const config = { url: 'http://localhost:11434', model: 'llama3.2', apiKey: '' };
    const showInsufficientBalanceDialog = vi.fn();
    setRuntimeWindow({ getOllamaConfig: () => config, showInsufficientBalanceDialog });

    expect(getOllamaConfigRuntime()).toBe(config);
    expect(showOpenRouterInsufficientBalanceDialogRuntime()).toBe(true);
    expect(showInsufficientBalanceDialog).toHaveBeenCalledTimes(1);
  });

  it('no-ops safely when a browser runtime is missing', () => {
    delete globalThis.window;

    expect(getApiLocationOriginRuntime()).toBe('');
    expect(getApiLocationPathnameRuntime()).toBe('');
    expect(setApiLocationHrefRuntime('https://openrouter.ai/auth')).toBe(false);
    expect(showOpenRouterInsufficientBalanceDialogRuntime()).toBe(false);
    expect(() => getOllamaConfigRuntime()).toThrow('Ollama config runtime is unavailable.');
  });

  it('keeps API provider browser globals behind the adapter', () => {
    const openRouterSrc = readFileSync(new URL('../js/api-openrouter.js', import.meta.url), 'utf8');
    const openRouterOAuthSrc = readFileSync(new URL('../js/api-openrouter-oauth.js', import.meta.url), 'utf8');
    const localSrc = readFileSync(new URL('../js/api-local.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(openRouterSrc).toContain("from './api-runtime.js'");
    expect(openRouterOAuthSrc).toContain("from './api-runtime.js'");
    expect(localSrc).toContain("from './api-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(openRouterSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(openRouterOAuthSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(localSrc)).toBe(false);
    expect(swSrc).toContain("'/js/api-runtime.js'");
  });
});
