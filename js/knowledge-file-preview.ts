// Read-only local preview; retire DOM text as soon as its source owner retires.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { projectKnowledgeImport } from './knowledge-import-model.js';
import { knowledgeFileInputs } from './knowledge-file-inputs.js';
import { state } from './state.js';
import { loadSettingsStylesheet } from './settings-styles.js';
import { AI_DIALOG_OVERLAY } from './ai-action-dialog-classes.js';
import { openModalOverlay,closeModalOverlay,trapModalFocus } from './modal-lifecycle.js';
let epoch=0,closeCurrent:(()=>void)|null=null;
export async function showKnowledgeFilePreview(proposal:AgentDataProposal) {
  const selected=projectKnowledgeImport(proposal).selection;if(!selected)throw new Error('Choose source files before previewing them.');
  const previous=closeCurrent;closeCurrent=null;const ticket=++epoch;previous?.();const profile=state.currentProfile,root=state.importedData;
  const allowed=()=>ticket===epoch&&profile===state.currentProfile&&root===state.importedData&&knowledgeFileInputs.has(selected);
  const [view]=await Promise.all([import('./components/KnowledgeFilePreview.svelte.native.js'),loadSettingsStylesheet()]);
  if(!allowed())return;
  const controller=new AbortController(),files=knowledgeFileInputs.resolve(selected,{signal:controller.signal,isCurrent:allowed});
  const overlay=document.createElement('div');overlay.id='knowledge-file-preview-overlay';overlay.className=AI_DIALOG_OVERLAY;overlay.dataset.modalLifecycleManaged='';document.body.appendChild(overlay);
  let disposed=false,inside=false;let releaseFocus:((restoreFocus?:boolean)=>void)|undefined;
  const close=(restoreFocus=true)=>{if(disposed)return;disposed=true;clearInterval(watch);controller.abort();releaseFocus?.(restoreFocus);closeModalOverlay(overlay,{restoreFocus});void view.unmount(component);view.flushSync();overlay.remove();if(ticket===epoch)closeCurrent=null;};
  const component=view.mount(view.default,{target:overlay,props:{files,close:()=>close()}});view.flushSync();
  const watch=setInterval(()=>{if(!allowed()||!overlay.isConnected)close(false);},250);
  overlay.addEventListener('mousedown',event=>{inside=event.target!==overlay;});overlay.addEventListener('click',event=>{if(event.target===overlay&&!inside)close();});
  closeCurrent=()=>close();openModalOverlay(overlay,{autoFocus:false});releaseFocus=trapModalFocus(overlay,{autoFocus:false,onEscape:()=>close()});overlay.querySelector<HTMLButtonElement>('[data-knowledge-preview-close]')?.focus();
}
