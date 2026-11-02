import { packLabPanelRows } from '../js/lab-panel-identity.js';
import type { LabEntryDraft } from '../js/lab-entry.js';
import {afterEach,expect,it,vi} from 'vitest';
import {mergeArrayRowsIntoImported} from '../js/sync-delta-array-merge.js';
import {mergeMapRowsIntoImported} from '../js/sync-delta-map-merge.js';
import {mergeScalarRowsIntoImported} from '../js/sync-delta-scalar-merge.js';
import {prepareSyncPullRows} from '../js/sync-pull-merge.js';
import {configureSyncDelta,_applyArrayDelta,_mergeItemRowsIntoImported,acknowledgePulledArrayVersions} from '../js/sync-delta.js';
import {_djb2} from '../js/sync-delta-id.js';
import {applyCommittedDeltas} from '../js/sync-push-deltas.js';
import {_planKeyedMapDelta} from '../js/sync-delta-map-planner.js';
import {_planArrayDelta} from '../js/sync-delta-array-planner.js';
import {_planScalarDelta} from '../js/sync-delta-scalar-planner.js';
import {_readDeltaSnapshot,readArrayVersions,writeArrayVersions} from '../js/sync-delta-snapshot.js';
import type {PulledArrayVersions} from '../js/sync-delta-snapshot.js';
import type {DeltaItemRow} from '../js/sync-delta-row-codec.js';
const at='2026-11-01T00:00:00.000Z',later='2026-11-01T00:00:01.000Z',profileId='convergence_test';
const row=(id:string,payload:unknown,syncedAt=at):DeltaItemRow=>({id,profileId,arrayName:'markerNotes',itemId:'marker_1',payload:JSON.stringify(payload),syncedAt});
it('acknowledges received map tombstones without suppressing an identical restoration', async()=>{
 const {acknowledgePulledMapSnapshots}=await import('../js/sync-delta-merge.js');
 const { _writeDeltaSnapshot }=await import('../js/sync-delta-snapshot.js');
 const rows=[{...row('physical',{k:'marker_1',v:'same'},later),isDeleted:1}];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 _writeDeltaSnapshot(profileId,'markerNotes',{marker_1:_djb2(JSON.stringify({k:'marker_1',v:'same'}))},1);
 const snapshots: import('../js/sync-delta-merge.js').PulledMapSnapshots={};
 const data={markerNotes:{marker_1:'same'}};await _mergeItemRowsIntoImported(profileId,data,{mapSnapshots:snapshots});
 expect(data.markerNotes).toEqual({});
 acknowledgePulledMapSnapshots(profileId,data,2,snapshots);
 expect(_readDeltaSnapshot(profileId,'markerNotes')).toEqual({});
 const restored=await _planKeyedMapDelta(profileId,'markerNotes',{marker_1:'same'});
 expect(restored.ops).toHaveLength(1);expect(restored.ops[0]!.args.isDeleted).toBe(0);
});
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();configureSyncDelta({getEvolu:()=>null,getItemRowQuery:()=>null});});
it('map and scalar duplicate winners do not depend on query order',async()=>{
 const maps=[row('a',{k:'marker_1',v:'alpha'}),row('b',{k:'marker_1',v:'beta'})],scalars=[row('a',{v:'alpha'}),row('b',{v:'beta'})].map(r=>({...r,itemId:'contextNotes'}));
 const results=[];
 for(const reverse of [false,true]){const data:Record<string,unknown>={};await mergeMapRowsIntoImported(data,'markerNotes',reverse?[...maps].reverse():maps);await mergeScalarRowsIntoImported(data,'contextNotes',reverse?[...scalars].reverse():scalars);results.push(data);}
 expect(results[0]).toEqual(results[1]);
});
it('committed array duplicates converge while an unrepresented local edit is retained',async()=>{
 const items=[{id:'sun_1',minutes:10,updatedAt:Date.parse(at)},{id:'sun_1',minutes:20,updatedAt:Date.parse(at)}],rows=items.map((item,i)=>({...row(String(i),item),itemId:'sun_1'}));
 const results=[];
 for(const item of items){const data={sunSessions:[item]};await mergeArrayRowsIntoImported(data,'sunSessions',rows);results.push(data);}
 expect(results[0]).toEqual(results[1]);
 const draft={sunSessions:[{...items[0]!,minutes:30}]};await mergeArrayRowsIntoImported(draft,'sunSessions',rows);expect(draft.sunSessions[0]!.minutes).toBe(30);
});
it('an in-place row update replaces an older committed array value with the same embedded timestamp',async()=>{
 const previous={id:'sun_1',minutes:10,updatedAt:Date.parse(at)},incoming={...previous,minutes:20};
 const rows=[{...row('physical',incoming,later),arrayName:'sunSessions',itemId:'sun_1'}];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 localStorage.setItem(`labcharts-${profileId}-delta-sunSessions-versions`,JSON.stringify({sun_1:{hash:_djb2(JSON.stringify(previous)),clock:Date.parse(at)}}));
 const data={sunSessions:[previous]};await _mergeItemRowsIntoImported(profileId,data);expect(data.sunSessions[0]!.minutes).toBe(20);
});
it('an older query result cannot replace a just-committed array value',async()=>{
 const current={id:'sun_1',minutes:20,updatedAt:Date.parse(at)},older={...current,minutes:10};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[{...row('physical',older),arrayName:'sunSessions',itemId:'sun_1'}],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 writeArrayVersions(profileId,'sunSessions',{sun_1:{hash:_djb2(JSON.stringify(current)),clock:Date.parse(later)}});
 const data={sunSessions:[current]};await _mergeItemRowsIntoImported(profileId,data);expect(data.sunSessions[0]!.minutes).toBe(20);
});
it.each([false,true])('legacy committed array values migrate without a new receipt (clock metadata: %s)',async withClock=>{
 const previous={id:'sun_1',minutes:10,updatedAt:Date.parse(at)},incoming={...previous,minutes:20};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[{...row('physical',incoming,later),arrayName:'sunSessions',itemId:'sun_1'}],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 localStorage.setItem(`labcharts-${profileId}-delta-sunSessions`,JSON.stringify({sun_1:_djb2(JSON.stringify(previous))}));
 if(withClock)localStorage.setItem(`labcharts-${profileId}-delta-sunSessions-meta`,JSON.stringify({plannedAt:Date.parse(at)}));
 const current={sunSessions:[previous]};await _mergeItemRowsIntoImported(profileId,current);expect(current.sunSessions[0]!.minutes).toBe(20);
 const draft={sunSessions:[{...previous,minutes:30}]};await _mergeItemRowsIntoImported(profileId,draft);expect(draft.sunSessions[0]!.minutes).toBe(30);
 expect(readArrayVersions(profileId,'sunSessions')).toEqual({});
});
it('a legacy planning clock bounds older query rows and cannot override an actual receipt',async()=>{
 const previous={id:'sun_1',minutes:10,updatedAt:Date.parse(at)},incoming={...previous,minutes:20};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[{...row('physical',incoming),arrayName:'sunSessions',itemId:'sun_1'}],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 localStorage.setItem(`labcharts-${profileId}-delta-sunSessions`,JSON.stringify({sun_1:_djb2(JSON.stringify(previous))}));
 localStorage.setItem(`labcharts-${profileId}-delta-sunSessions-meta`,JSON.stringify({plannedAt:Date.parse(later)}));
 const current={sunSessions:[previous]};await _mergeItemRowsIntoImported(profileId,current);expect(current.sunSessions[0]!.minutes).toBe(10);
 localStorage.removeItem(`labcharts-${profileId}-delta-sunSessions-meta`);
 writeArrayVersions(profileId,'sunSessions',{sun_1:{hash:_djb2(JSON.stringify(incoming)),clock:Date.parse(at)}});
 await _mergeItemRowsIntoImported(profileId,current);expect(current.sunSessions[0]!.minutes).toBe(10);
});
it('pull-only receipts survive reload and never acknowledge a value changed during persistence',async()=>{
 const first={id:'sun_1',minutes:10,updatedAt:Date.parse(at)},second={...first,minutes:20};
 let rows=[{...row('physical',first),arrayName:'sunSessions',itemId:'sun_1'}];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const versions:PulledArrayVersions={},data={sunSessions:[] as typeof first[]};
 await _mergeItemRowsIntoImported(profileId,data,{arrayVersions:versions});expect(readArrayVersions(profileId,'sunSessions')).toEqual({});
 acknowledgePulledArrayVersions(profileId,data,versions);expect(readArrayVersions(profileId,'sunSessions').sun_1!.clock).toBe(Date.parse(at));
 rows=[{...row('physical',second,later),arrayName:'sunSessions',itemId:'sun_1'}];
 const reloaded=JSON.parse(JSON.stringify(data)) as typeof data,nextVersions:PulledArrayVersions={};
 await _mergeItemRowsIntoImported(profileId,reloaded,{arrayVersions:nextVersions});expect(reloaded.sunSessions[0]!.minutes).toBe(20);
 const draft={sunSessions:[{...first,minutes:30}]};acknowledgePulledArrayVersions(profileId,draft,nextVersions);
 expect(readArrayVersions(profileId,'sunSessions').sun_1!.clock).toBe(Date.parse(at));
 await _mergeItemRowsIntoImported(profileId,draft);expect(draft.sunSessions[0]!.minutes).toBe(30);
});
it('array push receipts wait for their own acknowledgement',async()=>{
 let complete:()=>void=()=>{};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[],insert:(_table,_args,options?:{onComplete?:()=>void})=>{complete=options!.onComplete!;},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const plan=await _planArrayDelta(profileId,'sunSessions',[{id:'sun_1',minutes:10}]);
 const pending=applyCommittedDeltas(profileId,'blob',[{arrayName:'sunSessions',plan}],1,()=>{});
 expect(readArrayVersions(profileId,'sunSessions')).toEqual({});complete();expect(await pending).toBe(true);
 expect(readArrayVersions(profileId,'sunSessions').sun_1).toEqual({hash:plan.next.sun_1,clock:Date.parse(String(plan.ops[0]!.args.syncedAt))});
});
it('an edit back to an older pushed value is planned against the newer received receipt',async()=>{
 const previous={id:'sun_1',minutes:10},incoming={...previous,minutes:20};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[{...row('physical',incoming,later),arrayName:'sunSessions',itemId:'sun_1'}],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 localStorage.setItem(`labcharts-${profileId}-delta-sunSessions`,JSON.stringify({sun_1:_djb2(JSON.stringify(previous))}));
 writeArrayVersions(profileId,'sunSessions',{sun_1:{hash:_djb2(JSON.stringify(incoming)),clock:Date.parse(later)}});
 const plan=await _planArrayDelta(profileId,'sunSessions',[previous]);expect(plan.ops).toHaveLength(1);expect(JSON.parse(plan.ops[0]!.args.payload!)).toEqual(previous);
});
it('received membership can be deleted, and its receipt supports restoring an identical value',async()=>{
 const item={id:'sun_1',minutes:10};let rows=[{...row('physical',item),arrayName:'sunSessions',itemId:'sun_1'}];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:(_table,_args,options?:{onComplete?:()=>void})=>options?.onComplete?.(),update:(_table,_args,options?:{onComplete?:()=>void})=>options?.onComplete?.()}),getItemRowQuery:()=> 'query'});
 writeArrayVersions(profileId,'sunSessions',{sun_1:{hash:_djb2(JSON.stringify(item)),clock:Date.parse(at)}});
 const removed=await _planArrayDelta(profileId,'sunSessions',[]);expect(removed.ops).toHaveLength(1);expect(removed.ops[0]!.itemId).toBe('sun_1');
 expect(await applyCommittedDeltas(profileId,'blob',[{arrayName:'sunSessions',plan:removed}],1,()=>{})).toBe(true);
 const receipt=readArrayVersions(profileId,'sunSessions').sun_1!;expect(receipt.hash).toBeNull();
 const stale={sunSessions:[] as typeof item[]};await _mergeItemRowsIntoImported(profileId,stale);expect(stale.sunSessions).toEqual([]);
 rows=[{...rows[0]!,isDeleted:1}];
 const restored=await _planArrayDelta(profileId,'sunSessions',[item]);expect(restored.ops).toHaveLength(1);expect(restored.ops[0]!.args.isDeleted).toBe(0);
 expect(Date.parse(String(restored.ops[0]!.args.syncedAt))).toBeGreaterThan(receipt.clock);
});
it('an unchanged received value cannot resurrect a newly observed remote deletion',async()=>{
 const item={id:'sun_1',minutes:10};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[{...row('physical',item,later),arrayName:'sunSessions',itemId:'sun_1',isDeleted:1}],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 writeArrayVersions(profileId,'sunSessions',{sun_1:{hash:_djb2(JSON.stringify(item)),clock:Date.parse(at)}});
 expect((await _planArrayDelta(profileId,'sunSessions',[item])).ops).toEqual([]);
});
it('a newer unrelated profile timestamp cannot undo an acknowledged item deletion',async()=>{
 const item={id:'sun_1',minutes:10,updatedAt:Date.parse(at)};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[{...row('physical',item,later),arrayName:'sunSessions',itemId:'sun_1',isDeleted:1}],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 writeArrayVersions(profileId,'sunSessions',{sun_1:{hash:null,clock:Date.parse(later)}});
 const data={sunSessions:[item]};await _mergeItemRowsIntoImported(profileId,data,{baselineImported:structuredClone(data),baselineSyncedAt:Date.parse(later)+1000});
 expect(data.sunSessions).toEqual([]);
});
it.each([false,true])('map deletion is ordered against live duplicates; restore=%s',async restore=>{
 const rows=[row('a',{k:'marker_1',v:'old'}),{...row('b',null,later),isDeleted:1}];
 if(restore)rows.push(row('c',{k:'marker_1',v:'restored'},'2026-11-01T00:00:02.000Z'));
 for(const input of [rows,[...rows].reverse()]){const data={markerNotes:{marker_1:'old'}};await mergeMapRowsIntoImported(data,'markerNotes',input);expect(data.markerNotes).toEqual(restore?{marker_1:'restored'}:{});}
});
it('an incomplete duplicate does not mask a complete profile, including v4 metadata',async()=>{
 const good={id:'a',profileId,syncedAt:at,dataJson:JSON.stringify({_v:4,profile:{id:profileId}})},bad={id:'b',profileId,syncedAt:later,dataJson:null};
 expect((await prepareSyncPullRows([good,bad]))[0]!.id).toBe('a');
});
it('profile duplicates with equal clocks select the same row in either order',async()=>{
 const rows=['a','b'].map(id=>({id,profileId,syncedAt:at,dataJson:JSON.stringify({_v:3,importedData:{contextNotes:id}})}));
 expect((await prepareSyncPullRows(rows))[0]!.id).toBe((await prepareSyncPullRows([...rows].reverse()))[0]!.id);
});
it('unacknowledged row writes remain retryable until every row has completed',async()=>{
 const callbacks:Array<()=>void>=[],query=Symbol('query');
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[],insert:(_table,_args,options?:{onComplete?:()=>void})=>{expect(options?.onComplete).toBeTypeOf('function');callbacks.push(options!.onComplete!);},update:()=>{}}),getItemRowQuery:()=>query});
 const values={rs1:{genotype:'AA'},rs2:{genotype:'CC'}},plan=await _planKeyedMapDelta(profileId,'genetics.snps',values);
 const pending=applyCommittedDeltas(profileId,'blob',[{arrayName:'genetics.snps',plan}],2,()=>{});
 await Promise.resolve();expect(_readDeltaSnapshot(profileId,'genetics.snps')).toEqual({});expect(callbacks).toHaveLength(2);
 callbacks[0]!();await Promise.resolve();expect(_readDeltaSnapshot(profileId,'genetics.snps')).toEqual({});callbacks[1]!();expect(await pending).toBe(true);expect(_readDeltaSnapshot(profileId,'genetics.snps')).toEqual(plan.next);
});

