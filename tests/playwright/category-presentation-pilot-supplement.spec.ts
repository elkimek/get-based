import {createBlankPage} from '../helpers/browser-blank-page.js';
import {expect,test} from './coverage-fixture.js';
const blank=createBlankPage({path:'/category-presentation-pilot-supplement',status:200,body:'<!doctype html><html><head><link rel="stylesheet" href="/css/category-views.css"></head><body><main id="category-supplement"></main></body></html>'});
/** Additive native-module acceptance. The original 18-outcome case is unchanged;
 * this case requires the native server, never raw-source proxying into Kit. */
test('category presentation pilot supplements missing-range table and fatty both/reference branches',async({page})=>{
 await blank(page);const outcomes=await page.evaluate(async()=>{
  const [{renderTableView,renderFattyAcidsView},{state}]=await Promise.all([import('/js/category-view-renderers.js'),import('/js/state.js')]);const root=document.getElementById('category-supplement')!,saved=state.rangeMode;
  try{
   state.rangeMode='reference';root.innerHTML=renderTableView({markers:{unrated:{name:'Unrated native',unit:'u',values:[1.2,null,2],refMin:null,refMax:null}}},['Jan 2024','Feb 2024','Mar 2024'],'native',['2024-01-10','2024-02-10','2024-03-10']);const row=root.querySelector('.data-table-wrapper tbody tr')!;
   const missingRange=row.querySelector('.ref-col')?.textContent==='—'&&row.lastElementChild?.textContent==='—'&&!row.lastElementChild?.querySelector('.range-bar')&&root.querySelectorAll('.data-table-wrapper thead th').length===7&&root.querySelectorAll('.data-table-wrapper col').length===7;
   const category={singleDate:'2024-05-10',markers:{omega3:{name:'Omega 3 (EPA/DHA)',unit:'%',values:[7],refMin:4,refMax:12,optimalMin:8,optimalMax:12},omega6:{name:'Omega 6',unit:'%',values:[18],refMin:6,refMax:14,optimalMin:6,optimalMax:10}}};
   state.rangeMode='both';root.innerHTML=renderFattyAcidsView(category,'nativeSnapshot');const both=[...root.querySelectorAll('.fa-card-ref')].map(element=>element.textContent);const fattyBoth=JSON.stringify(both)===JSON.stringify(['Ref: 4 – 12 · Opt: 8 – 12','Ref: 6 – 14 · Opt: 6 – 10'])&&root.querySelectorAll('.fa-card').length===2&&root.querySelectorAll('.range-bar').length===2&&root.querySelector('.fa-card')?.getAttribute('data-marker-detail-id')==='nativeSnapshot_omega3'&&root.querySelector('h3')?.textContent==='Fatty Acid Profile — May 10, 2024';
   state.rangeMode='reference';root.innerHTML=renderFattyAcidsView(category,'nativeSnapshot');const reference=[...root.querySelectorAll('.fa-card-ref')].map(element=>element.textContent);const fattyReference=JSON.stringify(reference)===JSON.stringify(['Ref: 4 – 12','Ref: 6 – 14'])&&root.querySelector('.fa-card-value')?.classList.contains('val-normal')&&root.querySelectorAll('.range-bar-marker.marker-normal').length===1&&root.querySelectorAll('.range-bar-marker.marker-high').length===1;
   return {missingRange,fattyBoth,fattyReference};
  }finally{state.rangeMode=saved;}
 });expect(Object.keys(outcomes)).toEqual(['missingRange','fattyBoth','fattyReference']);for(const [name,result]of Object.entries(outcomes))expect.soft(result,name).toBe(true);
});
