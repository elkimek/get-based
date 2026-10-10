import { IMPORT_STEPS } from './constants.js';

export interface ImportProgressStepView {
  state: 'done' | 'active' | '';
  icon: 'done' | 'active' | 'pending';
  label: string;
}
export interface ImportProgressBodyView {
  kind: 'progress';
  pct: number;
  steps: readonly ImportProgressStepView[];
  fileName: string | null;
}
export interface ImportBatchCounterView {
  kind: 'batch-counter';
  text: string;
}
export type ImportProgressView = ImportProgressBodyView | ImportBatchCounterView;

/** Presentation only. The existing controller supplies its native initial percentage. */
export function projectImportProgress(step: number, pct: number, fileName: string): ImportProgressBodyView {
  const steps: ImportProgressStepView[] = [];
  for (let i = 0; i < IMPORT_STEPS.length; i++) {
    const isDone = i < step;
    const isActive = i === step;
    steps.push({
      state: isDone ? 'done' : isActive ? 'active' : '',
      icon: isDone ? 'done' : isActive ? 'active' : 'pending',
      label: `${IMPORT_STEPS[i]}${isActive ? '...' : ''}`,
    });
  }
  // Match the native truthy condition and escapeHTML's single String conversion.
  // Dynamic text is escaped by authored rendering; an empty boxed string stays present.
  const literalFileName = fileName ? String(fileName) : null;
  return { kind: 'progress', pct, steps, fileName: literalFileName };
}

/** Called before the progress-body projection, preserving the original prefix coercions. */
export function projectImportBatchCounter(current: number, total: number): ImportBatchCounterView {
  return { kind: 'batch-counter', text: `Processing file ${current} of ${total}` };
}
