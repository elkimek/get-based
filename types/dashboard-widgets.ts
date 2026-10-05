import type {renderMenstrualCycleSection} from '../js/health-data-loader.js';
export interface DashboardRendererOperations {
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
export interface DashboardWidgetOptionsReader {isOrganizeMode?:unknown; getDashboardMarkerWidgetDefinition?:unknown}
export interface DashboardWidgetOperationReader {id?:unknown; isAvailable?:unknown; render?:unknown}
export interface DashboardPreferenceReader {order?:unknown; hidden?:unknown}
export interface DashboardVisibleOptionsReader {includeEmpty?:unknown; excludeIds?:unknown}
export interface DashboardWidgetFilterOperations {
  filter(callback:(definition:unknown)=>unknown):DashboardWidgetFilterOperations;
  map(callback:(definition:unknown)=>{def:unknown;body:unknown}):{
    filter(callback:(entry:{def:unknown;body:unknown})=>unknown):unknown;
  };
}
