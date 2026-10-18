import {expect,test} from './coverage-fixture.js';
import {routeHtml} from '../helpers/browser-static-routes.js';

test('genuine EMF editor keeps native layout and single mouse/Enter/Space photo actions with focus and scoped delegates',async({page})=>{
 await routeHtml(page,'**/emf-editor-genuine','<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/modal-shared.css"><link rel="stylesheet" href="/css/emf.css"></head><body><div id="modal-overlay"><div id="detail-modal"></div></div><button id="foreign" data-emf-action="view-photo" data-emf-assessment-id="synthetic" data-emf-room-idx="0" data-emf-photo-idx="0">Foreign</button></body></html>',200);
 await page.goto('/emf-editor-genuine');
 const setup=await page.evaluate(async()=>{
  const [{state},owner]=await Promise.all([import('/js/state.js'),import('/js/emf-editor.js')]);
  const imported={protected:{keep:['all',3]},emfAssessment:{assessments:[{id:'synthetic',date:'2026-06-12',label:'Native <&>',rooms:[{name:'Bedroom',location:'Pillow',sleeping:true,measurements:{acElectric:{value:8,meter:'NFA'}},sources:[],mitigations:[],photos:[{mediaType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII=',name:'Synthetic photo'}]}]}]}};
  (state as {importedData:unknown}).importedData=imported;localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('synthetic-protected','{"keep":true}');
  const calls:unknown[]=[];Object.assign(window,{__emfEditorTest:{calls,imported,before:JSON.stringify(imported),storage:JSON.stringify(Object.entries(localStorage))}});
  owner.configureEMFEditor({hasAIProvider:()=>false,viewEMFPhoto:(...args:[string,number,number])=>calls.push(args),closeModal:()=>document.getElementById('modal-overlay')?.classList.remove('show')});owner.openEMFAssessmentEditor();owner.emfEditorState.editingAssessmentId='synthetic';owner.renderEMFEditor(document.getElementById('detail-modal'));
  const image=document.querySelector<HTMLImageElement>('.emf-photo-open img')!,thumb=image.closest<HTMLElement>('.emf-photo-thumb')!;
  const native=document.createElement('div');native.className='emf-photo-thumb';native.style.position='absolute';native.style.left='-10000px';const oldImage=document.createElement('img');oldImage.src=image.src;oldImage.alt=image.alt;oldImage.setAttribute('role','button');oldImage.tabIndex=0;native.append(oldImage);document.body.append(native);
  const rect=(e:Element,parent:Element)=>{const a=e.getBoundingClientRect(),b=parent.getBoundingClientRect();return[a.width,a.height,a.x-b.x,a.y-b.y];};
  const geometry={current:rect(image,thumb),native:rect(oldImage,native)};
  const properties=['display','font-size','font-family','line-height','color','margin-bottom','padding-top','padding-bottom'];
  const headings=[...document.querySelectorAll<HTMLElement>('.emf-tags-label')].map(current=>{const old=document.createElement('label');old.className=current.className;old.textContent=current.textContent;current.after(old);const style=(e:Element)=>properties.map(p=>getComputedStyle(e).getPropertyValue(p));const result={tag:current.tagName,current:style(current),native:style(old)};old.remove();return result;});native.remove();return{geometry,headings};
 });
 expect(setup.geometry.current).toEqual(setup.geometry.native);for(const heading of setup.headings){expect(heading.tag).toBe('DIV');expect(heading.current).toEqual(heading.native);}
 const button=page.locator('.emf-photo-open');await expect(button).toHaveAccessibleName('Synthetic photo');await button.focus();await expect(button).toBeFocused();
 await page.locator('#foreign').click();expect(await page.evaluate(()=>(window as unknown as {__emfEditorTest:{calls:unknown[]}}).__emfEditorTest.calls)).toEqual([]);
 await button.focus();await button.press('Enter');await expect(button).toBeFocused();await button.press('Space');await expect(button).toBeFocused();await button.click();
 const after=await page.evaluate(()=>{const s=(window as unknown as {__emfEditorTest:{calls:unknown[];imported:unknown;before:string;storage:string}}).__emfEditorTest;return{calls:s.calls,unchanged:JSON.stringify(s.imported)===s.before,storage:JSON.stringify(Object.entries(localStorage))===s.storage,inline:[...document.querySelectorAll('#detail-modal *')].flatMap(e=>[...e.attributes].filter(a=>/^on/i.test(a.name)).map(a=>a.name))};});
 expect(after).toEqual({calls:[['synthetic',0,0],['synthetic',0,0],['synthetic',0,0]],unchanged:true,storage:true,inline:[]});
 await page.locator('[data-emf-action="close-editor"]').click();await page.locator('#foreign').click();expect(await page.evaluate(()=>(window as unknown as {__emfEditorTest:{calls:unknown[]}}).__emfEditorTest.calls.length)).toBe(3);
});

test('genuine async EMF recommendation child preserves the public serializer DOM and cleans up replacement/removal',async({page})=>{
 await routeHtml(page,'**/emf-meter-genuine','<!doctype html><html><body><div id="container"><div id="slot"></div></div></body></html>',200);await page.goto('/emf-meter-genuine');
 const result=await page.evaluate(async()=>{
  const [{mountEMFMeterRecommendations,disposeEMFMeterRecommendations},products]=await Promise.all([import('/js/emf-meter-recommendations-component.js'),import('/js/recommendations-products.js')]);
  const original=localStorage.getItem('labcharts-show-product-recs');products.setProductRecsEnabled(true);
  const catalog={products:{'_internal.emfMeters':[{name:'Synthetic <meter>',brand:'Synthetic',url:'https://example.invalid/meter',vendor:'Synthetic',matchTypes:['acElectric']}]}};
  const view=products.getEMFMeterSectionView(catalog);if(!view)throw new Error('Synthetic catalog should produce a typed section');
  const legacy=document.createElement('div');legacy.id='slot';legacy.innerHTML=products.renderEMFMeterRecs(catalog);const slot=document.getElementById('slot')!;mountEMFMeterRecommendations(slot,view);
  const tree=(node:Node):unknown=>{if(node.nodeType===8)return['','[',']','[0','[1','[2','[-1'].includes(node.nodeValue||'')?null:{unknownComment:node.nodeValue};if(node.nodeType===3)return node.nodeValue;const e=node as Element,children:unknown[]=[];for(const child of node.childNodes){const value=tree(child);if(value===null)continue;if(typeof value==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+value;else children.push(value);}return{tag:e.tagName,attributes:[...e.attributes].map(a=>[a.name,a.value]),children};};
  // The client compiler sets static attributes before dynamic attributes.
  // Transport only these four exact expected native attribute orders; every
  // name/value and all other node/attribute/text order remains observable.
  for(const[selector,order]of [['.rec-disclosure-btn',['data-rec-action','class']],['.rec-section[data-tips-view]',['data-tips-view','data-rec-section-click-guard','class']],['.rec-product-link',['target','rel','class','href','data-umami-event','aria-label']],['.rec-region-edit',['href','data-rec-action','aria-label','class']]] as const){
   for(const element of legacy.querySelectorAll(selector)){const values=new Map([...element.attributes].map(a=>[a.name,a.value]));if(values.size!==order.length||order.some(name=>!values.has(name)))throw new Error('Unqualified native recommendation attributes: '+selector);for(const name of values.keys())element.removeAttribute(name);for(const name of order)element.setAttribute(name,values.get(name)!);}
  }
  // The mounted root retains its final empty text anchor.
  legacy.append(document.createTextNode(''));
  const native=tree(legacy),actual=tree(slot);mountEMFMeterRecommendations(slot,{...view,header:'Replacement literal <&>'});const replacement=slot.textContent?.includes('Replacement literal <&>')===true;
  disposeEMFMeterRecommendations(document.getElementById('container')!);const empty=slot.childElementCount===0;mountEMFMeterRecommendations(slot,view);slot.remove();await new Promise(resolve=>setTimeout(resolve,0));const detachedEmpty=slot.childElementCount===0;
  if(original===null)localStorage.removeItem('labcharts-show-product-recs');else localStorage.setItem('labcharts-show-product-recs',original);
  return{native,actual,replacement,empty,detachedEmpty};
 });
 expect(result.actual).toEqual(result.native);expect(result.replacement).toBe(true);expect(result.empty).toBe(true);expect(result.detachedEmpty).toBe(true);
});

test('editor catalog responses respect slot identity and preview replacement disposes the real child',async({page})=>{
 await routeHtml(page,'**/emf-meter-race','<!doctype html><html><body><div id="modal-overlay"><div id="detail-modal"></div></div></body></html>',200);
 const {routeJavaScript}=await import('../helpers/browser-static-routes.js');
 await routeJavaScript(page,'**/js/recommendations.js*',`export function isProductRecsEnabled(){return true;} export function loadEMFCatalog(){return new Promise(resolve=>{(window.__emfMeterPending??=[]).push(resolve);});}`,200);
 await page.goto('/emf-meter-race');
 const result=await page.evaluate(async()=>{
  const [{state},owner]=await Promise.all([import('/js/state.js'),import('/js/emf-editor.js')]);
  (state as {importedData:unknown}).importedData={emfAssessment:{assessments:[]}};localStorage.setItem('labcharts-show-product-recs','true');owner.configureEMFEditor({hasAIProvider:()=>false});
  const modal=document.getElementById('detail-modal')!;owner.renderEMFEditor(modal);const old=document.getElementById('emf-meter-recs-slot')!;owner.renderEMFEditor(modal);const active=document.getElementById('emf-meter-recs-slot')!;
  const pending=(window as unknown as {__emfMeterPending:((value:unknown)=>void)[]}).__emfMeterPending;
  const catalog={products:{'_internal.emfMeters':[{name:'Async synthetic meter',url:'https://example.invalid/meter'}]}};if(pending.length!==2)throw new Error('Two actual editor catalog requests expected');pending[0]!(catalog);await new Promise(resolve=>setTimeout(resolve,0));const staleRejected=old.childElementCount===0&&active.childElementCount===0;
  pending[1]!(catalog);await new Promise(resolve=>setTimeout(resolve,0));const composed=active.textContent?.includes('Async synthetic meter')===true;
  owner.showEMFImportPreview({rooms:[]});const preview=document.querySelector('#emf-confirm-btn')!==null,disposed=active.childElementCount===0;
  return{staleRejected,composed,preview,disposed};
 });
 expect(result).toEqual({staleRejected:true,composed:true,preview:true,disposed:true});
});
