// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {BiologyRenderScore} from '../js/biology-score-render.js';
import type {BiologyAIState} from '../js/biology-ai-presentation.js';
import type {BiologyOverviewProps} from '../js/biology-overview-presentation.js';
import {projectBiologyCoherence,projectBiologyDashboardScore,projectBiologyDashboardCoherence} from '../js/biology-overview-presentation.js';
import {renderHTML} from '../js/components/BiologyOverviewPresentation.svelte.html.js';
import {renderBiologicalCoherenceLensHero,renderDashboardBiologicalCoherenceWidget,renderDashboardBiologyScoreWidget} from '../js/biology-score-render.js';
import {configureLensPageShell,getLensDashboardToggleView} from '../js/lens-page-shell.js';
import {getScoreAIRequestKey,pendingScoreExplanations,scoreExplanationErrors} from '../js/biology-score-sections.js';
import {state} from '../js/state.js';
// Original receipts were captured in Europe/Prague; keep their exact local-time inputs on every host.
beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Prague');
  expect(new Date('2026-08-07T12:00:00Z').getHours()).toBe(14);
});
afterEach(() => vi.unstubAllEnvs());
interface Sample {kind:BiologyOverviewProps['kind'];name:string;score:BiologyRenderScore|null;ai:BiologyAIState|null;html:string}
const original=JSON.parse(readFileSync('tests/fixtures/biology-overview-original.json','utf8')) as {classes:string[];samples:Sample[]};
function decode(html:string){return html.replace(/class="@(\d+)"/g,(_,index:string)=>{const value=original.classes[Number(index)];if(value===undefined)throw new Error('Invalid frozen class reference');return `class="${value}"`;});}
function host(html:string){const node=document.createElement('div');node.innerHTML=html;return node;}
interface Structure {tag:string;text:string[];attributes:Record<string,string>;children:Structure[]}
function structure(node:Element):Structure{return {tag:node.tagName,text:[...node.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent!.replace(/\s+/g,' ').trim()).filter(Boolean),attributes:Object.fromEntries([...node.attributes].filter(a=>!['class','style','data-biology-overview-view'].includes(a.name)).map(a=>[a.name,a.value])),children:[...node.children].map(structure)};}
// Native buttons deliberately replace the baseline role/button divs. All
// labels, delegate attributes and neutral rows retain their frozen contracts.
function acceptedOriginal(html:string){
 const node=host(decode(html));
 for(const old of node.querySelectorAll('div.bc-micro-domain[data-biology-score-action]')){
  const button=document.createElement('button');button.type='button';
  for(const attr of [...old.attributes])if(!['role','tabindex'].includes(attr.name))button.setAttribute(attr.name,attr.value);
  button.replaceChildren(...old.childNodes);old.replaceWith(button);
 }
 return node;
}
function project(sample:Sample):BiologyOverviewProps {
 const score=sample.score!;
 if(sample.kind==='coherence')return {kind:sample.kind,view:projectBiologyCoherence(score,sample.ai!,getLensDashboardToggleView('biology-score-biologicalCoherence'))};
 if(sample.kind==='dashboard-score')return {kind:sample.kind,view:projectBiologyDashboardScore(score)};
 return {kind:sample.kind,view:projectBiologyDashboardCoherence(score)};
}
let restore:ReturnType<typeof configureLensPageShell>;
beforeEach(()=>{restore=configureLensPageShell({getAvailableDashboardFixedWidgetIds:()=>[],getDashboardWidgetPrefs:()=>({hidden:[]})});});
afterEach(()=>{configureLensPageShell(restore);pendingScoreExplanations.clear();scoreExplanationErrors.clear();});
for(const sample of original.samples){
 it(`preserves frozen overview composition and inputs: ${sample.kind}/${sample.name}`,()=>{
  if(!sample.score){expect(sample.html).toBe('');return;}
  const before=structuredClone(sample);const html=renderHTML(project(sample));
  expect(structure(host(html))).toEqual(structure(acceptedOriginal(sample.html)));expect(sample).toEqual(before);
  expect(host(html).querySelector('script,img,[onerror],a[href^="javascript:"]')).toBeNull();
 });
 it(`preserves the public synchronous facade: ${sample.kind}/${sample.name}`,()=>{
  state.currentProfile='overview-fixture';state.rangeMode='reference';
  (state as {importedData:unknown}).importedData={biologyScoreAI:sample.ai?.record?{[sample.score!.id]:sample.ai.record}:{}};
  if(sample.ai?.processing)pendingScoreExplanations.add(getScoreAIRequestKey(sample.score!));
  const compute=()=>sample.score?[sample.score]:[];
  const html=sample.kind==='coherence'?renderBiologicalCoherenceLensHero(null,compute)
   :sample.kind==='dashboard-score'?renderDashboardBiologyScoreWidget(null,sample.score?.id||'absent',compute)
   :renderDashboardBiologicalCoherenceWidget(null,compute);
  expect(structure(host(html))).toEqual(structure(acceptedOriginal(sample.html)));if(!sample.score)expect(html).toBe('');
 });
}
it('keeps source AI and contributors while reading snapshot domains without sorting or mutating inputs',()=>{
 const sample=original.samples.find(s=>s.kind==='coherence'&&s.name==='snapshot')!,before=structuredClone(sample);
 const source=sample.score!,snapshot=source.historicalSnapshot!;
 source.membership![0]!.label='Current contributor';snapshot.membership![0]!.label='Historical contributor';
 const view=projectBiologyCoherence(source,sample.ai!,null);
 expect(view.contributors.rows[0]!.label).toBe('Current contributor');expect(view.metric.historical).toBe(true);
 source.membership![0]!.label=before.score!.membership![0]!.label;snapshot.membership![0]!.label=before.score!.historicalSnapshot!.membership![0]!.label;expect(sample).toEqual(before);
});
it('excludes non-finite domains, preserves finite zero and clamps only the displayed bar',()=>{
 const score=structuredClone(original.samples.find(s=>s.kind==='coherence'&&s.name==='actual')!.score!);
 const first=score.available[0]!;score.available=[{...first,partial:NaN},{...first,partial:Infinity},{...first,partial:0},{...first,partial:-5},{...first,partial:123}];
 const before=structuredClone(score),dashboard=projectBiologyDashboardCoherence(score);
 expect(dashboard.domains.map(d=>d.width)).toEqual([100,0,0]);expect(dashboard.domains.map(d=>d.value)).toEqual([100,0,0]);expect(score).toEqual(before);
 const ai=original.samples.find(s=>s.kind==='coherence'&&s.name==='actual')!.ai!;
 const lens=projectBiologyCoherence(score,ai,null);expect(lens.domains.map(d=>d.value)).toEqual([0,-5,123]);expect(lens.domains.map(d=>d.width)).toEqual([0,0,100]);
});
it('removes native overview/dashboard templates and introduces no arbitrary HTML slot',()=>{
 const renderer=readFileSync('js/biology-score-render.ts','utf8');
 for(const html of ['<section class="biology-coherence-hero','<section class="db-bio-coherence-hero','<div class="bc-micro-domain','<button type="button" class="db-hero-bio','<details id="biology-score-membership"'])expect(renderer).not.toContain(html);
 for(const name of ['BiologyOverviewPresentation','BiologyCoherenceOverview','BiologyContributors','BiologyDashboardScore','BiologyDashboardCoherence'])expect(readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
});

it('uses native buttons for linked domains and leaves neutral rows outside the tab order',()=>{
 const sample=original.samples.find(s=>s.kind==='dashboard-coherence'&&s.name==='unlinked')!;
 const node=host(renderHTML(project(sample)));
 for(const row of node.querySelectorAll('.bc-micro-domain')){
  if(row.hasAttribute('data-biology-score-action')){expect(row.tagName).toBe('BUTTON');expect(row.getAttribute('type')).toBe('button');expect(row.getAttribute('data-biology-score-id')).toBeTruthy();}
  else{expect(row.tagName).toBe('DIV');expect(row.hasAttribute('role')).toBe(false);expect(row.hasAttribute('tabindex')).toBe(false);}
 }
});
