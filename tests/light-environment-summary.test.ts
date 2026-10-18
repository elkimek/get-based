import{nativeBurdenView,expectedGenuineLightChildren,genuineLightChildReceipts}from'./helpers/light-genuine-child-native-receipts.js';
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { configureLightEnv, renderEnvironmentAssessmentSummary, renderEnvironmentSection, computeIndoorBurden } from '../js/light-env.js';
import { renderHTML } from '../js/components/LightEnvironmentSummary.svelte.html.js';
import type { EnvironmentSummaryView } from '../js/light-environment-summary-presentation.js';
interface Sample { name:string;data:unknown;expanded:boolean;callbacks:boolean;embedded:boolean;section:string;summary:string }
const original=JSON.parse(readFileSync('tests/fixtures/light-environment-room-original.json','utf8')) as {now:number;cases:Sample[]};
const saved=state.importedData;
let prior:Record<string,unknown>;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(original.now);localStorage.clear();prior=configureLightEnv({getMeasurementsForRoom:null,getBurdenInterpretationView:null,getMeasurementAIView:null,getRoomAIView:null,getScreenAIView:null});});
afterEach(()=>{configureLightEnv(prior);state.importedData=saved;vi.useRealTimers();});
function describe(html:string,selector:string){
  const host=document.createElement('div');host.innerHTML=html;const root=host.querySelector(selector)!;
  const copy=(selectors:string)=>[...root.querySelectorAll(selectors)].map(element=>element.textContent?.replace(/\s+/g,' ').trim());
  return {state:[...root.classList].filter(name=>/^light-env-(?:assessment-summary|summary)-(?:green|orange|red|incomplete)$/.test(name)),
    header:copy('.light-env-summary-kicker,.light-env-assessment-tier,.light-env-assessment-parts,.light-env-summary-tier,.light-env-summary-parts'),
    lead:copy('.light-env-assessment-lead,.light-env-summary-interp'),
    metrics:[...root.querySelectorAll('.light-env-assessment-metric')].map(metric=>[...metric.children].map(element=>element.textContent)),
    actions:[...root.querySelectorAll('button')].map(button=>({action:button.dataset.lightEnvAction,text:button.textContent,primary:button.classList.contains('dashboard-action-btn-primary')})),
    trusted:genuineLightChildReceipts(root)};
}
for(const sample of original.cases)it(`preserves independent assessment and load summary: ${sample.name}`,()=>{
  (state as {importedData:unknown}).importedData=structuredClone(sample.data);
  configureLightEnv({getMeasurementsForRoom:(id:unknown)=>(state.importedData?.lightMeasurements||[]).filter(m=>m.roomId===id),getBurdenInterpretationView:sample.callbacks?()=>nativeBurdenView():null});
  const before=JSON.stringify(state.importedData);
  expect(describe(renderEnvironmentAssessmentSummary(),'.light-env-assessment-summary')).toEqual(describe(sample.summary,'.light-env-assessment-summary'));
  expect(describe(renderEnvironmentSection({embedded:sample.embedded}),'.light-env-summary')).toEqual(describe(expectedGenuineLightChildren(sample.section),'.light-env-summary'));
  expect(JSON.stringify(state.importedData)).toBe(before);
});
for(const result of [undefined,null])it(`preserves trusted callback coercion for ${String(result)} and live model authority`,()=>{
  (state as {importedData:unknown}).importedData={lightEnvironment:{rooms:[],screens:[]},lightMeasurements:[],lightAudits:[]};
  const burden=computeIndoorBurden(),callback=vi.fn(()=>result);configureLightEnv({getBurdenInterpretationView:callback});
  const html=renderEnvironmentSection({embedded:true});expect(callback).toHaveBeenCalledExactlyOnceWith(burden);
  const root=document.createElement('div');root.innerHTML=html;const summary=root.querySelector('.light-env-summary')!;
  expect(summary.classList.contains(`light-env-summary-${burden.color}`)).toBe(true);
  expect(summary.querySelector('.light-env-summary-tier')?.textContent).toBe(burden.label);
  expect(summary.querySelector('.light-env-summary-interp')?.textContent).toBe(burden.interp);expect(summary.querySelector('[data-light-review-ai]')).toBeNull();
});
it('escapes every literal summary field and metric while preserving action identity',()=>{
  const literal='<img src=x onerror=alert(1)> & "quoted"';
  const base={color:'green',label:literal,parts:[literal]};
  const views:EnvironmentSummaryView[]=[{...base,kind:'load',interp:literal,burden:null},{...base,kind:'assessment',lead:literal,actionLabel:literal,hasRooms:true,metrics:[{label:literal,value:literal,sub:literal}]}];
  for(const view of views){const root=document.createElement('div');root.innerHTML=renderHTML({view});expect(root.querySelector('img,script,[onerror]')).toBeNull();expect(root.textContent).toContain(literal);expect(root.querySelector('[data-light-environment-summary]')).not.toBeNull();}
  const root=document.createElement('div');root.innerHTML=renderHTML({view:views[1]!});expect([...root.querySelectorAll('button')].map(button=>[button.type,button.dataset.lightEnvAction])).toEqual([['button','open-assessment'],['button','open-assessment-save-audit']]);
});
it('removes superseded summary templates and native selectors while keeping a single explicit trusted slot',()=>{
  const adapter=readFileSync('js/light-env.ts','utf8'),css=readFileSync('css/light-env.base.css','utf8'),component=readFileSync('js/components/LightEnvironmentSummary.svelte','utf8');
  expect(adapter).not.toContain('return `<div class="light-env-assessment-summary');expect(adapter).not.toContain('return `<div class="light-env-summary');
  expect(css).not.toMatch(/\.light-env-assessment-(?:summary|metrics|metric|tier|parts|lead|status|actions)[\s.{:-]/);
  expect(css).not.toMatch(/\.light-env-summary(?:-|\s|\.)/);expect(component.match(/\{@html /g)).toBeNull();expect(component).toContain('<LightBurdenAI view={view.burden}/>');
});
