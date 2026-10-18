import {readFileSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileSettingsChatLayoutStyles,settingsChatLayoutOwnership,type SettingsChatLayoutLane} from '../scripts/settings-chat-layout-style-ownership.mjs';
interface NativeFixture {lane:SettingsChatLayoutLane;input:string;output:string;native:string;declarations:number;receivers:number}
const fixtureText=readFileSync('tests/fixtures/settings-chat-native.json','utf8');
const fixtures:NativeFixture[]=JSON.parse(fixtureText);
const sources=fixtures.map(row=>({...row,inputPath:path.resolve(row.input),source:readFileSync(row.input,'utf8')}));
type Source=(typeof sources)[number];
async function qualify(row:Source,input=row.source){
 const result=await compileSettingsChatLayoutStyles(row.lane,input,row.inputPath,process.cwd());
 expect(result.css).toBe(row.native);
 expect(result.receivers).toHaveLength(row.receivers);
 expect(result.css).not.toMatch(/@(?:apply|utility|import "tailwindcss")/);
 return result;
}
it('pins the independently captured original Settings and Chat stylesheet bodies',()=>{
 expect(crypto.createHash('sha256').update(fixtureText).digest('hex')).toBe('ae1c1483c6ebc51de21b0ffafb3fba96460c7c45ea783defdff5da9c9e13b308');
 expect(fixtures).toHaveLength(10);
 expect(fixtures.reduce((n,r)=>n+r.receivers,0)).toBe(280);
 expect(fixtures.reduce((n,r)=>n+r.declarations,0)).toBe(986);
});
it.each(sources)('$lane retains every original stylesheet byte and owns every ordinary layout declaration',async row=>{
 expect(settingsChatLayoutOwnership[row.lane].receivers).toHaveLength(row.receivers);
 expect(settingsChatLayoutOwnership[row.lane].declarationCount).toBe(row.declarations);
 await qualify(row);
 const unowned:string[]=[];
 postcss.parse(row.source).walkDecls(declaration=>{
  let owned=false;
  for(let parent:postcss.AnyNode|undefined=declaration.parent;parent;parent=parent.parent){
   if(parent.type==='atrule'&&['utility','keyframes','-webkit-keyframes'].includes(parent.name))owned=true;
  }
  if(!owned)unowned.push(declaration.toString());
 });
 expect(unowned).toEqual([]);
});
const mutationCases=sources.flatMap(row=>settingsChatLayoutOwnership[row.lane].receivers.map(receiver=>({row,utility:receiver[0]})));
it.each(mutationCases)('rejects a declaration mutation in $utility',async({row,utility})=>{
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
it.each(sources)('$lane rejects a missing receiver, extra declaration and foreign selector',async row=>{
 const first=settingsChatLayoutOwnership[row.lane].receivers[0][0];
 for(const changed of [row.source.replace('@apply gb:'+first+';',''),row.source.replace('@apply gb:'+first+';','@apply gb:'+first+';color:red;'),row.source+'\n.foreign-layout {color:red;}\n']){
  expect(changed).not.toBe(row.source);
  await expect(qualify(row,changed)).rejects.toThrow();
 }
});
it('keeps supports ancestry explicit and rejects a changed supports kind or condition',async()=>{
 const row=sources.find(item=>item.lane==='settings');if(!row)throw new Error('Missing Settings source');
 for(const changed of [row.source.replace('@supports (appearance: base-select)','@media (appearance: base-select)'),row.source.replace('@supports (appearance: base-select)','@supports (appearance: auto)')]){
  expect(changed).not.toBe(row.source);await expect(qualify(row,changed)).rejects.toThrow();
 }
});
