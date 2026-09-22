// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearSyncDisableStorage,isSyncDisableCleanupKey} from '../js/sync-disable-cleanup.js';
import {cleanupSupersededEvolu8Databases,guardLegacyIdentityChanges} from '../js/sync-evolu8-candidate.js';
beforeEach(()=>localStorage.clear());
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it.each(['labcharts-a-delta-clock','labcharts-a-sync-cutover-v2','labcharts-a-sync-dirty','labcharts-a-relay-bytes-month','labcharts-relay-cap-month','labcharts-sync-restore-join-pending','labcharts-relay-quota-warned'])('clears obsolete sync metadata %s',key=>{
 localStorage.setItem(key,'obsolete');localStorage.setItem('labcharts-a-imported','canonical');clearSyncDisableStorage();expect(localStorage.getItem(key)).toBeNull();expect(localStorage.getItem('labcharts-a-imported')).toBe('canonical');
});
it.each(['labcharts-a-imported','labcharts-a-chat-threads','labcharts-sync-enabled','labcharts-sync-evolu8-identity-token','labcharts-api-key',''])('does not classify preserved data %s as disposable metadata',key=>{expect(isSyncDisableCleanupKey(key)).toBe(false);});
it('preserves only requested dirty markers and always removes old sync timestamps',()=>{
 for(const key of ['labcharts-a-sync-dirty','labcharts-b-sync-dirty','labcharts-a-sync-ts','labcharts-b-sync-ts'])localStorage.setItem(key,'1');
 clearSyncDisableStorage({preserveDirtyProfileIds:['a',null,'../b']});expect(localStorage.getItem('labcharts-a-sync-dirty')).toBe('1');
 for(const key of ['labcharts-b-sync-dirty','labcharts-a-sync-ts','labcharts-b-sync-ts'])expect(localStorage.getItem(key)).toBeNull();
});
it('removes adjacent metadata keys without skipping entries during iteration',()=>{
 for(let i=0;i<20;i++)localStorage.setItem(`labcharts-${i}-sync-dirty`,'1');clearSyncDisableStorage();expect(localStorage.length).toBe(0);
});
function cleanupHarness(){
 const root={entries:vi.fn(async function*(){yield ['.getbased8g1-owner',{kind:'directory'}];yield ['.getbased8g2-owner',{kind:'directory'}];yield ['.getbased8g3-owner',{kind:'directory'}];}),removeEntry:vi.fn().mockResolvedValue(undefined)};
 return {root,options:{activeDatabaseName:'getbased8g3-owner',storageManager:{getDirectory:vi.fn().mockResolvedValue(root)},lockManager:{request:vi.fn(async (_name,_options,callback)=>callback({}))}}};
}
it.each(['invalid','getbased7','getbased8g0','getbased8g1/escape'])('does not enumerate OPFS with unsafe active name %s',async name=>{
 const {options}=cleanupHarness();options.activeDatabaseName=name;await expect(cleanupSupersededEvolu8Databases(options)).resolves.toEqual({deleted:[],skipped:[]});expect(options.storageManager.getDirectory).not.toHaveBeenCalled();
});
it.each(['storageManager','lockManager'])('does not attempt deletion without %s',async key=>{
 const {options,root}=cleanupHarness();options[key]=null;await expect(cleanupSupersededEvolu8Databases(options)).resolves.toEqual({deleted:[],skipped:[]});expect(root.removeEntry).not.toHaveBeenCalled();
});
it('uses exclusive nonblocking locks and skips active databases',async()=>{
 const {options,root}=cleanupHarness();options.lockManager.request.mockImplementation(async(name,_opts,callback)=>callback(name.includes('g1')?null:{}));
 await expect(cleanupSupersededEvolu8Databases(options)).resolves.toEqual({deleted:['getbased8g2-owner'],skipped:['getbased8g1-owner']});
 expect(root.removeEntry).toHaveBeenCalledExactlyOnceWith('.getbased8g2-owner',{recursive:true});
 expect(options.lockManager.request).toHaveBeenCalledWith('evolu-leaderlock-getbased8g1-owner',{ifAvailable:true,mode:'exclusive'},expect.any(Function));
});
it.each(['lock','delete'])('continues safely after one %s failure',async failure=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});const {options,root}=cleanupHarness();
 if(failure==='lock')options.lockManager.request.mockRejectedValueOnce(Error('locked'));else root.removeEntry.mockRejectedValueOnce(Error('denied'));
 await expect(cleanupSupersededEvolu8Databases(options)).resolves.toEqual({deleted:['getbased8g2-owner'],skipped:['getbased8g1-owner']});
});
it('never deletes files or unrelated OPFS directories',async()=>{
 const {options,root}=cleanupHarness();root.entries.mockImplementation(async function*(){for(const entry of [['.getbased8g1',{kind:'file'}],['.getbased7',{kind:'directory'}],['private-documents',{kind:'directory'}],['.getbased8g3-owner',{kind:'directory'}]])yield entry;});
 await expect(cleanupSupersededEvolu8Databases(options)).resolves.toEqual({deleted:[],skipped:[]});expect(options.lockManager.request).not.toHaveBeenCalled();
});
it('reports inaccessible OPFS rather than claiming cleanup success',async()=>{
 const {options}=cleanupHarness();options.storageManager.getDirectory.mockRejectedValue(Error('denied'));await expect(cleanupSupersededEvolu8Databases(options)).rejects.toThrow('denied');
});
it.each(['restoreAppOwner','resetAppOwner'])('blocks legacy %s if synchronous token invalidation fails',method=>{
 const legacy={[method]:vi.fn()};const guarded=guardLegacyIdentityChanges(legacy,{invalidate:()=>{throw Error('token retained');}});
 expect(()=>guarded[method]()).toThrow('token retained');expect(legacy[method]).not.toHaveBeenCalled();
});
it.each(['restoreAppOwner','resetAppOwner'])('awaits invalidation and preserves legacy %s result',async method=>{
 let release;const legacy={[method]:vi.fn().mockResolvedValue('result')};const guarded=guardLegacyIdentityChanges(legacy,{invalidate:()=>new Promise(r=>{release=r;})});
 let settled=false;const pending=guarded[method]('fixture',{reload:false}).then(v=>{settled=true;return v;});await Promise.resolve();expect(settled).toBe(false);
 release();await expect(pending).resolves.toBe('result');expect(legacy[method]).toHaveBeenCalledWith('fixture',{reload:false});
});
it.each(['restoreAppOwner','resetAppOwner'])('propagates legacy %s failure after invalidation',async method=>{
 const invalidate=vi.fn().mockResolvedValue(undefined);const guarded=guardLegacyIdentityChanges({[method]:vi.fn().mockRejectedValue(Error('legacy failure'))},{invalidate});
 await expect(guarded[method]()).rejects.toThrow('legacy failure');expect(invalidate).toHaveBeenCalledOnce();
});
