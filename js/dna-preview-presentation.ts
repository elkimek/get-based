import {renderHTML} from './components/DnaImportPreview.svelte.html.js';
import {dnaActionAttrs} from './dna-actions.js';
import type {StoredSnpCall} from './dna-runtime.js';
import type {snpFindingPresentation, resolveSnpEvidenceProfile} from './dna-evidence.js';

export type DnaPreviewFinding = StoredSnpCall & {
  rsid: string;
  presentation: ReturnType<typeof snpFindingPresentation>;
  evidenceProfile: ReturnType<typeof resolveSnpEvidenceProfile>;
};
export interface DnaPreviewInput {
  source: () => unknown;
  stats: unknown;
  apoe: unknown;
  groups: readonly [DnaPreviewFinding[], DnaPreviewFinding[], DnaPreviewFinding[], DnaPreviewFinding[]];
  categoryLabel: (category: unknown) => unknown;
  importCount: () => unknown;
}
export interface DnaPreviewRow {
  readonly icon: string; readonly gene: string; readonly variant: string; readonly category: string; readonly genotype: string;
  readonly evidenceLevel: string; readonly evidenceLabel: string; readonly relevanceLevel: string; readonly relevanceLabel: string; readonly note: string;
}
export interface DnaPreviewGroup {readonly label: string; readonly collapsed: boolean; readonly action: string; readonly rows: readonly DnaPreviewRow[]}
export interface DnaPreviewView {
  readonly source: string; readonly stats: string; readonly apoe: string | null; readonly groups: readonly DnaPreviewGroup[];
  readonly cancelAction: string; readonly importAction: string; readonly importCount: string;
}
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
function action(name: 'toggle-preview-group' | 'close-preview' | 'confirm-import'): string {
  // These fixed actions have no extra attributes. Keep the actual helper call
  // order while projecting its one exact delegated attribute to Svelte.
  const markup = dnaActionAttrs(name);
  if (markup !== `data-dna-action="${name}"`) throw new Error('Unexpected DNA action attribute');
  return name;
}
export function projectDnaImportPreview(input: DnaPreviewInput): DnaPreviewView {
  // Delayed source/count reads preserve original template interpolation order.
  const source = text(input.source()), stats = text(input.stats);
  const rawApoe = input.apoe;
  const apoe = rawApoe ? text(rawApoe) : null;
  const labels = ['🔴 Risk associations', '🟢 Protective associations', '🔵 Informational traits', '⚪ Reference, neutral, or ungraded calls'];
  const groups = input.groups.map((items, index): DnaPreviewGroup => {
    const collapsed = index === 3;
    const groupAction = collapsed && items.length ? action('toggle-preview-group') : '';
    const rows = items.map((match): DnaPreviewRow => {
      const icon = `${match.presentation.icon}`;
      const gene = text(match.gene), variant = text(match.variant);
      const category = text(input.categoryLabel(match.category)), genotype = text(match.genotype);
      // Collapsed/reference rows intentionally never read assessment or note.
      if (collapsed) return {icon,gene,variant,category,genotype,evidenceLevel:'',evidenceLabel:'',relevanceLevel:'',relevanceLabel:'',note:''};
      const profile = match.evidenceProfile;
      const evidenceLevel = text(profile.evidenceLevel), evidenceLabel = text(profile.evidenceShortLabel);
      const relevanceLevel = text(profile.relevanceLevel), relevanceLabel = text(profile.relevanceShortLabel);
      const note = text(match.note);
      return {icon,gene,variant,category,genotype,evidenceLevel,evidenceLabel,relevanceLevel,relevanceLabel,note};
    });
    return {label:labels[index]!,collapsed,action:groupAction,rows};
  });
  const cancelAction = action('close-preview'), importAction = action('confirm-import');
  // Template interpolation uses the string hint and rejects Symbols; String()
  // would accept Symbols and change this original public contract.
  const importCount = `${input.importCount()}`;
  return {source,stats,apoe,groups,cancelAction,importAction,importCount};
}
/** Stable synchronous renderer ABI; delegated actions stay in dna-actions. */
export function renderDnaImportPreview(input: DnaPreviewInput): string {
  return renderHTML({view:projectDnaImportPreview(input)});
}
