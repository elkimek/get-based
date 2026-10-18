import {renderHTML as rowsHTML} from './components/DashboardGenomeRows.svelte.html.js';
import {renderHTML as widgetHTML} from './components/DashboardGenomeWidget.svelte.html.js';
import type {DashboardMtdnaPanelView} from './dashboard-mtdna-panel-presentation.js';

export interface GenomeEvidenceView {
  readonly rsid: string;
  readonly assessment: string;
  readonly interpretation: Readonly<{scope: string | null; context: string | null}> | null;
  readonly references: readonly Readonly<{href: string; label: string}>[];
  readonly askRsid: string | null;
  readonly issueHref: string;
}
export interface GenomeRowView {
  readonly classes: string;
  readonly gene: string;
  readonly subline: string;
  readonly impact: string;
  readonly genotype: string;
  readonly note: string | null;
  readonly evidence: GenomeEvidenceView | null;
}
export interface GenomeGroupView {
  readonly classes: string;
  readonly label: string;
  readonly count: string;
  readonly impact: string;
  readonly rows: readonly GenomeRowView[];
}
export type DashboardGenomeView = Readonly<{
  kind: 'empty'; contributionHref: string | null;
}> | Readonly<{
  kind: 'populated'; meta: string | null; legend: boolean;
  apoe: Readonly<{assessment: string; value: string}> | null;
  mtdna: DashboardMtdnaPanelView | null; noPriority: boolean;
  groups: readonly GenomeGroupView[];
  secondary: Readonly<{count: string; groups: readonly GenomeGroupView[]}> | null;
  contributionHref: string | null;
}>;
export type DashboardGenomeWidgetView = DashboardGenomeView | Readonly<{
  kind: 'loading'; count: string; plural: '' | 's';
}>;

/** Literal snapshots compose directly; public synchronous renderer URLs remain stable. */
export function renderDashboardGenomeRows(view: DashboardGenomeView): string {
  return rowsHTML({view});
}
export function renderDashboardGenomeWidgetView(view: DashboardGenomeWidgetView): string {
  return widgetHTML({view});
}
