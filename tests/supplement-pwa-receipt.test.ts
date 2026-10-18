import {describe,it,expect} from 'vitest';
import {verifySupplementEdit,type SupplementProfileReceipt} from './helpers/supplement-pwa-receipt.js';
function fixture(){
 const data:Record<string,unknown>&{supplements:Array<Record<string,unknown>>}={entries:[{date:'2024-01-01',markers:{'biochemistry.glucose':4.5}}],notes:[{date:'2024-01-01',text:'Keep note'}],customMarkers:{},contextNotes:'Keep context',supplements:[{id:'sm_pwa_form_a',name:'Original',note:'Original note',updatedAt:1,ingredients:[{name:'Mg',amount:'25 mg'}],periods:[{start:'2024-01-01',end:null}],qualityTests:[{analyte:'Lead',resultText:'ND'}]},{id:'sm_pwa_form_b',name:'Untouched',note:'Second record'}]};
 const profiles=[{id:'default',name:'Synthetic',lastUpdated:1},{id:'other',name:'Keep registry',lastUpdated:2}];
 const before:SupplementProfileReceipt={live:structuredClone(data),stored:structuredClone(data),rawCommitted:JSON.stringify(data),profiles:structuredClone(profiles),rawProfiles:JSON.stringify(profiles),current:'default',active:'default'};
 const after=structuredClone(before);const updated=structuredClone(data);updated.supplements[0]={...updated.supplements[0]!,name:'Offline <literal>',note:'Saved note',updatedAt:110};after.live=structuredClone(updated);after.stored=updated;after.rawCommitted=JSON.stringify(updated);const registry=structuredClone(profiles);registry[0]!.lastUpdated=120;after.profiles=registry;after.rawProfiles=JSON.stringify(registry);
 return {before,after,edit:{name:'Offline <literal>',note:'Saved note'}};
}
describe('complete Supplement PWA persisted-mutation receipt',()=>{
 it('accepts only the exact intended whole-profile and native timestamp mutation',()=>{const {before,after,edit}=fixture();expect(verifySupplementEdit(before,after,edit,100,130).updatedAt).toBe(110);});
 const corruptions:Array<[string,(after:SupplementProfileReceipt)=>void]>=[
 ['unrelated context',a=>{a.stored.contextNotes='Wrong';}],
 ['unrelated lab data',a=>{a.stored.entries=[];}],
 ['missing profile field',a=>{delete a.stored.customMarkers;}],
 ['second supplement',a=>{(a.stored.supplements as Array<Record<string,unknown>>)[1]!.name='Wrong';}],
 ['saved ingredient',a=>{(a.stored.supplements as Array<Record<string,unknown>>)[0]!.ingredients=[];}],
 ['record identity',a=>{(a.stored.supplements as Array<Record<string,unknown>>)[0]!.id='wrong';}],
 ['stale record timestamp',a=>{(a.stored.supplements as Array<Record<string,unknown>>)[0]!.updatedAt=1;}],
 ['out-of-interval record timestamp',a=>{(a.stored.supplements as Array<Record<string,unknown>>)[0]!.updatedAt=131;}],
 ['live profile differs',a=>{a.live.contextNotes='Wrong';}],
 ['native committed string differs',a=>{a.rawCommitted='{}';}],
 ['other registry profile',a=>{(a.profiles as Array<Record<string,unknown>>)[1]!.name='Wrong';}],
 ['stale registry timestamp',a=>{(a.profiles as Array<Record<string,unknown>>)[0]!.lastUpdated=1;}],
 ['native registry string differs',a=>{a.rawProfiles='[]';}],
 ['active profile differs',a=>{a.active='other';}],
 ['committed wire whitespace',a=>{a.rawCommitted=JSON.stringify(a.stored,null,2);}],
 ['committed wire property order',a=>{a.rawCommitted=JSON.stringify(Object.fromEntries(Object.entries(a.stored).reverse()));}],
 ['registry wire whitespace',a=>{a.rawProfiles=JSON.stringify(a.profiles,null,2);}],
 ['registry wire property order',a=>{a.rawProfiles=JSON.stringify((a.profiles as Array<Record<string,unknown>>).map(value=>Object.fromEntries(Object.entries(value).reverse())));}],
 ];
 it.each(corruptions)('rejects %s',(_name,corrupt)=>{const {before,after,edit}=fixture();corrupt(after);expect(()=>verifySupplementEdit(before,after,edit,100,130)).toThrow();});
});
