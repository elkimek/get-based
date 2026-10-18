export interface DashboardBiometricRemoveView {readonly id:string|null;readonly label:string}
interface DashboardBiometricTileBase {readonly remove:DashboardBiometricRemoveView;readonly id:string|null;readonly label:string;readonly accessibleLabel:string}
export type DashboardBiometricTileView=
 |(DashboardBiometricTileBase&{readonly kind:'manual-empty';readonly metricId:string})
 |(DashboardBiometricTileBase&{readonly kind:'populated';readonly value:string;readonly unit:string;readonly change:string});
export interface DashboardBiometricSyncView {readonly stale:boolean;readonly label:string}
export interface DashboardBiometricsOverviewView {readonly kind:'wearables';readonly count:string;readonly pluralSuffix:string;readonly sync:DashboardBiometricSyncView|null;readonly rows:readonly DashboardBiometricTileView[]}
export interface DashboardBiometricsSnapshot {readonly body:string;readonly view:DashboardBiometricsOverviewView}
