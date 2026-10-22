// @vitest-environment node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import {expect,it} from 'vitest';
import {CURRENT_RELEASE} from '../js/changelog-current.js';
const root=process.cwd();
const dataSource=readFileSync('js/changelog-data.ts','utf8');
const controller=readFileSync('js/changelog-impl.ts','utf8');
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');
function archiveLiteral(source:string):string {
 return withParsedSource(source,'js/changelog-data.ts',file=>{
  const imports=file.statements.filter(ts.isImportDeclaration);
  assert.equal(imports.length,2);assert.equal(file.statements.length,3,'Data module contains only its two imports and archive declaration');
  for(const declaration of imports)assert(ts.isStringLiteral(declaration.moduleSpecifier)&&declaration.moduleSpecifier.text==='./changelog-current.js');
  const statement=file.statements[2];assert(statement&&ts.isVariableStatement(statement));
  assert.equal(statement.declarationList.declarations.length,1);
  const declaration=statement.declarationList.declarations[0]!;
  assert(ts.isIdentifier(declaration.name)&&declaration.name.text==='CHANGELOG');
  const value=declaration.initializer;assert(value&&ts.isArrayLiteralExpression(value));
  const current=value.elements[0];assert(current&&ts.isIdentifier(current)&&current.text==='CURRENT_RELEASE');
  for(const entry of value.elements.slice(1)){
   assert(ts.isObjectLiteralExpression(entry),'Historical entries are immutable authored literals, never evaluation callbacks');
   for(const property of entry.properties){
    assert(ts.isPropertyAssignment(property)&&ts.isIdentifier(property.name));
    assert(['version','date','title','items','forceShow'].includes(property.name.text));
    const item=property.initializer;
    if(property.name.text==='items'){
     assert(ts.isArrayLiteralExpression(item));assert(item.elements.every(ts.isStringLiteral),'Authored item strings only');
    }else if(property.name.text==='forceShow')assert.equal(item.kind,ts.SyntaxKind.TrueKeyword);
    else assert(ts.isStringLiteral(item),'Release metadata stays literal');
   }
  }
  return source.slice(value.getStart(file),value.end);
 });
}
// Appending a new release must preserve the previous current entries and the
// independently qualified 1.22-and-earlier archive; never replace their pins.
function previousCurrentLiteral(source:string,version:'1.24.0'|'1.23.0'='1.24.0'):string {
 return withParsedSource(source,'js/changelog-data.ts',file=>{
  const statement=file.statements[2];assert(statement&&ts.isVariableStatement(statement));
  const value=statement.declarationList.declarations[0]?.initializer;
  assert(value&&ts.isArrayLiteralExpression(value));
  const previous=value.elements[version==='1.24.0'?1:2];assert(previous&&ts.isObjectLiteralExpression(previous));
  const property=previous.properties[0];assert(property&&ts.isPropertyAssignment(property));
  assert(ts.isIdentifier(property.name)&&property.name.text==='version');
  assert(ts.isStringLiteral(property.initializer)&&property.initializer.text===version);
  return source.slice(previous.getStart(file),previous.end);
 });
}
function qualifiedOriginalArchive(source:string):string {
 archiveLiteral(source); // Validate the complete current declaration first.
 const previous=previousCurrentLiteral(source);
 assert.equal(Buffer.byteLength(previous),769);
 assert.equal(sha(previous),'e9ebcfe08904e8993151c72666df78a94785f1d58665ecb24f1680f01301267e');
 const typescript=previousCurrentLiteral(source,'1.23.0');
 assert.equal(Buffer.byteLength(typescript),943);
 assert.equal(sha(typescript),'d5eb37abdea9fd02d4f6518c230143c75367a4de877a5a9c68aad3ffb81bdd1a');
 const insertion='  '+previous+',\n';
 assert.equal(source.split(insertion).length,2,'Exactly one previous release entry');
 const typescriptInsertion='  '+typescript+',\n';
 assert.equal(source.split(typescriptInsertion).length,2,'Exactly one TypeScript release entry');
 return archiveLiteral(source.replace(insertion,'').replace(typescriptInsertion,''));
}
it('keeps the previous app and TypeScript releases byte-exact beside the new body measurements release',()=>{
 const literal=previousCurrentLiteral(dataSource);
 expect(Buffer.byteLength(literal)).toBe(769);
 expect(sha(literal)).toBe('e9ebcfe08904e8993151c72666df78a94785f1d58665ecb24f1680f01301267e');
 const typescript=previousCurrentLiteral(dataSource,'1.23.0');
 expect(Buffer.byteLength(typescript)).toBe(943);
 expect(sha(typescript)).toBe('d5eb37abdea9fd02d4f6518c230143c75367a4de877a5a9c68aad3ffb81bdd1a');
 const versionSource=readFileSync('version.ts','utf8');
 expect(versionSource.match(/self\.APP_VERSION = '([^']+)';/)?.[1]).toBe(CURRENT_RELEASE.version);
 expect(CURRENT_RELEASE.version).toBe('1.25.0');
 expect(CURRENT_RELEASE.date).toBe('2026-10-22');
 expect(CURRENT_RELEASE.title).toBe('Waist measurements and cycle guidance');
 expect(CURRENT_RELEASE.items).toHaveLength(4);
});
it('moves the exact original 82166-byte archive and leaves every controller statement unchanged',()=>{
 const literal=qualifiedOriginalArchive(dataSource);
 expect(Buffer.byteLength(literal)).toBe(82166);
 expect(sha(literal)).toBe('3f1d8ac0e4c1e416b903b279e4bcb73acc74b453aa9a9fc55dcbd0fc06a0af51');
 expect(dataSource).toBe("import type { ChangelogEntry } from './changelog-current.js';\nimport { CURRENT_RELEASE } from './changelog-current.js';\n\n// Shared authored notes; retry controllers retain their own evaluation and delegates.\nexport const CHANGELOG: readonly ChangelogEntry[] = "+archiveLiteral(dataSource)+';\n');
 const imported="import { CHANGELOG } from './changelog-data.js';\n";
 const stateImport="import { getMajorMinor, getSeenVersion, markChangelogSeen, _semverGt } from './changelog-state.js';\n";
 const delegates='const changelogDelegateRoots = new WeakSet<HTMLElement>();\n';
 for(const coordinate of [imported,stateImport,delegates])expect(controller.split(coordinate)).toHaveLength(2);
 const restored=controller.replace(imported,"import type { ChangelogEntry } from './changelog-current.js';\n")
  .replace(stateImport,"import { CURRENT_RELEASE } from './changelog-current.js';\n"+stateImport)
  .replace(delegates,delegates+'const CHANGELOG: ChangelogEntry[] = '+literal+';\n');
 expect(sha(restored)).toBe('a0446292c0e8ad39ccedfa6a7cf298c8229a6fe86670ce07b65d9b4a78107234');
});
it('keeps native ESM retry controller evaluation distinct and shares the canonical authored data/current release',()=>{
 // A fresh native ESM process exercises the actual emitted query identities;
 // test-runner module transforms cannot coalesce the canonical/retry entries.
 const url=(file:string)=>pathToFileURL(path.join(root,file)).href;
 const script=`
  import assert from 'node:assert/strict';
  await import(${JSON.stringify(url('tests/_node-shim.js'))});
  const canonical=await import(${JSON.stringify(url('js/changelog-impl.js'))});
  const retry=await import(${JSON.stringify(url('js/changelog-impl.js')+'?lazy-retry=1')});
  const data=await import(${JSON.stringify(url('js/changelog-data.js'))});
  const sameData=await import(${JSON.stringify(url('js/changelog-data.js'))});
  const current=await import(${JSON.stringify(url('js/changelog-current.js'))});
  const names=['closeChangelog','maybeShowChangelog','openChangelog'];
  assert.deepEqual(Object.keys(canonical).sort(),names);assert.deepEqual(Object.keys(retry).sort(),names);
  assert.notEqual(canonical,retry);
  for(const name of names)assert.notEqual(canonical[name],retry[name]);
  assert.equal(data,sameData);assert.equal(data.CHANGELOG,sameData.CHANGELOG);
  assert.equal(data.CHANGELOG[0],current.CURRENT_RELEASE);
  console.log(JSON.stringify({exports:names,distinctControllers:true,sharedData:true,currentReleaseIdentity:true}));
 `;
 const result=execFileSync(process.execPath,['--max-old-space-size=512','--input-type=module','--eval',script],{
  cwd:root,encoding:'utf8',timeout:10000,maxBuffer:8192,
 });
 expect(JSON.parse(result.trim())).toEqual({exports:['closeChangelog','maybeShowChangelog','openChangelog'],distinctControllers:true,sharedData:true,currentReleaseIdentity:true});
});
it('the independent archive pin rejects changed text, order and force-show metadata',()=>{
 const literal=qualifiedOriginalArchive(dataSource);
 for(const changed of [literal.replace("version: '1.22.0'","version: '1.22.1'"),literal.replace('forceShow: true','forceShow: false'),literal.replace('  CURRENT_RELEASE,','')]){
  expect(changed).not.toBe(literal);expect(sha(changed)).not.toBe('3f1d8ac0e4c1e416b903b279e4bcb73acc74b453aa9a9fc55dcbd0fc06a0af51');
 }
});

it('rejects edits, removal and duplicate insertion of the previous current release',()=>{
 const literal=previousCurrentLiteral(dataSource);
 for(const changed of [dataSource.replace('Migration to TypeScript 7','Migration to TypeScript 8'),
  dataSource.replace('A stronger foundation','An altered foundation'),
  dataSource.replace('  '+literal+',\n',''),dataSource.replace('  '+literal+',\n','  '+literal+',\n  '+literal+',\n')]){
  expect(()=>qualifiedOriginalArchive(changed)).toThrow();
 }
});
