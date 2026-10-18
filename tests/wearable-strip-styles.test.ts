// @vitest-environment node
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import postcss from 'postcss';
import {wearableStripOwnership} from '../scripts/wearable-presentation-style-ownership.mjs';
import {compileLegacyWearableStripStyles as compileWearableStripStyles} from './helpers/wearable-presentation-style-inverse.js';
const canonical=process.cwd(),inputPath=path.resolve('css/wearables.base.css');
const input=readFileSync(inputPath,'utf8'),prior=readFileSync('tests/fixtures/wearable-presentation-prior.css','utf8');
type Edit={start:number;end:number;before:string;after:string};
const bodies=JSON.parse(readFileSync('tests/fixtures/wearable-strip-style-bodies.json','utf8')) as {edits:Edit[]};
function restore(css:string){let out=css;for(const e of [...bodies.edits].sort((a,b)=>b.start-a.start)){expect(out.slice(e.start,e.end)).toBe(e.before);out=out.slice(0,e.start)+e.after+out.slice(e.end);}return out;}
function primitives(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule')ancestry.unshift([(p as postcss.AtRule).name,(p as postcss.AtRule).params]);else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
it('restores every prior wearable byte through 46 exclusive body inverses',async()=>{const out=await compileWearableStripStyles(input,inputPath,canonical);expect(out.receivers).toHaveLength(79);expect(wearableStripOwnership.declarationCount).toBe(331);expect(restore(out.css)).toBe(prior);expect(primitives(out.css)).toEqual(primitives(prior));expect(primitives(prior)).toHaveLength(845);});
const invalid:[string,(source:string)=>string][]=[
 ['unknown receiver',s=>s.replace('@apply gb:wearable-strip-wearable-strip-stub;','@apply gb:dashboard-strip-unknown;')],
 ['duplicate receiver',s=>s+'\n.wearable-strip-stub { border-style: dashed; }\n'],
 ['duplicate recipe',s=>s+'\n@utility wearable-strip-wearable-strip-stub { border-style: dashed; }\n'],
 ['extra declaration',s=>s.replace('@apply gb:wearable-strip-wearable-strip-stub;','@apply gb:wearable-strip-wearable-strip-stub; color: red;')],
 ['wrong media ancestry',s=>s.replace('.wearable-strip-stub { @apply gb:wearable-strip-wearable-strip-stub; }','@media (max-width: 731px) {.wearable-strip-stub { @apply gb:wearable-strip-wearable-strip-stub; }}')],
];
it.each(invalid)('rejects %s through unchanged ownership safety',async(_label,mutate)=>{const changed=mutate(input);expect(changed).not.toBe(input);await expect(compileWearableStripStyles(changed,inputPath,canonical)).rejects.toMatchObject({code:'ERR_ASSERTION'});});
it('the exact inverse rejects a changed compiled owned body',async()=>{const {css}=await compileWearableStripStyles(input,inputPath,canonical);const body=bodies.edits[0]!;expect(css.slice(body.start,body.end)).toBe(body.before);const altered=body.before.replace('border-style: dashed;','border-style: solid;');expect(altered).not.toBe(body.before);const changed=css.slice(0,body.start)+altered+css.slice(body.end);expect(changed).not.toBe(css);expect(()=>restore(changed)).toThrow();});
