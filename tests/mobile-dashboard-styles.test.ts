import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss, {type ChildNode} from 'postcss';
import {expect, it} from 'vitest';
import {buildMobileDashboardStyles} from '../scripts/build-styles.mjs';

const root=path.resolve(__dirname,'..');
const nativePath=path.join(__dirname,'fixtures/mobile-dashboard-original.css');
const outputPath=path.join(root,'css/mobile-dashboard.css');
// CSS whitespace is insignificant outside quoted tokens. Preserve quoted content,
// token boundaries, every declaration/fallback/priority and the full cascade tree.
function spaces(value:string):string {
  return value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\s+/g,token=>token[0]==='"'||token[0]==="'"?token:' ').trim();
}
function semantics(css:string):unknown {
  function visit(node:ChildNode):unknown {
    if(node.type==='comment')return null;
    if(node.type==='decl')return ['declaration',node.prop,spaces(node.value),node.important===true];
    if(node.type==='rule')return ['rule',spaces(node.selector),node.nodes.map(visit).filter(n=>n!==null)];
    if(node.type==='atrule')return ['at-rule',node.name,spaces(node.params),node.nodes?.map(visit).filter(n=>n!==null)??null];
    throw new Error('Unrecognized stylesheet node');
  }
  return postcss.parse(css).nodes.map(visit).filter(n=>n!==null);
}
it('preserves the Mobile cascade with the explicit horizontal navigation changes',async()=>{
  const original=await fs.readFile(nativePath,'utf8');
  expect(createHash('sha256').update(original).digest('hex')).toBe('8699dc45aadcfbe11494018533dcc8cafe922cbc3632ed03a9603d02c273051f');
  const compiled=await fs.readFile(outputPath,'utf8');
  const expected=postcss.parse(original);
  expected.walkRules('.m-tabbar',rule=>{
    rule.walkDecls('display',decl=>{decl.value='flex';});
    rule.walkDecls('grid-template-columns',decl=>{
      decl.replaceWith({prop:'overflow-x',value:'auto'},{prop:'overscroll-behavior-x',value:'contain'},
        {prop:'scroll-snap-type',value:'x proximity'},{prop:'scrollbar-width',value:'none'});
    });
  });
  expected.walkRules('.m-tab',rule=>{rule.walkDecls('min-width',decl=>{
    decl.value='76px';decl.after({prop:'scroll-snap-align',value:'center'});decl.after({prop:'flex',value:'0 0 22%'});
  });});
  expect(semantics(compiled)).toEqual(semantics(expected.toString()));
  let count=0;postcss.parse(compiled).walkDecls(()=>{count++;});expect(count).toBe(419);
  expect(await fs.readFile(path.join(root,'css/mobile-dashboard.base.css'),'utf8')).toContain('/* Mobile dashboard app shell */');
});
it('owns every rule with one scoped Tailwind recipe and emits no reset or global utility layer',async()=>{
  const base=postcss.parse(await fs.readFile(path.join(root,'css/mobile-dashboard.base.css'),'utf8'));
  const recipes=postcss.parse(await fs.readFile(path.join(root,'css/mobile-dashboard.tailwind.css'),'utf8'));
  const applies:string[]=[];let rules=0;let declarations=0;
  base.walkRules(rule=>{rules++;expect(rule.nodes).toHaveLength(1);expect(rule.nodes[0]?.type).toBe('atrule');});
  base.walkAtRules('apply',rule=>{applies.push(rule.params);});
  base.walkDecls(()=>{declarations++;});
  expect(rules).toBe(107);expect(declarations).toBe(0);expect(new Set(applies).size).toBe(107);
  const utilities:string[]=[];recipes.walkAtRules('utility',rule=>{utilities.push('gb:'+rule.params);});
  expect(applies).toEqual(utilities);
  const compiled=postcss.parse(await fs.readFile(outputPath,'utf8'));
  const layers:string[]=[];compiled.walkAtRules('layer',rule=>{layers.push(rule.params);});expect(layers).toEqual([]);
  const selectors:string[]=[];compiled.walkRules(rule=>{selectors.push(rule.selector);});expect(selectors).toHaveLength(107);
  expect(selectors.some(selector=>selector.includes('.gb\\:'))).toBe(false);
});
it('reproduces the runtime URL output through the maintained build and rejects stale output',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'getbased-mobile-styles-'));
  const candidate=path.join(directory,'mobile-dashboard.css');
  try {
    await buildMobileDashboardStyles({outputPath:candidate});
    expect(await fs.readFile(candidate,'utf8')).toBe(await fs.readFile(outputPath,'utf8'));
    await buildMobileDashboardStyles({outputPath:candidate,check:true});
    await fs.appendFile(candidate,'\n/* stale */\n');
    await expect(buildMobileDashboardStyles({outputPath:candidate,check:true})).rejects.toThrow('Mobile dashboard CSS is stale');
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
