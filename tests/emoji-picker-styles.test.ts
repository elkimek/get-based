import {sharedModalOwnership} from '../scripts/context-modal-style-ownership.mjs';
import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {compileNativeStyleBodies} from '../scripts/native-recipe-styles.mjs';
import {compileModalPresentationStyles,modalPresentationOwnership} from '../scripts/modal-presentation-style-ownership.mjs';
import {emojiPickerOwnership} from '../scripts/emoji-picker-style-ownership.mjs';
const root=process.cwd(),inputPath=path.join(root,'css/modal-shared.base.css');
const input=fs.readFileSync(inputPath,'utf8');
const original=fs.readFileSync(new URL('./fixtures/emoji-picker-original.css',import.meta.url),'utf8');
const oldOwnership={...modalPresentationOwnership,receivers:modalPresentationOwnership.receivers.filter(([name])=>!name.startsWith('emoji-picker-')&&!sharedModalOwnership.receivers.some(row=>row[0]===name)),declarationCount:modalPresentationOwnership.declarationCount-emojiPickerOwnership.declarationCount-sharedModalOwnership.declarationCount};
function signature(css:string){const rows:unknown[]=[];postcss.parse(css).walk(node=>{if(node.type==='decl')rows.push(['decl',node.prop,node.value,node.important]);else if(node.type==='rule')rows.push(['rule',node.selector]);else if(node.type==='atrule')rows.push(['at',node.name,node.params]);else if(node.type==='comment')rows.push(['comment',node.text]);});return rows;}
function removeReset(css:string){let result=css,count=0;postcss.parse(css).walkRules(rule=>{if(rule.selector!=='.emoji-picker-cats button[data-cat="__reset"]')return;count++;
  expect(rule.nodes.map(node=>node.type==='decl'?[node.prop,node.value,node.important===true]:null)).toEqual([['font-size','12px',false],['font-family','inherit',false]]);
  const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!;expect(css.slice(start,end)).toBe(rule.toString());expect(css[start-1]).toBe('\n');result=css.slice(0,start-1)+css.slice(end);
});expect(count).toBe(1);return result;}
function foreign(css:string){const edits:Array<[number,number]>=[];postcss.parse(css).walkRules(rule=>{
  if(!emojiPickerOwnership.receivers.some(([,selector])=>selector===rule.selector))return;
  const start=rule.source!.start!.offset!,end=rule.source!.end!.offset!,open=start+rule.selector.length+(rule.raws.between||'').length;
  expect(css.slice(start,end)).toBe(rule.toString());expect(css[open]).toBe('{');expect(css[end-1]).toBe('}');edits.push([open+1,end-1]);
});expect(edits).toHaveLength(11);let value=css;for(const [start,end] of edits.sort((a,b)=>b[0]-a[0]))value=value.slice(0,start)+'<owned>'+value.slice(end);return value;}
let index=0;
async function exact(source:string){const old=await compileNativeStyleBodies(original,inputPath,root,oldOwnership),next=await compileModalPresentationStyles(source,inputPath,root);
  const dir=process.env['GETBASED_EMOJI_STYLE_OUTPUT'];if(dir)fs.writeFileSync(path.join(dir,`styles-${index++}.json`),JSON.stringify({originalInput:original,candidateInput:source,original:old.css,candidate:next.css,oldReceivers:old.receivers,newReceivers:next.receivers},null,2),{flag:'wx'});
  const withoutReset=removeReset(next.css);expect(signature(withoutReset)).toEqual(signature(old.css));expect(foreign(withoutReset)).toBe(foreign(old.css));
  expect(emojiPickerOwnership.receivers).toHaveLength(12);expect(emojiPickerOwnership.declarationCount).toBe(58);return next;
}
describe('complete emoji picker native Tailwind ownership',()=>{
  it('preserves every old selector/declaration/foreign byte and transfers two reset inline values',async()=>{await exact(input);});
  for(const [name,mutate] of [
    ['owned value',(css:string)=>css.replace('width: 320px','width: 321px')],
    ['foreign value',(css:string)=>css.replace('backdrop-filter: blur(4px)','backdrop-filter: blur(5px)')],
    ['missing utility',(css:string)=>css.replace('@utility emoji-picker-01','@utility unknown-picker')],
    ['missing receiver',(css:string)=>css.replace('@apply gb:emoji-picker-01;','display: block;')],
    ['reset value',(css:string)=>css.replace('font-family: inherit; }','font-family: serif; }')],
  ] as const)it('rejects '+name,async()=>{expect(mutate(input)).not.toBe(input);await expect(exact(mutate(input))).rejects.toThrow();});
});
