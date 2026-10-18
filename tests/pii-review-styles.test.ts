import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {compilePIIReviewStyles} from '../scripts/pii-review-style-ownership.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputPath=path.join(root,'css/data-protection.base.css');
const input=fs.readFileSync(inputPath,'utf8');
const original: {source: string}=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/pii-review-styles-original.json'),'utf8'));
const tree = (source: string): unknown => {
  const node=postcss.parse(source).toJSON();
  // Parser locations/formatting are diagnostic; actual native selector/media,
  // property/value/priority/ordered children are the complete semantic oracle.
  function structural(value: unknown): unknown {
    if (!value||typeof value!=='object') return value;
    if (Array.isArray(value)) return value.map(structural);
    const row=value as Record<string,unknown>;
    return Object.fromEntries(Object.entries(row).filter(([key])=>!['raws','source','inputs','inputId'].includes(key)).map(([key,item])=>[key,structural(item)]));
  }
  return structural(node);
};
describe('PII lazy stylesheet recipes',()=>{
  it('retains the complete native CSS tree, declarations, keyframes and media order', async()=>{
    const result=await compilePIIReviewStyles(input,inputPath,root);
    // The sole intentional addition enforces the controller's existing hidden flags.
    const compiled=postcss.parse(result.css),hidden:postcss.Rule[]=[];
    compiled.walkRules(rule=>{if(rule.selector==='.pii-review-actions [hidden]')hidden.push(rule);});
    expect(hidden).toHaveLength(1);const receiver=hidden[0]!;
    expect(receiver.parent?.type).toBe('root');
    const previous=receiver.prev(),next=receiver.next();
    expect(previous?.type==='rule'&&previous.selector).toBe('.pii-review-actions');
    expect(next?.type==='rule'&&next.selector).toBe('.pii-review-actions-simple');
    expect(receiver.nodes.map(node=>node.type==='decl'?{type:node.type,property:node.prop,value:node.value,important:node.important||false}:{type:node.type})).toEqual([{type:'decl',property:'display',value:'none',important:false}]);
    receiver.remove();
    expect(tree(compiled.toString())).toEqual(tree(original.source));
    // Engine coordinates independently bind every foreign byte gap.
    let position=0, cursor=0;
    for (const edit of result.edits) {
      const gap=input.slice(position,edit.start);
      expect(result.css.slice(cursor,cursor+gap.length)).toBe(gap);
      position=edit.end;cursor+=gap.length+edit.after.length;
    }
    expect(result.css.slice(cursor)).toBe(input.slice(position));
  });
  it.each(['duplicate','media','extra','recipe'])('rejects altered ownership: %s', async kind=>{
    const tree=postcss.parse(input);let changed=false;
    tree.walkAtRules('apply',node=>{
      if(changed)return;changed=true;
      if(kind==='duplicate') node.parent!.after(node.parent!.clone());
      else if(kind==='media') {const media=postcss.atRule({name:'media',params:'(max-width: 767px)'});node.parent!.replaceWith(media);media.append(node.parent!);}
      else if(kind==='extra') node.parent!.append(postcss.decl({prop:'outline',value:'1px solid red'}));
      else node.params='gb:pii-unowned';
    });
    expect(changed).toBe(true);
    await expect(compilePIIReviewStyles(tree.toString(),inputPath,root)).rejects.toThrow();
  });
  it.each(['missing','moved','media','duplicate','extra'])('rejects altered hidden-action receiver: %s', async kind=>{
    const source=postcss.parse(input);let receiver:postcss.Rule|undefined;
    source.walkRules(rule=>{if(rule.selector==='.pii-review-actions [hidden]')receiver=rule;});
    expect(receiver).toBeDefined();const owned=receiver!;
    if(kind==='missing')owned.remove();
    else if(kind==='moved'){owned.remove();source.append(owned);}
    else if(kind==='media'){const media=postcss.atRule({name:'media',params:'(max-width: 768px)'});owned.replaceWith(media);media.append(owned);}
    else if(kind==='duplicate')owned.after(owned.clone());
    else owned.append(postcss.decl({prop:'opacity',value:'0'}));
    await expect(Promise.resolve().then(()=>compilePIIReviewStyles(source.toString(),inputPath,root))).rejects.toThrow();
  });
});
