// wearables-detail-runtime.js - Browser runtime adapters for wearable detail modal hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { showConfirmDialog } from './utils.js';

export interface WearableDetailRuntimeDeps {
  closeModal: (() => void) | null;
  navigate: ((route: string) => void) | null;
  rememberModalTrigger: (() => void) | null;
  showConfirmDialog: typeof showConfirmDialog | null;
}
interface WearableChartConstructor {
  new(canvas: HTMLCanvasElement, config: Record<string, unknown>): unknown;
}

const wearableDetailRuntimeDeps: WearableDetailRuntimeDeps = {
  closeModal: null,
  navigate: null,
  rememberModalTrigger: null,
  showConfirmDialog,
};

export function configureWearableDetailRuntimeDeps(deps: Partial<WearableDetailRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(wearableDetailRuntimeDeps, deps);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as Window & { Chart?: WearableChartConstructor | null })
    : null;
}

export function rememberWearableDetailModalTriggerRuntime() {
  wearableDetailRuntimeDeps.rememberModalTrigger?.();
}

export function hasWearableDetailChartRuntime() {
  const runtime = getRuntimeWindow();
  return typeof runtime?.Chart === 'function';
}

export function createWearableDetailChartRuntime(canvas: HTMLCanvasElement, config: Record<string, unknown>) {
  const runtime = getRuntimeWindow();
  const ChartCtor = runtime?.Chart;
  return typeof ChartCtor === 'function' ? new ChartCtor(canvas, config) : null;
}

export function navigateWearableDetailRuntime(route: string = 'dashboard') {
  wearableDetailRuntimeDeps.navigate?.(route || 'dashboard');
}

export function closeWearableDetailModalRuntime() {
  wearableDetailRuntimeDeps.closeModal?.();
}

export async function confirmWearableDetailActionRuntime(message: string) {
  const confirm = wearableDetailRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message) : false;
}
