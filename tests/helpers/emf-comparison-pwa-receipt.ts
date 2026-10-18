import type {ProfileData} from '../../types/app-state.js';
export const emfComparisonTime='2026-08-07T12:00:00Z';
export const emfComparisonRegistry=[
 {id:'default',name:'Synthetic EMF profile',sex:'male',dob:'1987-11-22',createdAt:1,lastUpdated:1,tags:[],notes:'',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}},
 {id:'other',name:'Keep unrelated EMF profile',sex:'female',dob:'1988-01-01',createdAt:2,lastUpdated:2,tags:[],notes:'Keep registry bytes',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}},
];
const measurement=(value:number,unit:string)=>({value,unit,meter:null});
const room=(name:string,sleeping:boolean,measurements:Record<string,ReturnType<typeof measurement>>)=>({name,sleeping,location:'',note:'',measurements,sources:[],mitigations:[],photos:[]});
/** Complete native containers and native measurement units make collection a
 * fixed point; the existing interpretation is synthetic and never regenerated. */
export const emfComparisonSeedFields={
 wearableConnections:{},wearableSummary:{sources:{},metrics:{}},importBenchmarks:[],
 entries:[{date:'2024-05-10',sourceFile:'synthetic-emf-profile.pdf',markers:{'biochemistry.glucose':5,'iron.ferritin':65}}],
 notes:[{date:'2023-12-01',text:'Keep unrelated EMF note <&>'}],contextNotes:'Keep unrelated EMF context',markerNotes:{'iron.ferritin':'Keep unrelated marker note'},
 lightEnvironment:{rooms:[],screens:[]},sunDefaults:{},lightDailyVerdicts:{},
 emfAssessment:{assessments:[
  {id:'emf-earliest',date:'2026-06-01',label:'Earliest sentinel',consultant:'',note:'',rooms:[room('Bedroom',true,{acElectric:measurement(9,'V/m')})]},
  {id:'emf-after',date:'2026-08-06',label:'After <&> "',consultant:'',note:'',rooms:[room('Bedroom',true,{acElectric:measurement(2,'V/m'),acMagnetic:measurement(80,'nT'),rfMicrowave:measurement(5,'µW/m²'),dirtyElectricity:measurement(35,'GS')}),room('Study <&> "',false,{}),room('New study',false,{acElectric:measurement(4,'V/m')})]},
  {id:'emf-before',date:'2026-08-01',label:'Before <&> "',consultant:'',note:'',rooms:[room('Bedroom',true,{acElectric:measurement(10,'V/m'),acMagnetic:measurement(20,'nT'),rfMicrowave:measurement(5,'µW/m²'),dcMagnetic:measurement(8,'µT')}),room('Study <&> "',false,{}),room('Old study',false,{rfMicrowave:measurement(3,'µW/m²')})]},
  {id:'emf-earlier',date:'2026-07-01',label:'Earlier sentinel',consultant:'',note:'',rooms:[room('Bedroom',true,{acElectric:measurement(7,'V/m')})]},
 ],comparisonInterpretation:{text:'## Synthetic cached comparison\n\nThe native sample has improved and remaining measurements.',date:'2026-08-06T12:00:00Z',provider:'ollama',model:'synthetic-emf-model',inputTokens:10,outputTokens:5}},
} satisfies Partial<ProfileData>;
export const emfParsedPreview={date:'2026-08-05',consultant:'Synthetic consultant <&>',rooms:[{name:'Bedroom',location:'pillow area <&>',measurements:{acElectric:measurement(28,'V/m'),acMagnetic:measurement(45,'nT')},sources:['Synthetic router <&>'],mitigations:['Synthetic demand switch <&>']}],note:'Synthetic report only'};
/** Ordered native DOM, controls and action attributes. No field sorting,
 * attribute normalization, private marker removal or observed-browser oracle. */
export function emfComparisonPresentationReceipt(root:Element){
 const node=(value:Node):unknown=>{if(value.nodeType===1){const element=value as Element;return{type:value.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].map(attribute=>[attribute.name,attribute.value]),children:[...element.childNodes].map(node)};}return{type:value.nodeType,text:value.nodeValue};};
 return{children:[...root.childNodes].map(node),actions:[...root.querySelectorAll('[data-emf-action],[data-emf-change-action],[data-emf-interp-action]')].map(element=>({tag:element.localName,attributes:[...element.attributes].map(attribute=>[attribute.name,attribute.value])})),controls:[...root.querySelectorAll('input,textarea,select')].map(element=>{const control=element as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;return{tag:element.localName,attributes:[...element.attributes].map(attribute=>[attribute.name,attribute.value]),value:control.value,checked:element instanceof HTMLInputElement?element.checked:null};})};
}
export type EMFComparisonReceipt=ReturnType<typeof emfComparisonPresentationReceipt>;
export interface EMFComparisonNativeOracle {seed:ProfileData;profileKeys:string[];originalEditorSHA256:string;receipts:Record<string,EMFComparisonReceipt>;raw:Record<string,string>;profiles:Record<string,ProfileData>;devicePersistence:unknown;parsedPreview:typeof emfParsedPreview;pdf:{base64:string;text:string;obfuscatedText:string};request:{model:string;messages:Array<{role:string;content:string}>;max_tokens:number};}
/** Read only every native device store and row. This seed has no protected
 * provider credentials, so no vault key/envelope is expected or synthesized. */
export async function emfDevicePersistenceReceipt(){
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('labcharts-wearables-default',1);request.onupgradeneeded=()=>{request.transaction?.abort();reject(new Error('Expected existing native device database'));};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
 try{
  const names=[...db.objectStoreNames],tx=db.transaction(names,'readonly');
  const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  const read=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const schema=names.map(name=>{const store=tx.objectStore(name);return{name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:[...store.indexNames].map(name=>{const index=store.index(name);return{name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};})};});
  const pending=names.map(name=>{const store=tx.objectStore(name);return{name,keys:read(store.getAllKeys()),values:read(store.getAll())};});
  const rows=await Promise.all(pending.map(async row=>({name:row.name,keys:await row.keys,values:await row.values})));await done;
  return{name:db.name,version:db.version,schema,rows};
 }finally{db.close();}
}
