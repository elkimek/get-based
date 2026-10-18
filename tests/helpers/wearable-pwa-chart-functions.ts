import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as ts from 'typescript/unstable/ast';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
export interface NativeArtifact {files:readonly {path:string;sha256:string}[];mappings:readonly {module:string;sourceSHA256:string;chunks:readonly string[]}[]}
interface Metadata {functionName:string;functionLength:number;runtimeSource:string}
interface MapData {version:3;sources:string[];sourcesContent:string[];names:string[];mappings:string}
interface Bundle {name:string;code:string;map:MapData;trace:TraceMap}
type FunctionNode=ts.ArrowFunction|ts.FunctionExpression|ts.FunctionDeclaration;
type Declaration=ts.VariableDeclaration|ts.ParameterDeclaration|ts.ImportSpecifier|ts.FunctionDeclaration;
interface Binding {name:string;position:number;imported?:{file:string;name:string};builtin?:true}
interface Identifier {name:string;start:number;end:number;property:boolean;binding:Binding|null}
interface FunctionRecord {code:string;name:string;length:number;start:number;identifiers:Identifier[]}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const isFunction=(node:ts.Node):node is FunctionNode=>ts.isArrowFunction(node)||ts.isFunctionExpression(node)||ts.isFunctionDeclaration(node);
function scope(node:ts.Node):ts.Node {for(let parent=node.parent;parent;parent=parent.parent)if(isFunction(parent)||ts.isSourceFile(parent))return parent;throw Error('Missing lexical scope');}
function position(code:string,offset:number){const lines=code.slice(0,offset).split('\n');return {line:lines.length,column:lines.at(-1)!.length};}
function offset(code:string,line:number,column:number){const lines=code.split('\n');assert(line>0&&line<=lines.length);return lines.slice(0,line-1).reduce((sum,text)=>sum+text.length+1,0)+column;}
function propertyIdentifier(node:ts.Identifier){const parent=node.parent;return(ts.isPropertyAccessExpression(parent)&&parent.name===node)||(ts.isPropertyAssignment(parent)&&parent.name===node);}
function declaration(node:ts.Node):node is Declaration{return ts.isVariableDeclaration(node)||ts.isParameterDeclaration(node)||ts.isImportSpecifier(node)||ts.isFunctionDeclaration(node);}
function bindingAt(file:ts.SourceFile,node:ts.Identifier):Binding|null {
 for(let current:ts.Node|null=scope(node);current;current=ts.isSourceFile(current)?null:scope(current)){
  const found:Declaration[]=[];
  function visit(value:ts.Node){if(declaration(value)&&value.name&&ts.isIdentifier(value.name)&&value.name.text===node.text){const owner=ts.isParameterDeclaration(value)?value.parent:scope(value);if(owner===current)found.push(value);}value.forEachChild(visit);}
  visit(file);assert(found.length<=1,'Unambiguous generated lexical binding');if(!found.length)continue;const value=found[0]!,name=value.name;assert(name&&ts.isIdentifier(name));
  if(ts.isImportSpecifier(value)){const parent=value.parent.parent.parent;assert(ts.isImportDeclaration(parent)&&ts.isStringLiteral(parent.moduleSpecifier));return {name:name.text,position:name.getStart(file),imported:{file:parent.moduleSpecifier.text,name:(value.propertyName??name).text}};}
  return {name:name.text,position:name.getStart(file)};
 }
 assert(['Number','String','Object','Math','undefined'].includes(node.text),'No unqualified generated free binding: '+node.text);return {name:node.text,position:-1,builtin:true};
}
function functionName(node:FunctionNode){if(!ts.isArrowFunction(node)&&node.name)return node.name.text;const parent=node.parent;if(ts.isVariableDeclaration(parent)&&ts.isIdentifier(parent.name))return parent.name.text;if(ts.isPropertyAssignment(parent)&&(ts.isIdentifier(parent.name)||ts.isStringLiteral(parent.name)))return parent.name.text;return '';}
function functions(code:string,target?:FunctionRecord):FunctionRecord[]{return withParsedSource(code,'generated-chart.js',file=>{const results:FunctionRecord[]=[];function visit(node:ts.Node){if(isFunction(node)){const start=node.getStart(file),identifiers:Identifier[]=[];function names(value:ts.Node){if(ts.isIdentifier(value)){const property=propertyIdentifier(value);identifiers.push({name:value.text,start:value.getStart(file)-start,end:value.end-start,property,binding:property?null:bindingAt(file,value)});}value.forEachChild(names);}if(target&&node.getText(file)===target.code&&functionName(node)===target.name)names(node);results.push({code:node.getText(file),name:functionName(node),length:node.parameters.length,start,identifiers});}node.forEachChild(visit);}visit(file);return results;});}
function sourceIdentity(bundle:Bundle,generatedPosition:number,sourceRoot:string|null){
 const mapped=originalPositionFor(bundle.trace,position(bundle.code,generatedPosition));assert(mapped.source&&mapped.line!==null&&mapped.column!==null,'Mapped source binding');const index=bundle.map.sources.indexOf(mapped.source);assert(index>=0);const source=bundle.map.sourcesContent[index]!;assert(typeof source==='string');
 const module=mapped.source.slice(mapped.source.lastIndexOf('/js/')+1);assert(module.startsWith('js/')&&module.endsWith('.js'),'First-party mapped chart source');
 return {module,source,at:offset(source,mapped.line,mapped.column),sourceRoot};
}
async function canonicalDeclaration(bundle:Bundle,generatedPosition:number,sourceRoot:string|null):Promise<string> {
 const {module,source,at}=sourceIdentity(bundle,generatedPosition,sourceRoot);
 if(sourceRoot)assert.equal(source,await fs.readFile(path.join(sourceRoot,module),'utf8'),'Fresh actual imported/local canonical binding source');
 return withParsedSource(source,module,file=>{const found:Declaration[]=[];function visit(node:ts.Node){if(declaration(node)&&node.name&&node.name.getStart(file)<=at&&at<node.name.end)found.push(node);node.forEachChild(visit);}visit(file);assert.equal(found.length,1,'Exactly one source-owned binding declaration');const node=found[0]!;const parent=scope(node);const owner=isFunction(parent)?functionName(parent):'(module)';return JSON.stringify({module,owner,declaration:node.getText(file)});});
}
async function moduleBinding(bundle:Bundle,binding:Binding,bundles:readonly Bundle[],sourceRoot:string|null,seen=new Set<string>()):Promise<string>{
 if(binding.builtin)return 'builtin:'+binding.name;
 if(!binding.imported)return canonicalDeclaration(bundle,binding.position,sourceRoot);
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(bundle.name),binding.imported.file));assert(target.startsWith('_app/immutable/'));const imported=bundles.find(value=>value.name===target);assert(imported,'Actual imported chart chunk');const key=target+'#'+binding.imported.name;assert(!seen.has(key),'No circular imported chart alias');seen.add(key);
 const resolved=withParsedSource(imported.code,target,file=>{let local:string|undefined;for(const statement of file.statements)if(ts.isExportDeclaration(statement)&&!statement.moduleSpecifier&&statement.exportClause&&ts.isNamedExports(statement.exportClause))for(const item of statement.exportClause.elements)if(item.name.text===binding.imported!.name){assert.equal(local,undefined);local=(item.propertyName??item.name).text;}assert(local,'Exact actual exported chart binding');const found:Binding[]=[];function visit(node:ts.Node){if(declaration(node)&&node.name&&ts.isIdentifier(node.name)&&node.name.text===local&&ts.isSourceFile(scope(node)))found.push({name:local!,position:node.name.getStart(file)});node.forEachChild(visit);}visit(file);assert.equal(found.length,1,'Single actual chart export definition');return found[0]!;});return moduleBinding(imported,resolved,bundles,sourceRoot,seen);
}
function sourceCallback(bundle:Bundle,record:FunctionRecord){const {module,source,at}=sourceIdentity(bundle,record.start,null);return withParsedSource(source,module,file=>{const found:FunctionNode[]=[];function visit(node:ts.Node){if(isFunction(node)&&node.getStart(file)<=at&&at<node.end)found.push(node);node.forEachChild(visit);}visit(file);const node=found.sort((a,b)=>(a.end-a.getStart(file))-(b.end-b.getStart(file)))[0];assert(node);const parent=scope(node);assert(isFunction(parent)||ts.isSourceFile(parent));return {module,callback:node.getText(file),owner:isFunction(parent)?functionName(parent):'(module)',ownerBody:isFunction(parent)?parent.body!.getText(file):node.getText(file)};});}
async function compareBindings(oldBundle:Bundle,oldRecord:FunctionRecord,currentBundle:Bundle,currentRecord:FunctionRecord,oldBundles:readonly Bundle[],currentBundles:readonly Bundle[],root:string){
 oldRecord=functions(oldBundle.code,oldRecord).find(value=>value.code===oldRecord.code&&value.name===oldRecord.name)!;currentRecord=functions(currentBundle.code,currentRecord).find(value=>value.code===currentRecord.code&&value.name===currentRecord.name)!;
 assert.equal(currentRecord.length,oldRecord.length);assert.equal(currentRecord.identifiers.length,oldRecord.identifiers.length);let rewritten=currentRecord.code;const replacements:Array<{old:string;current:string;binding:string}>=[];
 for(let i=oldRecord.identifiers.length-1;i>=0;i--){const before=oldRecord.identifiers[i]!,after=currentRecord.identifiers[i]!;assert.equal(before.property,after.property);if(before.property){assert.equal(after.name,before.name);continue;}assert(before.binding&&after.binding);const left=await moduleBinding(oldBundle,before.binding,oldBundles,null),right=await moduleBinding(currentBundle,after.binding,currentBundles,root);assert.equal(right,left,'Same actual source-bound chart reference');if(after.name!==before.name){replacements.push({old:before.name,current:after.name,binding:left});rewritten=rewritten.slice(0,after.start)+before.name+rewritten.slice(after.end);}}
 assert.equal(rewritten,oldRecord.code,'Only individually source-qualified finite identifier lexemes may differ; all logic/literals/operators remain exact');return replacements;
}
async function bundles(directory:string,original?:NativeArtifact,overrides?:ReadonlyMap<string,string>):Promise<Bundle[]>{
 const folder=path.join(directory,'_app/immutable/chunks'),names=(await fs.readdir(folder)).filter(name=>name.endsWith('.js.map'));const results:Bundle[]=[];
 for(const name of names){const relative='_app/immutable/chunks/'+name;const raw=await fs.readFile(path.join(directory,relative),'utf8'),code=overrides?.get(relative.slice(0,-4))??await fs.readFile(path.join(directory,relative.slice(0,-4)),'utf8');if(original){assert.equal(sha(raw),original.files.find(row=>row.path==='/'+relative)?.sha256);assert.equal(sha(code),original.files.find(row=>row.path==='/'+relative.slice(0,-4))?.sha256);}const map:MapData=JSON.parse(raw);assert.equal(map.version,3);assert(Array.isArray(map.sources)&&Array.isArray(map.sourcesContent));results.push({name:relative.slice(0,-4),code,map,trace:new TraceMap(map)});
 }return results;
}
function metadata(value:unknown):value is Metadata{return !!value&&typeof value==='object'&&'runtimeSource'in value&&typeof value.runtimeSource==='string'&&'functionName'in value&&typeof value.functionName==='string'&&'functionLength'in value&&typeof value.functionLength==='number';}
/** Expected-only finite callback names/lexemes from the actual immutable original
 * and current bundle source maps. Never rewrites actual Chart configuration. */
