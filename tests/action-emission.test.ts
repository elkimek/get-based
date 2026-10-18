import {expect,it} from 'vitest';
import {scanActionEmission,scanActionEmissionFamilies} from './helpers/action-emission.js';
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


it('bulk inspection retains exact family distinctions and analyzes changed source anew',()=>{
 const families=[token,'data-cl-','data-changelog-action','data-report-action','data-profile-share-'];
 const file='BulkOwner.svelte',source='<div data-wearable-action="open" {...view.attrs}></div>';
 const contracts={'view.attrs':['data-cl-delete','data-report-action']};
 const scan=scanActionEmissionFamilies(source,file,families,contracts);
 expect([...scan].map(([family,result])=>[family,result.emits,result.unclassified])).toEqual([
  [token,true,[]],['data-cl-',true,[]],['data-changelog-action',false,[]],['data-report-action',true,[]],['data-profile-share-',false,[]],
 ]);
 for(const family of families)expect(scan.get(family)).toEqual(scanActionEmission(source,file,family,contracts));
 const changed=scanActionEmissionFamilies(source.replace('data-wearable-action','data-profile-share-open'),file,families,contracts);
 expect(changed.get(token)?.emits).toBe(false);expect(changed.get('data-profile-share-')?.emits).toBe(true);
 const unknown=scanActionEmissionFamilies(source,file,families);
 for(const family of families)expect(unknown.get(family)?.unclassified).toEqual(['unreviewed DOM spread: view.attrs']);
 const changedContract=scanActionEmissionFamilies(source,file,families,{'view.attrs':['data-changelog-action']});
 expect(changedContract.get('data-cl-')?.emits).toBe(false);expect(changedContract.get('data-changelog-action')?.emits).toBe(true);
});

it.each([
 ['native.ts','const html=`<button data-wearable-action="open">Open</button>`;'],
 ['native.ts','node.setAttribute(key,value);'],
 ['native.ts','import {actionAttributes as attrs} from "./action-attributes.js";attrs(namespace,"open");'],
 ['Owner.svelte','<script>const base={"data-report-action":"open"};const attrs=$derived(active?{...base,role:"button"}:{});</script><div {...attrs}/>'],
 ['Owner.svelte','<div {...unknown}/><div {...unknown}/>'],
] as const)('bulk inspection preserves single-family corruption/serializer behavior for %s/%s',(file,source)=>{
 const families=[token,'data-cl-','data-changelog-action','data-report-action','data-profile-share-'];
 const contracts={'setAttribute(key)':['data-*']};
 const scan=scanActionEmissionFamilies(source,file,families,contracts);
 for(const family of families)expect(scan.get(family)).toEqual(scanActionEmission(source,file,family,contracts));
});
