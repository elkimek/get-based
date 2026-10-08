// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {describeAuditComparison} from './helpers/light-audit-comparison-contract.js';
import {auditComparisonArrow} from '../js/light-audit-presentation.js';
interface Sample {name:string;audits:{id:string}[];provider:boolean;html:string;calls:unknown[];prompt:string}
const original=JSON.parse(readFileSync('tests/fixtures/light-audit-compare-original.json','utf8')) as {cases:Sample[]};
for(const sample of original.cases)it(`preserves comparison and exact AI handoff: ${sample.name}`,async()=>{
  vi.resetModules();
  const {state}=await import('../js/state.js'),api=await import('../js/light-env-audits.js');
  const {computeRoomSeverityForRoom}=await import('../js/light-env-model.js');
  (state as {importedData:unknown}).importedData={lightAudits:structuredClone(sample.audits)};
  const calls:unknown[]=[],prompts:string[]=[];
  api.configureLightEnvAudits({computeRoomSeverity:(room:Parameters<typeof computeRoomSeverityForRoom>[0],measurements:Parameters<typeof computeRoomSeverityForRoom>[1],options:{screens:unknown;isActiveToday:()=>boolean})=>{
    calls.push({room:room?.id,screens:structuredClone(options.screens),active:options.isActiveToday()});
    return computeRoomSeverityForRoom(room,measurements,options as Parameters<typeof computeRoomSeverityForRoom>[2]);
  },hasAIProvider:()=>sample.provider,refreshLightEnvironmentUI:()=>{},openChatPanel:(prompt:string)=>prompts.push(prompt)});
  api.toggleLightAuditCompare();const before=JSON.stringify(state.importedData);
  const host=document.createElement('div');host.innerHTML=api.renderLightAuditsBlock();
  const reference=document.createElement('div');reference.innerHTML=sample.html;
  expect(describeAuditComparison(host)).toEqual(describeAuditComparison(reference));
  expect(calls).toEqual(sample.calls);
  expect(host.querySelector('img,script,[onerror],button button,[role="button"] button')).toBeNull();
  api.interpretLightAuditCompare(sample.audits[0]!.id,sample.audits[1]!.id);
  expect(prompts).toEqual([sample.prompt]);expect(JSON.stringify(state.importedData)).toBe(before);
  const block=host.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-audits-block"]')!;
  expect(block.type).toBe('button');expect(block.tabIndex).toBe(0);expect(block.getAttribute('aria-expanded')).toBe('true');
  api.setLightAuditsBlockOpen(false);
  const collapsed=document.createElement('div');collapsed.innerHTML=api.renderLightAuditsBlock();
  expect(collapsed.querySelector('[data-light-env-action="toggle-audits-block"]')?.getAttribute('aria-expanded')).toBe('false');
  expect(collapsed.querySelector('.light-audits-body')?.hasAttribute('hidden')).toBe(true);
  api.toggleLightAuditsBlock();expect(api.readLightAuditsView().open).toBe(true);
});
it('preserves directional classification without treating brightness as universally better',()=>{
  expect([-1,0,1].map(delta=>auditComparisonArrow(delta,'lower'))).toEqual([{glyph:'↓',tone:'good'},{glyph:'=',tone:'neutral'},{glyph:'↑',tone:'bad'}]);
  expect([-1,0,1].map(delta=>auditComparisonArrow(delta,'higher'))).toEqual([{glyph:'↓',tone:'bad'},{glyph:'=',tone:'neutral'},{glyph:'↑',tone:'good'}]);
  expect([-1,0,1].map(delta=>auditComparisonArrow(delta,'depends'))).toEqual([{glyph:'↓',tone:'neutral'},{glyph:'=',tone:'neutral'},{glyph:'↑',tone:'neutral'}]);
});

for(const explicitFocus of [false,true])it(`preserves block focus without stealing a new focus target: ${explicitFocus}`,async()=>{
  vi.resetModules();
  const {state}=await import('../js/state.js'),api=await import('../js/light-env-audits.js');
  const {installLightEnvActionDelegates}=await import('../js/light-env-actions.js');
  (state as {importedData:unknown}).importedData={lightAudits:[]};
  const host=document.createElement('div'),other=document.createElement('input');document.body.append(host,other);
  const render=()=>{host.innerHTML=api.renderLightAuditsBlock();};
  try{
    api.configureLightEnvAudits({refreshLightEnvironmentUI:()=>{render();if(explicitFocus)other.focus();}});
    render();installLightEnvActionDelegates(api.lightEnvAuditActionHandlers,host);
    const button=host.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-audits-block"]')!;
    button.focus();button.click();
    const replacement=host.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-audits-block"]')!;
    expect(replacement.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(explicitFocus?other:replacement);
  }finally{host.remove();other.remove();}
});