export async function wearableChartExpectedQualifier(nativeDirectory:string,currentDirectory:string,root:string,artifact:NativeArtifact,originals:readonly unknown[],currentBundleOverrides?:ReadonlyMap<string,string>){
 const oldDirectory=path.join(nativeDirectory,'clone/.local-notes/original-kit-artifact'),oldBundles=await bundles(oldDirectory,artifact),currentBundles=await bundles(currentDirectory,undefined,currentBundleOverrides);
 for(const file of ['vendor/chart.min.js','vendor/chartjs-adapter-native.js'])assert.equal(sha(await fs.readFile(path.join(currentDirectory,file),'utf8')),artifact.files.find(value=>value.path==='/'+file)?.sha256,'Exact unchanged native Chart vendor');
 const unique=new Map<string,Metadata>();function collect(value:unknown){if(metadata(value)){unique.set(JSON.stringify(value),value);return;}if(value&&typeof value==='object')for(const item of Object.values(value))collect(item);}originals.forEach(collect);
 const transformed=new Map<string,Metadata>(),proofs:Array<{original:Metadata;current:Metadata;sourceModule:string;owner:string;authoredBodySHA256:string;bundle:string;replacements:readonly {old:string;current:string;binding:string}[]}> = [];
 for(const [key,original]of unique){const oldCandidates: Array<{bundle:Bundle;record:FunctionRecord}>=[];for(const bundle of oldBundles)if(bundle.code.includes(original.runtimeSource))for(const record of functions(bundle.code))if(record.code===original.runtimeSource&&record.name===original.functionName)oldCandidates.push({bundle,record});
  if(!oldCandidates.length){assert(['tickWidth','tickColor'].includes(original.functionName),'No unmapped original application callback');transformed.set(key,original);continue;}
  assert.equal(oldCandidates.length,1,'Exact original callback lexical binding');const before=oldCandidates[0]!;assert.equal(before.record.length,original.functionLength,'Exact original callback parameter arity');const source=sourceCallback(before.bundle,before.record);assert(['js/wearables-detail-modal.js','js/wearables-bp-detail-chart.js','js/charts.js'].includes(source.module),'Finite original Chart callback owners');
  const candidates:Array<{bundle:Bundle;record:FunctionRecord}>=[];for(const bundle of currentBundles)if(bundle.map.sources.some(name=>name.endsWith('/'+source.module)))for(const record of functions(bundle.code)){let current;const mapped=originalPositionFor(bundle.trace,position(bundle.code,record.start));if(!mapped.source?.endsWith('/'+source.module))continue;try{current=sourceCallback(bundle,record);}catch{continue;}if(current.module===source.module&&current.callback===source.callback&&current.owner===source.owner){assert.equal(current.ownerBody,source.ownerBody,'Exact original authored enclosing Chart callback body');candidates.push({bundle,record});}}
  assert.equal(candidates.length,1,'Single actual current source-mapped callback');const current=candidates[0]!;
  for(const bundle of [current.bundle])for(let index=0;index<bundle.map.sources.length;index++){const name=bundle.map.sources[index]!;if(name.endsWith('/'+source.module))assert.equal(bundle.map.sourcesContent[index],await fs.readFile(path.join(root,source.module),'utf8'),'Fresh actual canonical Chart source');}
  const replacements=await compareBindings(before.bundle,before.record,current.bundle,current.record,oldBundles,currentBundles,root);const next={...original,functionName:current.record.name,functionLength:current.record.length,runtimeSource:current.record.code};transformed.set(key,next);proofs.push({original,current:next,sourceModule:source.module,owner:source.owner,authoredBodySHA256:sha(source.ownerBody),bundle:current.bundle.name,replacements});
 }
 function qualify(value:unknown):unknown {if(metadata(value)){const known=transformed.get(JSON.stringify(value));assert(known,'No unknown/originally corrupted callback metadata');return {...known};}if(Array.isArray(value))return value.map(qualify);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,qualify(item)]));return value;}
 return {qualify,proofs};
}
