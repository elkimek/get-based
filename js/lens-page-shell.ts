// lens-page-shell.ts — synchronous compatibility rendering over the shared core.
import {renderHTML as renderShell} from './components/LensShellPresentation.svelte.html.js';
import {projectLensHeader, projectLensWidget} from './lens-shell-presentation.js';
import {renderHTML as renderDashboardToggle} from './components/LensDashboardToggle.svelte.html.js';
import {getLensDashboardToggleView, orderLensPageWidgets, lensWidgetChromeFacts} from './lens-page-shell-core.js';
import type {LensPageWidget, LensWidgetOptions} from './lens-page-shell-core.js';
export {configureLensPageShell, lensPageActionAttrs, getLensPageWidgetOrder, moveLensPageWidget,
  getLensDashboardToggleView, getLensWidgetChrome, getLensContentGrid} from './lens-page-shell-core.js';
export type {LensDashboardToggleView, LensPageShellDeps, LensWidgetOptions, LensPageWidget,
  LensContentWidget, LensContentGrid} from './lens-page-shell-core.js';

export function renderLensHeader(title: unknown, subtitle: unknown, actions:unknown=null, options: { className?: unknown } = {}) {
  return renderShell({kind: 'header', view: projectLensHeader(title, subtitle, actions, options)});
}

export function renderLensPageWidgets(route: string, widgets: Array<LensPageWidget | null | undefined | false>, options: { group?: string } = {}) {
  const orderKey = options.group ? `${route}-${options.group}` : route;
  const ordered = orderLensPageWidgets(orderKey, widgets.filter(Boolean) as LensPageWidget[]);
  return renderShell({kind: 'grid', view: {route, orderKey, widgets: ordered.map((widget, index) =>
    lensWidgetView(widget.id, widget.title, widget.description, widget.body, widget.size || 'full',
      {...(widget.opts || {}), pageRoute: route, pageIndex: index, pageCount: ordered.length}))}});
}

export function renderLensDashboardToggle(dashboardId: string | null | undefined) {
  const view = getLensDashboardToggleView(dashboardId);
  return view ? renderDashboardToggle({view}) : '';
}

function lensWidgetView(id: string, title: unknown, description: string | undefined, body: unknown, size: string, opts: LensWidgetOptions) {
  const {headerDescription, tools} = lensWidgetChromeFacts(id, description, opts);
  return projectLensWidget(id,title,headerDescription,body,size,tools,!!opts.compactScore);
}

export function renderLensWidget(id: string, title: unknown, description: string | undefined, body: unknown, size = 'full', opts: LensWidgetOptions = {}) {
  return renderShell({kind: 'widget', view: lensWidgetView(id, title, description, body, size, opts)});
}
