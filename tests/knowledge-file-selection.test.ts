import { afterEach, expect, it, vi } from 'vitest';
import { createKnowledgeFileSelections, KNOWLEDGE_FILE_LIMITS } from '../js/knowledge-file-selection.js';
import { librarySourceDigest } from '../js/knowledge-library-source.js';
const text = 'Synthetic chosen document text, retained locally until the user reviews and approves indexing. No parser or selection action initializes an embedding model. '.repeat(4);
const file = (name='source.md',body=text) => new File([body],name,{type:'text/markdown'});
const scope = () => {const controller=new AbortController();return {controller,signal:controller.signal,isCurrent:()=>true};};
afterEach(()=>vi.unstubAllGlobals());
it('uses the native text parser and exposes only exact names, sizes, hashes and excerpt counts',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No network during text selection');}));
 const store=createKnowledgeFileSelections(),owner=scope(),selected=await store.select([file()],owner);
 expect(JSON.stringify(selected)).not.toContain('Synthetic chosen');expect(selected.files[0]).toMatchObject({name:'source.md',bytes:new TextEncoder().encode(text).length,contentHash:librarySourceDigest(new TextEncoder().encode(text))});
 expect(selected.documents[0]).toMatchObject({source:'source.md',characters:text.length,utf8Bytes:new TextEncoder().encode(text).length,contentHash:librarySourceDigest(text),excerpts:expect.any(Number)});
 expect(store.resolve(selected,owner)).toEqual([{name:'source.md',text}]);expect(fetch).not.toHaveBeenCalled();
 const result=store.resolve(selected,owner);result[0]!.text='altered';expect(store.resolve(selected,owner)[0]!.text).toBe(text);store.clear();
});
it('rejects cancelled and retired owners before reading any selected file',async()=>{
 const parse=vi.fn(async()=>[{name:'source.md',text}]),store=createKnowledgeFileSelections(parse),owner=scope();owner.controller.abort();
 await expect(store.select([file()],owner)).rejects.toMatchObject({noChangeApplied:true});expect(parse).not.toHaveBeenCalled();
 await expect(store.select([file()],{...scope(),isCurrent:()=>false})).rejects.toMatchObject({noChangeApplied:true});
});
it('drops chosen contents on abort and refuses subsequent resolution',async()=>{
 const store=createKnowledgeFileSelections(),owner=scope(),selected=await store.select([file()],owner);owner.controller.abort();expect(()=>store.resolve(selected,scope())).toThrow('no longer available');
});
it('does not publish staged contents if ownership changes while extraction is pending',async()=>{
 let active=true,finish!:(value:{name:string;text:string}[])=>void;
 const store=createKnowledgeFileSelections(()=>new Promise(resolve=>{finish=resolve;})),owner={...scope(),isCurrent:()=>active},pending=store.select([file()],owner);
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));active=false;finish([{name:'source.md',text}]);await expect(pending).rejects.toMatchObject({noChangeApplied:true});
});
it('binds source descriptors to the exact original bytes and rejects forged/reloaded tokens',async()=>{
 const store=createKnowledgeFileSelections(),owner=scope(),selected=await store.select([file()],owner);
 expect(()=>store.resolve({...selected,documents:[{...selected.documents[0]!,source:'other.md'}]},owner)).toThrow('exact chosen source');
 expect(()=>createKnowledgeFileSelections().resolve(selected,owner)).toThrow('no longer available');
 const another=await store.select([file('other.md')],owner);expect(another.digest).not.toBe(selected.digest);store.clear();
});
it('rejects duplicate indexed names without silently accepting the last file',async()=>{
 const store=createKnowledgeFileSelections();await expect(store.select([file(),file()],scope())).rejects.toThrow('same indexed filename');
});
it('refuses empty, unsupported and archive selections until complete archive review is available',async()=>{
 const store=createKnowledgeFileSelections();await expect(store.select([],scope())).rejects.toThrow('Choose between');
 await expect(store.select([file('source.zip')],scope())).rejects.toThrow('Archive review is not available yet');
 await expect(store.select([file('unsupported.xyz')],scope())).rejects.toThrow('usable documents');
 await expect(store.select([file('empty.md','')],scope())).rejects.toThrow('valid name');
});
it('bounds file bytes before invoking a parser and checks the bytes actually read',async()=>{
 const parse=vi.fn(async()=>[{name:'source.md',text}]),store=createKnowledgeFileSelections(parse),huge=file();Object.defineProperty(huge,'size',{value:KNOWLEDGE_FILE_LIMITS.fileBytes+1});
 await expect(store.select([huge],scope())).rejects.toThrow('20 MB');expect(parse).not.toHaveBeenCalled();
 const changed=file();vi.spyOn(changed,'arrayBuffer').mockResolvedValue(new ArrayBuffer(1));await expect(store.select([changed],scope())).rejects.toThrow('changed while');expect(parse).not.toHaveBeenCalled();
});
it('bounds extracted bytes and document count even when an extractor misreports its output',async()=>{
 const tooMany=createKnowledgeFileSelections(async()=>Array.from({length:101},(_,i)=>({name:`${i}.md`,text})));
 await expect(tooMany.select([file()],scope())).rejects.toThrow('at most 100');
 const expanded=createKnowledgeFileSelections(async()=>[{name:'large.md',text:'a'.repeat(KNOWLEDGE_FILE_LIMITS.extractedBytes+1)}]);
 await expect(expanded.select([file()],scope())).rejects.toThrow('16 MB');
});
it('bounds retained selections and releases a discarded input without affecting another review',async()=>{
 const store=createKnowledgeFileSelections(),owner=scope(),items=[];
 for(let i=0;i<4;i++)items.push(await store.select([file(`${i}.md`)],owner));
 await expect(store.select([file('overflow.md')],owner)).rejects.toThrow('Finish or discard');expect(store.release(items[1]!,owner)).toBe(true);
 expect(store.resolve(items[0]!,owner)[0]!.text).toBe(text);await expect(store.select([file('replacement.md')],owner)).resolves.toMatchObject({version:1});store.clear();
});

it('accepts equivalent serialized metadata in a different key order while still checking every source fact',async()=>{
 const store=createKnowledgeFileSelections(),owner=scope(),selected=await store.select([file()],owner);
 const reordered={digest:selected.digest,totalTextBytes:selected.totalTextBytes,documents:selected.documents.map(row=>({excerpts:row.excerpts,contentHash:row.contentHash,utf8Bytes:row.utf8Bytes,characters:row.characters,source:row.source})),files:selected.files.map(row=>({contentHash:row.contentHash,type:row.type,bytes:row.bytes,name:row.name})),token:selected.token,version:1 as const};
 expect(store.resolve(reordered,owner)).toEqual([{name:'source.md',text}]);store.clear();
});

it('checks total source bytes and file count before invoking an extractor',async()=>{
 const parse=vi.fn(async()=>[{name:'source.md',text}]),store=createKnowledgeFileSelections(parse);
 await expect(store.select(Array.from({length:11},(_,i)=>file(`${i}.md`)),scope())).rejects.toThrow('between 1 and 10');
 const large=Array.from({length:3},(_,i)=>{const f=file(`${i}.md`);Object.defineProperty(f,'size',{value:15*1024*1024});return f;});
 await expect(store.select(large,scope())).rejects.toThrow('40 MB');expect(parse).not.toHaveBeenCalled();
});
