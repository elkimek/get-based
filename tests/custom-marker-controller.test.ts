// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {configureMarkerDetailCustomMarkers,openCreateMarkerModal,pickNewCatIcon,saveCustomMarker} from '../js/marker-detail-custom-markers.js';
import {installMarkerDetailActionDelegates} from '../js/marker-detail-actions.js';
interface Profile {entries:unknown[];customMarkers:Record<string,unknown>;refOverrides:Record<string,unknown>;sentinel:string}
const fixture=vi.hoisted(()=>({profile:{entries:[],customMarkers:{},refOverrides:{},sentinel:'protected'} as Profile,
  registry:{} as Record<string,unknown>,calls:[] as unknown[][],
  categories:{biochemistry:{label:'Biochemistry',markers:{}}} as Record<string,{label:string;markers:Record<string,unknown>}>}));
vi.mock('../js/state.js',()=>({state:{get importedData(){return fixture.profile;},get markerRegistry(){return fixture.registry;}}}));
vi.mock('../js/data.js',()=>({getActiveData:()=>({categories:fixture.categories}),saveImportedData:()=>fixture.calls.push(['save',structuredClone(fixture.profile)]),updateHeaderDates:()=>fixture.calls.push(['dates'])}));
vi.mock('../js/custom-marker-identity.js',()=>({createCustomMarkerId:()=> 'custom-marker-fixture-uuid'}));
vi.mock('../js/marker-detail-runtime.js',()=>({buildMarkerDetailSidebarRuntime:()=>fixture.calls.push(['sidebar']),openWithMarkerDetailStylesheet:(callback:()=>unknown)=>callback(),setDetailModalShell:(...classes:string[])=>{const modal=document.getElementById('detail-modal');if(modal)modal.className=['modal',...classes].join(' ');return modal;}}));
vi.mock('../js/modal-lifecycle.js',()=>({openModalOverlay:(overlay:Element,options:unknown)=>fixture.calls.push(['open',overlay.id,options])}));
vi.mock('../js/utils.js',async importActual=>{
  const actual=await importActual<typeof import('../js/utils.js')>();
  return {...actual,showNotification:(...args:unknown[])=>fixture.calls.push(['notification',...args]),showConfirmDialog:()=>false};
});
function input(id:string,value:string){const node=document.getElementById(id);if(!(node instanceof HTMLInputElement || node instanceof HTMLSelectElement))throw new Error('Missing native input');node.value=value;}
beforeEach(()=>{vi.useFakeTimers();fixture.profile={entries:[{date:'2001-01-02',markers:{unchanged:4}}],customMarkers:{},refOverrides:{},sentinel:'protected'};fixture.registry={};fixture.calls=[];fixture.categories={biochemistry:{label:'Biochemistry',markers:{}}};document.body.innerHTML='<div id="modal-overlay"><div id="detail-modal"></div></div>';configureMarkerDetailCustomMarkers({closeModal:()=>fixture.calls.push(['close']),openManualEntryForm:(id:string)=>fixture.calls.push(['manual',id])});openCreateMarkerModal();fixture.calls=[];});
afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
describe('custom marker public controller',()=>{
  it('opens the real native form with unchanged shell and focus contract',()=>{openCreateMarkerModal();expect(document.getElementById('detail-modal')?.className).toBe('modal gb-form-modal marker-form-modal');expect(fixture.calls).toEqual([['open','modal-overlay',{initialFocus:'#cm-name',focusDelay:50}]]);expect(document.querySelector('#cm-name')?.hasAttribute('autofocus')).toBe(true);expect(document.querySelector('#cm-new-cat-row')?.getAttribute('style')).toBe('display:none');});
  it.each([['','Please enter a marker name'],['!!!','Could not generate a valid key from marker name']])('keeps invalid name %s nonmutating',(name,message)=>{const before=structuredClone(fixture.profile);input('cm-name',name);saveCustomMarker();expect(fixture.profile).toEqual(before);expect(fixture.registry).toEqual({});expect(fixture.calls).toEqual([['notification',message,'error']]);vi.runAllTimers();expect(fixture.calls).toHaveLength(1);});
  it('keeps duplicate marker rejection and protected profile exact',()=>{fixture.categories.biochemistry!.markers={glucose:{name:'Glucose'}};input('cm-name','Glucose');const before=structuredClone(fixture.profile);saveCustomMarker();expect(fixture.profile).toEqual(before);expect(fixture.calls).toEqual([['notification','A marker with this name already exists in that category','error']]);});
  it('creates a marker with exact range/registry state before its delayed manual entry',()=>{
    input('cm-name',' Acetoacetic Acid ');input('cm-unit',' mmol/L ');input('cm-ref-min','1.25');input('cm-ref-max','9');input('cm-opt-min','2');input('cm-opt-max','7');saveCustomMarker();
    const expected={entries:[{date:'2001-01-02',markers:{unchanged:4}}],customMarkers:{'biochemistry.acetoaceticAcid':{markerId:'custom-marker-fixture-uuid',name:'Acetoacetic Acid',unit:'mmol/L',refMin:1.25,refMax:9,categoryLabel:'Biochemistry'}},refOverrides:{'biochemistry.acetoaceticAcid':{optimalMin:2,optimalMax:7}},sentinel:'protected'};
    expect(fixture.profile).toEqual(expected);expect(fixture.registry).toEqual({biochemistry_acetoaceticAcid:{name:'Acetoacetic Acid',unit:'mmol/L',refMin:1.25,refMax:9,custom:true}});
    expect(fixture.calls).toEqual([['save',expected],['sidebar'],['close'],['notification','Created "Acetoacetic Acid" in Biochemistry','success']]);vi.advanceTimersByTime(99);expect(fixture.calls).toHaveLength(4);vi.advanceTimersByTime(1);expect(fixture.calls[4]).toEqual(['manual','biochemistry_acetoaceticAcid']);
  });
  it('keeps the real category-change delegate in charge of inline display',()=>{
    installMarkerDetailActionDelegates({},document);
    const select=document.getElementById('cm-category');if(!(select instanceof HTMLSelectElement))throw new Error('Missing category select');
    select.value='__new__';select.dispatchEvent(new Event('change',{bubbles:true}));expect(document.querySelector('#cm-new-cat-row')?.getAttribute('style')).toBe('display: flex;');
    select.value='biochemistry';select.dispatchEvent(new Event('change',{bubbles:true}));expect(document.querySelector('#cm-new-cat-row')?.getAttribute('style')).toBe('display: none;');
  });
  it('preserves emoji callback, blank new-category rejection, and custom category icon',()=>{
    let choose:((emoji?:unknown)=>void)|undefined;configureMarkerDetailCustomMarkers({showEmojiPicker:(_element:Element,callback:(emoji?:unknown)=>void)=>{choose=callback;}});
    const icon=document.getElementById('cm-new-cat-icon');if(!icon)throw new Error('Missing icon');pickNewCatIcon(icon);choose?.(null);expect(icon.textContent).toBe('🔖');expect(icon.dataset.custom).toBe('');choose?.('🧪');expect(icon.dataset.custom).toBe('1');
    input('cm-category','__new__');input('cm-name',' Test Marker ');saveCustomMarker();expect(fixture.calls).toEqual([['notification','Please enter a category name','error']]);expect(fixture.profile.customMarkers).toEqual({});fixture.calls=[];
    input('cm-new-cat',' 123 Tests ');saveCustomMarker();expect(fixture.profile.customMarkers).toEqual({'custom123Tests.testMarker':{markerId:'custom-marker-fixture-uuid',name:'Test Marker',unit:'',refMin:null,refMax:null,categoryLabel:'123 Tests',icon:'🧪'}});
  });
});
