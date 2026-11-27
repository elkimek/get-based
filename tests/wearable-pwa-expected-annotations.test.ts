import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expectedWearablePwaRaw} from './helpers/wearable-pwa-expected-annotations.js';
import {normalizeWearableTree} from './helpers/wearable-genuine-dom.js';
import {wearableDetailBodyReceipt} from './helpers/wearable-detail-pwa-receipt.js';
import fixture from './fixtures/wearable-pwa-first-weight-body.json' with {type:'json'};
function body(raw:string){const dom=new JSDOM('<main></main>');try{const root=dom.window.document.querySelector('main')!;for(const [namespace,name,value]of fixture.rootAttributes){expect(namespace).toBe(null);root.setAttribute(name!,value!);}root.innerHTML=raw;return wearableDetailBodyReceipt(root);}finally{dom.window.close();}}
it('qualifies actual captured first Weight raw with pristine genuine SSR, preserving every original noncomment byte',()=>{
 const expected=expectedWearablePwaRaw(fixture.originalRaw);expect(expected).toBe(fixture.actualCapturedRaw);expect(expected).not.toBe(fixture.originalRaw);
 const native=body(fixture.originalRaw),actual=body(fixture.actualCapturedRaw),nativeBefore=JSON.stringify(native),actualBefore=JSON.stringify(actual);
 expect(normalizeWearableTree(structuredClone(actual))).toEqual(normalizeWearableTree(structuredClone(native)));
 expect(JSON.stringify(actual)).toBe(actualBefore);expect(JSON.stringify(native)).toBe(nativeBefore);
});
it.each([
 ['text',(raw:string)=>raw.replace('<h3>Weight','<h3>Changed')],
 ['attribute',(raw:string)=>raw.replace('data-wearable-range="90d"','data-wearable-range="other"')],
 ['missing node',(raw:string)=>raw.replace('<h3>Weight<!--[-1--><!--]--></h3>','')],
 ['unknown comment',(raw:string)=>raw+'<!--[99-->'],
 ['extra known comment',(raw:string)=>raw+'<!--[-->'],
 ['moved known comment',(raw:string)=>raw.slice('<!--[-->'.length)+'<!--[-->'],
 ['known comment value',(raw:string)=>raw.replace('<!--[-->','<!--[20-->')],
 ['whitespace',(raw:string)=>raw.replace('\n    <h3>','\n<h3>')],
] as const)('retains exact actual raw rejection for %s corruption, including inert SDK-looking extras',(_name,change)=>{
 const expected=expectedWearablePwaRaw(fixture.originalRaw),changed=change(fixture.actualCapturedRaw);expect(changed).not.toBe(fixture.actualCapturedRaw);expect(()=>expect(changed).toBe(expected)).toThrow();
});
it.each([
 ['text',(raw:string)=>raw.replace('<h3>Weight','<h3>Changed')],
 ['attribute',(raw:string)=>raw.replace('data-wearable-range="90d"','data-wearable-range="other"')],
 ['missing node',(raw:string)=>raw.replace('<h3>Weight<!--[-1--><!--]--></h3>','')],
 ['unknown comment',(raw:string)=>raw+'<!--[99-->'],
 ['whitespace',(raw:string)=>raw.replace('\n    <h3>','\n<h3>')],
] as const)('keeps complete normalized body/action/input comparison sensitive to %s',(_name,change)=>{
 expect(normalizeWearableTree(structuredClone(body(change(fixture.actualCapturedRaw))))).not.toEqual(normalizeWearableTree(structuredClone(body(fixture.originalRaw))));
});
it('binds exact historical observations and calendar-adjusted native receipts to the shipping PWA comparison', () => {
  const normalizer = readFileSync(new URL('./helpers/wearable-genuine-dom.ts', import.meta.url));
  expect(createHash('sha256').update(normalizer).digest('hex')).toBe('cc2fa6467b738887eabfe91de7e79905fb4e04de7f6c2fadc3f9f383845c7054');
  const reference = readFileSync(new URL('./helpers/wearable-chart-reference.ts', import.meta.url), 'utf8');
  for (const guard of [
    "assert.deepEqual(nonChart,oldNonChart,'Exact complete historical original non-chart receipt')",
    "assert.deepEqual(chart.rawNativeConfiguration,history.oracle.chartStates[receipt.profileState+'/'+receipt.name])",
    'const restore=await applyWindowPresentation(target,actualArtifact.state,calendarView(receipt.profileState,receipt.name))',
    'const correctedChart=await target.evaluate(wearableActualChartReceipt,actualArtifact.state)',
    'correctedStates[key]={chart:correctedChart,body:await modal.evaluate(wearableDetailBodyReceipt),raw:await modal.evaluate(el=>el.innerHTML)}',
    "assert.deepEqual(restored,chart,'Complete same-browser historic chart restored')",
    "assert.equal(await target.locator('#detail-modal').evaluate(el=>el.innerHTML),receipt.raw,'Complete historic modal restored')",
    'assertWearableChartFrame(expected,actual)',
  ]) expect(reference).toContain(guard);

  const source = readFileSync(new URL('./pwa/sveltekit-wearable-detail.spec.ts', import.meta.url), 'utf8');
  for (const guard of [
    "const phaseKey='phase-'+currentPhase+'/'+profileState+'/'+name;const amended=reference.correctedStates[phaseKey]!",
    'normalizeWearableTree(structuredClone(await modal.evaluate(wearableDetailBodyReceipt)))).toEqual(normalizeWearableTree(structuredClone(amended.body)))',
    'expect(normalizeWearableTree(structuredClone(receipt.body))).toEqual(normalizeWearableTree(structuredClone(amended.body)))',
    'expect(receipt.raw).toBe(expectedWearablePwaRaw(amended.raw))',
    'const originalExpected=chartQualification.qualify(amended.chart!) as ChartReceipt',
    'const pairedPaint=await reference.compare(page,phaseKey,chart,artifact.state,wearableActualChartReceipt)',
    'expect(chart).toEqual({...originalExpected,datasetMetadata:referenceFrame.datasetMetadata,paint:pairedPaint})',
    'expect(events).toEqual(oracle.eventChronology)', 'expect(events).toEqual(reference.eventChronology)',
    'expect(reference.eventChronology).toEqual(reference.expectedEventChronology)',
    'expect(receipt.profile).toEqual(qualifyWearableManualProfile(native.rawStates',
    'expect(receipt.device).toEqual(qualifyWearableManualDevice(native.rawStates',
    'expect(actualProfile).toEqual(oracle.profileStates',
    'expect(chart.rawNativeConfiguration).toEqual(chartQualification.qualify(amended.chart!.rawNativeConfiguration))',
    'expect({cases:chart.nativeCallbackCases,outputs:chart.nativeCallbackOutputs}).toEqual({cases:amended.chart!.nativeCallbackCases,outputs:amended.chart!.nativeCallbackOutputs})',
    "expect(createHash('sha256').update(bytes).digest('hex')).toBe(input.identity.sha256)",
  ]) expect(source).toContain(guard);
});
