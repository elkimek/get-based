// @vitest-environment jsdom
import {IDBFactory} from 'fake-indexeddb';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearProfileStorage,configureProfileStorageCleanupDeps,listStoredProfileIds} from '../js/profile-storage-cleanup.js';
let previous,connections;
beforeEach(()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());connections=[];localStorage.clear();
 previous=configureProfileStorageCleanupDeps({getBlobKeys:async()=>[],encryptedRemoveItem:async key=>{localStorage.removeItem(key);}});
});
afterEach(()=>{for(const db of connections)db.close();configureProfileStorageCleanupDeps(previous);vi.unstubAllGlobals();localStorage.clear();});
async function open(name){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});connections.push(db);return db;}
it('discovers profile databases through the actual browser database enumeration API',async()=>{
 for(const name of ['labcharts-cycle-cycleOnly','labcharts-wearables-wearableOnly','getbased-nutrition-mealOnly','unrelated']){const db=await open(name);db.close();}
 expect((await listStoredProfileIds()).sort()).toEqual(['cycleOnly','mealOnly','wearableOnly']);
});
it('deletes all three database families while preserving another profile database',async()=>{
 for(const name of ['labcharts-cycle-target','labcharts-wearables-target','getbased-nutrition-target','getbased-nutrition-other']){const db=await open(name);db.close();}
 localStorage.setItem('labcharts-target-imported','data');await clearProfileStorage('target');
 expect((await indexedDB.databases()).map(x=>x.name)).toEqual(['getbased-nutrition-other']);expect(localStorage.getItem('labcharts-target-imported')).toBeNull();
});
it('reports an actually blocked nutrition database deletion and retains canonical data',async()=>{
 const db=await open('getbased-nutrition-target');localStorage.setItem('labcharts-target-imported','data');
 await expect(clearProfileStorage('target')).rejects.toThrow(/blocked/);expect(localStorage.getItem('labcharts-target-imported')).toBe('data');db.close();
});
it('supports cleanup when IndexedDB is unavailable',async()=>{
 vi.stubGlobal('indexedDB',undefined);localStorage.setItem('labcharts-target-imported','data');await clearProfileStorage('target');expect(localStorage.getItem('labcharts-target-imported')).toBeNull();
});
it('supports discovery when database enumeration is unavailable',async()=>{
 vi.stubGlobal('indexedDB',{});await expect(listStoredProfileIds(['seed'])).resolves.toEqual(['seed']);
});
it('reports an actual delete request error without removing local data',async()=>{
 const original=indexedDB.deleteDatabase.bind(indexedDB);
 vi.spyOn(indexedDB,'deleteDatabase').mockImplementation(name=>{if(name!=='getbased-nutrition-target')return original(name);const request={error:new Error('delete denied')};queueMicrotask(()=>request.onerror());return request;});
 localStorage.setItem('labcharts-target-imported','data');await expect(clearProfileStorage('target')).rejects.toThrow('delete denied');expect(localStorage.getItem('labcharts-target-imported')).toBe('data');
});
