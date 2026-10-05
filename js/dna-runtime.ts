import { createRetryingStylesheetLoader } from './retrying-module-loader.js';
// dna-runtime.js - Browser runtime adapters for DNA import and shell refresh flows.

import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';
import type { SnpCatalog } from './dna-evidence.js';
import type { HaplogroupTable, PendingMtDnaImport } from './dna-mtdna.js';

import type { SnpAnnotation } from './dna-evidence.js';
export interface SnpSource { type?: string | null; label?: string | null; fileName?: string | null; rawText?: string | null; addedAt?: string | null }
/** Persisted calls may predate the current catalog; consumers retain their original field fallbacks. */
export interface StoredSnpCall extends SnpAnnotation {
  genotype?: string | null | undefined; normalizedGenotype?: string | null | undefined; category?: string | null | undefined;
  markers?: readonly string[] | null; source?: SnpSource | null;
}
export interface GeneticsData {
  snps?: Record<string, StoredSnpCall> | null; apoe?: string | null; source?: string | null; importDate?: string | null;
  coverage?: { found?: number; total?: number } | null | undefined;
  effects?: Partial<Record<'significant' | 'moderate' | 'mild' | 'normal', number>>;
  catalogVersion?: { size: number; hash: string } | null;
  mtdna?: Partial<PendingMtDnaImport['resolved']> & {
    coupling?: PendingMtDnaImport['coupling']; origin?: string | null; details?: string | null;
    source?: string | null; importDate?: string | null; mutations?: string[];
  } | null;
}
export interface DnaProfileData { genetics?: GeneticsData | null }
export type PendingDnaImport = Omit<Awaited<ReturnType<typeof import('./dna-parser.js').parseDNAFileWithTable>>, 'matches'> & {
  matches: Record<string, StoredSnpCall>;
  mergeSnps?: boolean; rawMatchedCount?: number; preservedOverrideCount?: number;
};
interface DnaRuntimeDeps {
  buildSidebar: (() => void) | null;
  getLatitudeFromLocation: typeof getLatitudeFromLocation;
  isDebugMode: typeof isDebugMode; isImportRunning: typeof isImportRunning;
  navigate: ((route: string) => void) | null;
  openChatPanel: ((prompt?: string) => unknown) | null;
  showConfirmDialog: typeof showConfirmDialog | null;
}
interface DnaPublishedState {
  _snpTableCache?: SnpCatalog; _haplogroupTableCache?: HaplogroupTable;
  _pendingDNAImport?: PendingDnaImport | null; _pendingMtDNA?: PendingMtDnaImport | null;
}

import { configureRuntimeDependencies } from './runtime-callbacks.js';
import { isImportRunning } from './pdf-import-progress.js';
import { getLatitudeFromLocation } from './profile.js';
import { isDebugMode, showConfirmDialog, showNotification } from './utils.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { updateChatNudgeRuntime } from './chat-runtime.js';

const GENETICS_STYLESHEET_URL = new URL('../css/genetics.css', import.meta.url).href;
const geneticsStylesheetPromiseCache = createRetryingStylesheetLoader({
  createLink: () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = geneticsStylesheetUrl();
    link.dataset.geneticsStylesheet = '';
    return link;
  },
  insertLink: link => {
    const anchor = document.querySelector('[data-genetics-stylesheet-anchor]');
    const parent = anchor?.parentNode || document.head;
    parent.insertBefore(link, anchor || null);
  },
  requireDocument: "Genetics stylesheet requires a document",
  failedLoad: "Genetics stylesheet could not be loaded",
});

const dnaRuntimeDeps: DnaRuntimeDeps = {
  buildSidebar: null,
  getLatitudeFromLocation,
  isDebugMode,
  isImportRunning,
  navigate: null,
  openChatPanel: null,
  showConfirmDialog: showConfirmDialog,
};

