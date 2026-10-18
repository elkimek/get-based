import {renderHTML} from './components/DashboardInsights.svelte.html.js';
import {renderHTML as renderCardHTML} from './components/DashboardInsightCard.svelte.html.js';
import type {DashboardInsightCardView,DashboardInsightsView} from '../types/dashboard-insights-view.js';
/** Synchronous public string compatibility; real Svelte nodes own cards and collections. */
export function renderDashboardInsightsPresentation(view:DashboardInsightsView):string {return renderHTML({view});}
export function renderDashboardInsightCard(view:DashboardInsightCardView):string {return renderCardHTML({view});}
