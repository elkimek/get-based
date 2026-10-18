// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({unitReads:0,calls:[] as unknown[][],options:['mmol/L','mg/dL'] as unknown[],dotKey:'bio.glucose',markerPresent:true,
 profile:{entries:[{date:'2026-06-02',context:{sampleTime:'07:35',fasting:true}}],customMarkers:{'bio.glucose':{unit:'mmol/L'}}},registry:{} as Record<string,unknown>}));
vi.mock('../js/state.js',()=>({state:{unitSystem:'EU',get importedData(){return fixture.profile;},get markerRegistry(){return fixture.registry;}}}));
vi.mock('../js/data.js',()=>({getActiveData:()=>({categories:{bio:{label:'Biochemistry',markers:fixture.markerPresent?{glucose:{name:'Glucose',refMin:4,refMax:6,get unit(){fixture.unitReads++;return 'mmol/L';}},potassium:{name:'Potassium',refMin:3.5,refMax:5,unit:'mmol/L'}}:{}}}})}));
vi.mock('../js/marker-detail-runtime.js',()=>({openWithMarkerDetailStylesheet:(callback:()=>unknown)=>callback(),setDetailModalShell:(...classes:string[])=>{const modal=document.getElementById('detail-modal');if(modal)modal.className=['modal',...classes].join(' ');return modal;}}));
vi.mock('../js/marker-placement.js',()=>({getMarkerStorageDotKey:()=>fixture.dotKey}));
vi.mock('../js/unit-profiles.js',()=>({getMarkerInputUnits:(...args:unknown[])=>{fixture.calls.push(['units',...args]);return fixture.options;}}));
vi.mock('../js/modal-lifecycle.js',()=>({openModalOverlay:(overlay:Element,options:unknown)=>{overlay.classList.add('show');fixture.calls.push(['open',overlay.id,options]);}}));
vi.mock('../js/marker-detail-editing.js',()=>({saveManualEntry:(id:string)=>fixture.calls.push(['save',id])}));
const {openManualEntryForm,configureMarkerDetailManualEntry}=await import('../js/marker-detail-manual-entry.js');
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));fixture.unitReads=0;fixture.calls=[];fixture.options=['mmol/L','mg/dL'];fixture.dotKey='bio.glucose';fixture.markerPresent=true;fixture.registry={};sessionStorage.clear();document.body.innerHTML='<div id="modal-overlay"><div id="detail-modal"></div></div>';configureMarkerDetailManualEntry({showDetailModal:(id:string)=>fixture.calls.push(['detail',id])});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();document.body.innerHTML='';});
it('preserves native independent unit reads and original context/options/modal defaults without mutating profile data',()=>{
 const before=structuredClone(fixture.profile);openManualEntryForm('bio_glucose','2026-06-02');
 expect(fixture.unitReads).toBe(2);
 expect(fixture.calls).toEqual([['units','bio.glucose','EU','mmol/L'],['open','modal-overlay',{initialFocus:'#me-value',focusDelay:50}]]);
 expect(document.getElementById('detail-modal')?.className).toBe('modal gb-form-modal marker-form-modal');
 expect(document.querySelector('.modal-unit')?.textContent).toBe('Glucose · mmol/L · Reference: 4 – 6 mmol/L');
 expect(document.querySelector<HTMLInputElement>('#me-date')?.value).toBe('2026-06-02');
 expect(document.querySelector<HTMLInputElement>('#me-date')?.max).toBe('2026-10-15');
 expect(document.querySelector<HTMLInputElement>('#me-sample-time')?.value).toBe('07:35');
 expect(document.querySelector<HTMLSelectElement>('#me-fasting')?.value).toBe('fasting');
 expect(fixture.profile).toEqual(before);
});
it.each([['2026-01-02','2026-06-02','2026-01-02'],['bad','2026-06-02','2026-06-02'],[undefined,'bad','2026-10-15']] as const)('preserves explicit/session/today date fallback %#',(prefill,session,expected)=>{
 sessionStorage.setItem('labcharts-last-manual-date',session);openManualEntryForm('bio_glucose',prefill);
 expect(document.querySelector<HTMLInputElement>('#me-date')?.value).toBe(expected);
});
it.each(['me-value','me-date'])('saves from %s immediately and once per Enter before or after delayed focus',inputId=>{
 openManualEntryForm('bio_glucose','2026-06-02');fixture.calls=[];
 const input=document.getElementById(inputId)!;
 document.querySelector<HTMLInputElement>('#me-value')!.value='5.2';
 const immediate=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
 input.dispatchEvent(immediate);
 expect(immediate.defaultPrevented).toBe(true);
 expect(fixture.calls).toEqual([['save','bio_glucose']]);
 vi.advanceTimersByTime(50);
 const later=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
 input.dispatchEvent(later);
 expect(later.defaultPrevented).toBe(true);
 expect(fixture.calls).toEqual([['save','bio_glucose'],['save','bio_glucose']]);
});
it.each(['me-value','me-date'])('cancels from %s immediately before delayed focus',inputId=>{
 openManualEntryForm('bio_glucose','2026-06-02');fixture.calls=[];
 const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
 document.getElementById(inputId)!.dispatchEvent(escape);
 expect(escape.defaultPrevented).toBe(true);
 expect(fixture.calls).toEqual([['detail','bio_glucose']]);
});
it('updates collection context synchronously when the date changes',()=>{
 const before=structuredClone(fixture.profile);
 openManualEntryForm('bio_glucose','2026-06-02');fixture.calls=[];
 const date=document.querySelector<HTMLInputElement>('#me-date')!;
 date.value='2026-06-03';date.dispatchEvent(new Event('change',{bubbles:true}));
 expect(document.querySelector<HTMLInputElement>('#me-sample-time')?.value).toBe('');
 expect(document.querySelector<HTMLSelectElement>('#me-fasting')?.value).toBe('unknown');
 date.value='2026-06-02';date.dispatchEvent(new Event('change',{bubbles:true}));
 expect(document.querySelector<HTMLInputElement>('#me-sample-time')?.value).toBe('07:35');
 expect(document.querySelector<HTMLSelectElement>('#me-fasting')?.value).toBe('fasting');
 expect(fixture.calls).toEqual([]);expect(fixture.profile).toEqual(before);
});
it('ignores closed form controls before and after the delayed focus boundary',()=>{
 openManualEntryForm('bio_glucose','2026-06-02');fixture.calls=[];
 const value=document.querySelector<HTMLInputElement>('#me-value')!,date=document.querySelector<HTMLInputElement>('#me-date')!;
 document.getElementById('modal-overlay')!.classList.remove('show');
 for(const advance of [0,50]){
  if(advance)vi.advanceTimersByTime(advance);
  for(const input of [value,date]){
   const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
   input.dispatchEvent(enter);expect(enter.defaultPrevented).toBe(false);
  }
  date.value='2026-06-03';date.dispatchEvent(new Event('change',{bubbles:true}));
  expect(document.querySelector<HTMLInputElement>('#me-sample-time')?.value).toBe('07:35');
  expect(document.querySelector<HTMLSelectElement>('#me-fasting')?.value).toBe('fasting');
  expect(fixture.calls).toEqual([]);
 }
});
it('keeps replaced controls inert and never binds an old marker to the new form after 50ms',()=>{
 openManualEntryForm('bio_glucose','2026-06-02');
 const oldValue=document.querySelector<HTMLInputElement>('#me-value')!,oldDate=document.querySelector<HTMLInputElement>('#me-date')!;
 openManualEntryForm('bio_potassium','2026-06-03');fixture.calls=[];
 expect(oldValue.isConnected).toBe(false);expect(oldDate.isConnected).toBe(false);
 const staleEnter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
 oldValue.dispatchEvent(staleEnter);expect(staleEnter.defaultPrevented).toBe(false);
 oldDate.value='2026-06-02';oldDate.dispatchEvent(new Event('change',{bubbles:true}));
 expect(document.querySelector<HTMLInputElement>('#me-sample-time')?.value).toBe('');
 expect(document.querySelector<HTMLSelectElement>('#me-fasting')?.value).toBe('unknown');
 expect(fixture.calls).toEqual([]);
 vi.advanceTimersByTime(50);
 document.querySelector<HTMLInputElement>('#me-value')!.value='4.2';
 const currentEnter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
 document.querySelector<HTMLInputElement>('#me-value')!.dispatchEvent(currentEnter);
 expect(currentEnter.defaultPrevented).toBe(true);
 expect(fixture.calls).toEqual([['save','bio_potassium']]);
});
it('keeps missing marker and storage identity paths nonmutating',()=>{
 const before=structuredClone(fixture.profile);fixture.markerPresent=false;openManualEntryForm('bio_glucose');expect(document.getElementById('detail-modal')?.childNodes).toHaveLength(0);expect(fixture.calls).toEqual([]);
 fixture.markerPresent=true;fixture.dotKey='';openManualEntryForm('bio_glucose');expect(document.getElementById('detail-modal')?.childNodes).toHaveLength(0);expect(fixture.calls).toEqual([]);expect(fixture.profile).toEqual(before);
});
