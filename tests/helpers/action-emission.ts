import {parse} from 'svelte/compiler';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import {scriptSource,syntaxFile} from '../../scripts/svelte-source.mjs';
import {sourceCallsNamespacedActionAttributes} from './native-source-contracts.js';

type Node = Record<string,unknown>;
export interface ActionEmission {emits:boolean;unclassified:string[]}
export type SpreadContracts = Readonly<Record<string,readonly string[]>>;
function object(value:unknown):Node|null{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Node:null;}
function walk(value:unknown,visit:(node:Node)=>void):void{
 if(Array.isArray(value)){for(const child of value)walk(child,visit);return;}
 const node=object(value);if(!node)return;visit(node);
 for(const [key,child] of Object.entries(node))if(key!=='parent')walk(child,visit);
}
function name(value:unknown):string|null{
 const node=object(value);if(!node)return null;
 if(node.type==='Identifier'&&typeof node.name==='string')return node.name;
 return node.type==='Literal'&&typeof node.value==='string'?node.value:null;
}
function matches(attribute:string,token:string):boolean{return attribute==='data-*'||(token.endsWith('-')?attribute.startsWith(token):attribute===token);}
/**
 * Inspect authored emission syntax rather than compiler bundle substrings.
 * A DOM spread must resolve to literal keys or an explicitly reviewed contract;
 * selector strings alone never emit an attribute. Unknowns remain diagnostic.
 */
export function scanActionEmission(source:string,file:string,token:string,contracts:SpreadContracts={}):ActionEmission{
 return scanActionEmissionFamilies(source,file,[token],contracts).get(token)!;
}
/** Inspect every requested family in one source pass. There is no source/AST
 * cache: a new source string or contract is analyzed anew on every invocation. */
export function scanActionEmissionFamilies(source:string,file:string,tokens:readonly string[],contracts:SpreadContracts={}):Map<string,ActionEmission>{
 const results=new Map<string,ActionEmission>(tokens.map(token=>[token,{emits:false,unclassified:[]}]));
 const active=tokens.filter(token=>file.endsWith('.svelte')||source.includes(token)||source.includes('action-attributes.js')||source.includes('setAttribute'));
 if(!active.length)return results;
 const script=scriptSource(file,source);
 const emit=(attribute:string,native=false)=>{for(const token of active){
  if(native&&!script.includes(token)&&!script.includes('setAttribute'))continue;
  if(matches(attribute,token))results.get(token)!.emits=true;
 }};
 const unclassified=(message:string)=>{for(const token of active)results.get(token)!.unclassified.push(message);};
 for(const token of active){
  const namespace=/^data-(.+)-(?:action)?$/.exec(token)?.[1];
  if(namespace&&script.includes('action-attributes.js')&&sourceCallsNamespacedActionAttributes(script,namespace))results.get(token)!.emits=true;
 }
 if(active.some(token=>script.includes(token))||script.includes('setAttribute'))withParsedSource(script,syntaxFile(file),parsed=>{
  function visit(node:ts.Node):void{
   if((ts.isStringLiteralLikeNode(node)&&node.text.includes('<'))||ts.isTemplateExpression(node)){
    // Only an HTML-attribute lexeme is emission; `[data-x]` is a selector.
    for(const match of (ts.isTemplateExpression(node)?node.getText(parsed):node.text).matchAll(/(?:^|\s)(data-[a-z0-9_.:-]+)\s*=/gi))emit(match[1]!,true);
   }
   if(ts.isPropertyAssignment(node)&&ts.isStringLiteralLikeNode(node.name))emit(node.name.text,true);
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='setAttribute'){
    const attribute=node.arguments[0];
    if(attribute&&ts.isStringLiteralLikeNode(attribute))emit(attribute.text,true);
    else {const key='setAttribute('+ (attribute?.getText(parsed)??'') +')';
     if(Object.hasOwn(contracts,key)){for(const name of contracts[key]!)emit(name,true);}
     else unclassified('unreviewed native attribute name: '+key);
    }
   }
   node.forEachChild(visit);
  }
  visit(parsed);
 });
 if(!file.endsWith('.svelte'))return results;
 const ast=parse(source,{filename:file,modern:true});const bindings=new Map<string,Node>();
 walk(ast.instance,node=>{if(node.type==='VariableDeclarator'){const key=name(node.id),value=object(node.init);if(key&&value)bindings.set(key,value);}});
 function keys(expression:unknown,seen:Set<string>=new Set()):void{
  const node=object(expression);if(!node){unclassified('missing spread expression');return;}
  const begin=typeof node.start==='number'?node.start:0,end=typeof node.end==='number'?node.end:begin;
  const text=source.slice(begin,end).trim();
  if(Object.hasOwn(contracts,text)){for(const key of contracts[text]!)emit(key);return;}
  if(node.type==='ObjectExpression'){
   const properties=Array.isArray(node.properties)?node.properties:[];
   for(const value of properties){const property=object(value);if(!property)continue;
    if(property.type==='SpreadElement'){keys(property.argument,seen);continue;}
    const key=name(property.key);
    if(key&&(!property.computed||object(property.key)?.type==='Literal'))emit(key);
    else unclassified('dynamic key: '+text);
   }return;
  }
  if(node.type==='ConditionalExpression'){keys(node.consequent,seen);keys(node.alternate,seen);return;}
  if(node.type==='LogicalExpression'){keys(node.left,seen);keys(node.right,seen);return;}
  if(node.type==='TSAsExpression'||node.type==='TSNonNullExpression'){keys(node.expression,seen);return;}
  if(node.type==='Identifier'){
   const key=name(node);if(key&&!seen.has(key)&&bindings.has(key)){const next=new Set(seen);next.add(key);keys(bindings.get(key),next);return;}
  }
  if(node.type==='CallExpression'&&name(node.callee)==='$derived'){
   const args=Array.isArray(node.arguments)?node.arguments:[];keys(args[0],seen);return;
  }
  unclassified('unreviewed DOM spread: '+text);
 }
 walk(ast.fragment,node=>{
  if(node.type!=='RegularElement'&&node.type!=='SvelteElement')return;
  const attributes=Array.isArray(node.attributes)?node.attributes:[];
  for(const value of attributes){const attribute=object(value);if(!attribute)continue;
   if(attribute.type==='Attribute'&&typeof attribute.name==='string')emit(attribute.name);
   if(attribute.type==='SpreadAttribute')keys(attribute.expression);
  }
 });
 for(const result of results.values())result.unclassified=[...new Set(result.unclassified)];return results;
}
