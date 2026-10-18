// @vitest-environment node
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {wearableDetailOwnership} from '../scripts/wearable-presentation-style-ownership.mjs';
import {compileLegacyWearableDetailStyles as compileWearableDetailStyles} from './helpers/wearable-presentation-style-inverse.js';
const canonical=process.cwd(),inputPath=path.resolve('css/wearables.base.css');
const input=readFileSync(inputPath,'utf8'),prior=readFileSync('tests/fixtures/wearable-presentation-prior.css','utf8');
type Edit={start:number;end:number;before:string;after:string};
const bodies=JSON.parse(readFileSync('tests/fixtures/wearable-detail-style-bodies.json','utf8')) as {edits:Edit[]};
function restore(css:string){let out=css;for(const e of [...bodies.edits].sort((a,b)=>b.start-a.start)){expect(out.slice(e.start,e.end)).toBe(e.before);out=out.slice(0,e.start)+e.after+out.slice(e.end);}return out;}
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule')ancestry.unshift([(p as postcss.AtRule).name,(p as postcss.AtRule).params]);else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
it('restores every original wearable CSS byte and ordered ancestry/comment/priority through32 dedicated detail bodies',async()=>{const out=await compileWearableDetailStyles(input,inputPath,canonical);expect(out.receivers).toHaveLength(65);expect(wearableDetailOwnership.declarationCount).toBe(272);expect(restore(out.css)).toBe(prior);expect(primitives(out.css)).toEqual(primitives(prior));expect(primitives(prior)).toHaveLength(845);});
const utility="wearable-detail-wearable-manual-entries",selector=".wearable-manual-entries";
const invalid:[string,(source:string)=>string][]=[
 ['unknown receiver',s=>s.replace('@apply gb:'+utility+';','@apply gb:unknown-detail;')],
 ['duplicate receiver',s=>s+'\n'+selector+' { color:red; }\n'],
 ['duplicate recipe',s=>s+'\n@utility '+utility+' { color:red; }\n'],
 ['extra declaration',s=>s.replace('@apply gb:'+utility+';','@apply gb:'+utility+'; color:red;')],
 ['wrong media ancestry',s=>s.replace(selector+' { @apply gb:'+utility+'; }','@media (max-width:731px) {'+selector+' { @apply gb:'+utility+'; }}')],
];
it.each(invalid)('rejects %s through unchanged ownership safety',async(_label,mutate)=>{const changed=mutate(input);expect(changed).not.toBe(input);await expect(compileWearableDetailStyles(changed,inputPath,canonical)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('rejects a changed compiled declaration through the exact body inverse',async()=>{const out=await compileWearableDetailStyles(input,inputPath,canonical);const body=bodies.edits[0]!;expect(out.css.slice(body.start,body.end)).toBe(body.before);const altered=body.before.replace('margin-top: 14px','margin-top: 15px');expect(altered).not.toBe(body.before);const changed=out.css.slice(0,body.start)+altered+out.css.slice(body.end);expect(()=>restore(changed)).toThrow();});
