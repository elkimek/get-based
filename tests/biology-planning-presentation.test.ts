// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {compileDashboardLabMarkerWidgetStyles} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
import {expect, it} from 'vitest';
import postcss from 'postcss';
import {renderBiologyScoreCoveragePlanner, renderBiologyScoresActionSummary, type BiologyRenderScore} from '../js/biology-score-render.js';
import {projectBiologyCoverage, projectBiologyNextChecks} from '../js/biology-planning-presentation.js';
import {renderHTML} from '../js/components/BiologyPlanningPresentation.svelte.html.js';
const original = JSON.parse(readFileSync('tests/fixtures/biology-planning-original.json','utf8')) as {
  actions: {name: string; live: BiologyRenderScore[]; waiting: BiologyRenderScore[]; coherence?: BiologyRenderScore; html: string}[];
  planners: {name: string; scores: BiologyRenderScore[]; coherence: BiologyRenderScore | null; html: string}[];
};
function host(html: string) { const node = document.createElement('div'); node.innerHTML=html; return node; }
interface Structure {tag: string; text: string; attributes: Record<string,string>; children: Structure[]}
function structure(node: Element): Structure {
  return {tag: node.tagName, text: node.textContent!.replace(/\s+/g,' ').trim(), attributes: Object.fromEntries([...node.attributes].filter(a=>!['class','style','data-biology-planning-view'].includes(a.name)).map(a=>[a.name,a.value])), children:[...node.children].map(structure)};
}
for(const sample of original.actions) it(`preserves next-check copy, priority and delegates: ${sample.name}`,()=>{
  const before=structuredClone(sample);
  expect(structure(host(renderBiologyScoresActionSummary(sample.live,sample.waiting,sample.coherence)))).toEqual(structure(host(sample.html)));
  expect(sample).toEqual(before);
});
for(const sample of original.planners) it(`preserves lab planner content, bundles and progress: ${sample.name}`,()=>{
  const before=structuredClone(sample);
  expect(structure(host(renderBiologyScoreCoveragePlanner(sample.scores,sample.coherence)))).toEqual(structure(host(sample.html)));
  expect(sample).toEqual(before);
});
it('escapes labels, reasons and delegate ids without raw slots',()=>{
  const literal='<img src=x onerror=alert(1)>"<&';
  const checks=host(renderHTML({kind:'checks',rows:[{label:literal,text:literal,scoreId:literal}]}));
  expect(checks.querySelector('img,script,[onerror]')).toBeNull();
  expect(checks.querySelector('button')?.getAttribute('data-biology-score-id')).toBe(literal);
  const view=projectBiologyCoverage([],null);view.baselineIntro=literal;view.questions=[{label:literal,reason:literal}];view.bundles[0]!.markers=[{label:literal,title:literal}];
  const planner=host(renderHTML({kind:'coverage',view}));expect(planner.querySelector('img,script,[onerror]')).toBeNull();expect(planner.textContent).toContain(literal);
});
it('keeps the action projection and shared coverage model free of mutations',()=>{
  expect(projectBiologyNextChecks([],[])).toEqual([]);
  const view=projectBiologyCoverage([],null);expect(view.progress).toBe(0);expect(view.priority).toBeNull();expect(view.bundles).toHaveLength(3);
});
it('removes superseded planning templates and owned native styles',()=>{
  const source=readFileSync('js/biology-score-render.ts','utf8');
  expect(source).not.toContain('function renderCoverageBundle');expect(source).not.toContain('function renderCoverageMarkerList');
  expect(source.slice(source.indexOf('export function renderBiologyScoresActionSummary'),source.indexOf('export function renderBiologyScoresLens'))).not.toContain('`<');
  expect(readFileSync('css/dashboard-widgets.base.css','utf8')).not.toMatch(/\.biology-(?:planning-card|next-checks|coverage-|score-(?:action-summary|coverage))/);
  for(const name of ['BiologyPlanningCard','BiologyNextChecks','BiologyCoverageBundle','BiologyCoveragePlanner','BiologyPlanningPresentation']) expect(readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
});

it('scopes planning utilities without a reset or priority overrides',async()=>{
  const css=readFileSync('css/dashboard-widgets.css','utf8');
  const basePath=path.resolve('css/dashboard-widgets.base.css');
  const compiled=await compileDashboardLabMarkerWidgetStyles(readFileSync(basePath,'utf8'),basePath,process.cwd());
  expect(css).toContain(compiled.css.trimEnd());
  postcss.parse(readFileSync('css/dashboard-widgets.base.css','utf8')).walkRules(rule=>{expect(rule.selector.trim()).not.toBe('');});
  const scoped:string[]=[];postcss.parse(css).walkRules(rule=>{for(const selector of rule.selectors)if(selector.includes('.gb\\:plan-ui'))scoped.push(selector);});
  expect(scoped.length).toBeGreaterThan(80);expect(scoped.every(selector=>selector.includes(':is([data-biology-planning-view],[data-biology-planning-view] *)'))).toBe(true);
  expect(css.slice(css.indexOf('/*! tailwindcss'))).not.toContain('!important');
});
