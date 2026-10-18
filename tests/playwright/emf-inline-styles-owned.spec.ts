import {expect,test} from './coverage-fixture.js';
import {routeHtml} from '../helpers/browser-static-routes.js';

test('Tailwind-backed hidden native PDF and photo pickers retain activation, node identity and canceled-selection state',async({page})=>{
 await routeHtml(page,'**/emf-inline-pickers','<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/modal-shared.css"><link rel="stylesheet" href="/css/emf.css"></head><body><div id="modal-overlay"><div id="detail-modal"></div></div></body></html>',200);
 await page.goto('/emf-inline-pickers');
 const before=await page.evaluate(async()=>{
  const [{state},owner]=await Promise.all([import('/js/state.js'),import('/js/emf-editor.js')]);
  const imported={protected:{keep:['all',3]},emfAssessment:{assessments:[{id:'synthetic',date:'2026-06-12',label:'Picker test',rooms:[{name:'Bedroom',location:'Pillow',sleeping:true,measurements:{},sources:[],mitigations:[],photos:[]}]}]}};
  (state as {importedData:unknown}).importedData=imported;localStorage.setItem('labcharts-show-product-recs','false');
  const calls:unknown[]=[];owner.configureEMFEditor({hasAIProvider:()=>true,addEMFPhotos:(...args:unknown[])=>calls.push(args)});owner.openEMFAssessmentEditor();owner.emfEditorState.editingAssessmentId='synthetic';owner.renderEMFEditor(document.getElementById('detail-modal'));
  const pdf=document.querySelector<HTMLInputElement>('#emf-pdf-input')!,photo=document.querySelector<HTMLInputElement>('[data-emf-change-action="photos"]')!;
  const activations:number[]=[0,0];[pdf,photo].forEach((input,index)=>input.addEventListener('click',()=>activations[index]!++));
  Object.assign(window,{__emfPickerTest:{pdf,photo,imported,before:JSON.stringify(imported),storage:JSON.stringify(Object.entries(localStorage)),html:document.getElementById('detail-modal')!.innerHTML,calls,activations}});
  return[pdf,photo].map(input=>({style:input.getAttribute('style'),display:getComputedStyle(input).display,accept:input.accept,multiple:input.multiple}));
 });
 expect(before).toEqual([{style:'display:none',display:'none',accept:'.pdf',multiple:false},{style:'display:none',display:'none',accept:'image/*',multiple:true}]);
 const pdfChooser=page.waitForEvent('filechooser');await page.locator('[data-emf-action="trigger-pdf-import"]').click();const pdf=await pdfChooser;expect(await pdf.element().getAttribute('id')).toBe('emf-pdf-input');await pdf.setFiles([]);
 const photoChooser=page.waitForEvent('filechooser');await page.locator('.emf-photo-add').click();const photo=await photoChooser;expect(await photo.element().getAttribute('data-emf-change-action')).toBe('photos');await photo.setFiles([]);
 const after=await page.evaluate(()=>{const value=(window as unknown as {__emfPickerTest:{pdf:HTMLInputElement;photo:HTMLInputElement;imported:unknown;before:string;storage:string;html:string;calls:unknown[];activations:number[]}}).__emfPickerTest;return{sameNodes:value.pdf===document.querySelector('#emf-pdf-input')&&value.photo===document.querySelector('[data-emf-change-action="photos"]'),html:document.getElementById('detail-modal')!.innerHTML===value.html,data:JSON.stringify(value.imported)===value.before,storage:JSON.stringify(Object.entries(localStorage))===value.storage,calls:value.calls,activations:value.activations,files:[value.pdf.files?.length,value.photo.files?.length]};});
 expect(after).toEqual({sameNodes:true,html:true,data:true,storage:true,calls:[],activations:[1,1],files:[0,0]});
});
