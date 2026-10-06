import type { SettingsBenchmarkReader } from '../types/settings-data.js';
import type { BenchmarkContext, BenchmarkView } from './import-benchmark-contract.js';
import type { BenchmarkRun, BenchmarkRunState } from './import-benchmark-run.js';
import { importBenchmarkStorageId, importBenchmarksUseSameInput, isImportBenchmarkComparable, latestCompatibleModelTests } from './import-benchmark-data.js';
import { buildBenchmarkSnapshot } from './import-benchmark-presentation.js';

export interface BenchmarkControllerDependencies {
  read(): SettingsBenchmarkReader[];
  context(): BenchmarkContext;
  fixtureId: string;
  run: BenchmarkRun;
  confirm(message: string): Promise<unknown>;
  remove(ids: string[]): Promise<number>;
  notify(message: string, tone: 'info'|'success'|'error'): unknown;
  now(): number;
  close(): unknown;
}
export function createImportBenchmarksController(view: BenchmarkView, deps: BenchmarkControllerDependencies) {
  let snapshots = deps.read(), selected = new Set<string>(), reviewId = '', deleting = false, disposed = false;
  let initiatedRun = 0, lastRun = deps.run.getSnapshot().id;
  let timer: ReturnType<typeof setInterval> | null = null;
  const current = () => !disposed && view.isCurrent();
  const chooseReference = (benchmarkId?: unknown, fixtureId: unknown = deps.fixtureId) => {
    const gold = snapshots.find(snap => snap.benchmarkLocked && snap.referenceFixtureId === fixtureId);
    const run = snapshots.find(snap => benchmarkId ? snap.id === benchmarkId : snap.benchmarkKind === 'reference' && snap.referenceFixtureId === fixtureId && isImportBenchmarkComparable(snap));
    if (gold && run) selected = new Set([importBenchmarkStorageId(gold),importBenchmarkStorageId(run)]);
  };
  chooseReference();
  const refresh = () => {
    if (!current()) return;
    const run = deps.run.getSnapshot(), progress = run.progress;
    const context = deps.context();
    view.refresh(buildBenchmarkSnapshot(snapshots,{ ...context,running:run.running || context.running },{
      selected,reviewId,deleting,initiated:initiatedRun === run.id,
      progress:progress ? { ...progress,elapsed:Math.max(0,Math.round((deps.now() - progress.startedAt) / 1000)) } : null,
    }));
  };
  const updateRun = (run: BenchmarkRunState) => {
    if (!current()) return;
    if (run.running && !timer) timer = setInterval(refresh,1000);
    if (!run.running && timer) { clearInterval(timer); timer = null; }
    if (!run.running && run.id >= lastRun) {
      snapshots = deps.read();
      if (run.completion && initiatedRun === run.id) chooseReference(run.completion.benchmarkId,run.completion.manifest.id);
    }
    lastRun = run.id;
    refresh();
  };
  const unsubscribe = deps.run.subscribe(updateRun);
  updateRun(deps.run.getSnapshot());
  return {
    refresh() { if (current()) { snapshots = deps.read(); refresh(); } },
    dispose() { disposed = true; unsubscribe(); if (timer) clearInterval(timer); timer = null; },
    close:() => { if (current()) deps.close(); },
    run() {
      if (!current() || deps.run.getSnapshot().running || deps.context().running) return;
      initiatedRun = deps.run.getSnapshot().id + 1;
      void deps.run.start();
    },
    select(id: string, checked: boolean) {
      if (!current() || deleting) return;
      const candidate = snapshots.find(snap => importBenchmarkStorageId(snap) === id);
      if (!candidate || !isImportBenchmarkComparable(candidate)) return;
      const baseline = snapshots.find(snap => importBenchmarkStorageId(snap) === [...selected][0]);
      if (checked && baseline && !importBenchmarksUseSameInput(baseline,candidate)) {
        deps.notify('Choose model tests that used the same report.','info'); refresh(); return;
      }
      if (checked) selected.add(id); else selected.delete(id);
      reviewId = ''; refresh();
    },
    latest() { if (current() && !deleting) { selected = new Set(latestCompatibleModelTests(snapshots).map(importBenchmarkStorageId)); reviewId = ''; refresh(); } },
    clear() { if (current() && !deleting) { selected.clear(); reviewId = ''; refresh(); } },
    review(id: string) {
      if (!current() || !selected.has(id)) return;
      reviewId = id; refresh();
      requestAnimationFrame(() => { if (current()) view.scrollReview(); });
    },
    closeReview() { if (current()) { reviewId = ''; refresh(); } },
    async remove(id?: string): Promise<void> {
      if (!current() || deleting) return;
      const ids = (id ? [id] : [...selected]).filter(value => snapshots.some(snap => importBenchmarkStorageId(snap) === value && !snap.benchmarkLocked));
      if (!ids.length) return;
      const run = snapshots.find(snap => importBenchmarkStorageId(snap) === ids[0]);
      deleting = true; refresh();
      try {
        const confirmed = await deps.confirm(ids.length === 1
          ? `Delete this model test for "${run?.fileName || 'Unknown file'}"? Your imported health data will not be changed.`
          : `Delete ${ids.length} selected model tests? Your imported health data will not be changed.`);
        if (!confirmed || !current()) return;
        const count = await deps.remove(ids);
        if (!count && current()) deps.notify('Model tests could not be deleted. Try again.','error');
        if (count && current()) {
          ids.forEach(value => selected.delete(value)); snapshots = deps.read(); reviewId = '';
          deps.notify(`${count} model test${count === 1 ? '' : 's'} deleted.`,'success');
        }
      } catch { if (current()) deps.notify('Model tests could not be deleted. Try again.','error'); }
      finally { deleting = false; refresh(); }
    },
  };
}
