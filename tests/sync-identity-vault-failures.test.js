import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEvolu8IdentityVault, EVOLU8_IDENTITY_TOKEN_KEY as KEY } from '../js/sync-evolu8-identity-vault.js';

let storage, values, request, db, tx, store, row, indexedDb, vault;
const identity = {ownerId:'synthetic-owner',mnemonic:'synthetic recovery fixture'};
beforeEach(() => {
  vi.stubGlobal('navigator',{locks:{request:(_name,operation)=>operation()}});
  vi.useFakeTimers(); values=new Map([[KEY,'old-token']]);
  storage={getItem:vi.fn(k=>values.get(k)??null),setItem:vi.fn((k,v)=>values.set(k,v)),removeItem:vi.fn(k=>values.delete(k))};
  request={}; row={};
  store={get:vi.fn(()=>row),put:vi.fn(()=>row),delete:vi.fn(()=>row)};
  tx={objectStore:vi.fn(()=>store),abort:vi.fn(),error:null};
  db={transaction:vi.fn(()=>tx),close:vi.fn(),objectStoreNames:{contains:vi.fn(()=>true)},createObjectStore:vi.fn()};
  indexedDb={open:vi.fn(()=>request)};
  vault=createEvolu8IdentityVault({storage,indexedDb,tokenFactory:()=> 'new-token'});
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function opened() {request.result=db;request.onsuccess();await Promise.resolve();await Promise.resolve();}
async function completed(result) {row.result=result;row.onsuccess?.();tx.oncomplete();await Promise.resolve();}
it('does not return a read until its transaction commits',async()=>{
  let settled=false;const pending=vault.read().then(v=>{settled=true;return v;}); await opened();
  row.result={version:1,token:'old-token',...identity};row.onsuccess();await Promise.resolve();expect(settled).toBe(false);
  tx.oncomplete();await expect(pending).resolves.toEqual(identity);expect(db.close).toHaveBeenCalledOnce();
});
it('does not publish a token until the write transaction commits',async()=>{
  const pending=vault.write(identity);await opened();row.onsuccess();expect(storage.setItem).not.toHaveBeenCalled();
  await completed();await pending;expect(storage.setItem).toHaveBeenCalledWith(KEY,'new-token');
});
it.each(['blocked','error','timeout'])('fails closed on read open %s',async mode=>{
  const pending=vault.read();
  if(mode==='timeout') await vi.advanceTimersByTimeAsync(5000);
  else request[mode==='blocked'?'onblocked':'onerror']();
  await expect(pending).resolves.toBeNull(); expect(vi.getTimerCount()).toBe(0);
});
it.each(['blocked','error','timeout'])('rejects write open %s without publishing',async mode=>{
  const pending=vault.write(identity);const rejection=expect(pending).rejects.toThrow();
  if(mode==='timeout') await vi.advanceTimersByTimeAsync(5000);
  else request[mode==='blocked'?'onblocked':'onerror']();
  await rejection; expect(storage.setItem).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it.each(['blocked','timeout'])('closes a late open after %s',async mode=>{
  const pending=vault.read(); if(mode==='blocked') request.onblocked();else await vi.advanceTimersByTimeAsync(5000);
  await pending;request.result=db;request.onsuccess();expect(db.close).toHaveBeenCalledOnce();expect(db.transaction).not.toHaveBeenCalled();
});
it.each(['read','write'])('releases database after %s transaction abort',async method=>{
  const pending=vault[method](identity);const outcome=method==='write'?expect(pending).rejects.toThrow('aborted'):expect(pending).resolves.toBeNull();
  await opened();tx.onabort();await outcome;expect(db.close).toHaveBeenCalledOnce();expect(storage.setItem).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it.each(['read','write'])('bounds stalled %s transactions',async method=>{
  const pending=vault[method](identity);const outcome=method==='write'?expect(pending).rejects.toThrow('timed out'):expect(pending).resolves.toBeNull();
  await opened();await vi.advanceTimersByTimeAsync(5000);await outcome;expect(tx.abort).toHaveBeenCalledOnce();expect(db.close).toHaveBeenCalledOnce();
});
it('ignores request success followed by transaction failure',async()=>{
  const pending=vault.write(identity);const outcome=expect(pending).rejects.toThrow('aborted');await opened();row.onsuccess();tx.onabort();await outcome;expect(storage.setItem).not.toHaveBeenCalled();
});
it('aborts when a store operation throws synchronously',async()=>{
  store.put.mockImplementation(()=>{throw Error('quota');});const pending=vault.write(identity);const outcome=expect(pending).rejects.toThrow('quota');
  await opened();await outcome;expect(tx.abort).toHaveBeenCalledOnce();expect(db.close).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it.each([
  ['missing',null],['version',{version:2}],['token',{token:'other'}],['owner',{ownerId:''}],['mnemonic',{mnemonic:''}],['owner type',{ownerId:7}],['mnemonic type',{mnemonic:7}],
])('does not restore %s record',async (_label,override)=>{
  const pending=vault.read();await opened();await completed(override===null?null:{version:1,token:'old-token',...identity,...override});await expect(pending).resolves.toBeNull();
});
it('ignores inaccessible token storage without opening the database',async()=>{
  storage.getItem.mockImplementation(()=>{throw Error('denied');});await expect(vault.read()).resolves.toBeNull();expect(indexedDb.open).not.toHaveBeenCalled();
});
it('invalidates synchronously even when physical deletion fails',async()=>{
  const pending=vault.invalidate();expect(values.has(KEY)).toBe(false);await Promise.resolve();request.onerror();await expect(pending).resolves.toBeUndefined();
});
it('does not delete the database record if removing the commit token fails',()=>{
  storage.removeItem.mockImplementation(()=>{throw Error('denied');});expect(()=>vault.invalidate()).toThrow('denied');expect(indexedDb.open).not.toHaveBeenCalled();
});
it('does not return an identity whose token changed while reading',async()=>{
  const pending=vault.read();await opened();values.set(KEY,'replacement');await completed({version:1,token:'old-token',...identity});await expect(pending).resolves.toBeNull();
});
it('does not publish an in-flight write after invalidation',async()=>{
  const pending=vault.write(identity);const outcome=expect(pending).rejects.toThrow(/invalidated|superseded/);await opened();
  // A separate open request lets invalidation's deletion remain pending.
  const deletionRequest={};indexedDb.open.mockReturnValue(deletionRequest);const deletion=vault.invalidate();await completed();await outcome;expect(values.has(KEY)).toBe(false);await Promise.resolve();deletionRequest.onerror();await deletion;
});
it.each([null,{}, {getItem:()=>null}, {setItem:()=>{}}])('rejects writing with unavailable token storage %s',async unavailable=>{
 const isolated=createEvolu8IdentityVault({storage:unavailable,indexedDb});await expect(isolated.write(identity)).rejects.toThrow('unavailable');expect(indexedDb.open).not.toHaveBeenCalled();
});
it('rejects an empty generated commit token before any write',async()=>{
 const isolated=createEvolu8IdentityVault({storage,indexedDb,tokenFactory:()=>''});await expect(isolated.write(identity)).rejects.toThrow('token is unavailable');expect(indexedDb.open).not.toHaveBeenCalled();
});
it('does not publish a write after another context changes its token',async()=>{
 const pending=vault.write(identity);const outcome=expect(pending).rejects.toThrow('superseded');await opened();values.set(KEY,'external-owner');await completed();await outcome;expect(values.get(KEY)).toBe('external-owner');
});
it('does not return a read invalidated and reauthorized with the same token',async()=>{
 const pending=vault.read();await opened();const deletionRequest={};indexedDb.open.mockReturnValue(deletionRequest);
 const deletion=vault.invalidate();values.set(KEY,'old-token');await completed({version:1,token:'old-token',...identity});await expect(pending).resolves.toBeNull();await Promise.resolve();deletionRequest.onerror();await deletion;
});
it('does not publish an in-flight first write after invalidation',async()=>{
 values.clear();const pending=vault.write(identity);const outcome=expect(pending).rejects.toThrow('invalidated');await opened();const deletionRequest={};indexedDb.open.mockReturnValue(deletionRequest);
 const deletion=vault.invalidate();await completed();await outcome;expect(values.has(KEY)).toBe(false);await Promise.resolve();deletionRequest.onerror();await deletion;
});
it('clears timers and closes the database when transaction creation throws',async()=>{
 db.transaction.mockImplementation(()=>{throw Error('closed');});const pending=vault.write(identity);const outcome=expect(pending).rejects.toThrow('closed');await opened();await outcome;expect(db.close).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('creates the object store only for a missing upgrade schema',async()=>{
 const pending=vault.read();request.result=db;db.objectStoreNames.contains.mockReturnValue(false);request.onupgradeneeded();expect(db.createObjectStore).toHaveBeenCalledWith('identity');
 await opened();await completed(null);await pending;
});
it('does not recreate an existing store during an upgrade',async()=>{
 const pending=vault.read();request.result=db;request.onupgradeneeded();expect(db.createObjectStore).not.toHaveBeenCalled();await opened();await completed(null);await pending;
});
it('fails closed before writing when cross-context coordination is unavailable',async()=>{
 const isolated=createEvolu8IdentityVault({storage,indexedDb,lockManager:null});await expect(isolated.write(identity)).rejects.toThrow('coordination is unavailable');expect(indexedDb.open).not.toHaveBeenCalled();
});
it('rejects a queued write invalidated before acquiring the lock',async()=>{
 let acquire;const isolated=createEvolu8IdentityVault({storage,indexedDb,lockManager:{request:(_name,operation)=>new Promise((resolve,reject)=>{acquire=()=>Promise.resolve().then(operation).then(resolve,reject);})}});
 const pending=isolated.write(identity);const outcome=expect(pending).rejects.toThrow('invalidated');const begin=acquire;
 const deletion=isolated.invalidate();begin();await outcome;await Promise.resolve();expect(indexedDb.open).not.toHaveBeenCalled();
 // Finish the separately queued deletion by denying storage access.
 indexedDb.open.mockImplementation(()=>{throw Error('unavailable');});acquire();await deletion;
});
it('clears a newly published token again when queued invalidation acquires its lock',async()=>{
 let acquire;const isolated=createEvolu8IdentityVault({storage,indexedDb,lockManager:{request:(_name,operation)=>new Promise((resolve,reject)=>{acquire=()=>Promise.resolve().then(operation).then(resolve,reject);})}});
 const pending=isolated.invalidate();await Promise.resolve();values.set(KEY,'published-ahead-of-delete');acquire();await Promise.resolve();await Promise.resolve();
 expect(values.has(KEY)).toBe(false);request.onerror();await pending;expect(storage.removeItem).toHaveBeenCalledTimes(2);
});
it('does not delete the durable record if locked token invalidation is not retained',async()=>{
 let acquire;const isolated=createEvolu8IdentityVault({storage,indexedDb,lockManager:{request:(_name,operation)=>new Promise((resolve,reject)=>{acquire=()=>Promise.resolve().then(operation).then(resolve,reject);})}});
 const pending=isolated.invalidate();const outcome=expect(pending).rejects.toThrow('invalidation was not retained');await Promise.resolve();values.set(KEY,'new-token');storage.removeItem.mockImplementation(()=>{});
 acquire();await outcome;expect(indexedDb.open).not.toHaveBeenCalled();expect(values.get(KEY)).toBe('new-token');
});
