export type BenchmarkTone = 'neutral' | 'better' | 'worse' | 'baseline';
export interface BenchmarkField { label: string; text: string; title?: string; wide?: boolean }
export interface BenchmarkDifference {
  model: string; summary: string; unavailable: boolean; count: number; truncated: boolean;
  groups: Array<{ marker: string; section: string; report: boolean; issues: Array<{ label: string; expected: string; actual: string; note: string }> }>;
}
export interface BenchmarkCard {
  id: string; fileName: string; recorded: string; reference: boolean; gold: boolean;
  diagnostic: boolean; selected: boolean; incompatible: boolean; order: string;
  status: string; retried: boolean; fields: BenchmarkField[]; differences: BenchmarkDifference;
}
export interface BenchmarkComparison {
  gold: boolean;
  headers: Array<{ id: string; label: string; provider: string; model: string; fileName: string; differenceCount: number; unavailable: boolean }>;
  rows: Array<{ key: string; group: string; groupStart: boolean; label: string; hint: string; cells: Array<{ id: string; text: string; difference: string; tone: BenchmarkTone }> }>;
}
export interface BenchmarkProgress {
  value: number; label: string; indeterminate: boolean; elapsed: number;
}
export interface BenchmarkSnapshot {
  summary: Array<{ label: string; value: number }>;
  gold: BenchmarkCard[]; successful: BenchmarkCard[]; diagnostics: BenchmarkCard[];
  model: string; provider: string; sampleUrl: string; referenceRuns: number;
  running: boolean; initiated: boolean; deleting: boolean; progress: BenchmarkProgress | null;
  canSelectLatest: boolean; canClear: boolean; canDelete: boolean; selectionCopy: string;
  comparison: BenchmarkComparison | null; reviewId: string; review: BenchmarkDifference | null;
}
export interface BenchmarkActions {
  close(): unknown; run(): unknown; select(id: string, checked: boolean): unknown;
  latest(): unknown; clear(): unknown; remove(id?: string): unknown;
  review(id: string): unknown; closeReview(): unknown;
}
export interface BenchmarkComponentView { refresh(snapshot: BenchmarkSnapshot): void; getSnapshot(): BenchmarkSnapshot; scrollReview(): void }
export interface BenchmarkView extends BenchmarkComponentView { isCurrent(): boolean; dispose(): void }
export interface BenchmarkContext { model: string; provider: string; sampleUrl: string; running: boolean }
export interface BenchmarkUiState {
  selected: Set<string>; reviewId?: string; deleting?: boolean; initiated?: boolean; progress?: BenchmarkProgress | null;
}
