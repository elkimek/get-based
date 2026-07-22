import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  configureApiRuntimeCallbacks,
  getApiLocationOriginRuntime,
  getApiLocationPathnameRuntime,
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
  configureApiRuntimeCallbacks({ showInsufficientBalanceDialog: () => false });
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

  it('delegates OpenRouter balance dialog access', () => {
    const showInsufficientBalanceDialog = vi.fn();
    configureApiRuntimeCallbacks({ showInsufficientBalanceDialog });

    expect(showOpenRouterInsufficientBalanceDialogRuntime()).toBe(true);
    expect(showInsufficientBalanceDialog).toHaveBeenCalledTimes(1);
  });

  it('no-ops safely when a browser runtime is missing', () => {
    delete globalThis.window;
    configureApiRuntimeCallbacks({ showInsufficientBalanceDialog: () => false });

    expect(getApiLocationOriginRuntime()).toBe('');
    expect(getApiLocationPathnameRuntime()).toBe('');
    expect(setApiLocationHrefRuntime('https://openrouter.ai/auth')).toBe(false);
    expect(showOpenRouterInsufficientBalanceDialogRuntime()).toBe(false);
  });

  it('keeps API provider browser globals behind runtime adapters', () => {
    const apiRuntimeSrc = readFileSync(new URL('../js/api-runtime.js', import.meta.url), 'utf8');
    const openRouterSrc = readFileSync(new URL('../js/api-openrouter.js', import.meta.url), 'utf8');
    const openRouterOAuthSrc = readFileSync(new URL('../js/api-openrouter-oauth.js', import.meta.url), 'utf8');
    const localSrc = readFileSync(new URL('../js/api-local.js', import.meta.url), 'utf8');
    const apiSrc = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
    const appShellHooksSrc = readFileSync(new URL('../js/app-shell-hooks.js', import.meta.url), 'utf8');
    const startupOAuthSrc = readFileSync(new URL('../js/startup-oauth-callbacks.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(apiRuntimeSrc).not.toContain("from './provider-panels.js'");
    expect(apiRuntimeSrc).not.toContain("import('./provider-panels.js')");
    expect(openRouterSrc).toContain("from './api-runtime.js'");
    expect(openRouterOAuthSrc).toContain("from './api-runtime.js'");
    expect(localSrc).toContain("from './api-provider-storage.js'");
    expect(localSrc).not.toContain("from './api-runtime.js'");
    expect(startupOAuthSrc).not.toContain("from './provider-panels.js'");
    expect(startupOAuthSrc).not.toContain("import('./provider-panels.js')");
    expect(appShellHooksSrc).toContain("from './api-runtime.js'");
    expect(appShellHooksSrc).toContain("from './startup-oauth-callbacks.js'");
    expect(appShellHooksSrc).toContain("import('./provider-panels.js')");
    expect(appShellHooksSrc).toContain('configureApiRuntimeCallbacks({ showInsufficientBalanceDialog })');
    expect(appShellHooksSrc).toContain('configureStartupOAuthCallbackDeps({ showInsufficientBalanceDialog })');
    expect(apiSrc).not.toContain('Object.assign(window');
    expect(/\bwindow(?:\.|\s*\[)/.test(openRouterSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(openRouterOAuthSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(localSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(apiSrc)).toBe(false);
    expect(swSrc).toContain("'/js/api-runtime.js'");
  });

  it('keeps API facade model helpers as module re-exports', () => {
    const apiSrc = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
    const modelReExport = apiSrc.match(/export\s*\{[\s\S]*?\}\s*from\s*['"]\.\/api-models\.js['"]/)?.[0] || '';

    for (const name of ['findPreferredModel', 'fetchOpenRouterModelPricing']) {
      expect(modelReExport).toContain(name);
    }
  });
});
