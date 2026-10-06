import type { SettingsBenchmarkReader } from '../types/settings-data.js';
import type { BenchmarkContext, BenchmarkUiState, BenchmarkView } from './import-benchmark-contract.js';
import { getActiveModelId, getAIProvider } from './api.js';
import { getImportBenchmarkProviderLabel } from './import-benchmarks.js';
import { IMPORT_REFERENCE_FIXTURE, isBundledImportReferenceBenchmarkRunning } from './import-reference-benchmark.js';
import { getImportBenchmarksView, mountImportBenchmarks } from './import-benchmark-component.js';
import { buildBenchmarkDifference, buildBenchmarkSnapshot } from './import-benchmark-presentation.js';
import { latestCompatibleModelTests, importBenchmarkStorageId } from './import-benchmark-data.js';

export function getImportBenchmarkContext(): BenchmarkContext {
  const provider = getAIProvider();
  const model = String(getActiveModelId() || 'No model selected');
  return {
    model, provider: getImportBenchmarkProviderLabel({ provider, modelId: model }),
    sampleUrl: IMPORT_REFERENCE_FIXTURE.sourcePath, running: isBundledImportReferenceBenchmarkRunning(),
  };
}

interface PendingBody {
  snapshots: readonly SettingsBenchmarkReader[];
  ui: BenchmarkUiState;
}
let hostId = 0;
const pending = new Map<string, PendingBody>();
const bodies = new WeakMap<HTMLElement, PendingBody>();

/** Stable HTML-host contract; the same Svelte view owns standalone and dialog rendering. */
export function renderImportBenchmarksBody(snapshots: readonly SettingsBenchmarkReader[]): string {
  const id = String(++hostId), body: PendingBody = { snapshots, ui: { selected: new Set() } };
  pending.set(id, body);
  queueMicrotask(() => {
    pending.delete(id);
    if (typeof document === 'undefined') return;
    const host = document.querySelector<HTMLElement>(`[data-import-benchmark-body-host="${id}"]`);
    if (!host?.isConnected) return;
    bodies.set(host, body);
    let view: BenchmarkView;
    const refresh = () => view.refresh(buildBenchmarkSnapshot(body.snapshots, getImportBenchmarkContext(), body.ui));
    view = mountImportBenchmarks(host, buildBenchmarkSnapshot(body.snapshots, getImportBenchmarkContext(), body.ui), {
      close() {}, run() {}, remove() {},
      select(value, checked) { if (checked) body.ui.selected.add(value); else body.ui.selected.delete(value); refresh(); },
      latest() { body.ui.selected = new Set(latestCompatibleModelTests(body.snapshots).map(importBenchmarkStorageId)); refresh(); },
      clear() { body.ui.selected.clear(); body.ui.reviewId = ''; refresh(); },
      review(value) { body.ui.reviewId = value; refresh(); view.scrollReview(); },
      closeReview() { body.ui.reviewId = ''; refresh(); },
    }, 'body');
  });
  return `<div data-import-benchmark-body-host="${id}"></div>`;
}

export function updateImportBenchmarkSelection(overlay: Element, snapshots: readonly SettingsBenchmarkReader[], selectedIds: Set<string>): void {
  const host = overlay instanceof HTMLElement && getImportBenchmarksView(overlay)
    ? overlay : overlay.querySelector<HTMLElement>('[data-import-benchmark-body-host]');
  if (!host) return;
  const body = bodies.get(host) || pending.get(host.dataset.importBenchmarkBodyHost || '');
  if (body) {
    body.snapshots = snapshots; body.ui.selected = selectedIds;
    getImportBenchmarksView(host)?.refresh(buildBenchmarkSnapshot(snapshots, getImportBenchmarkContext(), body.ui));
    return;
  }
  const view = getImportBenchmarksView(host);
  if (!view) return;
  const previous = view.getSnapshot();
  view.refresh(buildBenchmarkSnapshot(snapshots, getImportBenchmarkContext(), {
    selected: selectedIds, reviewId: previous.reviewId, deleting: previous.deleting,
    initiated: previous.initiated, progress: previous.progress,
  }));
}

export function renderReferenceDiscrepancyDetails(snap: SettingsBenchmarkReader | null | undefined, { showClose = false } = {}): string {
  const id = String(++hostId);
  queueMicrotask(() => {
    if (typeof document === 'undefined') return;
    const host = document.querySelector<HTMLElement>(`[data-import-benchmark-difference-host="${id}"]`);
    if (!host?.isConnected) return;
    const initial = { ...buildBenchmarkSnapshot([], getImportBenchmarkContext(), { selected: new Set() }), review: buildBenchmarkDifference(snap) };
    let view: BenchmarkView;
    view = mountImportBenchmarks(host, initial, {
      close() {}, run() {}, select() {}, latest() {}, clear() {}, remove() {}, review() {},
      closeReview() { view.refresh({ ...initial, review: null }); },
    }, 'differences', showClose);
  });
  return `<div data-import-benchmark-difference-host="${id}"></div>`;
}
