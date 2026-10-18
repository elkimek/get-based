import type {ProfileData} from '../../types/app-state.js';
export const biometricFreshTime='2026-08-07T12:00:00Z',biometricStaleTime='2026-08-08T01:00:00Z';
export const biometricInitialSelection=['rhr','bp_systolic'] as const;
export const biometricRegistry=[{id:'default',name:'Synthetic Biometrics profile',sex:'male',dob:'1987-11-22',createdAt:1,lastUpdated:1,tags:[],notes:'',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}},{id:'other',name:'Keep unrelated Biometrics profile',sex:'female',dob:'1988-01-01',createdAt:2,lastUpdated:2,tags:[],notes:'Keep registry bytes',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}}];
/** Synthetic existing metadata exercises native status predicates. WHOOP's
 * confidential deployment remains unconfigured; neither scheduler nor trusted
 * Sync attempt may hydrate credentials, fetch vendor rows, or write profile data. */
export const biometricUninitializedSeedFields={
 entries:[{date:'2024-05-10',sourceFile:'synthetic-biometric-profile.pdf',markers:{'biochemistry.glucose':5,'iron.ferritin':65}}],
 wearableConnections:{whoop:{connectedAt:1786017600000,lastSyncAt:1786103400000,accessToken:'synthetic-only-not-a-real-credential',expiresAt:1893456000000}},
 wearableSummary:{summaryUpdatedAt:'2026-08-07T11:50:00Z',sources:{whoop:{connectedSince:1786017600000,lastSyncAt:1786103400000,coverageDays:7}},metrics:{rhr:{primarySource:'whoop',latest:58,latestDate:'2026-08-07',baseline:60,baselineP25:57,baselineP75:62,rolling:{d7:58,d30:60,d90:60},trend30d:'improving',weekly:[60,59,58]}}},
 notes:[{date:'2023-12-01',text:'Keep unrelated Biometrics note <&>'}],contextNotes:'Keep unrelated Biometrics context',markerNotes:{'iron.ferritin':'Keep unrelated marker note'},importBenchmarks:[],
} satisfies Partial<ProfileData>;
/** Valid native Light-initialized containers prevent foreign warm-start mutation. */
export const biometricSeedFields={...biometricUninitializedSeedFields,lightEnvironment:{rooms:[],screens:[]},sunDefaults:{},lightDailyVerdicts:{}} satisfies Partial<ProfileData>;
/** Exact full native authored body: all text/comments, child grammar, styles,
 * attributes and action chronology remain ordered with no normalization. */
export function biometricOverviewPresentationReceipt(root:Element){
 const node=(n:Node):unknown=>{if(n.nodeType===1){const element=n as Element;return{type:n.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].map(a=>[a.name,a.value]),children:[...element.childNodes].map(node)};}return{type:n.nodeType,text:n.nodeValue};};
 return {children:[...root.childNodes].map(node),actions:[...root.querySelectorAll('[data-dashboard-widget-action]')].map(element=>({tag:element.localName,attributes:[...element.attributes].map(a=>[a.name,a.value])})),count:root.querySelector('.db-biometric-overview-bar > span')?.textContent??null};
}
export type BiometricOverviewReceipt=ReturnType<typeof biometricOverviewPresentationReceipt>;
export interface BiometricOverviewNativeOracle {devicePersistence:{stored:Record<string,unknown>;rawStored:string;manualMigration:unknown;rawProtectedPayload:string;protectedPayload:Record<string,unknown>;schema:unknown;keyDescriptor:unknown};widgetPreferences:{initial:null;saved:string};seed:ProfileData;profileKeys:string[];originalControllerSHA256:string;receipts:Record<string,BiometricOverviewReceipt>;raw:Record<string,string>;selections:Record<string,string[]>;times:Record<string,string>;}

/** Read-only device database receipt. Binary envelopes are represented completely,
 * while the native nonextractable key is described without exporting its material.
 * No creation, hydration, provider callbacks or data writes occur here. */
export async function biometricDevicePersistenceReceipt(){
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('labcharts-wearables-default',1);request.onupgradeneeded=()=>{request.transaction?.abort();reject(new Error('Expected existing native device database'));};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
 try{
  const names=[...db.objectStoreNames];const tx=db.transaction(names,'readonly');
  const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
  const read=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const schema=names.map(name=>{const store=tx.objectStore(name);return{name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:[...store.indexNames].map(name=>{const index=store.index(name);return{name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};})};});
  const reads=names.map(name=>{const store=tx.objectStore(name);return{name,keys:read(store.getAllKeys()),values:read(store.getAll()) as Promise<unknown[]>};});const rows=await Promise.all(reads.map(async row=>({name:row.name,keys:await row.keys,values:await row.values})));await done;
  const meta=rows.find(store=>store.name==='meta')!.values as Array<{k:string;v:unknown;updatedAt:number}>;
  const key=meta.find(row=>row.k==='credential-vault-key:v1')!.v as CryptoKey;
  const envelope=meta.find(row=>row.k==='whoop-profile-data:v1')!.v as {version:number;iv:Uint8Array<ArrayBuffer>;ciphertext:ArrayBuffer};
  const descriptor=(key:CryptoKey)=>({type:key.type,extractable:key.extractable,algorithm:{...key.algorithm},usages:[...key.usages]});
  const bytes=(value:unknown):unknown=>{if(value===key)return{cryptoKey:descriptor(key)};if(ArrayBuffer.isView(value))return{view:Object.prototype.toString.call(value),bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};if(Object.prototype.toString.call(value)==='[object ArrayBuffer]')return{arrayBuffer:[...new Uint8Array(value as ArrayBuffer)]};if(Array.isArray(value))return value.map(bytes);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,value])=>[name,bytes(value)]));return value;};
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:envelope.iv},key,envelope.ciphertext);
  return{name:db.name,version:db.version,schema,rows:bytes(rows),dailyRows:rows.find(store=>store.name==='daily-metrics')!,manualMigration:meta.find(row=>row.k==='biometrics-migrated-v1'),metaRecordFields:meta.map(row=>({key:row.k,fields:Object.keys(row)})),metaKeys:meta.map(row=>row.k),keyDescriptor:descriptor(key),envelope:{version:envelope.version,iv:[...envelope.iv],ciphertext:[...new Uint8Array(envelope.ciphertext)]},rawProtectedPayload:new TextDecoder().decode(plaintext),protectedPayload:JSON.parse(new TextDecoder().decode(plaintext)) as Record<string,unknown>};
 }finally{db.close();}
}