it('same-clock deletion wins over a duplicate live value regardless of physical ID',async()=>{
 const rows=[row('z',{k:'marker_1',v:'old'}),{...row('a',null),isDeleted:1}];
 const data={markerNotes:{marker_1:'old'}};await mergeMapRowsIntoImported(data,'markerNotes',rows);expect(data.markerNotes).toEqual({});
});
it('aborting a pending delta commit retains its snapshot for retry and ignores late callbacks',async()=>{
 let complete:()=>void=()=>{};
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[],insert:(_table,_args,options?:{onComplete?:()=>void})=>{complete=options!.onComplete!;},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const plan=await _planKeyedMapDelta(profileId,'markerNotes',{marker_1:'value'}),abort=new AbortController();
 const pending=applyCommittedDeltas(profileId,'blob',[{arrayName:'markerNotes',plan}],1,()=>{},{signal:abort.signal});
 abort.abort();expect(await pending).toBe(false);complete();await Promise.resolve();expect(_readDeltaSnapshot(profileId,'markerNotes')).toEqual({});
});
it('a superseded delta acknowledgement cannot advance its receipt',async()=>{
 let complete:()=>void=()=>{},current=true;
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[],insert:(_table,_args,options?:{onComplete?:()=>void})=>{complete=options!.onComplete!;},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const plan=await _planKeyedMapDelta(profileId,'markerNotes',{marker_1:'older'});
 const pending=applyCommittedDeltas(profileId,'blob',[{arrayName:'markerNotes',plan}],1,()=>{},{isCurrent:()=>current});
 current=false;complete();expect(await pending).toBe(false);expect(_readDeltaSnapshot(profileId,'markerNotes')).toEqual({});
});

