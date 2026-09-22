// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearProfileStorage,configureProfileStorageCleanupDeps,listStoredProfileIds} from '../js/profile-storage-cleanup.js';
let previous,deps;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();
 deps=Object.fromEntries(['encryptedRemoveItem','getBlobKeys','getDatabaseNames','deleteWearablesDB','deleteCycleDB','deleteNutritionDB'].map(k=>[k,vi.fn().mockResolvedValue([])]));
 previous=configureProfileStorageCleanupDeps(deps);
 localStorage.setItem('labcharts-target-imported','canonical');localStorage.setItem('labcharts-target-chat-orphan','message');
 sessionStorage.setItem('chat-onboard-intro-target','draft');
});
afterEach(()=>{configureProfileStorageCleanupDeps(previous);localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
it.each(['deleteWearablesDB','deleteCycleDB','deleteNutritionDB'])('does not erase canonical data after %s rejects',async key=>{
 deps[key].mockRejectedValue(Error('blocked'));await expect(clearProfileStorage('target')).rejects.toThrow('blocked');
 expect(deps.encryptedRemoveItem).not.toHaveBeenCalled();expect(localStorage.getItem('labcharts-target-imported')).toBe('canonical');expect(sessionStorage.getItem('chat-onboard-intro-target')).toBe('draft');
});
it.each(['deleteWearablesDB','deleteCycleDB','deleteNutritionDB'])('waits for %s before erasing canonical data',async key=>{
 let release;deps[key].mockImplementation(()=>new Promise(r=>{release=r;}));const pending=clearProfileStorage('target');await Promise.resolve();expect(deps.encryptedRemoveItem).not.toHaveBeenCalled();
 release();await pending;expect(deps.encryptedRemoveItem).toHaveBeenCalledTimes(2);expect(localStorage.getItem('labcharts-target-chat-orphan')).toBeNull();
});
it.each(['imported','imported-corrupt'])('retains ancillary keys when %s blob deletion fails',async suffix=>{
 deps.encryptedRemoveItem.mockImplementation(async key=>{if(key===`labcharts-target-${suffix}`) throw Error('blob');});
 await expect(clearProfileStorage('target')).rejects.toThrow('blob');expect(localStorage.getItem('labcharts-target-chat-orphan')).toBe('message');expect(sessionStorage.getItem('chat-onboard-intro-target')).toBe('draft');
});
it('a failed database deletion can be retried',async()=>{
 deps.deleteNutritionDB.mockRejectedValueOnce(Error('blocked'));await expect(clearProfileStorage('target')).rejects.toThrow();
 await clearProfileStorage('target');expect(localStorage.getItem('labcharts-target-imported')).toBeNull();expect(deps.deleteNutritionDB).toHaveBeenCalledTimes(2);
});
it.each(['',null,'../target','target space','x'.repeat(129),'target/child'])('rejects invalid cleanup id %s before any deletion',async id=>{
 await expect(clearProfileStorage(id)).rejects.toThrow('Invalid profile');for(const spy of Object.values(deps))expect(spy).not.toHaveBeenCalled();
});
it.each(['getBlobKeys','getDatabaseNames'])('reports %s enumeration failure instead of claiming complete discovery',async key=>{
 deps[key].mockRejectedValue(Error('unavailable'));await expect(listStoredProfileIds(['seed'])).rejects.toThrow('unavailable');
});
it('deduplicates identities from local, blob and database surfaces',async()=>{
 deps.getBlobKeys.mockResolvedValue(['labcharts-target-imported','labcharts-blob-only-imported-corrupt','unrelated']);
 deps.getDatabaseNames.mockResolvedValue(['labcharts-cycle-target','labcharts-wearables-db-only','getbased-nutrition-meals-only','getbased-evolu8-identity']);
 expect((await listStoredProfileIds(['target','seed','../invalid',null])).sort()).toEqual(['blob-only','db-only','meals-only','seed','target']);
});
it('ignores absent dependency overrides and preserves previous configuration',async()=>{
 configureProfileStorageCleanupDeps({getBlobKeys:null,deleteCycleDB:'invalid',unknown:()=>{throw Error('unexpected');}});
 await clearProfileStorage('target');expect(deps.deleteCycleDB).toHaveBeenCalledWith('target');
});
it('preserves another profile and global settings while clearing adjacent local keys',async()=>{
 for(const key of ['labcharts-other-imported','labcharts-other-chat-id','labcharts-api-key','unrelated'])localStorage.setItem(key,'keep');
 await clearProfileStorage('target');for(const key of ['labcharts-other-imported','labcharts-other-chat-id','labcharts-api-key','unrelated'])expect(localStorage.getItem(key)).toBe('keep');
});
it('does not claim success when local key removal is denied',async()=>{
 vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw Error('denied');});
 await expect(clearProfileStorage('target')).rejects.toThrow('denied');
});
