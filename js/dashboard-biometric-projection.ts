import type {BiometricTile} from '../types/dashboard-widget-renderers.js';
import type {DashboardBiometricTileView} from '../types/dashboard-biometric-views.js';
function nativeText(value:unknown):string {return value===null||value===undefined?'':String(value);}
/** Match actionAttributes: only missing/empty IDs are omitted; zero, false and Symbols retain native String conversion. */
function actionId(value:unknown):string|null {return value===undefined||value===null||value===''?null:String(value);}
/** Capture each original read separately. Default-hint accessible-label concatenation precedes later display String conversion. */
export function projectDashboardBiometricTile(tile:BiometricTile):DashboardBiometricTileView {
 const source=tile as BiometricTile&{label:string;value:string;unit:string};
 const remove={id:actionId(source.id),label:nativeText(source.label)};
 if(source.empty){
  const metricId=nativeText(source.id);
  const id=actionId(source.id);
  const accessibleLabel=nativeText(source.label.toLowerCase());
  const label=nativeText(source.label);
  return {kind:'manual-empty',remove,metricId,id,accessibleLabel,label};
 }
 const id=actionId(source.id);
 const accessibleLabel=nativeText(source.label+': '+source.value+' '+source.unit);
 const label=nativeText(source.label);
 const value=nativeText(source.value);
 const unit=nativeText(source.unit||'');
 const change=nativeText(source.change||'latest');
 return {kind:'populated',remove,id,accessibleLabel,label,value,unit,change};
}
