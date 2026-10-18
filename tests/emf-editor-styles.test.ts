import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import {compileEMFComparisonStyles,emfComparisonOwnership} from '../scripts/emf-comparison-style-ownership.mjs';
import {emfEditorOwnership} from '../scripts/emf-editor-style-ownership.mjs';
import previousBodies from './fixtures/emf-comparison-style-bodies.json' with {type:'json'};
import {restoreEMFStyleBodies} from './helpers/emf-editor-style-inverse.js';
const root=process.cwd(),inputPath=path.join(root,'css/emf.base.css'),input=fs.readFileSync(inputPath,'utf8'),original=fs.readFileSync('tests/fixtures/emf-editor-styles-original.css','utf8');
function rows(css:string){const result:{selector:string;media:string|null;declarations:unknown[]}[]=[];postcss.parse(css).walkRules(rule=>{result.push({selector:rule.selector,media:rule.parent?.type==='atrule'?rule.parent.params:null,declarations:rule.nodes.map(n=>{if(n.type!=='decl')throw new Error('Only native ordered declarations');return[n.prop,n.value,n.important===true];})});});return result;}
const previous=new Set([...previousBodies.map(row=>JSON.stringify([row.selector,row.media])),JSON.stringify(['.emf-lightbox',null]),JSON.stringify(['.emf-lightbox img',null])]);
const editorNative=rows(original).filter(row=>!previous.has(JSON.stringify([row.selector,row.media]))&&!row.selector.startsWith('.emf-interp-'));
async function exact(source:string){const result=await compileEMFComparisonStyles(source,inputPath,root);expect(result.receivers).toHaveLength(115);expect(emfComparisonOwnership.declarationCount).toBe(364);expect(rows(result.css)).toEqual(rows(original));expect(restoreEMFStyleBodies(result.css,original)).toBe(original);return result;}
it('pins complete pre-migration runtime CSS and owns all73 ordinary receivers/240 declarations, including15 phone and1 coarse-pointer rules',()=>{
 expect(createHash('sha256').update(original).digest('hex')).toBe('cc55e09b35448e97d10d36b5c6f63c79af3e152cd8d163456b82b63f0bdf10fb');expect(editorNative).toHaveLength(73);expect(editorNative.reduce((n,row)=>n+row.declarations.length,0)).toBe(240);expect(editorNative.filter(row=>row.media==='(max-width: 600px)')).toHaveLength(15);expect(editorNative.filter(row=>row.media==='(pointer: coarse)')).toHaveLength(1);
 expect(emfEditorOwnership.receivers.map(([,selector,media])=>[selector,media])).toEqual(editorNative.map(row=>[row.selector,row.media]));expect(emfEditorOwnership.declarationCount).toBe(240);
});
it('preserves every original declaration/value/priority/order, selector/media/cascade position and foreign byte',async()=>{await exact(input);});
it('has no remaining ordinary declaration authority or duplicate custom CSS outside scoped Tailwind recipes',()=>{const tree=postcss.parse(input);let ordinary=0,recipes=0,applies=0;tree.walkDecls(decl=>{if(decl.parent?.type==='rule')ordinary++;});tree.walkAtRules(node=>{if(node.name==='utility')recipes++;if(node.name==='apply')applies++;});expect(ordinary).toBe(0);expect(recipes).toBe(115);expect(applies).toBe(115);});
function mutateOwned(source:string,kind:'value'|'priority'|'order'){const tree=postcss.parse(source);let changed=0;tree.walkAtRules('utility',node=>{if(node.params!=='emf-editor-room-content')return;changed++;const declarations=node.nodes! as postcss.Declaration[];if(kind==='value')declarations[0]!.value='3px solid red';if(kind==='priority')declarations[0]!.important=true;if(kind==='order'){const first=declarations[0]!;first.remove();node.append(first);}});expect(changed).toBe(1);return tree.toString();}
for(const kind of ['value','priority','order'] as const)it('rejects an owned declaration '+kind+' mutation',async()=>{const changed=mutateOwned(input,kind);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
for(const[name,change]of[
 ['missing recipe',(s:string)=>s.replace('@utility emf-editor-room-content','@utility foreign-room-content')],
 ['foreign apply',(s:string)=>s.replace('@apply gb:emf-editor-room-content;','@apply gb:foreign-room-content;')],
 ['extra receiver declaration',(s:string)=>s.replace('@apply gb:emf-editor-room-content;','@apply gb:emf-editor-room-content; color:red;')],
 ['phone ancestry',(s:string)=>s.replace('@media (max-width: 600px)','@media (max-width: 601px)')],
 ['coarse-pointer ancestry',(s:string)=>s.replace('@media (pointer: coarse)','@media (pointer: fine)')],
 ['same-count receiver replacement',(s:string)=>s.replace('.emf-room-content { @apply','.foreign-room-content { @apply')],
 ['foreign comment',(s:string)=>s.replace('/* EMF assessment editor, comparison, interpretation, and media surfaces */','/* foreign comment */')],
 ['foreign rule',(s:string)=>s+'\n.foreign {color:red;}'],
]as const)it('rejects '+name,async()=>{const changed=change(input);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
it('complete body inverse rejects removed/reordered/foreign declarations or rules rather than hiding them',()=>{for(const changed of[original.replace('gap: 8px','gap: 9px'),original.replace('display: flex','display: flex !important'),original.replace('.emf-editor-actions','.foreign-editor-actions'),original+'\n.foreign {color:red;}']){expect(changed).not.toBe(original);expect(()=>restoreEMFStyleBodies(changed,original)).toThrow();}});
