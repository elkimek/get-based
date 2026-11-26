// wearables-apple-health-runtime.js - Browser runtime adapters for Apple Health import hooks.

import type { AppleHealthProgressCallback } from './wearables-apple-health-parser.js';

export interface AppleHealthZipStream {
  on(event: 'data', cb: (chunk: Uint8Array) => void): AppleHealthZipStream;
  on(event: 'end', cb: () => void): AppleHealthZipStream;
  on(event: 'error', cb: (err: unknown) => void): AppleHealthZipStream;
  pause?(): void;
  resume(): void;
}
export interface AppleHealthZipEntry {
  async(type: 'blob'): Promise<Blob>;
  internalStream?(type: 'uint8array'): AppleHealthZipStream;
}
export interface AppleHealthZipReader {
  loadAsync(file: Blob, options: { onUpdate: (event: { percent: number }) => void }): Promise<{ files: Record<string, AppleHealthZipEntry> }>;
}
type CycleImportLoader = typeof import('./cycle-import-runtime.js');
interface AppleHealthRuntimeDeps {
  parseCycleBlob: CycleImportLoader['parseAppleHealthCycleBlob'] | null;
  showCyclePreview: CycleImportLoader['showCycleImportPreview'] | null;
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

export async function showAppleHealthCyclePreviewRuntime(parsed: Parameters<CycleImportLoader['showCycleImportPreview']>[0]) {
  if (!appleHealthRuntimeDeps.showCyclePreview) return null;
  return appleHealthRuntimeDeps.showCyclePreview(parsed);
}
