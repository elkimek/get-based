// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { renderChannelDeficitDeviceRecs, recommendDeviceProductsForChannelDeficit, setProductRecsEnabled, type ProductCatalog } from '../js/recommendations-products.js';
import { projectDeviceRecommendations } from '../js/light-device-recommendations-presentation.js';
import { renderHTML } from '../js/components/LightDeviceRecommendations.svelte.html.js';
interface Sample { name:string;country:string;enabled:boolean;catalog:ProductCatalog|null;presets:Parameters<typeof renderChannelDeficitDeviceRecs>[2];channel:string;label:unknown;html:string }
const original=JSON.parse(readFileSync('tests/fixtures/light-device-recommendations-original.json','utf8')) as {cases:Sample[]};
const saved={profiles:state.profiles,currentProfile:state.currentProfile};
afterEach(()=>{state.profiles=saved.profiles;state.currentProfile=saved.currentProfile;localStorage.clear();});
function semantic(html:string) {
  const root=document.createElement('div');root.innerHTML=html;
  // Settings is an action: the authored control adds native Space activation.
  const old=root.querySelector('a[data-rec-action]');if(old){const button=document.createElement('button');button.type='button';button.setAttribute('data-rec-action',old.getAttribute('data-rec-action')!);button.textContent=old.textContent;old.replaceWith(button);}
  const tree=(element:Element):unknown=>({tag:element.tagName,
    classes:[...element.classList].filter(name=>!name.startsWith('gb:')&&!['rec-light-deficit-name','rec-channel-deficit-opt-out'].includes(name)).sort(),
    attrs:Object.fromEntries([...element.attributes].filter(attr=>!['class','data-light-device-options'].includes(attr.name)).map(attr=>[attr.name,attr.value])),
    text:[...element.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').replace(/\s+/g,' ').trim(),children:[...element.children].map(tree)});
  return [...root.children].map(tree);
}
for(const sample of original.cases)it(`retains independent original device options: ${sample.name}`,()=>{
  state.currentProfile='default';state.profiles=[{id:'default',location:{country:sample.country,zip:''}}];setProductRecsEnabled(sample.enabled);
  const before=JSON.stringify(sample);
  expect(semantic(renderChannelDeficitDeviceRecs(sample.catalog,sample.channel,sample.presets,{label:sample.label}))).toEqual(semantic(sample.html));
  expect(JSON.stringify(sample)).toBe(before);
});
it('keeps catalog order, regional joins, deduplication and the cap before URL rejection',()=>{
  const sample=original.cases[0]!;state.profiles=[{id:'default',location:{country:'',zip:''}}];state.currentProfile='default';setProductRecsEnabled(true);
  expect(recommendDeviceProductsForChannelDeficit(sample.catalog,sample.channel,sample.presets).map(p=>p.key)).toEqual(['panel-one','panel-three','panel-four']);
  const invalid=original.cases.find(sample=>sample.name==='cap-before-invalid-filter')!;
  expect(renderChannelDeficitDeviceRecs(invalid.catalog,invalid.channel,invalid.presets)).toBe('');
});
it('escapes literal labels, product metadata and attributes through the authored view',()=>{
  const literal='<img src=x onerror=alert(1)> & "';
  const options=[{href:'https://fixture.example/?literal=%22',event:literal,name:literal,vendor:literal,blurb:literal}];
  const before=JSON.stringify(options),view=projectDeviceRecommendations(literal,options)!;
  const root=document.createElement('div');root.innerHTML=renderHTML({view});
  expect(root.querySelector('img,script,[onerror]')).toBeNull();
  expect(root.querySelector('strong')?.textContent).toBe(literal);
  expect(root.querySelector('.rec-vendor')?.textContent).toBe(`View on ${literal} →`);
  expect(root.querySelector('.rec-channel-deficit')?.getAttribute('aria-label')).toBe(`${literal} channel device options`);
  expect(root.querySelector('a')?.getAttribute('data-umami-event')).toBe(literal);
  expect(root.querySelector('a')?.getAttribute('rel')).toBe('noopener sponsored');
  expect(root.querySelector('[data-rec-action]')?.getAttribute('data-rec-action')).toBe('open-privacy-settings');
  expect(JSON.stringify(options)).toBe(before);
});
it('preserves scalar display coercion and empty render suppression without stores',()=>{
  expect(projectDeviceRecommendations('anything',[])).toBeNull();
  const view=projectDeviceRecommendations(null,[{href:'https://fixture.example/',event:'test',name:0,vendor:23,blurb:null}])!;
  expect(view).toEqual({label:'',rows:[{href:'https://fixture.example/',event:'test',name:'0',vendor:'23',blurb:'',label:'View 0 on 23, opens in new tab'}]});
});
