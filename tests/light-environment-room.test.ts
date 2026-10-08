// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {state} from '../js/state.js';
import {configureLightEnv,renderEnvironmentSection} from '../js/light-env.js';
import {environmentActionValue,formatEnvironmentMeasureValue,formatEnvironmentMeasureTime,environmentReadingIcon} from '../js/light-environment-room-presentation.js';
import type {EnvironmentMeasurementOperations} from '../types/light-env-view.js';
interface Sample{name:string;data:unknown;expanded:boolean;callbacks:boolean;embedded:boolean;section:string}
const original=JSON.parse(readFileSync('tests/fixtures/light-environment-room-original.json','utf8')) as {now:number;cases:Sample[]};
const saved=state.importedData;let previous:Record<string,unknown>;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(original.now);localStorage.clear();sessionStorage.clear();previous=configureLightEnv({getMeasurementsForRoom:null,renderBurdenInterp:null,renderMeasurementAIInline:null,renderRoomAIBlock:null,renderScreenAIBlock:null,navigate:null});});
afterEach(()=>{configureLightEnv(previous);state.importedData=saved;vi.useRealTimers();});
const clean=(value:string|null|undefined)=>value?.replace(/\s+/g,' ').trim();
function describe(html:string){
  const host=document.createElement('div');host.innerHTML=html;
  const attrs=(element:Element)=>Object.fromEntries([...element.attributes].filter(attr=>!['class','style','type'].includes(attr.name)).map(attr=>[attr.name,attr.value]));
  return {
    embedded:host.querySelector('.light-env-section')?.classList.contains('light-env-section-embedded'),headers:[...host.querySelectorAll('.light-env-head')].map(node=>clean(node.textContent)),
    rooms:[...host.querySelectorAll('.light-env-room-disclosure')].map(room=>{
      const disclosure=room.querySelector('[data-light-env-action="toggle-room-expanded"]')!;
      return {id:room.getAttribute('data-id'),state:[...room.classList].filter(name=>/^(?:expanded|light-env-card-skipped|light-env-card-sev-\w+)$/.test(name)).sort(),disclosure:{attrs:Object.fromEntries(Object.entries(attrs(disclosure)).filter(([name])=>!['role','tabindex'].includes(name))),role:disclosure.tagName==='BUTTON'?'button':disclosure.getAttribute('role'),tabIndex:(disclosure as HTMLElement).tabIndex},
        copy:[...room.querySelectorAll('.light-env-room-disclosure-name,.light-env-room-signal,.light-env-room-step-head,.light-env-room-empty,.light-env-picker-label,.light-env-picker-help,.light-env-reading-value,.light-env-reading-time')].map(node=>clean(node.textContent)),
        sourceReveal:room.querySelector('.light-env-picker-more')?.hasAttribute('open')};
    }),
    actions:[...host.querySelectorAll('[data-light-env-action]')].filter(element=>element.getAttribute('data-light-env-action')!=='toggle-room-expanded').map(element=>({tag:element.tagName,attrs:attrs(element),text:element.matches('button,summary')?clean(element.textContent):undefined})),
    fields:[...host.querySelectorAll('input,select')].map(element=>({attrs:attrs(element),options:[...element.querySelectorAll('option')].map(option=>({value:option.value,text:option.textContent,selected:option.hasAttribute('selected')}))})),
    chips:[...host.querySelectorAll('.light-env-chip')].map(element=>({text:element.textContent,active:element.getAttribute('aria-pressed'),selected:element.classList.contains('light-env-chip-active')})),
    trusted:[...host.querySelectorAll('[data-fixture-room-ai],[data-fixture-reading-ai],[data-fixture-burden]')].map(node=>node.outerHTML),
    empty:[...host.querySelectorAll('.light-env-empty-cta p')].map(node=>clean(node.textContent)),
    quickLabels:[...host.querySelectorAll('.light-env-quickpicks-label')].map(node=>node.textContent),
  };
}
for(const sample of original.cases)it(`preserves independent room and section controls: ${sample.name}`,()=>{
  (state as {importedData:unknown}).importedData=structuredClone(sample.data);
  const rooms=state.importedData?.lightEnvironment?.rooms||[];
  localStorage.setItem('labcharts-light-env-active-room',sample.expanded?String(rooms[0]?.id||''):'__none__');
  configureLightEnv({getMeasurementsForRoom:(id:unknown)=>(state.importedData?.lightMeasurements||[]).filter(m=>m.roomId===id),
    renderBurdenInterp:sample.callbacks?()=>'<div data-fixture-burden>Trusted burden verdict</div>':null,
    renderMeasurementAIInline:sample.callbacks?()=>'<span data-fixture-reading-ai>Trusted reading verdict</span>':null,
    renderRoomAIBlock:sample.callbacks?()=>'<div data-fixture-room-ai>Trusted room verdict</div>':null});
  const before=JSON.stringify(state.importedData),html=renderEnvironmentSection({embedded:sample.embedded});
  expect(describe(html)).toEqual(describe(sample.section));expect(JSON.stringify(state.importedData)).toBe(before);
  const host=document.createElement('div');host.innerHTML=html;
  expect(host.querySelector('button button,[role="button"] button')).toBeNull();
  for(const disclosure of host.querySelectorAll('[data-light-env-action="toggle-room-expanded"]'))expect(disclosure.tagName).toBe('BUTTON');
  expect(host.querySelector('img,script,[onerror]')).toBeNull();
});
it('preserves callback order, latest-per-tool identity and collapsed-room laziness',()=>{
  const calls:string[]=[],older={id:'older',roomId:'r',tool:'lux',value:5,capturedAt:1},latest={id:'latest',roomId:'r',tool:'lux',value:20,capturedAt:2};
  (state as {importedData:unknown}).importedData={lightEnvironment:{rooms:[{id:'r',name:'Bedroom'}],screens:[{id:'nested',roomId:'r',device:'phone'}]},lightMeasurements:[older,latest]};
  const measurement=vi.fn((item:EnvironmentMeasurementOperations)=>{calls.push(`reading:${(item as {id?:string}).id}`);return null;}),room=vi.fn(()=>{calls.push('room');return undefined;});
  configureLightEnv({getMeasurementsForRoom:()=>[older,latest],renderBurdenInterp:()=>{calls.push('burden');return '<p data-trusted>Configured burden</p>';},renderMeasurementAIInline:measurement,renderRoomAIBlock:room,renderScreenAIBlock:()=>{calls.push('screen');return '<p>Screen callback</p>';}});
  localStorage.setItem('labcharts-light-env-active-room','__none__');renderEnvironmentSection();expect(calls).toEqual(['burden']);expect(room).not.toHaveBeenCalled();expect(measurement).not.toHaveBeenCalled();
  localStorage.setItem('labcharts-light-env-active-room','r');calls.length=0;
  const html=renderEnvironmentSection();expect(calls).toEqual(['burden','reading:latest','room']);expect(measurement).toHaveBeenCalledExactlyOnceWith(latest);expect(room).toHaveBeenCalledExactlyOnceWith(state.importedData!.lightEnvironment!.rooms[0]);
  expect(html).toContain('null');expect(html).toContain('undefined');
});
it('escapes persisted fields and unsafe exact-hour values while preserving action omission',()=>{
  const literal='"><img src=x onerror=alert(1)> & literal';
  (state as {importedData:unknown}).importedData={lightEnvironment:{rooms:[{id:'room-literal',name:literal,hoursOccupiedPerDay:literal,primarySource:'__proto__'}],screens:[]},lightMeasurements:[]};
  const host=document.createElement('div');host.innerHTML=renderEnvironmentSection();expect(host.querySelector('img,script,[onerror]')).toBeNull();expect(host.querySelector('.light-env-room-disclosure-name')?.textContent).toBe(literal);
  expect(host.querySelector('[aria-label="Hours per day"]')?.getAttribute('value')).toBe(literal);
  expect([undefined,null,'',false,0,'safe'].map(environmentActionValue)).toEqual([undefined,undefined,undefined,undefined,'0','safe']);expect(environmentReadingIcon('__proto__')).toBe('·');
});
it('keeps measurement method distinctions and time boundaries independent of rendering',()=>{
  const value=(tool:string,value:number,extra?:EnvironmentMeasurementOperations['extra'])=>formatEnvironmentMeasureValue({tool,value,capturedAt:original.now,...(extra?{extra}:{})});
  expect(value('lux',1500,{source:'camera-estimate'})).toBe('~1,500 lux (camera estimate)');expect(value('lux',1500,{source:'AmbientLightSensor'})).toBe('1,500 lux');expect(value('lux',20)).toBe('20 lux (method unknown)');
  expect(value('darkness',.03,{method:'meter-entry'})).toBe('0.03 lux (meter)');expect(value('darkness',.03)).toBe('0.03 legacy value (method unknown)');expect(value('darkness',0,{method:'camera-relative',levelLabel:'Dark'})).toBe('Dark camera check');
  expect(value('flicker',-1)).toBeUndefined();expect(value('flicker',8)).toBe('strong banding');expect(value('cct',4260)).toBe('~4300 K (camera)');expect(value('brightness-proxy',1)).toBe('Relative brightness (camera comparison)');expect(value('glass-transmission',.56)).toBe('~56% camera-visible comparison');expect(value('audit',NaN,{rooms:{length:1}})).toBe('1 room snapshot');expect(value('custom',32)).toBe('32');
  expect([0,1,2,6,7,29].map(days=>formatEnvironmentMeasureTime(original.now-days*86400000))).toEqual(['today','yesterday','2d ago','6d ago','1w ago','4w ago']);
});
it('has one authored owner for room/section/modal templates with only named configured or audit slots',()=>{
  const adapter=readFileSync('js/light-env.ts','utf8'),room=readFileSync('js/components/LightEnvironmentRoom.svelte','utf8'),section=readFileSync('js/components/LightEnvironmentSection.svelte','utf8'),css=readFileSync('css/light-env.base.css','utf8');
  expect(adapter).not.toContain('let html =');expect(adapter).not.toContain('renderRoomExpandedBody');expect(adapter).not.toContain('renderSourcePicker');expect(adapter).not.toContain('overlay.innerHTML = `');
  expect(room.match(/\{@html /g)).toHaveLength(2);expect(room).toContain('{@html reading.trustedAIHTML}');expect(room).toContain('{@html body.trustedRoomHTML}');expect(section.match(/\{@html /g)).toHaveLength(1);expect(section).toContain('{@html view.trustedAuditsHTML}');expect(room).toContain('<LightEnvironmentScreen view={screen}/>');
  expect(css).toContain('.light-env-block-head');expect(css).not.toMatch(/\.light-env-(?:room-|picker|chip|quickpick|tool-pill|reading|assessment|section)/);
});
