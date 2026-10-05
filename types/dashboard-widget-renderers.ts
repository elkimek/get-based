import type {MobileInsight} from './mobile-dashboard.js';
export interface WidgetRendererDependencies {
 markerHasData(marker:unknown):unknown;
 renderDashboardLightChannelPills():unknown;renderLightConditionsWidgetBody(options:{variant:string;slotId:string}):unknown;
 renderLightLiveSession?:((options:{includeEmptyState:boolean})=>unknown)|undefined;renderLightSessionLogActions():unknown;
 getMobileDashboardMarkers(ctx:unknown):unknown;getMobileDashboardInsights(ctx:unknown,markers:unknown):MobileInsight[];
 getMobileWearableTiles():{id:unknown}[];formatMobileWearableValue(id:unknown,metric:unknown,summary:unknown):unknown;formatMobileWearableDelta(id:unknown,metric:unknown,canon:unknown):unknown;
 getMobileWearablePriority?: (()=>Iterable<unknown>)|undefined;isLightSunUILoaded?:(()=>unknown)|undefined;
 loadLightSunUI?:(()=>{then(callback:()=>unknown):{catch(callback:(error:unknown)=>unknown):{finally(callback:()=>unknown):unknown}}})|undefined;
 rerenderDashboardFromWidgetChange():unknown;renderLightTodayHero?:(()=>unknown)|undefined;showRecommendations?:unknown;
}
export interface BiometricTile {id:unknown;label:unknown;value:unknown;unit:unknown;change:unknown;empty:boolean}
export interface WearableConnectionReader {connectedAt?:unknown;accessToken?:unknown;needsReauth?:unknown;lastSyncAt?:unknown}
export interface GenomeStored {gene?:unknown;variant?:unknown;genotype?:unknown;note?:unknown;category?:unknown;effect?:unknown;valence?:unknown;references?:unknown;[key:string]:unknown}
export interface GenomeProfile {evidenceShortLabel?:unknown;relevanceShortLabel?:unknown;scope?:unknown;context?:unknown}
export interface GenomeEvidence {
 dnaStudyReferenceLabel(reference:unknown):{replace(pattern:RegExp,replacement:string):unknown};mtdnaEvidenceIssueUrl():unknown;newSnpSuggestionIssueUrl():unknown;
 resolveSnpEvidenceProfile(entry:unknown,info?:unknown):GenomeProfile;snpEvidenceIssueUrl(rsid:unknown,entry:unknown):unknown;
 snpFindingPresentation(effect:unknown,valence:unknown):{shortLabel:unknown;tone:unknown};snpFindingRank(profile:unknown,presentation:unknown):unknown;
}
export interface GenomeFinding extends GenomeStored {rsid:unknown;categoryLabel:unknown;impactLabel:unknown;impactTone:unknown;impactRank:unknown;evidenceProfile:GenomeProfile|null;catalogEntry:unknown}
export interface GenomeGroup {category:unknown;categoryLabel:unknown;findings:GenomeFinding[];rank:unknown;tone:unknown;impactLabel:unknown}
export interface MtdnaStudyReader {pmid?:unknown;direction?:unknown;studyLabel?:unknown;title?:unknown;scopeLabel?:unknown;summary?:unknown;model?:unknown;limitations?:unknown}
export interface MtdnaReader {origin?:unknown;source?:unknown;matchedMutations?:unknown;totalDiagnostic?:unknown;details?:unknown;haplogroup?:unknown;coupling?:{description?:unknown;implications?:unknown;shortLabel?:unknown;label?:unknown;climate?:unknown}|null}
export interface GenomeGenetics {snps?:Record<string,GenomeStored>|null;apoe?:unknown;mtdna?:MtdnaReader|null;source?:unknown;importDate?:unknown}
export interface GenomeHaplogroupTable {_meta?:{references?:unknown;caveat?:unknown}|null}
