// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {configureClientListFormRuntime,handleClientFormClick,handleClientFormKeydown,handleClientFormSubmit,openClientForm,resetClientListFormState,type ClientListFormSnapshot} from '../js/client-list-form.js';

const ports=vi.hoisted(()=>({
  profile:{id:'tag-client',name:'Synthetic client',tags:[] as string[]},
  save:vi.fn(async (_id:string,_fields:Record<string,unknown>)=>({id:'tag-client'})),
  refresh:vi.fn(async()=>{}),notify:vi.fn(),render:vi.fn(),
}));
vi.mock('../js/state.js',()=>({state:{currentProfile:'tag-client',profileSex:null,profileDob:null,importedData:null}}));
vi.mock('../js/profile.js',()=>({
  getProfiles:()=>[ports.profile],getProfileHeight:()=>({height:null,unit:'cm'}),
  updateProfileMeta:(id:string,fields:Record<string,unknown>)=>ports.save(id,fields),
  createProfile:()=>{throw new Error('Unexpected creation');},switchProfile:()=>{throw new Error('Unexpected switch');},
  detectLatitudeWithAI:()=>{throw new Error('Unexpected latitude request');},getLatitudeFromLocation:()=>null,getLocationCache:()=>({}),latitudeToBand:()=>null,
}));
vi.mock('../js/constants.js',()=>({LATITUDE_BANDS:[]}));
vi.mock('../js/nav.js',()=>({getAvatarColor:()=> '#a3e635'}));
vi.mock('../js/url-safety.js',()=>({isOfficialGetbasedHost:()=> false}));
vi.mock('../js/client-list-runtime.js',()=>({
  getClientHaplogroupList:()=>[],navigateClientListRoute:()=>{throw new Error('Unexpected navigation');},
  refreshClientProfileButton:()=>ports.refresh(),setClientManualHaplogroup:()=>{throw new Error('Unexpected haplogroup edit');},
  showClientListNotification:(message:string,type:string)=>ports.notify(message,type),
}));
let oldBody:string,oldRuntime:ClientListFormSnapshot;
beforeEach(()=>{
  oldBody=document.body.innerHTML;document.body.innerHTML='<div id="client-list-modal"></div>';
  ports.profile.tags=['Existing <literal>','Remove me'];vi.clearAllMocks();resetClientListFormState();
  oldRuntime=configureClientListFormRuntime({closeClientList:()=>{throw new Error('Unexpected close');},renderClientList:ports.render});
  // Unit-only scheduling seam: no latitude/BMI RAF runs and no timer/remote work is needed to exercise tag/save ownership.
  vi.stubGlobal('requestAnimationFrame',()=>0);
  openClientForm('tag-client');
  const input=document.getElementById('cl-tag-input') as HTMLInputElement;
  input.addEventListener('keydown',event=>handleClientFormKeydown('tag-input',event));
  document.querySelector('form')!.addEventListener('submit',event=>handleClientFormSubmit('save-form',event));
});
afterEach(()=>{resetClientListFormState();configureClientListFormRuntime(oldRuntime);vi.unstubAllGlobals();document.body.innerHTML=oldBody;});
function add(value:string):void {
  const input=document.getElementById('cl-tag-input') as HTMLInputElement;input.value=value;
  const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(input.value).toBe('');
}
async function save(expected:string[]):Promise<void> {
  (document.querySelector('form') as HTMLFormElement).requestSubmit();
  expect(ports.save).toHaveBeenCalledTimes(1);expect(ports.save.mock.calls[0]![0]).toBe('tag-client');
  expect(ports.save.mock.calls[0]![1].tags).toEqual(expected);
  await vi.waitFor(()=>expect(ports.render).toHaveBeenCalledTimes(1));
  expect(ports.refresh).toHaveBeenCalledTimes(1);expect(ports.notify).toHaveBeenCalledWith('"Synthetic client" updated','info');
}
it('saves existing native tag text despite actual compiled fragment boundary comments',async()=>{
  expect(document.querySelectorAll('.cl-tag-pill')).toHaveLength(2);await save(['Existing <literal>','Remove me']);
});
it('saves a newly rendered literal tag together with existing tags',async()=>{
  add('  Added <literal> & text  ');await save(['Existing <literal>','Remove me','Added <literal> & text']);
});
it('rejects case-insensitive duplicate additions against existing rendered tags',async()=>{
  add('existing <LITERAL>');expect(document.querySelectorAll('.cl-tag-pill')).toHaveLength(2);await save(['Existing <literal>','Remove me']);
});
it('excludes the genuinely removed native pill from the saved tag array',async()=>{
  const remove=document.querySelectorAll<HTMLButtonElement>('.cl-tag-remove')[1]!;
  remove.addEventListener('click',event=>handleClientFormClick('remove-tag',remove,event));remove.click();
  expect(document.querySelectorAll('.cl-tag-pill')).toHaveLength(1);await save(['Existing <literal>']);
});
