import {restoreResultRecipeBodies} from './marker-detail-result-style-receipts.js';
import {compileMarkerDetailCompleteStyles as compileManualMarkerEntryStyles} from '../scripts/marker-detail-complete-style-ownership.mjs';
import {describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {JSDOM} from 'jsdom';
import original from './fixtures/custom-marker-original.json' with {type:'json'};
import {renderCustomMarkerForm} from '../js/custom-marker-presentation.js';
import {manualMarkerEntryOwnership} from '../scripts/manual-marker-entry-style-ownership.mjs';
import {customMarkerOwnership} from '../scripts/custom-marker-style-ownership.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputPath=path.join(root,'css/marker-detail-modal.base.css');
const expected=[
  [['margin-top','6px'],['gap','8px'],['align-items','center']],
  [['cursor','pointer'],['font-size','20px'],['min-width','28px'],['text-align','center']],
  [['flex','1']], [['display','flex'],['gap','8px']], [['line-height','36px']],
];
function structure(css:string):unknown {return postcss.parse(css).nodes.map(node=>node.type==='rule'?{type:node.type,selector:node.selector,decls:node.nodes.map(child=>child.type==='decl'?[child.prop,child.value,child.important]:child.toString())}:node.type==='atrule'?{type:node.type,name:node.name,params:node.params,body:node.nodes?.map(child=>child.toString())}: {type:node.type,text:node.toString()});}
describe('fixed custom marker Tailwind styles',()=>{
  it('preserves the whole original sheet prefix and declaration order; adds only five scoped rules',async()=>{
    const input=await fs.readFile(inputPath,'utf8'),old=await fs.readFile(path.join(root,'tests/fixtures/custom-marker-styles-original.css'),'utf8');
    const result=await compileManualMarkerEntryStyles(input,inputPath,root);
    // Exact old bytes and all ordered native rules remain before new receivers.
    const qualified=await restoreResultRecipeBodies(result.css);
    const boundary=qualified.indexOf('/* Fixed Custom Marker presentation');expect(boundary).toBeGreaterThan(0);
    expect(qualified.startsWith(old)).toBe(true);
    expect(qualified.slice(0,boundary).trimEnd()).toBe(old.trimEnd());
    expect(structure(qualified.slice(0,boundary))).toEqual(structure(old));
    const rules=postcss.parse(qualified.slice(boundary)).nodes.filter(node=>node.type==='rule');expect(rules).toHaveLength(5);
    rules.forEach((rule,index)=>{expect(rule.selector).toBe(customMarkerOwnership.receivers[index]![1]);expect(rule.nodes.map(node=>node.type==='decl'?[node.prop,node.value]:node.toString())).toEqual(expected[index]);});
    expect(result.receivers.filter(row=>manualMarkerEntryOwnership.receivers.some(([name])=>name===row.utility))).toHaveLength(16);
    let stitched=input;for(const edit of [...result.edits].sort((a,b)=>b.start-a.start)){expect(input.slice(edit.start,edit.end)).toBe(edit.before);stitched=stitched.slice(0,edit.start)+edit.after+stitched.slice(edit.end);}expect(result.css).toBe(stitched);

  });
  it('keeps full computed CSS for the seven transferred native nodes',async()=>{
    const input=await fs.readFile(inputPath,'utf8'),oldCSS=await fs.readFile(path.join(root,'tests/fixtures/custom-marker-styles-original.css'),'utf8');
    const output=await compileManualMarkerEntryStyles(input,inputPath,root);
    const old=new JSDOM('<!doctype html><style>'+oldCSS+'</style><div class="modal gb-form-modal marker-form-modal">'+original[1]!.originalHTML+'</div>');
    const current=new JSDOM('<!doctype html><style>'+output.css+'</style><div class="modal gb-form-modal marker-form-modal">'+renderCustomMarkerForm(original[1]!.categories)+'</div>');
    const selectors=['#cm-new-cat-row','#cm-new-cat-icon','#cm-new-cat','#cm-ref-min + span','#cm-opt-min + span','#cm-ref-min','#cm-opt-min'];
    function observe(dom:JSDOM){return selectors.map(selector=>{
      const target=dom.window.document.querySelector(selector);if(!target)throw new Error('Missing source-owned target');
      const element=selector.endsWith('min')?target.parentElement:target;if(!element)throw new Error('Missing native range parent');
      const css=dom.window.getComputedStyle(element);
      return {selector,node:element.tagName,css:Array.from({length:css.length},(_,index)=>{const name=css.item(index);return [name,css.getPropertyValue(name),css.getPropertyPriority(name)];})};
    });}
    try{expect(observe(current)).toEqual(observe(old));}finally{old.window.close();current.window.close();}
  });
  it.each([
    ['unknown','\n.bad { @apply gb:custom-marker-category-row; }'],
    ['duplicate','\n.marker-form-modal #cm-new-cat-row { @apply gb:custom-marker-category-row; }'],
    ['wrong media','\n@media(max-width:799px) {.marker-form-modal #cm-new-cat-icon { @apply gb:custom-marker-category-icon; }}'],
  ])('rejects %s receiver',async(_name,extra)=>{
    const input=await fs.readFile(inputPath,'utf8');await expect(compileManualMarkerEntryStyles(input+extra,inputPath,root)).rejects.toThrow();
  });
});
