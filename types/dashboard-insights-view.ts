export interface DashboardInsightCardView {
 readonly detail:boolean;readonly id:string|null;readonly tone:string;
 readonly eyebrow:string;readonly title:string;readonly body:string;
}
export interface DashboardInsightsView {readonly kind:'insights';readonly rows:readonly DashboardInsightCardView[]}
export interface DashboardInsightsSnapshot {readonly body:string;readonly view:DashboardInsightsView|null}
