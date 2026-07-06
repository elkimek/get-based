import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  getStartupSunEngineVersionRuntime,
  hasLightDevicePresetHydrationRuntime,
  hasSunSessionRehydrateRuntime,
  hydrateLightDevicesFromPresetsRuntime,
  logStartupMaintenanceRuntime,
  rehydrateStaleSunSessionsRuntime,
} from '../js/startup-maintenance-runtime.js';

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

describe('startup maintenance runtime adapter', () => {
  it('delegates startup maintenance hooks and logging', async () => {
    const calls = [];
    setRuntimeWindow({
      SUN_ENGINE_VERSION: 'runtime-test',
      rehydrateStaleSessions: () => {
        calls.push('rehydrate');
        return Promise.resolve({ rehydrated: 2 });
      },
      hydrateDevicesFromPresets: () => {
        calls.push('hydrate-devices');
        return Promise.resolve(true);
      },
      console: {
        log: (...args) => calls.push(['log', ...args]),
      },
    });

    expect(hasSunSessionRehydrateRuntime()).toBe(true);
    expect(await rehydrateStaleSunSessionsRuntime()).toEqual({ rehydrated: 2 });
    expect(getStartupSunEngineVersionRuntime()).toBe('runtime-test');
    expect(hasLightDevicePresetHydrationRuntime()).toBe(true);
    expect(await hydrateLightDevicesFromPresetsRuntime()).toBe(true);
    expect(logStartupMaintenanceRuntime('[startup]', 'ok')).toBe(true);
    expect(calls).toEqual([
      'rehydrate',
      'hydrate-devices',
      ['log', '[startup]', 'ok'],
    ]);
  });

  it('uses safe fallbacks when browser hooks are missing or fail', async () => {
    setRuntimeWindow({
      rehydrateStaleSessions: () => { throw new Error('rehydrate unavailable'); },
      hydrateDevicesFromPresets: () => { throw new Error('hydrate unavailable'); },
      console: {
        log: () => { throw new Error('log unavailable'); },
      },
    });

    expect(hasSunSessionRehydrateRuntime()).toBe(true);
    expect(await rehydrateStaleSunSessionsRuntime()).toBeNull();
    expect(getStartupSunEngineVersionRuntime()).toBe('?');
    expect(hasLightDevicePresetHydrationRuntime()).toBe(true);
    expect(await hydrateLightDevicesFromPresetsRuntime()).toBe(false);
    expect(logStartupMaintenanceRuntime('[startup]', 'ignored')).toBe(false);

    delete globalThis.window;
    expect(hasSunSessionRehydrateRuntime()).toBe(false);
    expect(await rehydrateStaleSunSessionsRuntime()).toBeNull();
    expect(getStartupSunEngineVersionRuntime()).toBe('?');
    expect(hasLightDevicePresetHydrationRuntime()).toBe(false);
    expect(await hydrateLightDevicesFromPresetsRuntime()).toBe(false);
    expect(logStartupMaintenanceRuntime('[startup]', 'ignored')).toBe(false);
  });

  it('keeps startup-maintenance.js browser globals behind the adapter', () => {
    const startupSrc = readFileSync(new URL('../js/startup-maintenance.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(startupSrc).toContain("from './startup-maintenance-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(startupSrc)).toBe(false);
    expect(swSrc).toContain("'/js/startup-maintenance-runtime.js'");
  });
});
