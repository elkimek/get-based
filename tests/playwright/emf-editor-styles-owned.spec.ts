import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';
import {expect,test} from '@playwright/test';
import {routeHtml} from '../helpers/browser-static-routes.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const original=fs.readFileSync(path.join(root,'tests/fixtures/emf-editor-styles-original.css'),'utf8');
const compiled=fs.readFileSync(path.join(root,'css/emf.css'),'utf8');
const common=['styles.css','themes-extra.css','css/modal-shared.css','css/context-editor.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const properties=new Set<string>();postcss.parse(original).walkDecls(decl=>{properties.add(decl.prop);for(const match of decl.value.matchAll(/var\((--[\w-]+)/g))properties.add(match[1]!);});
const props=[...properties].sort();
for(const touch of [false,true])test.describe(touch?'coarse pointer':'fine pointer',()=>{
 test.use({hasTouch:touch});
 for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer'])test('EMF Tailwind retains editor/preview/comparison layouts, hover/focus and native keyboard controls / '+theme,async({page})=>{
  test.setTimeout(120_000);
  await routeHtml(page,'**/emf-editor-style-parity','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+common+'</style><style id="emf-style-under-test">'+compiled+'</style></head><body><div id="modal-overlay"><div id="detail-modal"></div></div></body></html>',200);
  await page.goto('/emf-editor-style-parity');
  expect(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(touch);
  await page.evaluate(async()=>{
   const [{state},owner]=await Promise.all([import('/js/state.js'),import('/js/emf-editor.js')]);
   const rooms=[{name:'Bedroom',location:'Pillow wall',sleeping:true,note:'Measured near the bed',measurements:{acElectric:{value:8,meter:'NFA1000'},acMagnetic:{value:25},rfMicrowave:{value:30},dirtyElectricity:{value:10},dcMagnetic:{value:30}},sources:['WiFi router'],mitigations:['WiFi off at night'],photos:[{name:'Synthetic photo',mediaType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG9sAAAAASUVORK5CYII='}]},{name:'Office',sleeping:false,measurements:{}}];
   const assessments=[{id:'styled',date:'2026-06-12',label:'Before mitigation',consultant:'Synthetic consultant',note:'General notes',rooms},...[0,1,5,100,null].map((value,index)=>({id:'badge-'+index,date:'2026-06-0'+(index+1),label:'Severity sample',rooms:[{name:'Bedroom',measurements:value===null?{}:{acElectric:{value}}}]}))];
   const imported={protected:'synthetic-only',emfAssessment:{assessments}},calls:unknown[]=[];
   Object.assign(window,{__emfStyleSeed:{imported,rooms,calls}});(state as {importedData:unknown}).importedData=imported;localStorage.setItem('labcharts-show-product-recs','false');
   owner.configureEMFEditor({hasAIProvider:()=>true,viewEMFPhoto:(...args:[string,number,number])=>calls.push(args)});owner.openEMFAssessmentEditor();
  });
  let comparisons=0,keyboardChecked=false;
  for(const width of [375,600,601,1024]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
   for(const mode of ['editor','preview','empty','comparison'] as const){
    await page.evaluate(async mode=>{
     const [{state},owner]=await Promise.all([import('/js/state.js'),import('/js/emf-editor.js')]);
     const seed=(window as unknown as {__emfStyleSeed:{imported:unknown;rooms:unknown}}).__emfStyleSeed;
     (state as {importedData:unknown}).importedData=mode==='empty'?{emfAssessment:{assessments:[]}}:seed.imported;
     owner.emfEditorState.compareMode=mode==='comparison';if(mode!=='preview')owner.openEMFAssessmentEditor();owner.emfEditorState.editingAssessmentId=mode==='editor'?'styled':null;owner.emfEditorState.activeRoomIdx=0;
     if(mode==='preview')owner.showEMFImportPreview({date:'2026-06-12',consultant:'Synthetic consultant',rooms:seed.rooms});else owner.renderEMFEditor(document.getElementById('detail-modal'));
     await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    },mode);
    await expect(page.locator(mode==='preview'?'#detail-modal .context-back-btn':'#detail-modal .modal-close')).toBeFocused();
    for(const interaction of mode==='editor'?['normal','focus','hover']:['normal']){
     await page.mouse.move(0,0);
     if(interaction==='focus')await page.locator('.emf-room-note').evaluate((e:HTMLInputElement)=>{e.focus();e.setSelectionRange(1,5);});
     if(interaction==='hover')await page.locator('.emf-photo-open img').hover();
     async function snapshot(css:string){
      return page.evaluate(async({css,properties})=>{
       document.getElementById('emf-style-under-test')!.textContent=css;await document.fonts.ready;
       for(const animation of document.getAnimations()){animation.pause();animation.currentTime=0;}
       const styles=(element:Element,pseudo?:string)=>{const computed=getComputedStyle(element,pseudo);return properties.map(name=>[name,computed.getPropertyValue(name)]);};
       const elements=[...document.querySelectorAll('body,body *')].map(element=>{const r=element.getBoundingClientRect();return{tag:element.tagName,classes:element.getAttribute('class'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},styles:styles(element),before:styles(element,'::before'),after:styles(element,'::after')};});
       const active=document.activeElement as HTMLInputElement|null;return{elements,active:active?{tag:active.tagName,classes:active.className,start:active.selectionStart??null,end:active.selectionEnd??null}:null};
      },{css,properties:props});
     }
     const native=await snapshot(original),current=await snapshot(compiled);expect(current,theme+' '+width+' '+mode+' '+interaction+' touch='+touch).toEqual(native);comparisons++;
     if(!keyboardChecked&&mode==='editor'){
      const button=page.locator('.emf-photo-open');await button.focus();await button.press('Enter');await expect(button).toBeFocused();await button.press('Space');await expect(button).toBeFocused();await button.click();
      expect(await page.evaluate(()=>(window as unknown as {__emfStyleSeed:{calls:unknown[]}}).__emfStyleSeed.calls)).toEqual([['styled',0,0],['styled',0,0],['styled',0,0]]);keyboardChecked=true;
     }
    }
   }
  }
  expect(comparisons).toBe(24);expect(keyboardChecked).toBe(true);
 });
});
