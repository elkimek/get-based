/** Literal presentation snapshots for the native lens controller's content owners. */
export type LensAction = 'import-dna' | 'import-snp-report' | 'add-manual-snp' | 'reimport-dna' | 'delete-dna'
  | 'open-wearables-settings' | 'open-biometric-picker' | 'open-ai-chat' | 'open-emf-assessment'
  | 'open-recommendations' | 'open-privacy-settings' | 'remove-dashboard-widget' | 'add-dashboard-widget';
export interface LensActionButton {action: LensAction; label: string; primary?: boolean; id?: string}
export interface LensActionsView {buttons: LensActionButton[]; affiliate: boolean}
export interface GenomeImportView {
  cards: {label: string; value: string; sub: string}[];
  maternal: {title: string; lines: string[]} | null;
}
export interface BodySourcesView {empty: boolean; sources: {label: string; synced: string; coverage: string}[]}
export type LensContentProps =
  | {kind: 'actions'; view: LensActionsView}
  | {kind: 'genome-import'; view: GenomeImportView | null}
  | {kind: 'body-sources'; view: BodySourcesView};
interface MaternalInput {
  haplogroup?: unknown; origin?: unknown; source?: unknown; importDate?: unknown; details?: unknown;
  coupling?: {shortLabel?: unknown; label?: unknown; description?: unknown; implications?: unknown};
}
interface GeneticsInput {
  snps?: unknown; mtdna?: MaternalInput; source?: unknown; importDate?: unknown; apoe?: unknown;
  coverage?: {found?: unknown; total?: unknown};
}
interface SourceInput {lastSyncAt?: unknown; coverageDays?: unknown}
const text = (value: unknown): string => value == null ? '' : String(value);

export function projectGenomeImportDetails(input: unknown): GenomeImportView | null {
  const genetics = input as GeneticsInput | null | undefined;
  const count = Object.keys(genetics?.snps || {}).length;
  if (!genetics || (!count && !genetics.mtdna)) return null;
  const coverage = genetics.coverage && Number.isFinite(Number(genetics.coverage.found)) && Number.isFinite(Number(genetics.coverage.total))
    ? `${Number(genetics.coverage.found).toLocaleString()} / ${Number(genetics.coverage.total).toLocaleString()} catalog SNPs matched` : '';
  const cards: GenomeImportView['cards'] = [{label: 'Autosomal SNPs', value: count ? count.toLocaleString() : '0', sub: text(genetics.source || 'No raw autosomal import')}];
  if (genetics.importDate) cards.push({label: 'Imported', value: text(genetics.importDate), sub: coverage || 'Raw file processed locally'});
  if (genetics.apoe) cards.push({label: 'APOE', value: text(genetics.apoe), sub: 'Haplotype context'});
  const maternal = genetics.mtdna;
  if (!maternal) return {cards, maternal: null};
  cards.push({label: 'mtDNA', value: text(maternal.haplogroup), sub: text(maternal.coupling?.shortLabel || maternal.source || 'Maternal lineage')});
  const meta = [maternal.origin, maternal.source, maternal.importDate].filter(Boolean).map(text).join(' · ');
  const lines = [text(maternal.coupling?.label || 'Haplogroup stored')];
  if (meta) lines.push(meta);
  for (const line of [maternal.details, maternal.coupling?.description, maternal.coupling?.implications]) if (line) lines.push(text(line));
  return {cards, maternal: {title: `mtDNA ${text(maternal.haplogroup)}`, lines}};
}

export function projectBodySources(connectionsInput: unknown, summaryInput: unknown): BodySourcesView {
  const connections = (connectionsInput || {}) as Record<string, SourceInput>;
  const summary = summaryInput as {sources?: Record<string, SourceInput>} | null | undefined;
  const ids = Object.keys(connections);
  const empty = !ids.length && !summary?.sources;
  const sources = Array.from(new Set([...ids, ...Object.keys(summary?.sources || {})])).map(id => {
    const source = connections[id] || summary?.sources?.[id] || {};
    return {label: id === 'manual' ? 'Manual logs' : id,
      synced: source.lastSyncAt ? new Date(source.lastSyncAt as string).toLocaleDateString() : 'not synced',
      coverage: source.coverageDays ? `${source.coverageDays}d coverage` : 'coverage pending'};
  });
  return {empty, sources};
}

export function projectLensActions(kind: 'genome' | 'body' | 'insight' | 'tips', options: {hasSnps?: boolean; recommendationsVisible?: boolean} = {}): LensActionsView {
  const buttons: Record<typeof kind, LensActionButton[]> = {
    genome: [{action: 'import-dna', label: 'Import raw DNA', primary: true}, {action: 'import-snp-report', label: 'Import report'}, {action: 'add-manual-snp', label: 'Add SNP manually'}],
    body: [{action: 'open-wearables-settings', label: 'Connect source', primary: true}, {action: 'open-biometric-picker', label: 'Choose metrics'}],
    insight: [{action: 'open-ai-chat', label: 'Open AI chat', primary: true}, {action: 'open-emf-assessment', label: 'EMF assessment'}, {action: 'open-recommendations', label: 'Tips'}],
    tips: [{action: options.recommendationsVisible ? 'remove-dashboard-widget' : 'add-dashboard-widget', label: options.recommendationsVisible ? 'Remove from Dashboard' : 'Add to Dashboard', primary: true, id: 'recommendations'}, {action: 'open-privacy-settings', label: 'Disclosure & settings'}],
  };
  return {buttons: buttons[kind], affiliate: kind === 'genome' && !options.hasSnps};
}
