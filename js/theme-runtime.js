// @ts-check
// theme-runtime.js - Browser runtime adapters for theme module globals.

import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

function getThemeRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {Record<string, any>} detail
 */
export function dispatchThemeChange(detail) {
  const runtime = getThemeRuntimeWindow();
  const CustomEventCtor = runtime?.CustomEvent;
  if (!runtime || typeof CustomEventCtor !== 'function') return;
  runtime.dispatchEvent(new CustomEventCtor('labcharts-themechange', { detail }));
}

/**
 * @param {{ settingsModalOpen?: boolean }} [options]
 */
export function refreshThemeDependentsFromRuntime(options = {}) {
  const runtime = getThemeRuntimeWindow();
  if (!runtime) return;
  getSettingsModuleFunction('applyAccentOverride')?.();
  getSettingsModuleFunction('updateSettingsUI')?.();
  getSettingsModuleFunction('updateTweaksUI')?.();
  if (typeof runtime.scheduleChartThemeRefresh === 'function') runtime.scheduleChartThemeRefresh();
  else runtime.refreshChartThemeColors?.({ batchSize: 4 });
  if (options.settingsModalOpen) runtime.refreshSettingsWearables?.();
}
