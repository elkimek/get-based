import {compile} from '@tailwindcss/node';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileLightLayoutStyles,lightLayoutOwnership,type LightLayoutLane} from '../scripts/light-layout-style-ownership.mjs';
interface NativeFixture {lane:LightLayoutLane;input:string;output:string;native:string;declarations:number;receivers:number}
const fixtureText=readFileSync('tests/fixtures/light-layout-native.json','utf8');
const fixtures:NativeFixture[]=JSON.parse(fixtureText);
const sources=fixtures.map(row=>({...row,inputPath:path.resolve(row.input),source:readFileSync(row.input,'utf8')}));
type Source=(typeof sources)[number];
async function qualify(row:Source,input=row.source){
 const result=await compileLightLayoutStyles(row.lane,input,row.inputPath,process.cwd());
 expect(result.css).toBe(row.native);
 expect(result.receivers).toHaveLength(row.receivers);
 expect(result.css).not.toMatch(/@(?:apply|utility|import "tailwindcss")/);
 return result;
}
it('pins the six original stylesheet bodies and complete 59-owner/188-declaration scope',()=>{
 expect(crypto.createHash('sha256').update(fixtureText).digest('hex')).toBe('945685fcbbdc3ec8247898cec8eec9e09e9463553159563f733d9f0622a229d3');
 expect(fixtures).toHaveLength(6);
 expect(fixtures.reduce((n,r)=>n+r.receivers,0)).toBe(59);
 expect(fixtures.reduce((n,r)=>n+r.declarations,0)).toBe(188);
});
it.each(sources)('$lane keeps all original bytes while owning every ordinary layout declaration',async row=>{
 expect(lightLayoutOwnership[row.lane].receivers).toHaveLength(row.receivers);
 expect(lightLayoutOwnership[row.lane].declarationCount).toBe(row.declarations);
 await qualify(row);
 const unowned:string[]=[];
 postcss.parse(row.source).walkDecls(declaration=>{
  let owned=declaration.prop.startsWith('--');
  for(let parent:postcss.AnyNode|undefined=declaration.parent;parent;parent=parent.parent){
   if(parent.type==='atrule'&&['utility','keyframes','-webkit-keyframes'].includes(parent.name))owned=true;
  }
  if(!owned)unowned.push(declaration.toString());
 });
 expect(unowned).toEqual([]);
});
const mutations=sources.flatMap(row=>lightLayoutOwnership[row.lane].receivers.map(receiver=>({row,utility:receiver[0]})));
it.each(mutations)('rejects an actual declaration mutation in $utility',async({row,utility})=>{
 const tree=postcss.parse(row.source);let changed=false;
 tree.walkAtRules('utility',rule=>{
  if(rule.params!==utility)return;
  const declaration=rule.nodes?.find(node=>node.type==='decl');
  if(declaration?.type!=='decl')throw new Error('Missing actual owned declaration');
  declaration.value=declaration.value==='initial'?'inherit':'initial';changed=true;
 });
 expect(changed).toBe(true);
 await expect(qualify(row,tree.toString())).rejects.toThrow();
});
it.each(sources)('$lane rejects a missing receiver, extra declaration or foreign rule',async row=>{
 const first=lightLayoutOwnership[row.lane].receivers[0][0];
 for(const changed of [row.source.replace('@apply gb:'+first+';',''),row.source.replace('@apply gb:'+first+';','@apply gb:'+first+';color:red;'),row.source+'\n.foreign-light-layout {color:red;}\n']){
  expect(changed).not.toBe(row.source);
  await expect(qualify(row,changed)).rejects.toThrow();
 }
});
it('preserves exactly the public color tokens and required animation grammar',()=>{
 let tokens=0,keyframes=0;
 for(const row of sources){
  postcss.parse(row.source).walkDecls(declaration=>{
   let recipe=false,animation=false;
   for(let parent:postcss.AnyNode|undefined=declaration.parent;parent;parent=parent.parent){
    if(parent.type==='atrule'&&parent.name==='utility')recipe=true;
    if(parent.type==='atrule'&&['keyframes','-webkit-keyframes'].includes(parent.name))animation=true;
   }
   if(!recipe&&declaration.prop.startsWith('--'))tokens++;
   if(animation)keyframes++;
  });
 }
 expect(tokens).toBe(27);expect(keyframes).toBe(4);
});
it('rejects token, animation and responsive-condition corruption as well as ordinary recipe changes',async()=>{
 const page=sources.find(row=>row.lane==='page'),setup=sources.find(row=>row.lane==='setup');
 if(!page||!setup)throw new Error('Missing required Light fixtures');
 for(const[row,changed]of [[page,page.source.replace('#15131e','#15131f')],[page,page.source.replace('(max-width: 600px)','(max-width: 601px)')],[setup,setup.source.replace('scale(1.12)','scale(1.13)')]]as const){
  expect(changed).not.toBe(row.source);await expect(qualify(row,changed)).rejects.toThrow();
 }
});

const svgInputPath=path.resolve('css/sun-body-picker.css');
const svgSource=readFileSync(svgInputPath,'utf8');
const originalSvgSource=readFileSync('tests/fixtures/sun-body-picker-transition-native.css','utf8');
async function compileSvg(source:string){
 const compiler=await compile('@import "tailwindcss" prefix(gb) source(none) reference;\n'+source,{base:process.cwd(),from:svgInputPath,polyfills:0,onDependency:dependency=>{expect(path.isAbsolute(dependency)).toBe(true);}});
 return compiler.build([]);
}
it('moves the final SVG transition into a named Tailwind recipe with identical complete compiled output',async()=>{
 expect(crypto.createHash('sha256').update(originalSvgSource).digest('hex')).toBe('7255e2fac4a92fbcb97caba35dcb1b9a4694c01e80ead71da78918c6859b0500');
 expect(svgSource).toContain('@utility sun-body-region-transition');
 expect(svgSource).toContain('@apply gb:sun-body-region-transition;');
 expect(await compileSvg(svgSource)).toBe(await compileSvg(originalSvgSource));
 const unowned:string[]=[];
 postcss.parse(svgSource).walkDecls(declaration=>{
  if(declaration.parent?.type!=='atrule'||declaration.parent.name!=='utility')unowned.push(declaration.toString());
 });
 expect(unowned).toEqual([]);
});
it('rejects a changed SVG transition duration and keeps its values exact',async()=>{
 const changed=svgSource.replace('fill 0.22s cubic-bezier','fill 0.23s cubic-bezier');
 expect(changed).not.toBe(svgSource);
 expect(await compileSvg(changed)).not.toBe(await compileSvg(originalSvgSource));
});
