import {renderHTML} from './components/DashboardLightSunLoading.svelte.html.js';
export interface DashboardLoadingStateView {readonly kind:'light-sun-loading'}
/** Native loader promises, refresh timing and error handling stay in the controller. */
export function renderDashboardLoadingState(view:DashboardLoadingStateView):string {
 if(view.kind!=='light-sun-loading')throw new Error('Unqualified Dashboard loading branch');
 return renderHTML({});
}
