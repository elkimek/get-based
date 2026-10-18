import {renderHTML as timelineHTML} from './components/SupplementTimeline.svelte.html.js';
import {renderHTML as rowHTML} from './components/SupplementTimelineRow.svelte.html.js';
import {renderHTML as barHTML} from './components/SupplementTimelineBar.svelte.html.js';
import {renderHTML as evidenceHTML} from './components/SupplementMitoEvidence.svelte.html.js';
import {groupMitochondrialEvidenceMatches, mitochondrialDirectionLabel, mitochondrialEvidenceIssueUrl,
 type scanSupplementsForWarnings} from './supplement-warnings.js';

type Evidence=ReturnType<typeof groupMitochondrialEvidenceMatches>[number]['evidence'][number];
export interface SupplementHeader {readonly history:string|null}
export interface SupplementBar {readonly kind:'gap'|'supplement'|'medication';readonly left:string;readonly width:string;readonly ongoing:boolean}
export interface SupplementRow {readonly index:string;readonly aria:string;readonly title:string;readonly name:string;readonly bars:readonly SupplementBar[]}
interface EvidenceLinks {readonly study:string;readonly pmid:string;readonly search:string;readonly report:string}
interface EvidenceBadges {readonly study:string;readonly directionClass:string;readonly direction:string;readonly scope:string|null}
interface EvidenceDetail {readonly model:string;readonly exposure:string;readonly limitations:string;readonly title:string;readonly links:EvidenceLinks}
interface EvidenceStudy {readonly badges:EvidenceBadges;readonly summary:string;readonly detail:EvidenceDetail}
type EvidenceGroup=Readonly<{kind:'single';compoundAttribute:string;compoundText:string;products:string;study:EvidenceStudy}>
 |Readonly<{kind:'group';compoundAttribute:string;compoundText:string;products:string;count:string;studies:readonly EvidenceStudy[]}>;
export interface SupplementEvidence {readonly compoundCount:string;readonly studyCount:string;readonly groups:readonly EvidenceGroup[]}
export type SupplementSection=Readonly<{kind:'empty';header:SupplementHeader;emptyText:string}>
 |Readonly<{kind:'active';header:SupplementHeader;axis:readonly [string,string,string];rows:readonly SupplementRow[];evidence:SupplementEvidence|null}>;
export type SupplementTimelineProps={kind:'header';view:SupplementHeader}|{kind:'section';view:SupplementSection};
const text=(value:unknown):string=>value==null?'':String(value);
export function supplementHeader(history:string|null):SupplementHeader{return {history};}
export function supplementEmpty(header:SupplementHeader,emptyText:unknown):SupplementSection{return {kind:'empty',header,emptyText:text(emptyText)};}
export function supplementTimeline(header:SupplementHeader,axis:readonly [string,string,string],rows:readonly SupplementRow[],evidence:SupplementEvidence|null):SupplementSection{return {kind:'active',header,axis,rows,evidence};}
export function supplementBar(kind:SupplementBar['kind'],left:string,width:string|number,ongoing=false):SupplementBar{return {kind,left:String(left),width:String(width),ongoing};}
export function supplementRow(index:number,fullLabel:string,shortName:unknown,bars:readonly SupplementBar[]):SupplementRow{
 const aria='Edit '+text(fullLabel),key=String(index),title=text(fullLabel),name=text(shortName);
 return {index:key,aria,title,name,bars};
}
function projectBadges(e:Evidence):EvidenceBadges{
 const direction=mitochondrialDirectionLabel(e.direction,e.studyType),scope=e.scopeLabel?text(e.scopeLabel):null;
 const study=text(e.studyLabel),directionClass=String(['adverse','beneficial','mixed','null'].includes(e.direction as string)?e.direction:'mechanism');
 return {study,directionClass,direction:text(direction),scope};
}
function projectDetail(e:Evidence):EvidenceDetail{
 const model=text(e.model),exposure=text(e.exposure),limitations=text(e.limitations),title=text(e.title),reportUrl=mitochondrialEvidenceIssueUrl(e);
 const links={study:`${e.url}`,pmid:`${e.pmid}`,search:`${e.searchUrl}`,report:text(reportUrl)};
 return {model,exposure,limitations,title,links};
}
function projectStudy(e:Evidence):EvidenceStudy{const badges=projectBadges(e),summary=text(e.summary),detail=projectDetail(e);return {badges,summary,detail};}
export function supplementEvidence(warnings:ReturnType<typeof scanSupplementsForWarnings>):SupplementEvidence|null{
 const groups=groupMitochondrialEvidenceMatches(warnings);if(!groups.length)return null;
 const compoundCount=`${groups.length} matched compound${groups.length===1?'':'s'}`,studyCount=`${warnings.length} verified stud${warnings.length===1?'y':'ies'}`;
 const children:EvidenceGroup[]=[];
 for(const group of groups){
  const products=group.productNames.length?group.productNames.join(', '):group.compound;
  const compoundAttribute=text(group.compound),compoundText=text(group.compound);
  if(group.evidence.length===1){
   const e=group.evidence[0]!,badges=projectBadges(e),summary=text(e.summary),productText=text(products),detail=projectDetail(e);
   children.push({kind:'single',compoundAttribute,compoundText,products:productText,study:{badges,summary,detail}});
  }else{
   const count=String(group.evidence.length),productText=text(products),studies:EvidenceStudy[]=[];
   for(const e of group.evidence)studies.push(projectStudy(e));
   children.push({kind:'group',compoundAttribute,compoundText,count,products:productText,studies});
  }
 }
 return {compoundCount,studyCount,groups:children};
}
export function renderSupplementSection(view:SupplementSection):string{return timelineHTML({kind:'section',view});}
export function renderSupplementHeader(history:string|null):string{return timelineHTML({kind:'header',view:supplementHeader(history)});}
export function renderSupplementEmpty(header:SupplementHeader,emptyText:unknown):string{return renderSupplementSection(supplementEmpty(header,emptyText));}
export function renderSupplementTimeline(header:SupplementHeader,axis:readonly [string,string,string],rows:readonly SupplementRow[],evidence:SupplementEvidence|null):string{return renderSupplementSection(supplementTimeline(header,axis,rows,evidence));}
export function renderSupplementRow(index:number,fullLabel:string,shortName:unknown,bars:readonly SupplementBar[]):string{return rowHTML({view:supplementRow(index,fullLabel,shortName,bars)});}
export function renderSupplementBar(kind:SupplementBar['kind'],left:string,width:string|number,ongoing=false):string{return barHTML({view:supplementBar(kind,left,width,ongoing)});}
export function renderSupplementEvidence(warnings:ReturnType<typeof scanSupplementsForWarnings>):string{const view=supplementEvidence(warnings);return view===null?'':evidenceHTML({view});}
