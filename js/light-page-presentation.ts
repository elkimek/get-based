import type { ChannelPillView, ChannelSparkline } from './light-channel-presentation.js';
import type { LightTodayView } from './light-today-presentation.js';
// Pure display contracts. Light/Sun services keep calculations, persistence,
// session ownership and the rendering of their separately owned children.
export interface LightAction {
  readonly action: string;
  readonly label: string;
  readonly title?: string;
  readonly primary?: boolean;
  readonly active?: boolean;
  readonly more?: boolean;
  readonly liveId?: string;
  readonly elapsed?: string;
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
  readonly status: string;
  readonly label: string;
  readonly action: string;
  readonly hint: string;
  readonly extraClass: string;
}
export interface LightDashboardPill {
  readonly key: string;
  readonly name: string;
  readonly icon: string;
  readonly title: string;
  readonly label: string;
  readonly active: boolean;
  readonly days: string;
  readonly chart: ChannelSparkline | null;
}
export interface LightLocationHintView {
  readonly country: boolean;
  readonly latitude?: string;
}

export type LightPageBodyProps =
 | {readonly kind:'pills';readonly pills:readonly LightDashboardPill[]}
 | {readonly kind:'actions';readonly view:LightSessionActionsView}
 | {readonly kind:'prompt';readonly view:LightPromptView}
 | {readonly kind:'safety';readonly view:LightUVSafetyView}
 | {readonly kind:'methods';readonly skinBasis:string;readonly dataSource:import('./sun-data-source-presentation.js').SunDataSourceView|null}
 | {readonly kind:'live';readonly sun:boolean;readonly sunView:import('./light-session-presentation.js').LightSessionRowProps|null;readonly deviceView:Extract<import('./light-session-presentation.js').LightSessionPresentationProps,{kind:'active'}>|null}
 | {readonly kind:'location';readonly country:boolean;readonly latitude?:string}
 | {readonly kind:'loading';readonly id:string;readonly label:string}
 | {readonly kind:'channels';readonly lead:string;readonly pills:readonly ChannelPillView[];readonly location:LightLocationHintView|null}
 | {readonly kind:'dashboard-channels';readonly lead:string;readonly pills:readonly LightDashboardPill[]}
 | {readonly kind:'weekly';readonly review:import('./light-review-ai-presentation.js').ReviewPresentation|null}
 | {readonly kind:'today';readonly view:LightTodayView;readonly dashboard:Readonly<import('./light-review-ai-presentation.js').ReviewAIView>|null;readonly conditions:import('./light-conditions-presentation.js').ConditionsPresentationProps;readonly pills:readonly LightDashboardPill[]};
export type LightWidgetContent =
 | {readonly kind:'body';readonly props:LightPageBodyProps}
 | {readonly kind:'today-hero';readonly safety:LightUVSafetyView|null;readonly ai:Readonly<import('./light-review-ai-presentation.js').ReviewAIView>|null}
 | {readonly kind:'conditions';readonly location:LightLocationHintView|null;readonly props:import('./light-conditions-presentation.js').ConditionsPresentationProps}
 | {readonly kind:'setup';readonly props:import('./light-setup-presentation.js').LightSetupPresentationProps|null}
 | {readonly kind:'history';readonly props:import('./light-session-presentation.js').LightSessionHistoryProps};
export interface LightPageHeaderView {readonly title:string;readonly subtitle:string|null;readonly className:string}
export interface LightPageView {readonly header:LightPageHeaderView;readonly grid:import('./lens-page-shell-core.js').LensContentGrid<LightWidgetContent>}
export type LightPagePresentationProps=LightPageBodyProps|{readonly kind:'page';readonly view:LightPageView};
