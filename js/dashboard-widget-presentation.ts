import {renderHTML as renderFrame} from './components/DashboardWidgetFrame.svelte.html.js';
import {renderHTML as renderBody} from './components/DashboardWidgetBody.svelte.html.js';
import {getWidgetHeaderDescription} from './dashboard-widget-copy.js';
import {lensWidgetHasContent, type LensDataWidgetContent} from './lens-widget-content.js';
import type {ControlsWidget, ControlsPreferences} from '../types/dashboard-widget-controls.js';
import type {DashboardNotesView} from '../types/dashboard-owned-widgets.js';
import type {DashboardSingleMarkerView, DashboardSpotlightView} from '../types/dashboard-lab-marker-views.js';
import type {DashboardLabSummaryView} from './dashboard-lab-summary-presentation.js';
import type {DashboardLightWidgetView} from './dashboard-light-widget-presentation.js';
import type {BiologyDashboardScoreView, BiologyDashboardCoherenceView} from './biology-overview-presentation.js';

/** Feature-owned data, shared by desktop and mobile. No child HTML crosses this boundary. */
export type DashboardWidgetContent = LensDataWidgetContent
  | Readonly<{kind: 'lab-summary'; view: DashboardLabSummaryView}>
  | Readonly<{kind: 'lab-marker'; view: DashboardSingleMarkerView | DashboardSpotlightView}>
  | Readonly<{kind: 'notes'; view: DashboardNotesView}>
  | Readonly<{kind: 'biology-dashboard-score'; view: BiologyDashboardScoreView}>
  | Readonly<{kind: 'biology-dashboard-coherence'; view: BiologyDashboardCoherenceView}>
  | Readonly<{kind: 'dashboard-light'; view: DashboardLightWidgetView}>
  | Readonly<{kind: 'light-loading'}>;

export interface DashboardWidgetDefinition extends ControlsWidget {
  readonly id: string;
  readonly description?: string;
}
export interface DashboardWidgetEntry {
  readonly def: DashboardWidgetDefinition;
  readonly content: DashboardWidgetContent | null;
}
export interface DashboardWidgetToolsView {
  readonly canMoveUp: boolean; readonly canMoveDown: boolean;
  readonly upId: string | null; readonly downId: string | null; readonly removeId: string | null;
  readonly upLabel: string; readonly downLabel: string; readonly removeLabel: string; readonly removeText: string;
}
export interface DashboardWidgetFrameView {
  readonly className: string; readonly id: string; readonly dragId: string | null; readonly organizing: boolean;
  readonly source: string | null; readonly title: string; readonly description: string | null;
  readonly tools: DashboardWidgetToolsView | null; readonly content: DashboardWidgetContent | null;
}
const text = (value: unknown): string => value == null ? '' : String(value);
const attribute = (value: unknown): string | null => value == null || value === '' ? null : String(value);

export function dashboardWidgetHasContent(content: DashboardWidgetContent | null): boolean {
  if (content === null) return false;
  if (content.kind === 'dashboard-light') return content.view.kind === 'loading' || content.view.kind === 'today' || content.view.view !== null;
  if (content.kind === 'lab-summary' || content.kind === 'lab-marker' || content.kind === 'notes'
    || content.kind === 'biology-dashboard-score' || content.kind === 'biology-dashboard-coherence'
    || content.kind === 'light-loading') return true;
  return lensWidgetHasContent(content);
}

/** The controller owns organization state; capture chrome at its original read positions. */
export function projectDashboardWidgetFrame(entry: DashboardWidgetEntry, prefs: ControlsPreferences,
  index: number, visibleEntries: {readonly length: number}, organizing: boolean): DashboardWidgetFrameView | null {
  const {def, content} = entry;
  const description = getWidgetHeaderDescription(def.id, def.description);
  const hidden = prefs.hidden.includes(def.id);
  const hasContent = dashboardWidgetHasContent(content);
  if (hidden || (!hasContent && !organizing)) return null;
  const canMoveUp = index > 0;
  const canMoveDown = index < visibleEntries.length - 1;
  const removeText = def.customMarkerWidget ? 'Remove' : 'Hide';
  let tools: DashboardWidgetToolsView | null = null;
  if (organizing) {
    const upId = attribute(def.id), upLabel = `Move ${text(def.title)} up`;
    const downId = attribute(def.id), downLabel = `Move ${text(def.title)} down`;
    const removeId = attribute(def.id), removeLabel = `${removeText} ${text(def.title)}`;
    tools = {canMoveUp, canMoveDown, upId, downId, removeId, upLabel, downLabel, removeLabel, removeText};
  }
  const className = `dashboard-widget dashboard-widget-${def.size || 'full'}${organizing ? ' is-organizing' : ''}${hasContent ? '' : ' is-empty'}`;
  const id = text(def.id);
  const dragId = organizing ? text(def.id) : null;
  const source = organizing && def.source ? text(def.source) : null;
  const title = text(def.title);
  const descriptionText = description ? text(description) : null;
  return {className, id, dragId, organizing, source, title, description: descriptionText, tools, content};
}

export function renderDashboardWidgetFrame(view: DashboardWidgetFrameView | null): string {
  return view ? renderFrame({view}) : '';
}
export function renderDashboardWidgetContent(content: DashboardWidgetContent | null): string {
  return renderBody({content});
}
