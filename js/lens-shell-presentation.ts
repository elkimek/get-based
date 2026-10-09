import type {LensDashboardToggleView} from './lens-page-shell.js';

export interface LensMoveControlsView {route: string; id: string; index: number; count: number}
export interface LensWidgetToolsView {move: LensMoveControlsView | null; dashboard: LensDashboardToggleView | null}
export interface LensHeaderView {title: string; subtitle: string | null; className: string; actionsHTML: string | null}
export interface LensWidgetView {
  id: string; title: string; description: string | null; size: string;
  bodyHTML: string | null; compact: boolean; tools: LensWidgetToolsView;
}
export interface LensGridView {route: string; orderKey: string; widgets: LensWidgetView[]}
export type LensShellProps =
  | {kind: 'header'; view: LensHeaderView}
  | {kind: 'widget'; view: LensWidgetView}
  | {kind: 'grid'; view: LensGridView}
  | {kind: 'tools'; view: LensWidgetToolsView};

const text = (value: unknown) => value == null ? '' : String(value);
/** Literal fields are text; named HTML fields come from existing owned renderers. */
export function projectLensHeader(title: unknown, subtitle: unknown, actions = '', options: {className?: unknown} = {}): LensHeaderView {
  return {title: text(title), subtitle: subtitle ? text(subtitle) : null,
    className: options?.className ? String(options.className) : '', actionsHTML: actions ? String(actions) : null};
}
export function projectLensWidget(id: string, title: unknown, description: string | undefined, body: unknown, size: string,
  tools: LensWidgetToolsView, compact = false): LensWidgetView {
  return {id, title: text(title), description: description ? String(description) : null, size,
    bodyHTML: compact ? String(body) : body ? String(body) : null, compact, tools};
}
