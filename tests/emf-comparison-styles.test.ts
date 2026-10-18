// @vitest-environment node
import {expect,it} from 'vitest';import fs from 'node:fs';import path from 'node:path';import postcss from 'postcss';
import {compileEMFComparisonStyles,emfComparisonOwnership} from '../scripts/emf-comparison-style-ownership.mjs';
import {restoreEMFComparisonBodies} from './helpers/emf-comparison-style-inverse.js';
const root=process.cwd(),inputPath=path.join(root,'css/emf.base.css'),input=fs.readFileSync(inputPath,'utf8'),original=fs.readFileSync(new URL('./fixtures/emf-comparison-styles-original.css',import.meta.url),'utf8');
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule')ancestry.unshift([(p as postcss.AtRule).name,(p as postcss.AtRule).params]);else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
function changeOwned(source:string,priority:boolean){const root=postcss.parse(source);let changes=0;root.walkDecls('white-space',decl=>{const parent=decl.parent;if(parent?.type==='rule'&&parent.selector==='.emf-compare-room'||parent?.type==='atrule'&&parent.name==='utility'&&parent.params==='emf-comparison-emf-compare-room'){if(priority)decl.important=true;else decl.value='normal';changes++;}});if(changes!==1)throw new Error('Exactly one owned room declaration mutation required');return root.toString();}
async function exact(source:string){const result=await compileEMFComparisonStyles(source,inputPath,root);expect(result.receivers).toHaveLength(115);expect(emfComparisonOwnership.declarationCount).toBe(364);expect(primitives(result.css)).toEqual(primitives(original));expect(primitives(result.css)).toHaveLength(365);expect(restoreEMFComparisonBodies(result.css,original)).toBe(original);return result;}
it('preserves all 15 comparison receivers/39 declarations and every 365 ordered primitive and foreign byte',async()=>{await exact(input);});
for(const [name,change]of [
 ['owned value',(s:string)=>changeOwned(s,false)],
 ['owned priority',(s:string)=>changeOwned(s,true)],
 ['missing recipe',(s:string)=>s.replace('@utility emf-comparison-emf-compare-header','@utility foreign')],
 ['foreign apply',(s:string)=>s.replace('@apply gb:emf-comparison-emf-compare-header;','@apply gb:foreign;')],
 ['mobile ancestry',(s:string)=>s.replace('@media (max-width: 600px)','@media (max-width: 601px)')],
 ['foreign comment',(s:string)=>s.replace('/* EMF assessment editor, comparison, interpretation, and media surfaces */','/* foreign comment */')],
 ['foreign media rule',(s:string)=>s+'\n.foreign { color: red; }'],
]as const)it('rejects '+name,async()=>{const changed=change(input);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
for(const [name,change]of [
 ['owned body value',(s:string)=>changeOwned(s,false)],
 ['owned body priority',(s:string)=>changeOwned(s,true)],
]as const)it('bounded inverse rejects '+name,()=>{const changed=change(original);expect(changed).not.toBe(original);expect(()=>restoreEMFComparisonBodies(changed,original)).toThrow();});