it('an explicit map deletion advances past observed versions when the wall clock is behind',async()=>{
 const live=row('a',{k:'marker_1',v:'old'},'2099-01-01T00:00:00.000Z');
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[live],insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 localStorage.setItem(`labcharts-${profileId}-delta-markerNotes`,JSON.stringify({marker_1:'old_hash'}));
 const absent=await _planKeyedMapDelta(profileId,'markerNotes',undefined);expect(absent.ops).toEqual([]);expect(absent.next).toEqual({marker_1:'old_hash'});
 const removed=await _planKeyedMapDelta(profileId,'markerNotes',{});expect(removed.ops).toHaveLength(1);expect(Date.parse(String(removed.ops[0]!.args.syncedAt))).toBeGreaterThan(Date.parse(String(live.syncedAt)));
});
it('a retired runtime cannot queue any delta mutations',async()=>{
 let writes=0;configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[],insert:()=>{writes++;},update:()=>{writes++;}}),getItemRowQuery:()=> 'query'});
 const plan=await _planKeyedMapDelta(profileId,'markerNotes',{marker_1:'older'});
 expect(await applyCommittedDeltas(profileId,'blob',[{arrayName:'markerNotes',plan}],1,()=>{},{isCurrent:()=>false})).toBe(false);expect(writes).toBe(0);
});

