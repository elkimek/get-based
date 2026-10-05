import { expect, it } from 'vitest';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-theme-runtime.js - Theme browser-runtime adapter coverage.

import './_node-shim.js';

import {
  dispatchThemeChange,
  refreshThemeDependentsFromRuntime,
} from '../js/theme-runtime.js';
import { configureSettingsModuleBridge } from '../js/settings-runtime-bridge.js';


it('retains theme runtime adapter behavior', () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

  const RUNTIME_FIELDS = [
    'CustomEvent',
    'dispatchEvent',
    'applyAccentOverride',
    'updateSettingsUI',
    'updateTweaksUI',
    'scheduleChartThemeRefresh',
    'refreshChartThemeColors',
    'refreshSettingsWearables',
  ];

  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalFieldDescriptors = new Map(
    RUNTIME_FIELDS.map(field => [field, Object.getOwnPropertyDescriptor(globalThis, field)])
  );

  function restoreDescriptor(target: Record<string, unknown>, key: string, descriptor: PropertyDescriptor | undefined) {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
      return;
    }
    delete target[key];
  }

  function resetRuntimeWindow() {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: globalThis,
    });
    for (const field of RUNTIME_FIELDS) delete (globalThis as typeof globalThis & Record<string, unknown>)[field];
  }

  console.log('=== Theme Runtime Tests ===\n');

  let previousSettingsBridge: Record<string, unknown> | null = null;
  try {
    resetRuntimeWindow();

    const events: Array<{ type: string; detail?: Record<string, unknown> | undefined }> = [];
    (globalThis as Record<string, unknown>).CustomEvent = class {
      declare type: string;
      declare detail: Record<string, unknown> | undefined;
      constructor(type: string, init: { detail?: Record<string, unknown> } = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    (globalThis as Record<string, unknown>).dispatchEvent = (event: { type: string; detail?: Record<string, unknown> }) => {
      events.push(event);
      return true;
    };

    dispatchThemeChange({ theme: 'glass', sunsetMode: true });
    assert('theme change dispatches browser event', events.length === 1);
    assert('theme change event has expected type', events[0]?.type === 'labcharts-themechange');
    assert('theme change event carries detail', events[0]?.detail?.theme === 'glass' && events[0]?.detail?.sunsetMode === true);

    const calls: string[] = [];
    previousSettingsBridge = configureSettingsModuleBridge({
      applyAccentOverride: () => calls.push('accent'),
      updateSettingsUI: () => calls.push('settings'),
      updateTweaksUI: () => calls.push('tweaks'),
    });
    (globalThis as Record<string, unknown>).scheduleChartThemeRefresh = () => calls.push('schedule');
    (globalThis as Record<string, unknown>).refreshSettingsWearables = () => calls.push('wearables');
    refreshThemeDependentsFromRuntime({ settingsModalOpen: true });
    assert('theme dependents refresh accent/settings/tweaks', calls.includes('accent') && calls.includes('settings') && calls.includes('tweaks'));
    assert('theme dependents prefer scheduled chart refresh', calls.includes('schedule'));
    assert('theme dependents refresh wearables when settings modal is open', calls.includes('wearables'));

    delete (globalThis as Record<string, unknown>).scheduleChartThemeRefresh;
    let chartRefreshOptions: { batchSize: number } | null = null;
    (globalThis as Record<string, unknown>).refreshChartThemeColors = (options: { batchSize: number }) => { chartRefreshOptions = options; };
    refreshThemeDependentsFromRuntime({ settingsModalOpen: false });
    assert('theme dependents fall back to chart color refresh', (chartRefreshOptions as { batchSize: number } | null)?.batchSize === 4);

    delete (globalThis as { window?: unknown }).window;
    assert('no-window dispatch is safe', (() => {
      dispatchThemeChange({ theme: 'dark' });
      return true;
    })());
    assert('no-window dependent refresh is safe', (() => {
      refreshThemeDependentsFromRuntime({ settingsModalOpen: true });
      return true;
    })());
  } finally {
    if (previousSettingsBridge) configureSettingsModuleBridge(previousSettingsBridge);
    for (const field of RUNTIME_FIELDS) {
      restoreDescriptor(globalThis, field, originalFieldDescriptors.get(field));
    }
    restoreDescriptor(globalThis, 'window', originalWindowDescriptor);
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
  expect(legacyAssertions.fail).toBe(0);
});
