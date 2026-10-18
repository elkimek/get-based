import {expect,it} from 'vitest';
import {scanActionEmission} from './helpers/action-emission.js';
const token='data-wearable-action';
it('recognizes literal attributes once in authored Svelte without compiler artifacts',()=>{
 expect(scanActionEmission('<button data-wearable-action="open">Open</button>','NewOwner.svelte',token)).toEqual({emits:true,unclassified:[]});
});
it('does not classify selector-only event consumers as emitters',()=>{
 expect(scanActionEmission('document.querySelector("[data-wearable-action]")?.addEventListener("click", handler);','consumer.ts',token)).toEqual({emits:false,unclassified:[]});
});
it('recognizes derived conditional literal attribute records and nested spreads',()=>{
 const source='<script>const base={"data-wearable-action":"open"};const attrs=$derived(active?{...base,role:"button"}:{});</script><div {...attrs}></div>';
 expect(scanActionEmission(source,'NewOwner.svelte',token)).toEqual({emits:true,unclassified:[]});
});
it('fails closed on unknown DOM spreads and computed keys',()=>{
 for(const source of ['<div {...unknown}></div>','<script>const attrs={[key]:"open"};</script><div {...attrs}></div>'])expect(scanActionEmission(source,'NewOwner.svelte',token).unclassified.length).toBeGreaterThan(0);
});
it('recognizes native templates, setAttribute and aliased action helpers',()=>{
 for(const source of ['const html=`<button data-wearable-action="open">Open</button>`;', 'button.setAttribute("data-wearable-action","open");', 'import {actionAttributes as attrs} from "./action-attributes.js";attrs("wearable","open");'])expect(scanActionEmission(source,'new-owner.ts',token).emits).toBe(true);
});
it('treats a dynamic helper namespace conservatively as a possible emitter',()=>{
 const source='import {actionAttributes as attrs} from "./action-attributes.js";attrs(namespace,"open");';
 for(const family of [token,'data-cl-','data-report-action'])expect(scanActionEmission(source,'new-owner.ts',family).emits).toBe(true);
});
it('keeps component prop spreads separate from DOM attribute spreads',()=>{
 expect(scanActionEmission('<Child {...props}/>','Owner.svelte',token)).toEqual({emits:false,unclassified:[]});
});
it('accepts only the named closed-key contract and still detects foreign keys',()=>{
 const source='<div {...view.scroll}></div>';
 expect(scanActionEmission(source,'Owner.svelte',token,{'view.scroll':['tabindex']})).toEqual({emits:false,unclassified:[]});
 expect(scanActionEmission(source,'Owner.svelte',token,{'view.scroll':[token]}).emits).toBe(true);
 expect(scanActionEmission('<div {...view.other}></div>','Owner.svelte',token,{'view.scroll':['tabindex']}).unclassified).toHaveLength(1);
});

it('fails closed on a new dynamic native attribute name',()=>{
 expect(scanActionEmission('node.setAttribute(key,value);','new-owner.ts',token).unclassified).toHaveLength(1);
 expect(scanActionEmission('node.setAttribute(key,value);','reviewed-copy.ts',token,{'setAttribute(key)':['data-*']}).emits).toBe(true);
});

it('does not mistake public serializer input validation for actual HTML emission',()=>{expect(scanActionEmission('if(input!==\'data-wearable-action="open"\')throw new Error("bad");','validation.ts',token)).toEqual({emits:false,unclassified:[]});});
