import {renderHTML} from './components/DashboardBiometricsOverview.svelte.html.js';
import type {DashboardBiometricsOverviewView} from '../types/dashboard-biometric-views.js';
/** Thin synchronous public renderer compatibility; genuine Svelte nodes own the complete presentation. */
export function renderDashboardBiometricPresentation(view:DashboardBiometricsOverviewView):string {return renderHTML({view});}
