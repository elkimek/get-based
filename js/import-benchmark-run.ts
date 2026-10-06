import type { runBundledImportReferenceBenchmark } from './import-reference-benchmark.js';
export type BenchmarkCompletion = Awaited<ReturnType<typeof runBundledImportReferenceBenchmark>>;
export interface BenchmarkRunState {
  id: number; running: boolean; completion: BenchmarkCompletion | null;
  progress: { value: number; label: string; indeterminate: boolean; startedAt: number } | null;
}
export interface BenchmarkRunDependencies {
  run: typeof runBundledImportReferenceBenchmark;
  notify(message: string, tone: 'info'|'success'|'error'): unknown;
  errorMessage(error: unknown): string;
  now(): number;
}
/** Background operation ownership survives a dialog replacement. Subscribers own only presentation. */
export function createBenchmarkRun(deps: BenchmarkRunDependencies) {
  let state: BenchmarkRunState = { id:0,running:false,completion:null,progress:null };
  const listeners = new Set<(state: BenchmarkRunState) => void>();
  const publish = () => {
    for (const listener of listeners) {
      try { listener(state); }
      catch { deps.notify('Model-test view could not refresh. Reopen the dialog.','error'); }
    }
  };
  return {
    getSnapshot:() => state,
    subscribe(listener: (state: BenchmarkRunState) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async start(): Promise<BenchmarkCompletion | null> {
      if (state.running) return null;
      const id = state.id + 1, startedAt = deps.now();
      state = { id,running:true,completion:null,progress:{ value:1,label:'Preparing model test',indeterminate:false,startedAt } };
      publish();
      try {
        const completed = await deps.run({ onProgress:(pct,label) => {
          if (!state.running || state.id !== id) return;
          const value = Math.max(0,Math.min(100,Math.round(Number(pct) || 0))), copy = label || 'Testing model';
          state = { ...state,progress:{ value,label:copy,indeterminate:/(?:analyzing|model is reading)/i.test(copy) && value < 90,startedAt } };
          publish();
        } });
        state = { id,running:false,completion:completed,progress:null }; publish();
        const score = completed.score, count = score.referenceDiscrepancyCount || 0;
        deps.notify(score.referenceExactMatch
          ? `Model test passed: all ${score.referenceExpectedMarkerCount} markers and report fields matched exactly.`
          : `Model test scored ${score.referenceExactMarkerCount}/${score.referenceExpectedMarkerCount} exact markers with ${score.referenceF1Percent}% F1. ${count} difference${count === 1 ? '' : 's'} saved for review.`,score.referenceExactMatch ? 'success' : 'info');
        return completed;
      } catch (error) {
        state = { id,running:false,completion:null,progress:null }; publish();
        deps.notify(deps.errorMessage(error),'error'); return null;
      }
    },
  };
}
export type BenchmarkRun = ReturnType<typeof createBenchmarkRun>;
