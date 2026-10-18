import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {expectedBiometricPwaReceipt,qualifyBiometricPwaGrammar,biometricPwaGrammarSources,type BiometricNativeNode} from './helpers/biometric-pwa-expected-annotations.js';
import {expectedOwnedBiometricDOM} from './helpers/dashboard-biometric-owned-receipts.js';
import type {BiometricOverviewNativeOracle} from './helpers/biometric-overview-pwa-receipt.js';

const oracleFile = 'tests/fixtures/biometric-overview-pwa-native.json';
const oracle = JSON.parse(readFileSync(oracleFile, 'utf8')) as BiometricOverviewNativeOracle;
interface OwnedNode {tag?:string;namespace?:string|null;attributes?:string[][];children?:OwnedNode[];type?:number;text?:string|null}
// Adapt only the expected carriers' element-name spelling. Every other original
// field, ordered attribute, namespace and literal remains in the cross-check.
function owned(node:BiometricNativeNode):OwnedNode {
  const {name,...rest}=node;
  return node.type===1?{...rest,tag:name!.toUpperCase(),children:node.children!.map(owned)}:rest;
}
function native(node:OwnedNode):BiometricNativeNode {
  const {tag,...rest}=node;
  return tag?{...rest,type:1,name:tag.toLowerCase(),children:node.children!.map(native)}:rest as BiometricNativeNode;
}
const marker=(text:string)=>({type:8,text});
it('qualifies the untouched native oracle, exact six component sources and compiler version',()=>{
  qualifyBiometricPwaGrammar();
  expect(Object.keys(oracle.receipts)).toEqual(['fresh-pair','stale-pair','stale-manual-only','stale-empty','stale-populated-only','stale-restored-pair']);
});
it.each(Object.entries(oracle.receipts))('%s keeps the existing independently checked complete inner grammar and all original receipt metadata',(_name,input)=>{
  const before=JSON.stringify(input),expected=expectedBiometricPwaReceipt(input);
  const previous=expectedOwnedBiometricDOM({tag:'DIV',children:(input.children as BiometricNativeNode[]).map(owned)});
  expect(expected.children.slice(2,6)).toEqual(previous.children!.slice(1,-1).map(native));
  expect(expected.children).toHaveLength(9);
  expect(expected.children.slice(0,2)).toEqual([marker('[-1'),marker('[4')]);
  expect(expected.children.slice(6)).toEqual([marker(']'),marker(']'),marker('')]);
  expect(expected.actions).toEqual(input.actions);expect(expected.count).toBe(input.count);
  expect(JSON.stringify(input)).toBe(before);
});
it.each([...Object.keys(biometricPwaGrammarSources),oracleFile])('rejects a changed qualified input %s',changed=>{
  expect(()=>qualifyBiometricPwaGrammar(file=>readFileSync(file,'utf8')+(file===changed?'\nforeign':''))).toThrow();
});
it('rejects a different SDK compiler instead of widening accepted marker spellings',()=>{
  expect(()=>qualifyBiometricPwaGrammar(file=>{
    const source=readFileSync(file,'utf8');if(file!=='package-lock.json')return source;
    const lock=JSON.parse(source)as{packages:Record<string,{version:string}>};lock.packages['node_modules/svelte']!.version='foreign';return JSON.stringify(lock);
  })).toThrow();
});
it.each(['native-comment','extra-root','toolbar-class','row-class','counter']as const)('rejects unexpected native %s grammar',kind=>{
  const input=structuredClone(oracle.receipts['fresh-pair']!),nodes=input.children as BiometricNativeNode[];
  if(kind==='native-comment')nodes.unshift(marker('[4'));
  if(kind==='extra-root')nodes.push(structuredClone(nodes[0]!));
  if(kind==='toolbar-class')nodes[0]!.attributes![0]![1]='foreign';
  if(kind==='row-class')nodes[1]!.children![0]!.attributes![0]![1]='foreign';
  if(kind==='counter')input.count='foreign';
  expect(()=>expectedBiometricPwaReceipt(input)).toThrow();
});
it.each(['SDK-comment','literal','attribute','extra-element','row-order']as const)('full expected receipt still detects %s corruption without normalizing actual nodes',kind=>{
  const expected=expectedBiometricPwaReceipt(oracle.receipts['fresh-pair']!),changed=structuredClone(expected),nodes=changed.children as BiometricNativeNode[];
  const grid=nodes[4]!,row=grid.children![2]!;
  if(kind==='SDK-comment')nodes[1]!.text='[5';
  if(kind==='literal')row.children!.push({type:3,text:'foreign'});
  if(kind==='attribute')row.attributes!.push(['data-foreign','yes']);
  if(kind==='extra-element')grid.children!.push({type:1,name:'script',namespace:'http://www.w3.org/1999/xhtml',attributes:[],children:[]});
  if(kind==='row-order')grid.children!.reverse();
  expect(changed).not.toEqual(expected);
});
