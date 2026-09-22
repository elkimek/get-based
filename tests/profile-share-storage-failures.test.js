import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({statfs:vi.fn()}));
vi.mock('node:fs',async original=>{const real=await original();return {...real,statfsSync:(...args)=>mocks.statfs(...args)??real.statfsSync(...args)};});
import { createSqliteProfileShareStore, ProfileShareStoreConflictError } from '../lib/profile-share-sqlite-store.js';
const resources=[];
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'getbased-store-failure-'));
 const settings={databasePath:join(directory,'shares.sqlite'),rateLimitHmacKey:'fixture-private-key-with-more-than-32-characters',maxDatabaseBytes:67108864};
 const store=createSqliteProfileShareStore(settings);resources.push(()=>{try{store.close();}catch{}rmSync(directory,{recursive:true,force:true});});return {store,settings,directory};
}
afterEach(()=>{for(const cleanup of resources.splice(0))cleanup();mocks.statfs.mockReset();vi.useRealTimers();});
it.each(['','relative.sqlite'])('rejects non-absolute database location %s before touching disk',path=>{
 expect(()=>createSqliteProfileShareStore({databasePath:path,rateLimitHmacKey:'x'.repeat(32)})).toThrow('absolute path');
});
it('rejects a short rate identity key before creating the database',()=>{expect(()=>createSqliteProfileShareStore({databasePath:'/unused/test.sqlite',rateLimitHmacKey:'short'})).toThrow('32 characters');});
it.each(['get','put','list','delete'])('pre-cancelled %s preserves stored records',async operation=>{
 const {store}=fixture();await store.put('shares/a','original');const controller=new AbortController(),reason=new Error('cancelled-fixture');controller.abort(reason);
 const options={abortSignal:controller.signal};const pending=operation==='get'?store.get('shares/a',options):operation==='put'?store.put('shares/a','replacement',{...options,allowOverwrite:true}):operation==='list'?store.list(options):store.delete(['shares/a'],options);
 await expect(pending).rejects.toBe(reason);expect(await store.get('shares/a')).toBe('original');
});
it.each(['../escape','bad?query',''])('rejects invalid object key %s',async key=>{
 const {store}=fixture();await expect(store.put(key,'{}')).rejects.toThrow('pathname');await expect(store.get(key)).rejects.toThrow('pathname');
});
it.each([{prefix:'../'},{prefix:'bad?'},{cursor:'../escape'}])('rejects unsafe listing filters %j',async options=>{const {store}=fixture();await expect(store.list(options)).rejects.toThrow('Invalid');});
it('rolls back earlier deletions when a later SQLite deletion fails',async()=>{
 const {store,settings}=fixture();await store.put('shares/a','first');await store.put('shares/b','second');
 const db=new DatabaseSync(settings.databasePath);
 try{db.exec("CREATE TRIGGER fail_second BEFORE DELETE ON profile_share_objects WHEN OLD.pathname = 'shares/b' BEGIN SELECT RAISE(ABORT, 'fixture deletion denied'); END;");
 await expect(store.delete(['shares/a','shares/b'])).rejects.toThrow('fixture deletion denied');
 expect(await store.get('shares/a')).toBe('first');expect(await store.get('shares/b')).toBe('second');
 db.exec('DROP TRIGGER fail_second');await store.delete(['shares/a','shares/b']);expect((await store.list()).blobs).toEqual([]);
 }finally{db.close();}
});
it('validates all deletion keys before modifying any record',async()=>{
 const {store}=fixture();await store.put('shares/a','first');await expect(store.delete(['shares/a','../invalid'])).rejects.toThrow('pathname');expect(await store.get('shares/a')).toBe('first');
});
it('deduplicates deletion keys and permits an empty deletion',async()=>{
 const {store}=fixture();await store.put('shares/a','first');await store.delete([]);expect(await store.get('shares/a')).toBe('first');await store.delete(['shares/a','shares/a']);expect(await store.get('shares/a')).toBeNull();
});
it('rejects a write below the host disk reserve without modifying the previous value',async()=>{
 const {store}=fixture();await store.put('shares/a','first');mocks.statfs.mockReturnValue({bavail:1,bsize:4096});
 await expect(store.put('shares/a','replacement',{allowOverwrite:true})).rejects.toThrow('disk reserve');expect(await store.get('shares/a')).toBe('first');
});
it('counts UTF-8 bytes rather than characters at the object limit',async()=>{
 const {store}=fixture();await expect(store.put('shares/large','😀'.repeat(1048577))).rejects.toThrow('too large');expect(await store.get('shares/large')).toBeNull();
});
it.each([new ProfileShareStoreConflictError(),new Error('UNIQUE constraint failed'),new Error('disk failed')])('classifies only conflict-like storage errors: %s',error=>{
 const {store}=fixture();expect(store.isPreconditionFailure(error)).toBe(!error.message.includes('disk'));
});
it('persists records across close and reopen with restrictive permissions',async()=>{
 const {store,settings,directory}=fixture();await store.put('shares/a','persistent');store.close();const reopened=createSqliteProfileShareStore(settings);
 try{expect(await reopened.get('shares/a')).toBe('persistent');expect(statSync(directory).mode&0o777).toBe(0o700);expect(statSync(settings.databasePath).mode&0o777).toBe(0o600);}finally{reopened.close();}
});
it('uses literal listing prefixes and stops pagination cleanly',async()=>{
 const {store}=fixture();await store.put('a/one','1');await store.put('a/two','2');await store.put('ab/three','3');
 const page=await store.list({prefix:'a/',limit:1});expect(page.blobs.map(x=>x.pathname)).toEqual(['a/one']);
 const last=await store.list({prefix:'a/',limit:1,cursor:page.cursor});expect(last.blobs.map(x=>x.pathname)).toEqual(['a/two']);expect(last.hasMore).toBe(false);expect(last).not.toHaveProperty('cursor');
});
it('rotates the private rate-limit identifier daily without exposing the subject',()=>{
 const {store}=fixture();vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));const first=store.hashRateLimitSubject('198.51.100.4');
 expect(store.hashRateLimitSubject('198.51.100.4')).toBe(first);vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));expect(store.hashRateLimitSubject('198.51.100.4')).not.toBe(first);expect(first).toMatch(/^[0-9a-f]{64}$/);
});
