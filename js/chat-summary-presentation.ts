// Display projection only. Summary generation, persistence and exports stay in
// chat-summaries; Markdown is formatted by the shared, escaping renderer.
export interface SavedSummaryDisplayInput {
  id?: unknown;
  threadName?: unknown;
  createdAt?: unknown;
  model?: unknown;
}

function actionId(value: unknown): string | undefined {
  return value == null || value === false ? undefined : String(value);
}

export function projectSavedSummaries(summaries: readonly SavedSummaryDisplayInput[]) {
  return summaries.slice().sort((a, b) =>
    (b.createdAt as { localeCompare(value: unknown): number }).localeCompare(a.createdAt)
  ).map(summary => ({
    id: actionId(summary.id),
    name: String(summary.threadName ?? ''),
    meta: new Date(summary.createdAt as ConstructorParameters<typeof Date>[0])
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + (summary.model ? ' · ' + String(summary.model) : ''),
  }));
}
export type SavedSummaryView = ReturnType<typeof projectSavedSummaries>[number];

export interface SummaryDialogInput {
  name: unknown;
  date?: unknown;
  model?: unknown;
  costLabel: string;
  content: unknown;
  loading: boolean;
  attribution: string | null;
  savedId?: unknown;
}

export function projectSummaryDialog(input: SummaryDialogInput) {
  const date = input.date ? new Date(input.date as ConstructorParameters<typeof Date>[0])
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return {
    ...input,
    name: String(input.name ?? ''),
    meta: (date ? ' · ' + date : '') + (input.model ? ' · ' + String(input.model) : '') + input.costLabel,
    savedId: input.savedId ? actionId(input.savedId) : undefined,
  };
}
export type SummaryDialogView = ReturnType<typeof projectSummaryDialog>;

export function projectSummaryPrint(input: { name: unknown; date: unknown; model: unknown; content: unknown; attribution: string }) {
  const date = input.date ? new Date(input.date as ConstructorParameters<typeof Date>[0])
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    name: String(input.name || 'Summary'), content: input.content, attribution: input.attribution,
    dateLine: date ? `Summarized ${date}${input.model ? ' · ' + String(input.model) : ''}` : '',
  };
}
export type SummaryPrintView = ReturnType<typeof projectSummaryPrint>;

export type SummaryPresentationProps =
  | { kind: 'list'; rows: SavedSummaryView[] }
  | { kind: 'dialog'; view: SummaryDialogView }
  | { kind: 'print'; view: SummaryPrintView };
