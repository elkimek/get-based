import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {TraceMap, originalPositionFor} from '@jridgewell/trace-mapping';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import type {Page} from '@playwright/test';

/** Supply only the synthetic Sync owner normally delivered by the Evolu worker.
 * The shipping application performs credential rotation, persistence and signing. */
export async function attachSyntheticSyncOwner(page:Page,artifact:string) {
  const directory=path.join(artifact,'_app/immutable/chunks');
  const bindings: Array<{chunk:string; name:string}>=[];
  for(const file of await fs.readdir(directory)) {
    if(!file.endsWith('.js.map')) continue;
    const raw=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));
    if(!raw.sources.some((source:string)=>source.endsWith('/js/sync-runtime.js'))) continue;
    const script=file.slice(0,-4),code=await fs.readFile(path.join(directory,script),'utf8'), map=new TraceMap(raw);
    withParsedSource(code,script,source=>{
      const names=new Set<string>();
      for(const item of source.statements) if(ts.isFunctionDeclaration(item) && item.name) {
        const position=source.getLineAndCharacterOfPosition(item.name.getStart(source));
        const original=originalPositionFor(map,{line:position.line+1,column:position.character});
        if(original.name==='setSyncAppOwner' && original.source?.endsWith('/js/sync-runtime.js')) names.add(item.name.text);
      }
      for(const item of source.statements) if(ts.isExportDeclaration(item) && !item.moduleSpecifier && item.exportClause && ts.isNamedExports(item.exportClause)) {
        for(const row of item.exportClause.elements) if(names.has((row.propertyName??row.name).text)) bindings.push({chunk:'/_app/immutable/chunks/'+script,name:row.name.text});
      }
    });
  }
  assert.equal(bindings.length,1,'Exactly one source-mapped, exported shipping Sync owner setter');
  await page.evaluate(async({chunk,name})=>{const module=await import(chunk);module[name]({id:'test-offline-agent-owner',writeKey:new Uint8Array(32).fill(7)});},bindings[0]!);
}

export function readPersistedAgentAccess(page:Page) {
  return page.evaluate(async()=>{
    const open=indexedDB.open('labcharts-blobs',1);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
    try{
      const request=db.transaction('kv','readonly').objectStore('kv').get('labcharts-default-imported');
      const raw=await new Promise<string>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      return JSON.parse(raw).agentAccess as {enabled:boolean;token:string|null;contextKey:string|null;revokedAt:number|null};
    }finally{db.close();}
  });
}
