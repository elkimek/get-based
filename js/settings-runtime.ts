// settings-runtime.js - Browser runtime adapters for Settings and Tweaks flows.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { getMeteoConfig, saveMeteoConfig } from './sun-uvdata-config.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

const DEFAULT_METEO_CONFIG = Object.freeze({
  mode: 'auto',
  selfhostUrl: '',
  selfhostBearer: '',
  privacyRounding: 0.1,
});

type SettingsRuntimeDeps = { getMeteoConfig: unknown; saveMeteoConfig: unknown };
const settingsRuntimeDeps: SettingsRuntimeDeps = {
  getMeteoConfig: getMeteoConfig,
  saveMeteoConfig: saveMeteoConfig,
};

export function configureSettingsRuntimeDeps(deps: Record<string, unknown> = {}) {
  return (configureRuntimeCallbacks as (current: SettingsRuntimeDeps, updates: Record<string, unknown>, scope: 'inherited') => SettingsRuntimeDeps)(settingsRuntimeDeps, deps, 'inherited');
}

function getRuntimeWindow(): Record<string, unknown> {
  return typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)
    : (globalThis as Record<string, unknown>);
}

function getRuntimeFunction(name: string) {
  const runtime = getRuntimeWindow();
  return typeof runtime[name] === 'function' ? (runtime[name] as { bind(receiver: unknown): unknown }).bind(runtime) : null;
}

export function requestSettingsFrame(callback: FrameRequestCallback) {
  const requestFrame = getRuntimeFunction('requestAnimationFrame');
  return requestFrame ? (requestFrame as (callback: FrameRequestCallback) => unknown)(callback) : null;
}

export function cancelSettingsFrame(frameId: unknown) {
  const cancelFrame = getRuntimeFunction('cancelAnimationFrame');
  if (cancelFrame) (cancelFrame as (frameId: unknown) => unknown)(frameId);
}

export function settingsMediaMatches(query: string) {
  const matchMedia = getRuntimeFunction('matchMedia');
  if (!matchMedia) return false;
  try {
    return (matchMedia as (query: string) => { matches?: unknown } | null | undefined)(query)?.matches === true;
  } catch {
    return false;
  }
}

export function addSettingsRuntimeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
  const addEventListener = getRuntimeFunction('addEventListener');
  if (addEventListener) (addEventListener as (type: string, listener: EventListenerOrEventListenerObject) => unknown)(type, listener);
}

export function refreshSettingsRuntimeSurfaces(options: { settingsVisible?: unknown; updateSettingsUI?: unknown; updateTweaksUI?: unknown } = {}) {
  const runtime = getRuntimeWindow();
  ((options.updateSettingsUI || getSettingsModuleFunction('updateSettingsUI')) as (() => unknown) | null | undefined)?.();
  ((options.updateTweaksUI || getSettingsModuleFunction('updateTweaksUI')) as (() => unknown) | null | undefined)?.();
  if (options.settingsVisible) (runtime.refreshSettingsWearables as (() => unknown) | null | undefined)?.();
}

export function getSettingsMeteoConfig() {
  const readMeteoConfig = settingsRuntimeDeps.getMeteoConfig;
  if (!readMeteoConfig) return { ...DEFAULT_METEO_CONFIG };
  try {
    return (readMeteoConfig as () => unknown)() || { ...DEFAULT_METEO_CONFIG };
  } catch {
    return { ...DEFAULT_METEO_CONFIG };
  }
}

export async function saveSettingsMeteoConfig(config: unknown) {
  const writeMeteoConfig = settingsRuntimeDeps.saveMeteoConfig;
  if (!writeMeteoConfig) return false;
  try {
    return await (writeMeteoConfig as (...args: Parameters<typeof saveMeteoConfig>) => unknown)(config) !== false;
  } catch {
    return false;
  }
}
