import { renderHTML } from './components/SupplementImportProgress.svelte.html.js';

export interface SupplementImportProgressView {
  readonly label: string;
  readonly detail: string;
  readonly percent: number | undefined;
}
export interface SupplementImportProgressInput {
  readonly label: unknown;
  readonly phase: number;
  readonly startedAt: number;
  readonly state: string;
  readonly percent: number | undefined;
  readonly slowHint: string;
}
function importElapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return seconds < 60 ? `${seconds}s elapsed` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s elapsed`;
}
export function projectSupplementImportProgress(input: SupplementImportProgressInput): SupplementImportProgressView {
  // Capture the label before reading the elapsed-time clock, as in the original
  // template. Svelte receives only literal scalars and owns their escaping.
  const label = String(input.label ?? '');
  const detail = input.state === 'running'
    ? `Step ${input.phase} of 4 · ${importElapsed(input.startedAt)}${input.slowHint}`
    : input.state === 'success' ? 'Complete' : 'Stopped';
  return { label, detail, percent: input.percent };
}
export function renderSupplementImportProgress(view: SupplementImportProgressView): string {
  return renderHTML({ view });
}
