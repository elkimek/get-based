import {JSDOM} from 'jsdom';
import {buildSidebar} from '../../js/nav.js';
import {state} from '../../js/state.js';
import {projectLensActions} from '../../js/lens-content-presentation.js';
import {projectLensHeader} from '../../js/lens-shell-presentation.js';
import {renderHTML as renderLensDataPage} from '../../js/components/LensDataPage.svelte.html.js';

/** Exercise the public controller against a real detached DOM target. The legacy
 * document shim and profile/filter state are restored before other assertions. */
export function currentEMFSidebarHTML(count:number):string {
 const dom=new JSDOM('<aside id="sidebar-nav"></aside>');
 const original=document.getElementById;
 const previous={importedData:state.importedData,dateRangeFilter:state.dateRangeFilter,currentView:state.currentView};
 const imported={emfAssessment:{assessments:Array.from({length:count},(_,i)=>({id:'synthetic-'+i,date:'2026-06-12',rooms:[]}))}};
 const before=JSON.stringify(imported);
 try {
  document.getElementById=(id:string)=>id==='sidebar-nav'?dom.window.document.getElementById(id):original.call(document,id);
  (state as {importedData:unknown}).importedData=imported;state.dateRangeFilter='all';state.currentView='dashboard';
  buildSidebar({dates:[],dateLabels:[],categories:{}});
  if(JSON.stringify(imported)!==before)throw new Error('Sidebar rendering mutated assessment data');
  return dom.window.document.getElementById('sidebar-nav')!.innerHTML;
 }finally{document.getElementById=original;Object.assign(state,previous);dom.window.close();}
}
export function hasCurrentEMFSidebarEntry(html:string,count:number):boolean {
 const dom=new JSDOM(html);
 try {
  const doc=dom.window.document,entries=doc.querySelectorAll<HTMLElement>('[data-category="emf"]');if(entries.length!==1)return false;
  const entry=entries[0]!,nodes=[...doc.querySelectorAll('.nav-section,.nav-item')];
  const analysis=nodes.findIndex(e=>e.matches('.nav-section')&&e.textContent==='Analysis tools'),manage=nodes.findIndex(e=>e.matches('.nav-section')&&e.textContent==='Manage'),index=nodes.indexOf(entry);
  return analysis>=0&&analysis<index&&index<manage&&entry.matches('.nav-item')&&entry.getAttribute('data-nav-action')==='open-emf-assessment'
   &&entry.getAttribute('role')==='button'&&entry.tabIndex===0&&entry.querySelector('.nav-item-label')?.textContent==='EMF assessment'
   &&(count===0?entry.querySelectorAll('.nav-item-dot').length===1&&!entry.querySelector('.nav-item-count'):entry.querySelector('.nav-item-count')?.textContent===String(count));
 }finally{dom.window.close();}
}
/** Current whole genuine parent uses the same typed actions and child as Insight. */
export function currentInsightEMFActionsHTML():string {
 return renderLensDataPage({view:{kind:'insight',header:projectLensHeader('Insight',''),actions:projectLensActions('insight'),grid:{route:'insight',orderKey:'synthetic-emf-actions',widgets:[]}}});
}
export function hasCurrentInsightEMFAction(html:string):boolean {
 const dom=new JSDOM(html);
 try {
  const buttons=[...dom.window.document.querySelectorAll<HTMLButtonElement>('button[data-lens-page-action]')];
  const emf=buttons.filter(e=>e.dataset.lensPageAction==='open-emf-assessment');
  return buttons.length===3&&buttons.map(e=>e.dataset.lensPageAction).join('|')==='open-ai-chat|open-emf-assessment|open-recommendations'
   &&emf.length===1&&emf[0]!.textContent==='EMF assessment'&&emf[0]!.type==='button'&&!emf[0]!.disabled&&emf[0]!.tabIndex===0
   &&!buttons.some(e=>[...e.attributes].some(a=>/^on/i.test(a.name)));
 }finally{dom.window.close();}
}
export function hasCurrentEMFRegionLink(html:string):boolean {
 const dom=new JSDOM(html);
 try {
  const links=dom.window.document.querySelectorAll<HTMLAnchorElement>('a.rec-region-edit');if(links.length!==1)return false;
  const link=links[0]!;
  return link.getAttribute('href')==='#modal-overlay'&&link.dataset.recAction==='edit-region'&&link.getAttribute('aria-label')==='Change country for product tips'
   &&link.textContent==='change'&&link.tabIndex===0&&link.parentElement?.classList.contains('rec-region-tag')===true
   &&link.parentElement.textContent?.startsWith('Showing for ')===true&&!link.getAttributeNames().some(name=>/^on/i.test(name));
 }finally{dom.window.close();}
}