it('an omitted array preserves membership while explicit intent removes only its named item',async()=>{
 const rows=['keep','remove'].map(id=>({...row(id,{id}),arrayName:'sunSessions',itemId:id}));
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const previous={keep:'keep_hash',remove:'remove_hash'};
 localStorage.setItem(`labcharts-${profileId}-delta-sunSessions`,JSON.stringify(previous));
 expect(await _planArrayDelta(profileId,'sunSessions',undefined)).toMatchObject({ops:[],next:previous});
 const explicit=await _planArrayDelta(profileId,'sunSessions',undefined,{explicitTombstoneIds:['remove']});
 expect(explicit.ops).toEqual([expect.objectContaining({kind:'tombstone',args:expect.objectContaining({id:'remove'})})]);
 expect(explicit.next).toEqual({keep:'keep_hash'});
 const cleared=await _planArrayDelta(profileId,'sunSessions',[]);expect(cleared.ops).toHaveLength(2);expect(cleared.next).toEqual({});
});
it('scalar planning reuses the same canonical duplicate in either query order',async()=>{
 const rows=[row('z',{v:'old'}),{...row('a',null),isDeleted:1}].map(r=>({...r,arrayName:'contextNotes',itemId:'contextNotes'}));
 for(const input of [rows,[...rows].reverse()]){
  configureSyncDelta({getEvolu:()=>({getQueryRows:()=>input,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
  const plan=await _planScalarDelta(profileId,'contextNotes','restored');expect(plan.ops[0]!.args).toMatchObject({id:'a',isDeleted:0});
  expect(Date.parse(String(plan.ops[0]!.args.syncedAt))).toBeGreaterThan(Date.parse(at));
 }
});
it('SNP row fallback does not resurrect an older live duplicate behind a newer deletion',async()=>{
 const rows=[{...row('a',{k:'rs1',v:{genotype:'AA'}}),arrayName:'genetics.snps',itemId:'rs1'},
 {...row('b',null,later),arrayName:'genetics.snps',itemId:'rs1',isDeleted:1}];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 expect((await _planKeyedMapDelta(profileId,'genetics.snps',{})).ops).toEqual([]);
});
it('a malformed newer duplicate leaves a decodable profile available',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const good={id:'a',profileId,syncedAt:at,dataJson:'{"_v":3,"importedData":{}}'};
 expect((await prepareSyncPullRows([good,{...good,id:'b',syncedAt:later,dataJson:'{'}]))[0]!.id).toBe('a');
 expect((await prepareSyncPullRows([good,{...good,id:'b',syncedAt:later,dataJson:'{"_v":3,"importedData":"invalid"}'}]))[0]!.id).toBe('a');
});
it('a synchronous row failure settles once even when other acknowledgements arrive later',()=>{
 let complete:()=>void=()=>{},writes=0;const done=vi.fn();vi.spyOn(console,'warn').mockImplementation(()=>{});
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>[],insert:(_table,_args,options?:{onComplete?:()=>void})=>{
  if(writes++===0)throw new Error('synthetic row rejection');complete=options!.onComplete!;
 },update:()=>{}}),getItemRowQuery:()=> 'query'});
 const args={profileId,arrayName:'markerNotes',itemId:'marker_1',payload:'{}'};
 expect(_applyArrayDelta('markerNotes',{ops:[{kind:'insert',args},{kind:'insert',args}]},done)).toBe(false);
 expect(done).toHaveBeenCalledExactlyOnceWith(false);complete();complete();expect(done).toHaveBeenCalledTimes(1);
});

