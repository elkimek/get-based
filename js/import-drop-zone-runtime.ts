// import-drop-zone-runtime.js - Browser runtime adapters for drop-zone imports.

import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';
import { configureRuntimeDependencies } from './runtime-callbacks.js';
import { importDispatch, isImportRunning } from './pdf-import-progress.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { showNotification } from './utils.js';
import { importDataJSON } from './export-loader.js';

const importDropZoneRuntimeDeps = {
  importDataJSON,
  isImportRunning,
  showNotification: showNotification as null | typeof showNotification,
};

export function configureImportDropZoneRuntimeDeps(deps: RuntimeDependencyUpdates<typeof importDropZoneRuntimeDeps> = {}) {
  return configureRuntimeDependencies(importDropZoneRuntimeDeps, deps, ['showNotification']);
}

function getRuntimeWindow(): Window | null {
  return typeof window !== 'undefined'
    ? window
    : null;
}

function getRuntimeDocument() {
  return typeof document !== 'undefined'
    ? document
    : null;
}

function requireDnaModuleFunction(name: string) {
  const fn = getDnaModuleFunction(name);
  if (!fn) throw new TypeError(`${name} is not available`);
  return fn;
}

export function isDropZoneImportRunning() {
  if (!getRuntimeWindow()) return false;
  return importDispatch.busy || Boolean(importDropZoneRuntimeDeps.isImportRunning());
}

export function openDropZoneFilePicker() {
  const picker = getRuntimeDocument()?.getElementById('pdf-input');
  if (picker && typeof picker.click === 'function') picker.click();
}

export function showDropZoneImportNotification(message: string, type = 'info') {
  importDropZoneRuntimeDeps.showNotification?.(message, type);
}

export function importDropZoneJSONFile(file: File) {
  return importDropZoneRuntimeDeps.importDataJSON(file);
}

export function detectDropZoneDNAFile(header: string) {
  const detectDNAFile = getDnaModuleFunction('detectDNAFile');
  return detectDNAFile ? detectDNAFile(header) : null;
}

export function hasDropZoneMtDNAHandler() {
  return Boolean(getDnaModuleFunction('handleMtDNAFile'));
}

export async function handleDropZoneMtDNAFile(file: File) {
  return await requireDnaModuleFunction('handleMtDNAFile')(file);
}

export async function handleDropZoneDNAFile(file: File) {
  return await requireDnaModuleFunction('handleDNAFile')(file);
}
