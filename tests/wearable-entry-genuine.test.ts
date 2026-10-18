// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {renderWearableSourcePicker,renderWearableManualLog,projectWearableNoteField,projectWearableTagChips} from '../js/wearables-entry-presentation.js';
const host=(html:string)=>{const node=document.createElement('div');node.innerHTML=html;return node;};
it('preserves sparse source lists without inventing rows or reading missing ids',()=>{
 const ids:string[]=[];ids[2]='two';const trace:string[]=[];
 const node=host(renderWearableSourcePicker({label:()=>{trace.push('label');return 'Weight';},ids,current:'two',name:id=>{trace.push(id);return id;},automatic:()=>{trace.push('auto');return 'two';}}));
 expect(trace).toEqual(['label','two','auto']);expect(node.querySelectorAll('button')).toHaveLength(2);
 expect([...node.querySelectorAll('[data-source]')].map(n=>n.getAttribute('data-source'))).toEqual(['two','']);
 expect(node.querySelectorAll('.wearable-source-picker-check')).toHaveLength(1);
});
it('retains literal note ids and once-decoded action attributes without injected nodes',()=>{
 const id='</textarea><img data-probe><script>unsafe</script>&quot;';
 const node=host(renderWearableManualLog({mode:'detail-rhr',today:'2001-02-03',
  form:()=> 'data-wearable-form="detail-manual-add" data-wearable-metric="&lt;&gt;&amp;quot;&#39;" data-wearable-kind="rhr"',
  tags:()=>projectWearableTagChips('rhr'),note:()=>projectWearableNoteField(id),cancel:()=> 'data-wearable-action="close-detail-manual-add"'}));
 expect(node.querySelectorAll('textarea')).toHaveLength(1);expect(node.querySelector('textarea')?.id).toBe(id);
 expect(node.querySelector('form')?.getAttribute('data-wearable-metric')).toBe('<>&quot;\'');
 expect(node.querySelectorAll('[data-wearable-log-action="toggle-chip"]')).toHaveLength(3);
 expect(node.querySelectorAll('img,script,[data-probe]')).toHaveLength(0);
});
it('rejects foreign delegated attribute lanes at the original early form read',()=>{
 const trace:string[]=[];
 expect(()=>renderWearableManualLog({mode:'detail-weight',today:'2001-02-03',form:()=> 'onclick="unsafe"',
  placeholder:()=>{trace.push('placeholder');return 'kg';},note:()=>{trace.push('note');return projectWearableNoteField();},cancel:()=> 'data-wearable-action="close"'})).toThrow('Unexpected wearable delegated attribute fragment');
 expect(trace).toEqual([]);
});
it.each(['WearableManualLog','WearableManualTags','WearableManualNote','WearableSourcePicker','WearableSourceRow','WearableSourceCheck'])('genuine %s has no raw HTML child escape hatch',name=>{
 expect(readFileSync('js/components/'+name+'.svelte','utf8')).not.toContain('{@html');
});