it('acknowledges a packed day only after every specimen survives the durable profile write', async () => {
 const date='2026-10-20',panels:LabEntryDraft[]=[
  {date,panelId:'serum_panel',specimen:'serum',markers:{'hormones.cortisol':350},sourceFile:'serum.pdf'},
  {date,panelId:'saliva_panel',specimen:'saliva',markers:{'hormones.cortisol':3},sourceFile:'saliva.pdf'},
 ];
 const packed=packLabPanelRows(panels)[0]!,rows=[{...row('packed',packed,later),arrayName:'entries',itemId:date}];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const data={entries:[] as LabEntryDraft[]},versions:PulledArrayVersions={};
 await _mergeItemRowsIntoImported(profileId,data,{arrayVersions:versions});
 expect(data.entries).toHaveLength(2);expect(packLabPanelRows(data.entries)).toEqual([packed]);
 expect(readArrayVersions(profileId,'entries')).toEqual({});
 const incomplete={entries:data.entries.slice(0,1)};
 acknowledgePulledArrayVersions(profileId,incomplete,versions);expect(readArrayVersions(profileId,'entries')).toEqual({});
 acknowledgePulledArrayVersions(profileId,structuredClone(data),versions);
 expect(readArrayVersions(profileId,'entries')[date]).toEqual({hash:_djb2(JSON.stringify(packed)),clock:Date.parse(later)});
 expect((await _planArrayDelta(profileId,'entries',data.entries)).ops).toEqual([]);
});
it.each([false,true])('unions duplicate same-day specimen rows without acknowledging a partial carrier: reversed=%s', async reverse => {
 const date='2026-10-20',panels:LabEntryDraft[]=[
  {date,panelId:'serum_panel',specimen:'serum',markers:{'hormones.cortisol':350},sourceFile:'serum.pdf'},
  {date,panelId:'saliva_panel',specimen:'saliva',markers:{'hormones.cortisol':3},sourceFile:'saliva.pdf'},
 ];
 const rows=panels.map((panel,i)=>({...row(String(i),panel,later),arrayName:'entries',itemId:date}));
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>reverse?[...rows].reverse():rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const data={entries:[] as LabEntryDraft[]},versions:PulledArrayVersions={};
 await _mergeItemRowsIntoImported(profileId,data,{arrayVersions:versions});
 expect(data.entries).toHaveLength(2);expect(packLabPanelRows(data.entries)).toEqual(packLabPanelRows(panels));
 acknowledgePulledArrayVersions(profileId,data,versions);expect(readArrayVersions(profileId,'entries')).toEqual({});
 expect((await _planArrayDelta(profileId,'entries',data.entries)).ops).toHaveLength(1);
});
it('retains explicit SNP removal history in a transport-deleted carrier and refuses a stale call', async () => {
 const removed={deletedAt:200,restoredAt:0,updatedAt:200};
 const rows=[
  {...row('history',{k:'rs429358',v:removed}),arrayName:'geneticsSnpTombstones',itemId:'rs429358',isDeleted:1},
  {...row('stale',{k:'rs429358',v:{genotype:'TT',updatedAt:100}},later),arrayName:'genetics.snps',itemId:'rs429358'},
 ];
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const data:import('../js/sync-delta-row-codec.js').DeltaImportedData={genetics:{snps:{}}};
 await _mergeItemRowsIntoImported(profileId,data);
 expect(data.geneticsSnpTombstones).toEqual({rs429358:removed});expect(data.genetics!.snps).toEqual({});
});
it('retains an explicitly restored SNP across a later transport tombstone', async () => {
 const call={genotype:'CT',updatedAt:400},data={genetics:{snps:{rs429358:call}},geneticsSnpTombstones:{rs429358:{deletedAt:200,restoredAt:400,updatedAt:400}}};
 const tomb={...row('deleted',{k:'rs429358',v:{genotype:'TT',updatedAt:100}},later),arrayName:'genetics.snps',itemId:'rs429358',isDeleted:1};
 await mergeMapRowsIntoImported(data,'genetics.snps',[tomb]);
 expect(data.genetics.snps).toEqual({rs429358:call});expect(data.geneticsSnpTombstones.rs429358).toEqual({deletedAt:200,restoredAt:400,updatedAt:400});
});

