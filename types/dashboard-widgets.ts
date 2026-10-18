import type {DashboardWidgetContent} from '../js/dashboard-widget-presentation.js';
import type {DashboardBiometricsSnapshot} from './dashboard-biometric-views.js';
import type {DashboardInsightsSnapshot} from './dashboard-insights-view.js';
import type {DashboardSingleMarkerView,DashboardSpotlightView} from './dashboard-lab-marker-views.js';
import type {LabContext} from './dashboard-lab-widget-renderers.js';
import type {DashboardQuickMarkersView,DashboardNotesView} from './dashboard-owned-widgets.js';
import type {renderMenstrualCycleSection} from '../js/health-data-loader.js';
export interface DashboardRendererOperations {
  prepareDashboardWearableTilesWidget():DashboardBiometricsSnapshot;
  prepareDashboardInsightsListWidget(ctx:unknown):DashboardInsightsSnapshot;
  projectDashboardQuickMarkersWidget(ctx:LabContext):DashboardQuickMarkersView;
  projectDashboardNotesWidget():DashboardNotesView;
  projectDashboardSingleMarkerWidget(ctx:LabContext,id:unknown):DashboardSingleMarkerView|null;
  projectDashboardSpotlightWidget(ctx:LabContext):DashboardSpotlightView|null;
  renderDashboardBiologicalCoherenceWidget: unknown;
  renderDashboardBiologyScoreWidget: unknown;
  renderDashboardBioAgeWidget: unknown;
  renderFocusCard: unknown;
  renderDashboardRecommendationsWidget: unknown;
  renderDashboardSpotlightWidget: unknown;
  renderDashboardWearableTilesWidget: unknown;
  renderDashboardNutritionWidget: unknown;
  renderFuelWidget: unknown;
  renderDashboardQuickMarkersWidget: unknown;
  renderDashboardInsightsListWidget: unknown;
  renderDashboardGenomeWidget: unknown;
  renderDashboardAlertsWidget: unknown;
  renderDashboardCorrelationWidget: unknown;
  renderDashboardLightTodayWidget: unknown;
  renderDashboardLightConditionsWidget: unknown;
  renderDashboardLightLiveSessionWidget: unknown;
  renderDashboardLightSessionLogWidget: unknown;
  renderDashboardLightChannelsWidget: unknown;
  renderDashboardKeyTrendsWidget: unknown;
  renderDashboardNotesWidget: unknown;
}
export interface DashboardWidgetContext {data: Parameters<typeof renderMenstrualCycleSection>[0]}
export type DashboardWidgetProjector = (id: string, ctx: unknown) => DashboardWidgetContent | null;
export interface DashboardWidgetOptionsReader {isOrganizeMode?:unknown; getDashboardMarkerWidgetDefinition?:unknown; projectWidgetBody?(id:string,ctx:unknown):DashboardWidgetContent|null}
export interface DashboardWidgetOperationReader {id?:unknown; isAvailable?:unknown; render?:unknown}
export interface DashboardPreferenceReader {order?:unknown; hidden?:unknown}
export interface DashboardVisibleOptionsReader {includeEmpty?:unknown; excludeIds?:unknown}
export interface DashboardWidgetFilterOperations {
  filter(callback:(definition:unknown)=>unknown):DashboardWidgetFilterOperations;
  map(callback:(definition:unknown)=>{def:unknown;body:unknown}):{
    filter(callback:(entry:{def:unknown;body:unknown})=>unknown):unknown;
  };
}
