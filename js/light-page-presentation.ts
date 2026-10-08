import type { LightTodayView } from './light-today-presentation.js';
// Pure display contracts. Light/Sun services keep calculations, persistence,
// session ownership and the rendering of their separately owned children.
export interface LightAction {
  action: string;
  label: string;
  title?: string;
  primary?: boolean;
  active?: boolean;
  more?: boolean;
  liveId?: string;
  elapsed?: string;
}
export function projectLightSessionActions(input: {
  sunActive: boolean;
  deviceActive: boolean;
  hasDevices: boolean;
  totalSessions: number;
}) {
  const actions: LightAction[] = [];
  if (!input.sunActive)
    actions.push({ action: 'quick-log-sun', label: 'Start sun session', primary: true });
  if (!input.deviceActive)
    actions.push(input.hasDevices
      ? { action: 'quick-log-device', label: 'Start device session', primary: true }
      : { action: 'open-add-device', label: 'Add light device' });
  actions.push({ action: 'open-detailed-session', label: 'Log past session' });
  return { actions, empty: input.totalSessions === 0 };
}
export function projectLightUVSafety(medToday: number, medYesterday: number) {
  let tone: 'info' | 'warn' | 'over' = 'info';
  let title = 'Modeled UV dose today: low';
  let message = 'The estimate is below the base MED reference, but it cannot certify safety.';
  if (medToday >= 1) {
    tone = 'over';
    title = 'Base MED reference reached';
    message = 'Stop UV exposure and move to shade or cover up. This is not a personal threshold.';
  }
  else if (medToday >= 0.7) {
    tone = 'warn';
    title = 'Approaching base MED reference';
    message = 'Move to shade or cover up; do not chase a channel or vitamin-D estimate.';
  }
  else if (medToday >= 0.3) {
    title = 'Moderate modeled UV dose today';
    message = 'Avoid redness; medication reactions and individual response are not predicted.';
  }
  return { tone, title, message, percent: Math.round(medToday * 100), icon: medToday >= 1 ? '⚠' : medToday >= 0.7 ? '!' : 'i', carry: medYesterday >= 0.7 && medToday > 0 ? `Yesterday's modeled dose was ${Math.round(medYesterday * 100)}% of its base MED reference. Recent redness or tenderness matters more than an arithmetic carry-over formula.` : '' };
}
export type LightUVSafetyView = ReturnType<typeof projectLightUVSafety>;
export type LightSessionActionsView = ReturnType<typeof projectLightSessionActions>;
export interface LightPromptView {
  status: string;
  label: string;
  action: string;
  hint: string;
  extraClass: string;
}
// HTML fields below are outputs of named existing presentation owners, never
// untrusted profile strings. They keep child lifecycle/import contracts during
// the migration of those child owners; literal fields always use Svelte escaping.
export interface LightDashboardPill {
  key: string;
  name: string;
  icon: string;
  title: string;
  label: string;
  active: boolean;
  days: string;
  sparklineHTML: string;
}
export type LightPagePresentationProps = {
  kind: 'pills';
  pills: readonly LightDashboardPill[];
} | {
  kind: 'actions';
  view: LightSessionActionsView;
} | {
  kind: 'prompt';
  view: LightPromptView;
} | {
  kind: 'safety';
  view: LightUVSafetyView;
} | {
  kind: 'methods';
  skinBasis: string;
  dataSourceHTML: string;
  showDataSource: boolean;
} | {
  kind: 'live';
  sunHTML: string;
  deviceHTML: string;
  sun: boolean;
  device: boolean;
} | {
  kind: 'location';
  country: boolean;
  latitude?: string;
} | {
  kind: 'loading';
  id: string;
  label: string;
} | {
  kind: 'channels';
  lead: string;
  channelHTML: string;
  locationHTML: string;
} | {
  kind: 'weekly';
  reviewHTML: string;
} | {
  kind: 'today';
  view: LightTodayView;
  dashboardHTML: string;
  conditionsHTML: string;
  pillsHTML: string;
} | {
  kind: 'page';
  headerHTML: string;
  widgetsHTML: string;
};