it('does not acknowledge merged removal history as the value of a partial physical row', async () => {
 const key='panel.2026-10-20',removed={deletedAt:100,restoredAt:0,updatedAt:100},restored={deletedAt:0,restoredAt:200,updatedAt:200};
 const rows=[row('a',{k:key,v:removed}),row('b',{k:key,v:restored},later)].map(r=>({...r,arrayName:'labPanelTombstones',itemId:key}));
 configureSyncDelta({getEvolu:()=>({getQueryRows:()=>rows,insert:()=>{},update:()=>{}}),getItemRowQuery:()=> 'query'});
 const data={labPanelTombstones:{}},snapshots:import('../js/sync-delta-merge.js').PulledMapSnapshots={};
 await _mergeItemRowsIntoImported(profileId,data,{mapSnapshots:snapshots});
 expect(data.labPanelTombstones).toEqual({[key]:{deletedAt:100,restoredAt:200,updatedAt:200}});
 const {acknowledgePulledMapSnapshots}=await import('../js/sync-delta-merge.js');
 acknowledgePulledMapSnapshots(profileId,data,Date.parse(later),snapshots);
 expect(_readDeltaSnapshot(profileId,'labPanelTombstones')).toEqual({});
 expect((await _planKeyedMapDelta(profileId,'labPanelTombstones',data.labPanelTombstones)).ops).toHaveLength(1);
});

