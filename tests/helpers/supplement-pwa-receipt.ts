import assert from 'node:assert/strict';
export interface SupplementProfileReceipt {
 live:Record<string,unknown>;stored:Record<string,unknown>;rawCommitted:string;
 profiles:unknown;rawProfiles:string|null;current:string;active:string|null;
}
export interface SupplementEdit {name:string;note:string}
function object(value:unknown):asserts value is Record<string,unknown>{assert(value!==null&&typeof value==='object'&&!Array.isArray(value),'Native record object');}
function records(value:unknown):Record<string,unknown>[] {assert(Array.isArray(value),'Complete native record array');return value.map(item=>{object(item);return item;});}
function timestamp(value:unknown,min:number,max:number,label:string):asserts value is number {
 assert(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,label+' is the native save-interval timestamp');
}
/** Exact full-profile mutation: two authored text fields, the record timestamp and
 * the active registry timestamp. All other fields/records/ordering remain exact. */
export function verifySupplementEdit(before:SupplementProfileReceipt,after:SupplementProfileReceipt,edit:SupplementEdit,min:number,max:number){
 assert(Number.isSafeInteger(min)&&Number.isSafeInteger(max)&&min<=max,'Actual browser save interval');
 assert.equal(before.current,'default');assert.equal(after.current,before.current);assert.equal(before.active,'default');assert.equal(after.active,before.active);
 const previous=records(before.stored.supplements),current=records(after.stored.supplements);assert.equal(previous.length,2);assert.equal(current.length,2);
 assert.equal(previous[0]!.id,'sm_pwa_form_a');assert.equal(current[0]!.id,previous[0]!.id);
 const updatedAt=current[0]!.updatedAt;timestamp(updatedAt,min,max,'Supplement updatedAt');assert.notEqual(updatedAt,previous[0]!.updatedAt);
 const expected=structuredClone(before.stored);expected.supplements=[{...previous[0],...edit,updatedAt},previous[1]];
 assert.deepEqual(after.stored,expected,'Every whole committed profile field');assert.deepEqual(after.live,expected,'Every whole live profile field');
 assert.deepEqual(JSON.parse(after.rawCommitted),expected,'Whole native IDB committed string');assert.equal(after.rawCommitted,JSON.stringify(expected),'Exact native IDB JSON wire bytes');
 assert(after.rawProfiles!==null,'Whole native registry string');
 const previousProfiles=records(before.profiles),currentProfiles=records(after.profiles);assert.equal(previousProfiles.length,2);assert.equal(currentProfiles.length,2);
 const index=previousProfiles.findIndex(item=>item.id==='default');assert(index>=0);const lastUpdated=currentProfiles[index]!.lastUpdated;
 timestamp(lastUpdated,min,max,'Active profile lastUpdated');assert.notEqual(lastUpdated,previousProfiles[index]!.lastUpdated);
 const expectedProfiles=structuredClone(previousProfiles);expectedProfiles[index]={...expectedProfiles[index],lastUpdated};
 assert.deepEqual(currentProfiles,expectedProfiles,'Every registry field and unrelated profile');assert.deepEqual(JSON.parse(after.rawProfiles),expectedProfiles,'Whole native registry string');assert.equal(after.rawProfiles,JSON.stringify(expectedProfiles),'Exact native registry JSON wire bytes');
 return {expected,expectedProfiles,updatedAt,lastUpdated,saveInterval:{min,max}};
}
