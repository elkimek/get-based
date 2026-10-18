import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileStartupBannerStyles,syncStatusOwnership} from '../scripts/startup-banner-style-ownership.mjs';
const root=path.resolve('.');
const inputPath=path.join(root,'css/app-shell.base.css');const input=readFileSync(inputPath,'utf8');
const original = (JSON.parse(readFileSync('tests/fixtures/startup-banner-original.json', 'utf8')) as {lanes: {lane: string; original: string}[]}).lanes.find(row => row.lane === 'app-shell')!.original;
const foreign=`\n/* Synthetic foreign owner */\n.foreign-sync-color {\n  background:\n    linear-gradient(135deg, var(--accent), transparent),\n    var(--bg-card);\n}\n`;
it('retains foreign multiline source bytes and the original sync-pulse block between native receivers',async()=>{
  const {css}=await compileStartupBannerStyles('app-shell',input+foreign,inputPath,root);
  expect(css.endsWith(foreign)).toBe(true);
  const originalKeys:string[]=[],currentKeys:string[]=[];
  postcss.parse(original).walkAtRules('keyframes',n=>{if(n.params==='sync-pulse')originalKeys.push(n.toString());});
  postcss.parse(css).walkAtRules('keyframes',n=>{if(n.params==='sync-pulse')currentKeys.push(n.toString());});
  expect(originalKeys).toHaveLength(1);expect(currentKeys).toEqual(originalKeys);
  expect(css.indexOf('.sync-dot-error')).toBeLessThan(css.indexOf('@keyframes sync-pulse'));
  expect(css.indexOf('@keyframes sync-pulse')).toBeLessThan(css.indexOf('.sync-popover'));
  const originalReceivers=syncStatusOwnership.receivers.filter(([utility])=>utility!=='sync-popover-mobile');
  expect(originalReceivers).toEqual([['sync-indicator','.sync-indicator',null],['sync-dot','.sync-dot',null],['sync-dot-synced','.sync-dot-synced',null],['sync-dot-syncing','.sync-dot-syncing',null],['sync-dot-offline','.sync-dot-offline',null],['sync-dot-error','.sync-dot-error',null],['sync-popover','.sync-popover',null]]);
  for(const [,selector] of originalReceivers){const old:unknown[]=[],current:unknown[]=[];
    const declarations=(nodes:postcss.ChildNode[])=>nodes.map(n=>{expect(n.type).toBe('decl');if(n.type!=='decl')throw Error('undeclared child');return[n.prop,n.value,n.important===true];});
    postcss.parse(original).walkRules(selector,n=>{old.push(declarations(n.nodes));});postcss.parse(css).walkRules(selector,n=>{current.push(declarations(n.nodes));});
    expect(old).toHaveLength(1);expect(current).toEqual(old);
  }
});
const invalid:[string,()=>string][]=[
 ['unknown Sync apply',()=>input.replace('@apply gb:sync-indicator;','@apply gb:unowned-sync;')],
 ['duplicate Sync receiver',()=>input+'\n.sync-popover { color:red; }'],
 ['duplicate Sync recipe',()=>input+'\n@utility sync-dot { width:9px; }'],
 ['extra Sync receiver declaration',()=>input.replace('@apply gb:sync-dot;','@apply gb:sync-dot; width:9px;')],
 ['Sync receiver moved into foreign media',()=>input.replace('.sync-popover { @apply gb:sync-popover; }','@media (max-width: 1px) { .sync-popover { @apply gb:sync-popover; } }')],
];
it.each(invalid)('rejects %s without admitting undeclared ownership',async(_name,mutate)=>{
 const changed=mutate();expect(changed).not.toBe(input);await expect(compileStartupBannerStyles('app-shell',changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});
});

it('adds exactly the mobile-shell scrolling recipe at its own native media receiver',async()=>{
 const {css}=await compileStartupBannerStyles('app-shell',input,inputPath,root);
 expect(syncStatusOwnership.receivers).toHaveLength(8);expect(syncStatusOwnership.declarationCount).toBe(32);
 const matches:postcss.Rule[]=[];
 postcss.parse(css).walkRules(rule=>{if(rule.selector==='body.mobile-dashboard-active .sync-popover,\n  body.mobile-tabs-active .sync-popover')matches.push(rule);});
 expect(matches).toHaveLength(1);const rule=matches[0]!;
 expect(rule.parent?.type).toBe('atrule');if(rule.parent?.type!=='atrule')throw Error('Mobile media required');
 expect(rule.parent.name).toBe('media');expect(rule.parent.params).toBe('(max-width: 799px)');expect(rule.parent.parent?.type).toBe('root');expect(rule.parent.nodes).toHaveLength(1);
 expect(rule.nodes.map(node=>{expect(node.type).toBe('decl');if(node.type!=='decl')throw Error('Exact mobile declarations only');return [node.prop,node.value,node.important===true];})).toEqual([
  ['max-height','calc(100dvh - 164px - env(safe-area-inset-bottom, 0px) - var(--mobile-visual-bottom-offset, 0px))',false],['overflow-y','auto',false]]);
});
const mobileBlock='\n@media (max-width: 799px) {\n  body.mobile-dashboard-active .sync-popover,\n  body.mobile-tabs-active .sync-popover { @apply gb:sync-popover-mobile; }\n}';
it.each<[string,()=>string]>([
 ['missing mobile receiver',()=>input.replace(mobileBlock,'')],
 ['wrong mobile media',()=>input.replace(mobileBlock,mobileBlock.replace('799px','798px'))],
 ['duplicate mobile receiver',()=>input+mobileBlock],
 ['extra mobile receiver declaration',()=>input.replace('@apply gb:sync-popover-mobile;','@apply gb:sync-popover-mobile; width:10px;')],
])('rejects %s',async(_name,mutate)=>{const changed=mutate();expect(changed).not.toBe(input);await expect(compileStartupBannerStyles('app-shell',changed,inputPath,root)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