it.each([false,true])('same-panel duplicate rows converge at equal embedded clocks while an unrepresented local edit survives: reversed=%s', async reverse => {
 const date='2026-10-20',first:LabEntryDraft={date,panelId:'serum_panel',specimen:'serum',updatedAt:100,markers:{'hormones.cortisol':350}},second={...first,markers:{'hormones.cortisol':355}};
 const rows=[first,second].map((panel,i)=>({...row(String(i),panel,later),arrayName:'entries',itemId:date}));
 const committed={entries:[structuredClone(first)]};
 await mergeArrayRowsIntoImported(committed,'entries',reverse?[...rows].reverse():rows);
 expect(committed.entries).toEqual([second]);
 const draft={entries:[{...first,markers:{'hormones.cortisol':360}}]};
 await mergeArrayRowsIntoImported(draft,'entries',reverse?[...rows].reverse():rows);
 expect(draft.entries).toEqual([{...first,markers:{'hormones.cortisol':360}}]);
});
it('a committed specimen accepts an in-place equal-clock row update without overwriting an unsaved edit', async () => {
 const date='2026-10-20',first:LabEntryDraft={date,panelId:'serum_panel',specimen:'serum',updatedAt:100,markers:{'hormones.cortisol':350}},second={...first,markers:{'hormones.cortisol':355}};
 writeArrayVersions(profileId,'entries',{[date]:{hash:_djb2(JSON.stringify(first)),clock:Date.parse(at)}});
 const rows=[{...row('physical',second,later),arrayName:'entries',itemId:date}],data={entries:[structuredClone(first)]};
 await mergeArrayRowsIntoImported(data,'entries',rows,{profileId});expect(data.entries).toEqual([second]);
 const draft={entries:[{...first,markers:{'hormones.cortisol':360}}]};
 await mergeArrayRowsIntoImported(draft,'entries',rows,{profileId});expect(draft.entries).toEqual([{...first,markers:{'hormones.cortisol':360}}]);
});

