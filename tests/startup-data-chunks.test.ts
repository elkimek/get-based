// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'rolldown';
import {expect, it} from 'vitest';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import {parseModuleSpecifiers} from '../scripts/architecture-map.mjs';
import {STARTUP_DATA_MODULES,startupDataChunk} from '../scripts/startup-data-chunks.mjs';
const root=process.cwd();
it('matches only exact declared canonical files while preserving strict entry signatures', () => {
  const group=startupDataChunk(root);
  expect(group.includeDependenciesRecursively).toBe(true);
  expect(new Set(STARTUP_DATA_MODULES).size).toBe(STARTUP_DATA_MODULES.length);
  for(const module of STARTUP_DATA_MODULES){expect(group.test(path.join(root,module))).toBe(true);expect(group.test(path.join(root,module)+'?lazy-retry=1')).toBe(false);}
  for(const module of ['js/chat-send.js','js/lens-local-worker.js','js/persona-storage.js','node_modules/svelte/index.js'])expect(group.test(path.join(root,module))).toBe(false);
});
it('keeps the actual emitted module dependency set closed and module initialization free of statements and browser I/O', async () => {
  const allowed=new Set<string>(STARTUP_DATA_MODULES);
  for(const module of STARTUP_DATA_MODULES){
    const code=await fs.readFile(module,'utf8');
    for(const dependency of parseModuleSpecifiers(code,module).dependencies){
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(module),dependency.specifier));
      expect(allowed.has(target),module+' depends on '+dependency.specifier).toBe(true);
    }
    const unsafe=withParsedSource(code,module,source=>{
      const errors:string[]=[];
      for(const statement of source.statements){
        if(ts.isFunctionDeclaration(statement)||ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement)||ts.isEmptyStatement(statement))continue;
        if(!ts.isVariableStatement(statement)){errors.push(statement.getText(source));continue;}
        const visit=(node:ts.Node):void=>{
          if(ts.isArrowFunction(node)||ts.isFunctionExpression(node))return;
          if(ts.isIdentifier(node)&&['window','document','navigator','localStorage','indexedDB','fetch','globalThis'].includes(node.text))errors.push(node.getText(source));
          node.forEachChild(visit);
        };
        for(const declaration of statement.declarationList.declarations)if(declaration.initializer)visit(declaration.initializer);
      }
      return errors;
    });
    expect(unsafe,module+' initialization stays local and declarative').toEqual([]);
  }
});

it('preserves entry exports, separate retry namespaces and the optional feature boundary in a real strict build', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'getbased-startup-group-'));
  try {
    await fs.mkdir(path.join(directory,'js'));
    for(const name of ['base64.js','health-goals-utils.js'])await fs.copyFile(path.join(root,'js',name),path.join(directory,'js',name));
    await fs.writeFile(path.join(directory,'js/optional-feature.js'),'export const marker="optional";');
    await fs.writeFile(path.join(directory,'main.js'),'export * as b64 from "./js/base64.js"; export * as priorities from "./js/health-goals-utils.js"; export function optional(){return import("./js/optional-feature.js")} export function retry(){return import("./js/base64.js?lazy-retry=1")}');
    const result=await build({input:path.join(directory,'main.js'),preserveEntrySignatures:'strict',plugins:[{name:'fixture-vite-query-loader',resolveId(source,importer){if(source.endsWith('?lazy-retry=1')&&importer)return path.resolve(path.dirname(importer),source);return null;},load(id){return id.endsWith('?lazy-retry=1')?fs.readFile(id.slice(0,-'?lazy-retry=1'.length),'utf8'):null;}}],output:{dir:path.join(directory,'out'),format:'es',entryFileNames:'[name].mjs',chunkFileNames:'[name]-[hash].mjs',codeSplitting:{groups:[startupDataChunk(directory)]}}});
    const chunks=result.output.filter(item=>item.type==='chunk'),group=chunks.find(chunk=>chunk.name==='startup-data-contracts');
    expect(group).toBeDefined();expect(group!.moduleIds.sort()).toEqual(['\0rolldown/runtime.js',...['base64.js','health-goals-utils.js'].map(name=>path.join(directory,'js',name))].sort());
    const entry=chunks.find(chunk=>chunk.isEntry)!;
    expect(entry.exports).toEqual(['b64','optional','priorities','retry']);
    expect(entry.imports).toContain(group!.fileName);
    const optional=chunks.find(chunk=>chunk.moduleIds.includes(path.join(directory,'js/optional-feature.js')))!;
    expect(entry.imports).not.toContain(optional.fileName);expect(entry.dynamicImports).toContain(optional.fileName);
    const namespace=await import(pathToFileURL(path.join(directory,'out',entry.fileName)).href) as {b64:Record<string,unknown>;retry:()=>Promise<Record<string,unknown>>};
    const retry=await namespace.retry();expect(retry).not.toBe(namespace.b64);expect(Object.keys(retry)).toEqual(Object.keys(namespace.b64));
    expect(retry.bytesToBase64).not.toBe(namespace.b64.bytesToBase64);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
