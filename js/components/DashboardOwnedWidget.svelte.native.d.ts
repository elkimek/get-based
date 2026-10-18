import type {Component} from 'svelte';
import type {DashboardOwnedWidgetView} from '../../types/dashboard-owned-widgets.js';
type CollectionView=Extract<DashboardOwnedWidgetView,{kind:'notes'|'quick-markers'}>;
declare const component:Component<{view:CollectionView},{setView(view:CollectionView):void}>;
export default component;
export {mount,hydrate,unmount,flushSync} from 'svelte';
