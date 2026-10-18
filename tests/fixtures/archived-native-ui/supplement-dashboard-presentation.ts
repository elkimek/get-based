import {renderHTML as timelineHTML} from './components/SupplementTimeline.svelte.html.js';
import {renderHTML as rowHTML} from './components/SupplementTimelineRow.svelte.html.js';
import {renderHTML as barHTML} from './components/SupplementTimelineBar.svelte.html.js';
import {renderHTML as evidenceHTML} from './components/SupplementMitoEvidence.svelte.html.js';
import {escapeHTML} from '../../../js/utils.js';
import {suppActionAttrs} from '../../../js/supplement-action-delegates.js';
import {groupMitochondrialEvidenceMatches, mitochondrialDirectionLabel, mitochondrialEvidenceIssueUrl,
  type scanSupplementsForWarnings} from '../../../js/supplement-warnings.js';

type Evidence = ReturnType<typeof groupMitochondrialEvidenceMatches>[number]['evidence'][number];
interface Slot {coordinate: string; value: string}
type Render = (props: {kind: string}) => string;
function slot(coordinate: string, value: string): Slot {return {coordinate, value};}
function child(name: string, value: string): Slot {return slot('<!---->'+name+'<!---->', value);}
function checksum(value: string): string {
 let hash=5381, i=value.length;
 while(i--) hash=((hash<<5)-hash)^value.charCodeAt(i);
 return (hash>>>0).toString(36);
}
/** Only the exact branch/root envelopes and private child envelopes are removed.
 * All coordinates are validated before insertion; raw native leaves/children are never rescanned. */
