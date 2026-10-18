import type {LensActionsView} from './lens-content-presentation.js';
import type {LabDateRangeView} from './lab-date-range-presentation.js';
import {requireLensWidgetContent,type LensWidgetContent} from './lens-widget-content.js';
import type {LensDashboardToggleView} from './lens-page-shell-core.js';

export interface LensMoveControlsView {route: string; id: string; index: number; count: number}
export interface LensWidgetToolsView {move: LensMoveControlsView | null; dashboard: LensDashboardToggleView | null}
export type LensHeaderActions={readonly kind:'actions';readonly view:LensActionsView}|{readonly kind:'date-range';readonly view:LabDateRangeView};
export interface LensHeaderView {readonly title:string;readonly subtitle:string|null;readonly className:string;readonly actions:LensHeaderActions|null}
export interface LensWidgetChromeView {
  id: string; title: string; description: string | null; size: string;
  compact: boolean; tools: LensWidgetToolsView;
}
export interface LensWidgetView extends LensWidgetChromeView {readonly content:LensWidgetContent|null}
export interface LensGridView {route: string; orderKey: string; widgets: LensWidgetView[]}
export type LensShellProps =
  | {kind: 'header'; view: LensHeaderView}
  | {kind: 'widget'; view: LensWidgetView}
  | {kind: 'grid'; view: LensGridView}
  | {kind: 'tools'; view: LensWidgetToolsView};

const text = (value: unknown) => value == null ? '' : String(value);
/** Literal fields are text; named HTML fields come from existing owned renderers. */
export function projectLensHeader(title: unknown, subtitle: unknown, actions:unknown=null, options: {className?: unknown} = {}): LensHeaderView {
  return {title: text(title), subtitle: subtitle ? text(subtitle) : null,
    className: options?.className ? String(options.className) : '', actions: requireLensHeaderActions(actions)};
}
export function projectLensWidgetChrome(id: string, title: unknown, description: string | undefined, size: string,
  tools: LensWidgetToolsView, compact = false): LensWidgetChromeView {
  return {id, title: text(title), description: description ? String(description) : null, size, compact, tools};
}
export function projectLensWidget(id: string, title: unknown, description: string | undefined, body: unknown, size: string,
  tools: LensWidgetToolsView, compact = false): LensWidgetView {
  return {...projectLensWidgetChrome(id, title, description, size, tools, compact),
    content: requireLensWidgetContent(body)};
}

function requireLensHeaderActions(value:unknown):LensHeaderActions|null {
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='object'||!('kind'in value)||!['actions','date-range'].includes(String(value.kind))||!('view'in value))
  throw new TypeError('Lens header actions must be a typed owner view');
 return value as LensHeaderActions;
}
