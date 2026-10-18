import {renderDashboardBiometricPresentation} from './dashboard-biometric-presentation.js';
import {renderDashboardInsightsPresentation} from './dashboard-insights-presentation.js';
import {renderDashboardLabMarkersPresentation} from './dashboard-lab-markers-presentation.js';
import {renderHTML} from './components/DashboardOwnedWidget.svelte.html.js';
import type {DashboardOwnedWidgetView} from '../types/dashboard-owned-widgets.js';
/** Genuine remaining mobile/Lens string compatibility; no compiler frames. */
export function renderDashboardOwnedWidgetHTML(view:DashboardOwnedWidgetView):string {
 if(view.kind==='wearables')return renderDashboardBiometricPresentation(view);
 if(view.kind==='insights')return renderDashboardInsightsPresentation(view);
 if(view.kind==='single-marker'||view.kind==='spotlight')return renderDashboardLabMarkersPresentation(view);
 if(view.kind==='quick-markers'&&!view.rows.length)return '';
 return renderHTML({view});
}