function render(renderHTML: Render, branch: number, kind: string, slots: readonly Slot[]): string {
 let html=renderHTML({kind});
 const prefix='<!--[--><!--['+branch+'-->', suffix='<!--]--><!--]-->';
 if(!html.startsWith(prefix)||!html.endsWith(suffix)) throw new Error('Unqualified supplement SSR branch');
 html=html.slice(prefix.length,-suffix.length);
 if(kind==='header'||kind==='header-history') {
  const title='<span class="context-section-title">Current supplements &amp; medications</span>';
  const at=html.indexOf(title);
  if(at<0||html.indexOf(title,at+title.length)!==-1) throw new Error('Unqualified supplement title encoding');
  html=html.slice(0,at)+'<span class="context-section-title">Current supplements & medications</span>'+html.slice(at+title.length);
 }
 const qualified=slots.map(entry=>{
  let coordinate=entry.coordinate;
  if(coordinate.startsWith('<!---->')) {
   const name=coordinate.slice(7,-7), dev='<!--'+checksum(name)+'-->'+name+'<!---->';
   const candidates=[coordinate,dev].filter(value=>html.includes(value));
   if(candidates.length!==1) throw new Error('Unqualified supplement private child');
   coordinate=candidates[0]!;
  }
  const start=html.indexOf(coordinate);
  if(start<0||html.indexOf(coordinate,start+coordinate.length)!==-1) throw new Error('Unqualified supplement coordinate');
  return {start,end:start+coordinate.length,value:entry.value};
 }).sort((a,b)=>a.start-b.start);
 // Qualify the complete unmodified skeleton before any native escaped/raw value is inserted.
 let skeleton='', cursor=0, out='';
 for(const edit of qualified) {
  if(edit.start<cursor) throw new Error('Overlapping supplement coordinates');
  skeleton+=html.slice(cursor,edit.start); out+=html.slice(cursor,edit.start)+edit.value;cursor=edit.end;
 }
 skeleton+=html.slice(cursor);out+=html.slice(cursor);
 if(skeleton.includes('<!--')||skeleton.includes('<!>')||skeleton.includes('gb-supp-')||skeleton.includes('data-supp-private-'))
  throw new Error('Unqualified supplement skeleton marker');
 return out;
}
export function renderSupplementHeader(history: string | null): string {
 const slots: Slot[]=[];
 if(history!==null) slots.push(slot('gb-supp-history',history));
 slots.push(slot('<button class="supp-add-btn" data-supp-private-action="manage">',
  '<button class="supp-add-btn" '+suppActionAttrs('open-editor')+'>'));
 return render(timelineHTML,history===null?0:1,history===null?'header':'header-history',slots);
}
export function renderSupplementEmpty(header: string, emptyText: unknown): string {
 return render(timelineHTML,2,'empty',[child('gb-supp-header',header),slot('gb-supp-empty',escapeHTML(emptyText))]);
}
export function renderSupplementTimeline(header: string, axis: readonly [string,string,string], rows: string, evidence: string): string {
 return render(timelineHTML,3,'active',[child('gb-supp-header',header),slot('gb-supp-axis-min',axis[0]),
  slot('gb-supp-axis-mid',axis[1]),slot('gb-supp-axis-max',axis[2]),child('gb-supp-rows',rows),child('gb-supp-evidence',evidence)]);
}
export function renderSupplementRow(index: number, fullLabel: string, shortName: unknown, bars: string): string {
 // Keep aria escape → action helper → title escape → name escape in the old template order.
 const aria=escapeHTML(fullLabel), action=suppActionAttrs('open-editor',`data-supp-index="${index}"`),
  title=escapeHTML(fullLabel), name=escapeHTML(shortName);
 return render(rowHTML,0,'row',[slot('<div class="supp-bar-row" role="button" tabindex="0" aria-label="Edit gb-supp-row-aria" data-supp-private-action="edit">',
  '<div class="supp-bar-row" role="button" tabindex="0" aria-label="Edit '+aria+'" '+action+'>'),
  slot('gb-supp-row-title',title),slot('gb-supp-row-name',name),child('gb-supp-bars',bars)]);
}
export function renderSupplementBar(type: 'gap' | 'supplement' | 'medication', left: string, width: string | number, isOpen=false): string {
 const kind=type+(isOpen?'-ongoing':''), branches=['gap','supplement','supplement-ongoing','medication','medication-ongoing'];
 const branch=branches.indexOf(kind);
 if(branch<0) throw new Error('Unknown supplement period kind');
 const className=type==='gap'?'supp-bar-gap':'supp-bar supp-bar-'+type+(isOpen?' supp-bar-ongoing':'');
 return render(barHTML,branch,kind,[slot('<div class="'+className+'" style="left:111.11%;width:222.22%">',
  '<div class="'+className+'" style="left:'+left+'%;width:'+width+'%">')]);
}
function directionClass(evidence: Evidence) {
 return ['adverse','beneficial','mixed','null'].includes(evidence.direction as string)?evidence.direction:'mechanism';
}
function evidenceLinks(evidence: Evidence): string {
 const reportUrl=mitochondrialEvidenceIssueUrl(evidence);
 // These three native raw interpolations are compatibility contracts. Do not harden or rescan them here.
 const study=`${evidence.url}`, pmid=`${evidence.pmid}`, search=`${evidence.searchUrl}`, report=escapeHTML(reportUrl);
 return render(evidenceHTML,7,'links',[slot('gb-supp-study-url',study),slot('gb-supp-pmid',pmid),slot('gb-supp-search-url',search),slot('gb-supp-report-url',report)]);
}
function evidenceBadges(evidence: Evidence): string {
 const direction=mitochondrialDirectionLabel(evidence.direction,evidence.studyType);
 const scope=evidence.scopeLabel?escapeHTML(evidence.scopeLabel):null;
 const study=escapeHTML(evidence.studyLabel), className=`${directionClass(evidence)}`, label=escapeHTML(direction);
 const slots=[slot('gb-supp-study-label',study),slot('gb-supp-direction-class',className),slot('>gb-supp-direction</span>','>'+label+'</span>')];
 if(scope!==null) slots.push(slot('gb-supp-scope',scope));
 return render(evidenceHTML,scope===null?4:5,scope===null?'badges':'badges-scope',slots);
}
function evidenceDetail(evidence: Evidence): string {
 const slots=[slot('gb-supp-model',escapeHTML(evidence.model)),slot('gb-supp-exposure',escapeHTML(evidence.exposure)),
  slot('gb-supp-limitations',escapeHTML(evidence.limitations)),slot('gb-supp-source-title',escapeHTML(evidence.title)),child('gb-supp-links',evidenceLinks(evidence))];
 return render(evidenceHTML,6,'detail',slots);
}
export function renderSupplementEvidence(warnings: ReturnType<typeof scanSupplementsForWarnings>): string {
 const groups=groupMitochondrialEvidenceMatches(warnings);
 if(!groups.length) return '';
 const compoundCount=`${groups.length} matched compound${groups.length===1?'':'s'}`;
 const studyCount=`${warnings.length} verified stud${warnings.length===1?'y':'ies'}`;
 const action=suppActionAttrs('ask-mito');
 let children='';
 for(const group of groups) {
  const products=group.productNames.length?group.productNames.join(', '):group.compound;
  if(group.evidence.length===1) {
   const evidence=group.evidence[0]!;
   const slots=[slot('gb-supp-compound-attr',escapeHTML(group.compound)),slot('gb-supp-compound-text',escapeHTML(group.compound)),
    child('gb-supp-badges',evidenceBadges(evidence)),slot('gb-supp-summary',escapeHTML(evidence.summary)),
    slot('gb-supp-products',escapeHTML(products)),child('gb-supp-detail',evidenceDetail(evidence))];
   children+=render(evidenceHTML,1,'single',slots);continue;
  }
  const compoundAttr=escapeHTML(group.compound),compoundText=escapeHTML(group.compound),count=`${group.evidence.length}`,
   productText=escapeHTML(products);
  let studies='';
  for(const evidence of group.evidence) {
   studies+=render(evidenceHTML,3,'study',[child('gb-supp-badges',evidenceBadges(evidence)),
    slot('gb-supp-summary',escapeHTML(evidence.summary)),child('gb-supp-detail',evidenceDetail(evidence))]);
  }
  children+=render(evidenceHTML,2,'group',[slot('gb-supp-compound-attr',compoundAttr),slot('gb-supp-compound-text',compoundText),
   slot('gb-supp-group-count',count),slot('gb-supp-products',productText),child('gb-supp-studies',studies)]);
 }
 return render(evidenceHTML,0,'root',[slot('gb-supp-compound-count',compoundCount),slot('gb-supp-study-count',studyCount),
  slot('<span class="supp-mitotox-ask" data-supp-private-action="ask">','<span class="supp-mitotox-ask" '+action+'>'),child('gb-supp-groups',children)]);
}
