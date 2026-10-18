import{nativeEnvironmentView,nativeBurdenView,expectedGenuineLightChildren,genuineLightChildReceipts}from'./helpers/light-genuine-child-native-receipts.js';
// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {state} from '../js/state.js';
import {closeLightEnvironmentAssessment,configureLightEnv,openLightEnvironmentAssessment,refreshLightEnvironmentAssessment,renderEnvironmentSection} from '../js/light-env.js';
import {environmentActionValue,formatEnvironmentMeasureValue,formatEnvironmentMeasureTime,environmentReadingIcon} from '../js/light-environment-room-presentation.js';
import type {EnvironmentMeasurementOperations} from '../types/light-env-view.js';
interface Sample{name:string;data:unknown;expanded:boolean;callbacks:boolean;embedded:boolean;section:string}
const original=JSON.parse(readFileSync('tests/fixtures/light-environment-room-original.json','utf8')) as {now:number;cases:Sample[]};
const saved=state.importedData;let previous:Record<string,unknown>;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(original.now);localStorage.clear();sessionStorage.clear();previous=configureLightEnv({getMeasurementsForRoom:null,getBurdenInterpretationView:null,getMeasurementAIView:null,getRoomAIView:null,getScreenAIView:null,navigate:null});});
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
    trusted:genuineLightChildReceipts(host),
    empty:[...host.querySelectorAll('.light-env-empty-cta p')].map(node=>clean(node.textContent)),
    quickLabels:[...host.querySelectorAll('.light-env-quickpicks-label')].map(node=>node.textContent),
  };
}
for(const sample of original.cases)it(`preserves independent room and section controls: ${sample.name}`,()=>{
  (state as {importedData:unknown}).importedData=structuredClone(sample.data);
  const rooms=state.importedData?.lightEnvironment?.rooms||[];
  localStorage.setItem('labcharts-light-env-active-room',sample.expanded?String(rooms[0]?.id||''):'__none__');
  configureLightEnv({getMeasurementsForRoom:(id:unknown)=>(state.importedData?.lightMeasurements||[]).filter(m=>m.roomId===id),
    getBurdenInterpretationView:sample.callbacks?()=>nativeBurdenView():null,
    getMeasurementAIView:sample.callbacks?()=>nativeEnvironmentView('measurement'):null,
    getRoomAIView:sample.callbacks?()=>nativeEnvironmentView('room'):null});
  const before=JSON.stringify(state.importedData),html=renderEnvironmentSection({embedded:sample.embedded});
  const expected=describe(expectedGenuineLightChildren(sample.section));
  // Audit cards now use a native sibling button. Keep the comparator and all
  // unrelated expectations exact; assert the old and new semantic contracts
  // explicitly rather than discarding role, tab order or action text globally.
  const blockIndex=expected.actions.findIndex(action=>action.attrs['data-light-env-action']==='set-audits-block-open');
  if(blockIndex!==-1){
    expect(expected.actions[blockIndex]).toEqual({tag:'DETAILS',attrs:{'data-light-env-action':'set-audits-block-open'},text:undefined});
    expected.actions[blockIndex]={tag:'BUTTON',attrs:{'aria-expanded':'false','data-light-env-action':'toggle-audits-block'},text:'Light audits'};
    const parsed=document.createElement('div');parsed.innerHTML=html;
    const block=parsed.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-audits-block"]')!;
    expect(block.type).toBe('button');expect(block.tabIndex).toBe(0);
    expect(parsed.querySelector('.light-audits-body')?.hasAttribute('hidden')).toBe(true);
  }
  const auditIndex=expected.actions.findIndex(action=>action.attrs['data-light-env-action']==='toggle-audit');
  if(auditIndex!==-1){
    const originalAction=expected.actions[auditIndex]!;
    expect(originalAction.tag).toBe('DIV');
    expect(originalAction.attrs['role']).toBe('button');
    expect(originalAction.attrs['tabindex']).toBe('0');
    expect(originalAction.text).toBeUndefined();
    const {role,tabindex,...nativeAttributes}=originalAction.attrs;
    expect([role,tabindex]).toEqual(['button','0']);
    expected.actions[auditIndex]={tag:'BUTTON',attrs:nativeAttributes,text:''};
    const parsed=document.createElement('div');parsed.innerHTML=html;
    const control=parsed.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-audit"]')!;
    expect(control.tagName).toBe('BUTTON');expect(control.type).toBe('button');expect(control.tabIndex).toBe(0);
    expect(control.closest('.light-audit-header')?.querySelectorAll('button')).toHaveLength(1);
    expect(control.querySelector('button,input,a')).toBeNull();
  }
  expect(describe(html)).toEqual(expected);expect(JSON.stringify(state.importedData)).toBe(before);
  const host=document.createElement('div');host.innerHTML=html;
  expect(host.querySelector('button button,[role="button"] button')).toBeNull();
  for(const disclosure of host.querySelectorAll('[data-light-env-action="toggle-room-expanded"]'))expect(disclosure.tagName).toBe('BUTTON');
  expect(host.querySelector('img,script,[onerror]')).toBeNull();
});
it('preserves callback order, latest-per-tool identity and collapsed-room laziness',()=>{
  const calls:string[]=[],older={id:'older',roomId:'r',tool:'lux',value:5,capturedAt:1},latest={id:'latest',roomId:'r',tool:'lux',value:20,capturedAt:2};
  (state as {importedData:unknown}).importedData={lightEnvironment:{rooms:[{id:'r',name:'Bedroom'}],screens:[{id:'nested',roomId:'r',device:'phone'}]},lightMeasurements:[older,latest]};
  const measurement=vi.fn((item:EnvironmentMeasurementOperations)=>{calls.push(`reading:${(item as {id?:string}).id}`);return null;}),room=vi.fn(()=>{calls.push('room');return undefined;});
  configureLightEnv({getMeasurementsForRoom:()=>[older,latest],getBurdenInterpretationView:()=>{calls.push('burden');return nativeBurdenView();},getMeasurementAIView:measurement,getRoomAIView:room,getScreenAIView:()=>{calls.push('screen');return nativeEnvironmentView('screen');}});
  localStorage.setItem('labcharts-light-env-active-room','__none__');renderEnvironmentSection();expect(calls).toEqual(['burden']);expect(room).not.toHaveBeenCalled();expect(measurement).not.toHaveBeenCalled();
  localStorage.setItem('labcharts-light-env-active-room','r');calls.length=0;
  const html=renderEnvironmentSection();expect(calls).toEqual(['burden','reading:latest','room']);expect(measurement).toHaveBeenCalledExactlyOnceWith(latest);expect(room).toHaveBeenCalledExactlyOnceWith(state.importedData!.lightEnvironment!.rooms[0]);
  const host=document.createElement('div');host.innerHTML=html;expect(host.querySelectorAll('[data-light-environment-ai]')).toHaveLength(0);expect(host.querySelector('[data-light-review-ai]')?.textContent).toBe('Trusted burden verdict');
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
it('has one authored owner for room/section/modal templates with only named configured slots and typed audit composition',()=>{
  const adapter=readFileSync('js/light-env.ts','utf8'),room=readFileSync('js/components/LightEnvironmentRoom.svelte','utf8'),section=readFileSync('js/components/LightEnvironmentSection.svelte','utf8'),css=readFileSync('css/light-env.base.css','utf8');
  expect(adapter).not.toContain('let html =');expect(adapter).not.toContain('renderRoomExpandedBody');expect(adapter).not.toContain('renderSourcePicker');expect(adapter).not.toContain('overlay.innerHTML = `');
  expect(room.match(/\{@html /g)).toBeNull();expect(room).toContain('<LightEnvironmentAI view={reading.ai}/>');expect(room).toContain('<LightEnvironmentAI view={body.ai}/>');expect(section.match(/\{@html /g)).toBeNull();expect(section).toContain('<LightAuditBlock view={view.audits}/>');expect(section).not.toContain('trustedAuditsHTML');expect(room).toContain('<LightEnvironmentScreen view={screen}/>');
  expect(css).not.toContain('.light-env-block-head');expect(css).not.toContain('.light-audit');expect(css).toContain('.dashboard-widget[data-widget-id="light-environment"]');expect(css).not.toMatch(/\.light-env-(?:room-|picker|chip|quickpick|tool-pill|reading|assessment|section)/);
});


function assessmentFocusFixture() {
  const profile = state.currentProfile;
  const room = {id: 'room"[focus]\\entity', name: 'Bedroom', primarySource: 'led-cool'};
  state.currentProfile = 'light-assessment-focus';
  (state as {importedData: unknown}).importedData = {
    lightEnvironment: {rooms: [room], screens: []}, lightMeasurements: [], lightAudits: [],
  };
  localStorage.setItem('labcharts-light-env-active-room', room.id);
  openLightEnvironmentAssessment();
  const overlay = document.getElementById('light-env-assessment-overlay')!;
  return {room, overlay, close() {closeLightEnvironmentAssessment(); state.currentProfile = profile;}};
}

it('retains native room disclosure focus across real assessment refresh without scrolling', () => {
  const fixture = assessmentFocusFixture();
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  try {
    const original = fixture.overlay.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-room-expanded"]')!;
    expect(original.getAttribute('data-light-env-id')).toBe(fixture.room.id);
    original.focus();
    refreshLightEnvironmentAssessment();
    const replacement = fixture.overlay.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-room-expanded"]')!;
    expect(original.isConnected).toBe(false);
    expect(replacement).not.toBe(original);
    expect(document.activeElement).toBe(replacement);
    expect(focus).toHaveBeenLastCalledWith({preventScroll: true});
    expect(replacement.getAttribute('aria-expanded')).toBe('true');
  } finally {focus.mockRestore(); fixture.close();}
});

it('retains supported input selection while rendering the current model value', () => {
  const fixture = assessmentFocusFixture();
  try {
    const original = fixture.overlay.querySelector<HTMLInputElement>('[data-light-env-action="update-room-name"]')!;
    original.focus(); original.value = 'DOM-only draft'; original.setSelectionRange(2, 7, 'backward');
    fixture.room.name = 'Newest saved room';
    refreshLightEnvironmentAssessment();
    const replacement = fixture.overlay.querySelector<HTMLInputElement>('[data-light-env-action="update-room-name"]')!;
    expect(document.activeElement).toBe(replacement);
    expect(replacement.value).toBe('Newest saved room');
    expect([replacement.selectionStart, replacement.selectionEnd, replacement.selectionDirection]).toEqual([2, 7, 'backward']);
    expect(fixture.room.name).toBe('Newest saved room');
  } finally {fixture.close();}
});

it.each(['profile', 'data', 'removed room'] as const)('does not restore a retired control after changing %s before refresh', reason => {
  const fixture = assessmentFocusFixture();
  try {
    const original = fixture.overlay.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-room-expanded"]')!;
    original.focus();
    if (reason === 'profile') state.currentProfile = 'another-profile';
    if (reason === 'data') state.importedData = structuredClone(state.importedData);
    if (reason === 'removed room') state.importedData!.lightEnvironment!.rooms = [];
    refreshLightEnvironmentAssessment();
    expect(original.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  } finally {fixture.close();}
});

it('does not take focus moved to another owner while rendering the assessment', () => {
  const fixture = assessmentFocusFixture(), outside = document.createElement('input');
  document.body.appendChild(outside);
  try {
    fixture.overlay.querySelector<HTMLButtonElement>('[data-light-env-action="toggle-room-expanded"]')!.focus();
    configureLightEnv({getRoomAIView: () => {outside.focus(); return null;}});
    refreshLightEnvironmentAssessment();
    expect(document.activeElement).toBe(outside);
  } finally {fixture.close(); outside.remove();}
});
