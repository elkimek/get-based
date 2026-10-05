// Browser runtime adapters for theme module globals.

import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { dispatchRuntimeCustomEvent } from './utils-runtime.js';

export interface ThemeRefreshOptions { settingsModalOpen?: boolean; }
export interface ThemeRuntimeDependents {
  applyAccentOverride?: () => unknown;
  updateSettingsUI?: () => unknown;
  updateTweaksUI?: () => unknown;
  scheduleChartThemeRefresh?: () => unknown;
  refreshChartThemeColors?: (options: { batchSize: number }) => unknown;
  refreshSettingsWearables?: () => unknown;
}

function getThemeRuntimeWindow(): (Window & typeof globalThis & ThemeRuntimeDependents) | null {
  return typeof window !== 'undefined'
    ? (window as Window & typeof globalThis & ThemeRuntimeDependents)
    : null;
}

export function dispatchThemeChange(detail: Record<string, unknown>) {
  const runtime = getThemeRuntimeWindow();
  dispatchRuntimeCustomEvent(runtime, 'labcharts-themechange', detail);
}

export function refreshThemeDependentsFromRuntime(options: ThemeRefreshOptions = {}) {
  const runtime = getThemeRuntimeWindow();
  if (!runtime) return;
  getSettingsModuleFunction('applyAccentOverride')?.();
  getSettingsModuleFunction('updateSettingsUI')?.();
  getSettingsModuleFunction('updateTweaksUI')?.();
  if (typeof runtime.scheduleChartThemeRefresh === 'function') runtime.scheduleChartThemeRefresh();
  else runtime.refreshChartThemeColors?.({ batchSize: 4 });
  if (options.settingsModalOpen) runtime.refreshSettingsWearables?.();
}
