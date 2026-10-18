import {expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDomSinkPolicy,scanDomSinks} from '../../scripts/dom-sink-audit.mjs';
import reviewedPolicy from '../../scripts/dom-sink-policy.json' with {type:'json'};

export const dashboardInsightsLoadingOwners=['js/dashboard-loading-state-presentation.ts','js/components/DashboardLightSunLoading.svelte','js/dashboard-insights-presentation.ts','js/components/DashboardInsights.svelte','js/components/DashboardInsightCard.svelte','js/dashboard-insights-projection.ts']as const;
export const dashboardBiometricOwners=['js/dashboard-biometric-presentation.ts','js/dashboard-biometric-projection.ts','js/components/DashboardBiometricSyncStatus.svelte','js/components/DashboardBiometricTile.svelte','js/components/DashboardBiometricsOverview.svelte']as const;
export const emfComparisonOwners=['js/emf-comparison-presentation.ts','js/components/EMFComparison.svelte']as const;
export const sidebarOwners=['js/sidebar-presentation.ts','js/components/ConditionalSidebarItem.svelte','js/components/SidebarCategoryItem.svelte','js/components/SidebarNavigation.svelte','js/components/SidebarIcon.svelte']as const;
export const correlationWorkspaceChromeOwners=['js/correlation-workspace-chrome-presentation.ts','js/components/CorrelationWorkspaceChrome.svelte','js/components/CorrelationWorkspaceReadout.svelte','js/components/CorrelationWorkspaceUsageSegments.svelte']as const;
export const correlationWorkspaceControlsOwners=['js/correlation-workspace-controls-presentation.ts','js/components/CorrelationWorkspaceControls.svelte']as const;
export const wearablePresentationOwners=["js/components/WearableDetailChrome.svelte", "js/components/WearableDetailFeedback.svelte", "js/components/WearableDetailStats.svelte", "js/components/WearableEmptyCard.svelte", "js/components/WearableManualEntries.svelte", "js/components/WearableMetricCard.svelte", "js/components/WearableSparkline.svelte", "js/components/WearableStripBody.svelte", "js/components/WearableStripHeader.svelte", "js/components/WearableStripStub.svelte", "js/wearable-detail-presentation.ts", "js/wearable-strip-empty-presentation.ts", "js/wearable-strip-presentation.ts", "js/wearable-strip-sparkline-presentation.ts", "js/wearable-strip-stub-presentation.ts"] as const;
export const historicalWearablePresentationOwners=["js/components/WearableDetailChrome.svelte", "js/components/WearableDetailFeedback.svelte", "js/components/WearableDetailStats.svelte", "js/components/WearableEmptyCard.svelte", "js/components/WearableManualEntries.svelte", "js/components/WearableMetricCard.svelte", "js/components/WearableSparkline.svelte", "js/components/WearableStripBody.svelte", "js/components/WearableStripHeader.svelte", "js/components/WearableStripStub.svelte", "js/wearable-detail-presentation-compiler-anchors.ts", "js/wearable-detail-presentation.ts", "js/wearable-detail-wearable-detail-chrome-anchors.ts", "js/wearable-detail-wearable-detail-feedback-anchors.ts", "js/wearable-detail-wearable-detail-stats-anchors.ts", "js/wearable-detail-wearable-manual-entries-anchors.ts", "js/wearable-strip-empty-presentation.ts", "js/wearable-strip-presentation-compiler-anchors.ts", "js/wearable-strip-presentation.ts", "js/wearable-strip-sparkline-presentation.ts", "js/wearable-strip-stub-presentation.ts", "js/wearable-strip-wearable-metric-card-anchors.ts", "js/wearable-strip-wearable-strip-body-anchors.ts", "js/wearable-strip-wearable-strip-header-anchors.ts"] as const;
export const historicalEMFComparisonOwnerCount=5;
export const historicalSidebarOwnerCount=9;
export const historicalCorrelationChromeOwnerCount=3;
export const historicalCorrelationControlsOwnerCount=3;
export const categoryOwners=['js/category-presentation.ts',...['CategoryRangeRail','CategoryChartCard','CategoryTableColgroup','CategoryScrollableTable','CategoryDataTable','CategoryHeatmap','CategoryFattyAcids','CategoryGlyph','CategoryTableHeader','CategoryRangeText','CategoryDataRows','CategoryHeatmapRows'].map(name=>'js/components/'+name+'.svelte')] as const;
export const categoryPageOwners=['js/category-page-presentation.ts',...['CategoryPageRangeEmptyState','CategoryMarkerDataGaps','CategoryPageChrome','CategoryPageViewBody','CategoryGlyph'].map(name=>'js/components/'+name+'.svelte')] as const;
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
/** Observation for mutation controls, never written back as an approved policy. */
export const observedCurrentPolicy=createDomSinkPolicy(process.cwd());
/** The reviewed global policy must match every actual current field and source path. */
export function qualifyCurrentDomSinkPolicy(raw:unknown):void {expect(raw).toEqual(observedCurrentPolicy);}
export function qualifyCurrentDashboardSourceInventory(current:readonly string[],policy:{sourceInventoryDigest?:string;scannedFiles:number}=reviewedPolicy):void {
 expect(new Set(current).size).toBe(current.length);
 expect(current).toEqual([...current].sort());
 expect(current).toHaveLength(policy.scannedFiles);
 expect(sha(JSON.stringify(current))).toBe(policy.sourceInventoryDigest);
}
export function currentSinkFingerprint(source:string,file:string){
 const sinks=scanDomSinks(source,file),surface=sinks.map(({kind,source})=>({kind,source})).sort((a,b)=>(a.kind+':'+a.source).localeCompare(b.kind+':'+b.source));
 return{count:sinks.length,digest:sha(JSON.stringify(surface)),kinds:Object.fromEntries([...new Set(sinks.map(row=>row.kind))].sort().map(kind=>[kind,sinks.filter(row=>row.kind===kind).length]))};
}
// Historical snapshots retain their original bytes. Their intermediate source
// counts and inverse coordinates do not constrain today's migrated source tree.
const historicalEvidence={
 "dashboard-current-zero-sink-source-ledger.json":"5751e3221a12d6d63d6d728d39d5e579e4b6e954cc064bcace6635d732705712",
 "dashboard-loading-insights-owned-source.json":"ea95c4f25a0af004325b75b3fa62288c2a0ac2081cde77a8cf38f854be7b846b",
 "dashboard-biometric-owned-source.json":"4273e360c781a1cd94462d3aacc334e7cb4c5590baf9ba3e814e458b50a97e7c",
 "dashboard-insights-loading-controller-inverse.json":"f5310619dcdbbcd5d0d8139d0370a5d27069775dcc76a55ab409e1a294e8f834",
 "correlations-workspace-source-sink-inverse.json":"05d514eff0ba47a1b5e3137c1b23d036cf8daae1859bf0afeaf3cdf78a15da74",
 "category-page-chrome-sink-inverse.json":"4e5b48dd1377193669de019649ef0560aad99402b3e8ef40a67fd4e4540502f0",
 "dashboard-insights-loading-sink-policy-before.json":"4a614ed6cbc1b8675e08f6ef349fc822853275a425c4b69a95a03442bc69df40",
 "dashboard-biometric-sink-policy-before.json":"4a4804d15649dfd9607b916989381e1089d8a9d5b0e5dfc852e70cf4b2767410",
 "emf-comparison-sink-policy-before.json":"08529fbbe60d308c7a4171d240b5285fafba6a0a948798730768b5ad257c12ec",
 "sidebar-sink-policy-before.json":"b5150043269ccce39bcd70cafb80c9b8281d09af4671a89e7c3b2c60f7687b93",
 "correlation-workspace-chrome-sink-policy-before.json":"1896adb374297d3c45b5170ba77ec9245dd2bbce91287325164fabdede81d208",
 "correlation-workspace-controls-sink-policy-before.json":"cbc198a346f5d76178af4d1c9f375945afcc46a902eff557a692f72be1679941",
 "wearable-presentation-sink-policy-before.json":"c39fa897ff5eda220e8bdf2b82f89019ff8a433ebc34b703ea12ad8f76fa304a",
} as const;
export function qualifyHistoricalSinkEvidence():void {
 for(const [file,digest] of Object.entries(historicalEvidence))expect(sha(readFileSync(path.join(process.cwd(),'tests/fixtures',file)))).toBe(digest);
}