// The profile envelope can arrive before its item-row tombstone. A receiver
// may briefly republish that envelope; its clock is not an item restoration.
it('a later whole-profile echo cannot shield an acknowledged array value from deletion', async () => {
 const item = {id: 'sun_1', minutes: 10, updatedAt: Date.parse(at)};
 writeArrayVersions(profileId, 'sunSessions', {sun_1: {hash: _djb2(JSON.stringify(item)), clock: Date.parse(at)}});
 const tombstone = {...row('physical', item, later), arrayName: 'sunSessions', itemId: 'sun_1', isDeleted: 1};
 const data = {sunSessions: [item]};
 const versions: PulledArrayVersions = {};
 await mergeArrayRowsIntoImported(data, 'sunSessions', [tombstone], {
  profileId, baselineItems: [item], localItems: [item], baselineSyncedAt: Date.parse(later) + 1000,
  onVersion: (id, version) => {(versions.sunSessions ??= {})[id] = version;},
 });
 expect(data.sunSessions).toEqual([]);
 acknowledgePulledArrayVersions(profileId, data, versions);
 expect(readArrayVersions(profileId, 'sunSessions').sun_1).toEqual({hash: null, clock: Date.parse(later)});
});

it.each(['pending-local', 'newer-row'] as const)('explicit array restoration survives an older tombstone (%s)', async mode => {
 const item = {id: 'sun_1', minutes: 10, updatedAt: Date.parse(at)};
 const tombstone = {...row('deleted', item, later), arrayName: 'sunSessions', itemId: 'sun_1', isDeleted: 1};
 writeArrayVersions(profileId, 'sunSessions', {sun_1: mode === 'pending-local'
  ? {hash: null, clock: Date.parse(later)} : {hash: _djb2(JSON.stringify(item)), clock: Date.parse(at)}});
 const restored = {...row('restored', item, new Date(Date.parse(later) + 1000).toISOString()), arrayName: 'sunSessions', itemId: 'sun_1', isDeleted: 0};
 const data = {sunSessions: [item]};
 await mergeArrayRowsIntoImported(data, 'sunSessions', mode === 'newer-row' ? [tombstone, restored] : [tombstone], {
  profileId, baselineItems: [item], localItems: [item], baselineSyncedAt: Date.parse(later) + 2000,
 });
 expect(data.sunSessions).toEqual([item]);
});
