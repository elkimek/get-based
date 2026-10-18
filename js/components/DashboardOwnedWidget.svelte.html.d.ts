import type {DashboardOwnedWidgetView} from '../../types/dashboard-owned-widgets.js';
type CollectionView=Extract<DashboardOwnedWidgetView,{kind:'notes'|'quick-markers'}>;
export function renderHTML(props:{view:CollectionView}):string;
