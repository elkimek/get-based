import {renderHTML} from './components/DashboardLabMarkers.svelte.html.js';
import type {DashboardLabMarkerView} from '../types/dashboard-lab-marker-views.js';
/** Thin genuine typed SSR compatibility for existing public mobile/Lens renderer URLs. */
export function renderDashboardLabMarkersPresentation(view:DashboardLabMarkerView):string {return renderHTML({view});}
