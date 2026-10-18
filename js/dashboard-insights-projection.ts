import {safeMarkerId} from './utils.js';
import {renderDashboardInsightCard,renderDashboardInsightsPresentation} from './dashboard-insights-presentation.js';
import type {MobileInsight} from '../types/mobile-dashboard.js';
import type {DashboardInsightCardView,DashboardInsightsSnapshot,DashboardInsightsView} from '../types/dashboard-insights-view.js';
function nativeText(value:unknown):string {return value===null||value===undefined?'':String(value);}
/** Keep the three original ID reads/filter/string-hint conversion before display fields. */
export function projectDashboardInsightCard(insight:MobileInsight):DashboardInsightCardView {
 let detail=false,id:string|null=null;
 if(insight.id&&safeMarkerId(insight.id)){
  detail=true;const value=insight.id;
  if(value!==undefined&&value!==null&&value!=='')id=String(value);
 }
 const tone=nativeText(insight.tone),eyebrow=nativeText(insight.eyebrow);
 const title=nativeText(insight.title),body=nativeText(insight.body);
 return {detail,id,tone,eyebrow,title,body};
}
/** Preserve native map callback string results, sparse iteration, join and Symbol rejection.
 * A foreign join may legitimately replace the card markup. Only that existing public
 * ABI uses the native literal wrapper; it never hydrates or enters a Svelte HTML sink. */
export function prepareDashboardInsights(insights:MobileInsight[]):DashboardInsightsSnapshot {
 if(!insights.length)return {body:'',view:null};
 const rows:DashboardInsightCardView[]=[];let cardOutput='';
 const joined=`${insights.map(insight=>{
  const view=projectDashboardInsightCard(insight);rows.push(view);
  const html=renderDashboardInsightCard(view);cardOutput+=html;return html;
 }).join('')}`;
 if(joined!==cardOutput)return {body:`<div class="db-insights-list">${joined}</div>`,view:null};
 const view={kind:'insights' as const,rows};return {body:renderDashboardInsightsPresentation(view),view};
}

/** Page-owned collections compose literal cards; the public HTML compatibility API stays above. */
export function projectDashboardInsights(insights: MobileInsight[]): DashboardInsightsView | null {
  if (!insights.length) return null;
  const rows: DashboardInsightCardView[] = [];
  insights.map(insight => { rows.push(projectDashboardInsightCard(insight)); });
  return {kind: 'insights', rows};
}
