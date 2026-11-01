// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {configureMarkerDetailCustomMarkers,openCreateMarkerModal,pickNewCatIcon,saveCustomMarker} from '../js/marker-detail-custom-markers.js';
import {installMarkerDetailActionDelegates} from '../js/marker-detail-actions.js';
interface Profile {entries:unknown[];customMarkers:Record<string,unknown>;refOverrides:Record<string,unknown>;sentinel:string}
const fixture=vi.hoisted(()=>({commit:vi.fn(),currentProfile:'synthetic-profile',profile:{entries:[],customMarkers:{},refOverrides:{},sentinel:'protected'} as Profile,
  registry:{} as Record<string,unknown>,calls:[] as unknown[][],
  categories:{biochemistry:{label:'Biochemistry',markers:{}}} as Record<string,{label:string;markers:Record<string,unknown>}>}));
vi.mock('../js/state.js',()=>({state:{get currentProfile(){return fixture.currentProfile;},get importedData(){return fixture.profile;},get markerRegistry(){return fixture.registry;}}}));
vi.mock('../js/data.js',()=>({getActiveData:()=>({categories:fixture.categories}),saveImportedData:()=>fixture.calls.push(['save',structuredClone(fixture.profile)]),updateHeaderDates:()=>fixture.calls.push(['dates'])}));
vi.mock('../js/custom-marker-store.js',()=>({commitNativeCustomMarkerCreation:(...args:unknown[])=>fixture.commit(...args),readNativeCustomMarker:vi.fn(),commitNativeCustomMarkerRemoval:vi.fn()}));
vi.mock('../js/marker-detail-runtime.js',()=>({buildMarkerDetailSidebarRuntime:()=>fixture.calls.push(['sidebar']),openWithMarkerDetailStylesheet:(callback:()=>unknown)=>callback(),setDetailModalShell:(...classes:string[])=>{const modal=document.getElementById('detail-modal');if(modal)modal.className=['modal',...classes].join(' ');return modal;}}));
vi.mock('../js/modal-lifecycle.js',()=>({openModalOverlay:(overlay:Element,options:unknown)=>fixture.calls.push(['open',overlay.id,options])}));
vi.mock('../js/utils.js',async importActual=>{
  const actual=await importActual<typeof import('../js/utils.js')>();
  return {...actual,showNotification:(...args:unknown[])=>fixture.calls.push(['notification',...args]),showConfirmDialog:()=>false};
});
function input(id:string,value:string){const node=document.getElementById(id);if(!(node instanceof HTMLInputElement || node instanceof HTMLSelectElement))throw new Error('Missing native input');node.value=value;}
beforeEach(()=>{vi.useFakeTimers();fixture.profile={entries:[{date:'2001-01-02',markers:{unchanged:4}}],customMarkers:{},refOverrides:{},sentinel:'protected'};fixture.currentProfile='synthetic-profile';fixture.commit.mockReset();fixture.commit.mockImplementation(async (_profile:string,input:{name:string;unit:string;refMin:number|null;refMax:number|null;newCategory?:string})=>({markerKey:'biochemistry.syntheticMarker_123',markerId:'custom:synthetic',name:input.name,unit:input.unit,category:{key:'biochemistry',label:input.newCategory||'Biochemistry',group:'Metabolic'},definition:{},optimal:null}));fixture.registry={};fixture.calls=[];fixture.categories={biochemistry:{label:'Biochemistry',markers:{}}};document.body.innerHTML='<div id="modal-overlay"><div id="detail-modal"></div></div>';configureMarkerDetailCustomMarkers({closeModal:()=>fixture.calls.push(['close']),openManualEntryForm:(id:string)=>fixture.calls.push(['manual',id])});openCreateMarkerModal();fixture.calls=[];});
afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
describe('custom marker public controller',()=>{
  it('opens the real native form with unchanged shell and focus contract',()=>{openCreateMarkerModal();expect(document.getElementById('detail-modal')?.className).toBe('modal gb-form-modal marker-form-modal');expect(fixture.calls).toEqual([['open','modal-overlay',{initialFocus:'#cm-name',focusDelay:50}]]);expect(document.querySelector('#cm-name')?.hasAttribute('autofocus')).toBe(true);expect(document.querySelector('#cm-new-cat-row')?.getAttribute('style')).toBe('display:none');});
  it('keeps blank names nonmutating and does not call the durable command',async()=>{const before=structuredClone(fixture.profile);await saveCustomMarker();expect(fixture.profile).toEqual(before);expect(fixture.commit).not.toHaveBeenCalled();expect(fixture.calls).toEqual([['notification','Please enter a marker name','error']]);});
  it('retains form input and reports native validation/save errors',async()=>{input('cm-name','Glucose');fixture.commit.mockRejectedValue(new Error('A marker with this name already exists in that category.'));const before=structuredClone(fixture.profile);expect(await saveCustomMarker()).toBe(false);expect(fixture.profile).toEqual(before);expect(fixture.registry).toEqual({});expect((document.getElementById('cm-name') as HTMLInputElement).value).toBe('Glucose');expect(fixture.calls).toEqual([['notification','A marker with this name already exists in that category.','error']]);});
  it('awaits durable creation before success/close and opens manual entry with the real storage identity',async()=>{
    input('cm-name',' Acetoacetic Acid ');input('cm-unit',' mmol/L ');input('cm-ref-min','1.25');input('cm-ref-max','9');input('cm-opt-min','2');input('cm-opt-max','7');
    const durable=fixture.commit.getMockImplementation()!;let release:(()=>void)|undefined;fixture.commit.mockImplementationOnce(async(...args:unknown[])=>{await new Promise<void>(resolve=>{release=resolve;});return durable(...args);});
    const before=structuredClone(fixture.profile),pending=saveCustomMarker();expect(fixture.calls).toEqual([]);expect(fixture.registry).toEqual({});
    expect(fixture.commit).toHaveBeenCalledWith('synthetic-profile',{name:'Acetoacetic Acid',unit:'mmol/L',category:'biochemistry',refMin:1.25,refMax:9,optimalMin:2,optimalMax:7},expect.objectContaining({allowed:expect.any(Function)}));
    release!();expect(await pending).toBe(true);expect(fixture.profile).toEqual(before);
    expect(fixture.registry).toEqual({biochemistry_syntheticMarker_123:{name:'Acetoacetic Acid',unit:'mmol/L',refMin:1.25,refMax:9,custom:true,storageDotKey:'biochemistry.syntheticMarker_123'}});
    expect(fixture.calls).toEqual([['sidebar'],['close'],['notification','Created "Acetoacetic Acid" in Biochemistry','success']]);vi.advanceTimersByTime(99);expect(fixture.calls).toHaveLength(3);vi.advanceTimersByTime(1);expect(fixture.calls[3]).toEqual(['manual','biochemistry_syntheticMarker_123']);
  });
  it.each(['profile','root','input','modal'] as const)('revokes pending native creation when %s changes',async cause=>{
    input('cm-name','Synthetic');let allowed:(()=>boolean)|undefined;fixture.commit.mockImplementationOnce(async(_profile:string,_input:unknown,options:{allowed:()=>boolean})=>{allowed=options.allowed;await Promise.resolve();throw new Error('Origin changed');});
    const pending=saveCustomMarker();if(cause==='profile')fixture.currentProfile='other';if(cause==='root')fixture.profile={...fixture.profile};if(cause==='input')input('cm-name','New unsaved input');if(cause==='modal')document.getElementById('detail-modal')!.remove();
    expect(allowed!()).toBe(false);expect(await pending).toBe(false);expect(fixture.calls.some(call=>call[0]==='close'||call[0]==='manual'||call[2]==='success')).toBe(false);
  });
  it('does not open manual entry after a later profile switch',async()=>{input('cm-name','Synthetic');await saveCustomMarker();fixture.currentProfile='other';vi.runAllTimers();expect(fixture.calls.some(call=>call[0]==='manual')).toBe(false);});
  it('keeps the real category-change delegate in charge of inline display',()=>{
    installMarkerDetailActionDelegates({},document);
    const select=document.getElementById('cm-category');if(!(select instanceof HTMLSelectElement))throw new Error('Missing category select');
    select.value='__new__';select.dispatchEvent(new Event('change',{bubbles:true}));expect(document.querySelector('#cm-new-cat-row')?.getAttribute('style')).toBe('display: flex;');
    select.value='biochemistry';select.dispatchEvent(new Event('change',{bubbles:true}));expect(document.querySelector('#cm-new-cat-row')?.getAttribute('style')).toBe('display: none;');
  });
  it('preserves emoji callback, blank new-category rejection, and custom category icon',async()=>{
    let choose:((emoji?:unknown)=>void)|undefined;configureMarkerDetailCustomMarkers({showEmojiPicker:(_element:Element,callback:(emoji?:unknown)=>void)=>{choose=callback;}});
    const icon=document.getElementById('cm-new-cat-icon');if(!icon)throw new Error('Missing icon');pickNewCatIcon(icon);choose?.(null);expect(icon.textContent).toBe('🔖');expect(icon.dataset.custom).toBe('');choose?.('🧪');expect(icon.dataset.custom).toBe('1');
    input('cm-category','__new__');input('cm-name',' Test Marker ');await saveCustomMarker();expect(fixture.calls).toEqual([['notification','Please enter a category name','error']]);expect(fixture.profile.customMarkers).toEqual({});fixture.calls=[];
    input('cm-new-cat',' 123 Tests ');await saveCustomMarker();expect(fixture.commit).toHaveBeenCalledWith('synthetic-profile',{name:'Test Marker',unit:'',newCategory:'123 Tests',refMin:null,refMax:null},expect.objectContaining({icon:'🧪'}));
  });
});
