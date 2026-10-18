#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {InlineStyleMapOwner} from './inline-style-map-owners.mjs';
import postcss from 'postcss';
import type {NativeStyleOwnership} from './native-recipe-styles.mjs';
// This source entry also runs before any emitted project modules exist.
const {inlineStyleMapOwners}: typeof import('./inline-style-map-owners.mjs') = createRequire(import.meta.url)('./inline-style-map-owners.mts');
const {compileNativeStyleBodies}: typeof import('./native-recipe-styles.mjs') = await import(new URL('./native-recipe-styles.mts',import.meta.url).href);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function relativeFile(value:string,folder:string,suffix:string){
 assert.ok(typeof value==='string'&&value.startsWith(folder+'/')&&value.endsWith(suffix));
 assert.ok(/^[a-z0-9./-]+$/.test(value),'Safe authored path alphabet');
 assert.ok(!path.isAbsolute(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Owned relative generated/input path');
}
export async function compileInlineStyleMap(input:string,inputPath:string,root:string,owner:InlineStyleMapOwner){
 relativeFile(owner.input,'css','.tailwind.css');relativeFile(owner.output,'js','.generated.js');
 assert.ok(/^[a-z][a-z0-9-]*$/.test(owner.id));assert.ok(/^[a-zA-Z][a-zA-Z0-9]*$/.test(owner.exportName));
 assert.deepEqual(Object.keys(owner).sort(),['declarationCount','exportName','id','input','output','recipes']);
 assert.ok(owner.recipes.length>0);assert.ok(owner.recipes.every(row=>row.length===2||row.length===3),'Closed recipe tuple shape');assert.equal(new Set(owner.recipes.map(([key])=>key)).size,owner.recipes.length,'Unique typed recipe keys');
 for(const [key,utility,property]of owner.recipes){assert.ok(/^[a-z][a-zA-Z0-9]*$/.test(key)&&!Object.hasOwn(Object.prototype,key),'Safe explicit map key');assert.ok(/^[a-z][a-z0-9-]*$/.test(utility),'Explicit semantic utility');if(property!==undefined)assert.ok(/^(?:--)?[a-z][a-z0-9-]*$/.test(property),'Literal CSS property projection');}
 const ownership:NativeStyleOwnership={receivers:owner.recipes.map(([,utility])=>[utility,'.'+utility,null,{preserveFormatting:true}]),declarationCount:owner.declarationCount,isolateRecipes:true,compactMetadataPrefix:true};
 const compiled=await compileNativeStyleBodies(input,inputPath,root,ownership);
 const stylesheet=postcss.parse(compiled.css),rules:postcss.Rule[]=[];stylesheet.walkRules(rule=>{rules.push(rule);});
 assert.equal(rules.length,owner.recipes.length,'Only explicitly owned inline-map receivers');
 assert.ok(stylesheet.nodes.every(node=>node.type==='rule'||node.type==='comment'),'No unowned inline-map groups or metadata');
 assert.ok(rules.every(rule=>rule.parent===stylesheet),'Inline map recipes have no conditional/nested groups');
 const values=Object.fromEntries(owner.recipes.map(([key,utility,property])=>{
  const receiver=compiled.receivers.find(row=>row.utility===utility);assert.ok(receiver);
  if(property===undefined)return [key,receiver.body];
  const rule=rules.find(row=>row.selector==='.'+utility);assert.ok(rule);
  assert.equal(rule.nodes.length,1,'A property projection owns exactly one declaration');
  const declaration=rule.nodes[0];assert.ok(declaration?.type==='decl');assert.equal(declaration.prop,property);assert.ok(!declaration.important,'Property setters do not carry a CSS priority');
  return [key,declaration.value];
 }));
 const javascript='// Generated from '+owner.input+' by the Tailwind inline-style builder.\nexport const '+owner.exportName+' = Object.freeze('+JSON.stringify(values,null,2)+');\n';
 const declaration='// Generated from '+owner.input+'; edit its explicit recipe owner.\nexport declare const '+owner.exportName+': {\n'+owner.recipes.map(([key])=>'    readonly '+key+': string;\n').join('')+'};\n';
 return {values,javascript,declaration,compiled};
}
export async function buildInlineStyleMaps(root=ROOT,owners:readonly InlineStyleMapOwner[]=inlineStyleMapOwners,check=false){
 assert.equal(new Set(owners.map(owner=>owner.id)).size,owners.length,'Unique inline map owners');assert.equal(new Set(owners.map(owner=>owner.output)).size,owners.length,'Unique generated map outputs');
 for(const owner of owners){
  const inputPath=path.join(root,owner.input),result=await compileInlineStyleMap(await fs.readFile(inputPath,'utf8'),inputPath,root,owner);
  for(const [name,contents]of [[owner.output,result.javascript],[owner.output.replace(/\.js$/,'.d.ts'),result.declaration]] as const){
   const output=path.join(root,name);
   if(check)assert.equal(await fs.readFile(output,'utf8'),contents,'Generated inline style map is stale: '+name);
   else{await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,contents);}
  }
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await buildInlineStyleMaps(ROOT,inlineStyleMapOwners,process.argv.includes('--check'));
