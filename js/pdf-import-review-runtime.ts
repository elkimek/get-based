import type { ImportedRatioMarker } from './pdf-import-ratio-units.js';
import type { ImportDiagnostics } from './pdf-import-ai-utils.js';

export interface ImportReviewMarker extends ImportedRatioMarker {
  rawName?: string; value?: number | string | null; unit?: string | null;
  mappedKey?: string | null; suggestedKey?: string | null; matched?: boolean;
  suggestedName?: string | null; suggestedCategoryLabel?: string | null; suggestedGroup?: string | null;
  refMin?: number | null; refMax?: number | null; group?: string | null;
  [key: string]: unknown;
}
export interface PendingImport {
  markers: ImportReviewMarker[]; date?: string | null | undefined; testType?: string | null | undefined; fileName?: string | undefined;
  sampleTime?: unknown; fasting?: unknown; diagnostics?: ImportDiagnostics | null | undefined; imageMode?: boolean; importHash?: string | undefined; benchmarkId?: string | null;
  privacyMethod?: string; privacyOriginal?: unknown; privacyObfuscated?: unknown; privacyReplacements?: number;
  costInfo?: { cost?: number; provider?: string | null; modelId?: string | null; inputTokens?: number; outputTokens?: number } | null | undefined;
  timings?: { pii?: number; analysis?: number; piiMs?: number; analysisMs?: number; [key: string]: unknown } | null | undefined;
  _importProfileId?: string; _reReviewSnapshotId?: string | undefined; _excludedImportIndices?: number[];
  _adoptReferenceRanges?: boolean | undefined; _benchmarkContextEdited?: boolean; _benchmarkDateEdited?: boolean;
  [key: string]: unknown;
}
export interface ImportMarkerReference {
  name?: string | undefined; unit?: string | undefined; refMin?: number | null | undefined; refMax?: number | null | undefined;
  [key: string]: unknown;
}
export interface ImportReviewRuntimeFields {
  _pendingImport?: PendingImport | null;
  _pendingImportRefLookup?: Record<string, ImportMarkerReference> | null;
  _batchImportResolve?: ((action: string) => void) | null;
  _batchImportContext?: { current: number; total: number } | null;
  __importReviewDelegatesBound?: boolean;
  showPIIDiffViewer?: ((original: unknown, obfuscated: unknown) => unknown) | undefined;
}
interface ImportReviewDependencies {
  buildSidebar: (() => unknown) | null; confirmImport: (() => unknown) | null;
  navigate: ((route: string) => unknown) | null; updateHeaderDates: typeof updateHeaderDates | null;
}

// pdf-import-review-runtime.js - Browser runtime adapters for import review state.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { updateHeaderDates } from './data.js';

export function parseImportDatasetIndex(raw: string | undefined) {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const idx = Number(raw);
  return Number.isSafeInteger(idx) ? idx : null;
}

function getRuntimeWindow(): ImportReviewRuntimeFields | null {
  return typeof window !== 'undefined'
    ? (window as Window & ImportReviewRuntimeFields)
    : null;
}

const pdfImportReviewRuntimeDeps: ImportReviewDependencies = {
  buildSidebar: null,
  confirmImport: null,
  navigate: null,
  updateHeaderDates: updateHeaderDates,
};

export function configurePdfImportReviewRuntimeDeps(deps: Partial<ImportReviewDependencies> = {}) {
  return configureRuntimeCallbacks(pdfImportReviewRuntimeDeps, deps, 'inherited');
}

export function clearPendingImportRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._pendingImport = null;
  runtime._pendingImportRefLookup = null;
}

export function confirmImportFromRuntime() {
  const confirmImport = pdfImportReviewRuntimeDeps.confirmImport;
  if (!getRuntimeWindow() || !confirmImport) return false;
  return confirmImport();
}

export function getPendingImportFromRuntime() {
  const runtime = getRuntimeWindow();
  return runtime?._pendingImport || null;
}

export function getPendingImportRefLookup() {
  const runtime = getRuntimeWindow();
  return runtime?._pendingImportRefLookup || null;
}

export function navigateImportReviewRuntime(route: string = 'dashboard') {
  const navigate = pdfImportReviewRuntimeDeps.navigate;
  if (!getRuntimeWindow() || !navigate) return false;
  navigate(route);
  return true;
}

export function refreshImportedDataViewsRuntime(route: string = 'dashboard') {
  if (!getRuntimeWindow()) return false;
  let refreshed = false;
  const buildSidebar = pdfImportReviewRuntimeDeps.buildSidebar;
  if (buildSidebar) {
    buildSidebar();
    refreshed = true;
  }
  if (pdfImportReviewRuntimeDeps.updateHeaderDates) {
    pdfImportReviewRuntimeDeps.updateHeaderDates();
    refreshed = true;
  }
  if (navigateImportReviewRuntime(route)) refreshed = true;
  return refreshed;
}

export function setPendingImportRuntime(parseResult: PendingImport, refLookup: Record<string, ImportMarkerReference>) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._pendingImport = parseResult;
  runtime._pendingImportRefLookup = refLookup;
}

export function getBatchImportContext() {
  const runtime = getRuntimeWindow();
  return runtime?._batchImportContext || null;
}

export function hasBatchImportContext() {
  return !!getBatchImportContext();
}

export function markImportReviewDelegatesBound() {
  const runtime = getRuntimeWindow();
  if (!runtime || runtime.__importReviewDelegatesBound) return false;
  runtime.__importReviewDelegatesBound = true;
  return true;
}

export function showPIIDiffViewerFromRuntime(original: unknown, obfuscated: unknown) {
  const runtime = getRuntimeWindow();
  const showPIIDiffViewer = runtime?.showPIIDiffViewer;
  if (typeof showPIIDiffViewer === 'function') showPIIDiffViewer.call(runtime, original, obfuscated);
}

export function takeBatchImportResolve() {
  const runtime = getRuntimeWindow();
  const resolve = runtime?._batchImportResolve;
  if (typeof resolve !== 'function') return null;
  runtime!._batchImportResolve = null;
  runtime!._batchImportContext = null;
  return resolve;
}

export function startBatchImport(resolve: (action: string) => void, context: { current: number; total: number }) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._batchImportResolve = resolve;
  runtime._batchImportContext = context;
}
