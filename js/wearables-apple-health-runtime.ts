// wearables-apple-health-runtime.js - Browser runtime adapters for Apple Health import hooks.

import type { AppleHealthProgressCallback } from './wearables-apple-health-parser.js';

export interface AppleHealthZipEntry { async(type: 'blob'): Promise<Blob> }
export interface AppleHealthZipReader {
  loadAsync(file: Blob, options: { onUpdate: (event: { percent: number }) => void }): Promise<{ files: Record<string, AppleHealthZipEntry> }>;
}
interface AppleHealthCycleData { observations?: readonly unknown[] }
interface AppleHealthCyclePreviewResult extends Record<string, unknown> { periods?: unknown; observations?: unknown }
interface AppleHealthRuntimeDeps {
  parseCycleBlob: ((blob: Blob, fileName: string, onProgress: AppleHealthProgressCallback | null) => Promise<AppleHealthCycleData | null>) | null;
  showCyclePreview: ((parsed: AppleHealthCycleData) => Promise<AppleHealthCyclePreviewResult | null>) | null;
}

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as Window & { JSZip?: AppleHealthZipReader })
    : null;
}

const appleHealthRuntimeDeps: AppleHealthRuntimeDeps = {
  parseCycleBlob: null,
  showCyclePreview: null,
};

export function configureAppleHealthRuntimeDeps(deps: Partial<AppleHealthRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(appleHealthRuntimeDeps, deps);
}

export function getAppleHealthJSZip() {
  return getRuntimeWindow()?.JSZip || null;
}

export async function parseAppleHealthCycleRuntime(blob: Blob, fileName: string, onProgress: AppleHealthProgressCallback | null = null) {
  if (!appleHealthRuntimeDeps.parseCycleBlob) return null;
  return appleHealthRuntimeDeps.parseCycleBlob(blob, fileName, onProgress);
}

export async function showAppleHealthCyclePreviewRuntime(parsed: AppleHealthCycleData) {
  if (!appleHealthRuntimeDeps.showCyclePreview) return null;
  return appleHealthRuntimeDeps.showCyclePreview(parsed);
}
