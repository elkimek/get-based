// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {BiologyRenderScore} from '../js/biology-score-render.js';
import type {BiologyAIState} from '../js/biology-ai-presentation.js';
import type {LensDashboardToggleView} from '../js/lens-page-shell.js';
import {projectBiologyScoreDetail,projectBiologyScoreMetric,getScorePresentation} from '../js/biology-card-presentation.js';
import {renderHTML} from '../js/components/BiologyCardPresentation.svelte.html.js';
import {renderScoreDetail} from '../js/biology-score-render.js';
import {configureLensPageShell,renderLensDashboardToggle,renderLensWidget} from '../js/lens-page-shell.js';
import {state} from '../js/state.js';
import {pendingScoreExplanations,scoreExplanationErrors,getScoreAIRequestKey} from '../js/biology-score-sections.js';
// Original receipts were captured in Europe/Prague; keep their exact local-time inputs on every host.
beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Prague');
  expect(new Date('2026-08-07T12:00:00Z').getHours()).toBe(14);
});
afterEach(() => vi.unstubAllEnvs());
interface Sample {name:string;score:BiologyRenderScore;ai:BiologyAIState;withoutTools:string;dashboardToggleHTML:string;widgetToolsHTML:string;widgetPrefix:string;widgetSuffix:string}
const original=JSON.parse(readFileSync('tests/fixtures/biology-cards-original.json','utf8')) as {classes:string[];samples:Sample[];toggles:{id:string|null;html:string}[]};
function decode(html:string){return html.replace(/class="@(\d+)"/g,(_,index:string)=>{const value=original.classes[Number(index)];if(value===undefined)throw new Error('Invalid frozen class reference');return `class="${value}"`;});}
function host(html:string){const node=document.createElement('div');node.innerHTML=html;return node;}
interface Structure {tag:string;text:string;attributes:Record<string,string>;children:Structure[]}
function structure(node:Element):Structure{return {tag:node.tagName,text:node.textContent!.replace(/\s+/g,' ').trim(),attributes:Object.fromEntries([...node.attributes].filter(a=>!['class','style','data-biology-card-view','data-lens-shell-view'].includes(a.name)).map(a=>[a.name,a.value])),children:[...node.children].map(structure)};}
function toggle(sample:Sample):LensDashboardToggleView|null{const button=host(decode(sample.dashboardToggleHTML)).querySelector('button');return button?{id:button.getAttribute('data-lens-page-id')!,action:button.getAttribute('data-lens-page-action')! as LensDashboardToggleView['action'],label:button.textContent!}:null;}
let restore:ReturnType<typeof configureLensPageShell>;
beforeEach(()=>{restore=configureLensPageShell({getAvailableDashboardFixedWidgetIds:()=>[],getDashboardWidgetPrefs:()=>({hidden:['biology-score-thyroidCoherence']})});});
afterEach(()=>configureLensPageShell(restore));
for(const sample of original.samples){
 it(`preserves complete frozen card composition: ${sample.name}`,()=>{
  const before=structuredClone(sample);const html=renderHTML({kind:'detail',view:projectBiologyScoreDetail(sample.score,sample.ai)});
  expect(structure(host(html))).toEqual(structure(host(decode(sample.withoutTools))));
  expect(html).not.toContain('<!--score-tools-->');expect(sample).toEqual(before);
  expect(host(html).querySelector('script,img,[onerror],a[href^="javascript:"]')).toBeNull();
 });
 it(`preserves dashboard toggle state and the public widget insertion contract: ${sample.name}`,()=>{
  const actual=renderHTML({kind:'detail',view:projectBiologyScoreDetail(sample.score,sample.ai,toggle(sample))});
  const expected=decode(sample.withoutTools).replace('<!--score-tools-->','<!--score-tools-->'+decode(sample.dashboardToggleHTML));
  expect(structure(host(actual))).toEqual(structure(host(expected)));
  const body={kind:'biology-score' as const,view:projectBiologyScoreDetail(sample.score,sample.ai)};
  const widget=renderLensWidget(`biology-score-detail-${sample.score.id}`,sample.score.title,'',body,'full',{compactScore:true,dashboardId:`biology-score-${sample.score.id}`,pageRoute:'biology-scores',pageIndex:1,pageCount:3});
  const expectedWidget=sample.widgetPrefix+decode(sample.withoutTools).replace('<!--score-tools-->',decode(sample.widgetToolsHTML))+sample.widgetSuffix;
  expect(structure(host(widget))).toEqual(structure(host(expectedWidget)));
  expect(widget).not.toContain('<!--score-tools-->');
 });
}
for(const sample of original.toggles)it(`preserves shared toggle visibility and label: ${sample.id}`,()=>{
 const actual=renderLensDashboardToggle(sample.id);if(!sample.html)expect(actual).toBe('');
 expect(structure(host(actual))).toEqual(structure(host(sample.html)));
});
it('preserves finite zero and historical metric values without mutating scores',()=>{
 for(const sample of original.samples){const before=structuredClone(sample.score),view=projectBiologyScoreMetric(sample.score);expect(view.value).toBe(getScorePresentation(sample.score).value ?? null);expect(sample.score).toEqual(before);}
 expect(projectBiologyScoreMetric(original.samples.find(s=>s.name==='zero')!.score).value).toBe(0);
});
it('keeps the public card facade current with domain-owned AI processing and answers',()=>{
 for(const sample of original.samples){state.currentProfile='card-fixture';state.rangeMode='reference';
  (state as {importedData:unknown}).importedData={biologyScoreAI:sample.ai.record?{[sample.score.id]:sample.ai.record}:{}};
  pendingScoreExplanations.clear();scoreExplanationErrors.clear();if(sample.ai.processing)pendingScoreExplanations.add(getScoreAIRequestKey(sample.score));
  expect(structure(host(renderScoreDetail(sample.score)))).toEqual(structure(host(decode(sample.withoutTools))));
 }pendingScoreExplanations.clear();scoreExplanationErrors.clear();
});
it('removes native card templates and composes typed children without raw HTML slots',()=>{
 const renderer=readFileSync('js/biology-score-render.ts','utf8');expect(renderer).not.toContain('<article class="biology-score-detail');
 for(const name of ['BiologyScoreDetail','BiologyScoreMetric','BiologyCardPresentation','LensDashboardToggle'])expect(readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
});
