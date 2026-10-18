import {renderHTML} from './components/MtDnaImportPreview.svelte.html.js';
import {dnaActionAttrs} from './dna-actions.js';
import type {PendingMtDnaImport, MtDnaMutation, detectMtDNAMismatch} from './dna-mtdna.js';

type Mismatch = ReturnType<typeof detectMtDNAMismatch>;
export interface MtDnaPreviewCouplingView {
  readonly label: string; readonly climate: string; readonly description: string;
}
export type MtDnaPreviewMismatchView =
  | {readonly kind: 'match'; readonly message: string}
  | {readonly kind: 'mismatch'; readonly severity: string; readonly message: string; readonly implications: string | null};
export interface MtDnaPreviewView {
  readonly markerCount: string; readonly fileName: string; readonly haplogroup: string;
  readonly matched: string; readonly total: string; readonly coupling: MtDnaPreviewCouplingView | null;
  readonly mismatch: MtDnaPreviewMismatchView | null;
  readonly cancelAction: 'close-mtdna-preview'; readonly importAction: 'confirm-mtdna-import'; readonly actionHaplogroup: string;
}
const text = (value: unknown): string => value == null ? '' : String(value);
function action<Action extends 'close-mtdna-preview' | 'confirm-mtdna-import'>(name: Action): Action {
  // Preserve the original helper invocation order; genuine nodes own attributes.
  if (dnaActionAttrs(name) !== 'data-dna-action="' + name + '"') throw new Error('Unexpected mtDNA action attribute');
  return name;
}
/** Capture original template reads/coercions once before authored children consume the view. */
export function projectMtDnaImportPreview(resolved: PendingMtDnaImport['resolved'], coupling: PendingMtDnaImport['coupling'],
  mutations: readonly MtDnaMutation[], fileName: string, mismatch: Mismatch): MtDnaPreviewView {
  const markerCount = `${mutations.length}`, source = text(fileName), haplogroup = text(resolved.haplogroup);
  const matched = `${resolved.matchedMutations}`, total = `${resolved.totalDiagnostic}`;
  const couplingView = coupling ? {label: text(coupling.label), climate: text(coupling.climate), description: text(coupling.description)} : null;
  let mismatchView: MtDnaPreviewMismatchView | null = null;
  if (mismatch && mismatch.mismatch) {
    const severity = `${mismatch.severity}`, message = text(mismatch.message);
    const implications = mismatch.implications ? text(mismatch.implications) : null;
    mismatchView = {kind: 'mismatch', severity, message, implications};
  } else if (mismatch && !mismatch.mismatch) {
    mismatchView = {kind: 'match', message: text(mismatch.message)};
  }
  const cancelAction = action('close-mtdna-preview'), importAction = action('confirm-mtdna-import');
  const actionHaplogroup = text(resolved.haplogroup);
  return {markerCount, fileName: source, haplogroup, matched, total, coupling: couplingView, mismatch: mismatchView,
    cancelAction, importAction, actionHaplogroup};
}
/** Stable public synchronous serializer; ordinary UI values remain literal data. */
export function renderMtDnaImportPreview(resolved: PendingMtDnaImport['resolved'], coupling: PendingMtDnaImport['coupling'],
  mutations: readonly MtDnaMutation[], fileName: string, mismatch: Mismatch): string {
  return renderHTML({view: projectMtDnaImportPreview(resolved, coupling, mutations, fileName, mismatch)});
}