function geneticsStylesheetUrl() {
  if (!geneticsStylesheetPromiseCache.retry) return GENETICS_STYLESHEET_URL;
  const retryUrl = new URL(GENETICS_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isGeneticsStylesheetLoaded() {
  return geneticsStylesheetPromiseCache.loaded;
}

export function loadGeneticsStylesheet() {
  return geneticsStylesheetPromiseCache.load();
}

export async function loadGeneticsStylesheetForAction() {
  try {
    return await loadGeneticsStylesheet();
  } catch (err) {
    console.error('[dna] Could not load stylesheet:', err);
    showNotification('Could not open DNA tools. Reload the app to finish updating, then try again.', 'error');
    return false;
  }
}

export function configureDnaRuntimeDeps(deps: RuntimeDependencyUpdates<DnaRuntimeDeps> = {}) {
  return configureRuntimeDependencies(dnaRuntimeDeps, deps, ['buildSidebar', 'navigate', 'openChatPanel', 'showConfirmDialog']);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as Window & DnaPublishedState)
    : (globalThis as typeof globalThis & DnaPublishedState);
}

function isDnaDebugMode() {
  try {
    return dnaRuntimeDeps.isDebugMode() === true;
  } catch {
    return false;
  }
}

export function cacheDnaSnpTable(data: SnpCatalog) {
  getRuntimeWindow()._snpTableCache = data;
}

export function cacheDnaHaplogroupTable(data: HaplogroupTable) {
  getRuntimeWindow()._haplogroupTableCache = data;
}

export function logDnaDebugError(...args: unknown[]) {
  if (isDnaDebugMode()) console.error(...args);
}

export function logDnaDebugWarn(...args: unknown[]) {
  if (isDnaDebugMode()) console.warn(...args);
}

export function navigateDnaRoute(route: string) {
  dnaRuntimeDeps.navigate?.(route);
}

export function openDnaChatPrompt(prompt: string) {
  const openChatPanel = dnaRuntimeDeps.openChatPanel;
  if (!openChatPanel || !String(prompt || '').trim()) return false;
  void Promise.resolve(openChatPanel(prompt)).catch(() => {});
  return true;
}

export function refreshDnaSidebar() {
  const buildSidebar = dnaRuntimeDeps.buildSidebar;
  if (!buildSidebar) return;
  try {
    buildSidebar();
  } catch {}
}

export function refreshDnaShell(route: string) {
  refreshDnaSidebar();
  navigateDnaRoute(route);
}

export function isDnaLabImportRunning() {
  try {
    return dnaRuntimeDeps.isImportRunning() === true;
  } catch {
    return true;
  }
}

export function triggerDnaFilePicker() {
  triggerContextCardDNAFilePickerRuntime();
}

export function updateDnaChatNudge() {
  updateChatNudgeRuntime();
}

export function getDnaProfileLatitudeBand() {
  try {
    return dnaRuntimeDeps.getLatitudeFromLocation() || null;
  } catch {
    return null;
  }
}

export async function confirmDnaDeleteDialog() {
  const confirmDialog = dnaRuntimeDeps.showConfirmDialog;
  if (!confirmDialog) return false;
  try {
    return await confirmDialog('Delete genetic data? This cannot be undone.') === true;
  } catch {
    return false;
  }
}

export function setPendingDnaImport(result: PendingDnaImport) {
  getRuntimeWindow()._pendingDNAImport = result;
}

export function getPendingDnaImport() {
  return getRuntimeWindow()._pendingDNAImport || null;
}

export function clearPendingDnaImport() {
  getRuntimeWindow()._pendingDNAImport = null;
}

export function setPendingMtDnaImport(result: PendingMtDnaImport) {
  getRuntimeWindow()._pendingMtDNA = result;
}

export function getPendingMtDnaImport() {
  return getRuntimeWindow()._pendingMtDNA || null;
}

export function clearPendingMtDnaImport() {
  getRuntimeWindow()._pendingMtDNA = null;
}

/** Reuse the DNA overlay, creating its original backdrop only on first use. */
export function ensureDnaModalOverlay() {
  let overlay = document.getElementById('dna-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dna-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
}
