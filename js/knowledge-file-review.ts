// User-gesture file acquisition -> separate metadata-only review. Never indexes.
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { AgentDraft } from './agent-tool-runtime.js';
import { projectKnowledgeImport } from './knowledge-import-model.js';
import { knowledgeFileInputs, retainKnowledgeFileInput, releaseKnowledgeFileInput } from './knowledge-file-inputs.js';
import { beginKnowledgeImport } from './knowledge-import-jobs.js';
import { state } from './state.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { getLensConfig, hasKnowledgeLibraryDraft } from './lens.js';
import { localDateKey } from './supplement-medication-domain.js';
type ChosenKnowledgeDraft=Omit<AgentDraft,'kind'|'payload'>&{kind:'data';payload:AgentDataProposal&Record<string,unknown>};
function pickFiles(signal:AbortSignal,single:boolean):Promise<File[]|null> {
  const input=document.createElement('input');input.type='file';input.multiple=!single;input.accept='.txt,.md,.markdown,.rst,.json,.csv,.log,.pdf,.docx';input.hidden=true;input.dataset.knowledgeImportPicker='true';document.body.appendChild(input);
  return new Promise((resolve,reject)=>{
    let settled=false,focusTimer:ReturnType<typeof setTimeout>|undefined;
    const finish=(files:File[]|null)=>{if(settled)return;settled=true;clearTimeout(focusTimer);signal.removeEventListener('abort',abort);globalThis.removeEventListener('focus',focus);input.remove();resolve(files);};
    const abort=()=>finish(null),focus=()=>{focusTimer=setTimeout(()=>{if(!input.files?.length)finish(null);},500);};
    input.addEventListener('change',()=>finish(Array.from(input.files??[])),{once:true});input.addEventListener('cancel',()=>finish(null),{once:true});signal.addEventListener('abort',abort,{once:true});globalThis.addEventListener('focus',focus,{once:true});
    try {signal.throwIfAborted();input.click();}catch(error){reject(error);finish(null);}
  });
}
export function chooseKnowledgeImportFiles(proposal:AgentDataProposal,isConversationCurrent:()=>boolean):Promise<ChosenKnowledgeDraft[]|null> {
  const review=projectKnowledgeImport(proposal),profile=state.currentProfile,root=state.importedData,disclosure=getContextDisclosureFingerprint();
  let hasSettingsDraft=()=>false;
  const current=()=>isConversationCurrent()&&state.currentProfile===profile&&state.importedData===root&&getContextDisclosureFingerprint()===disclosure&&getLensConfig().enabled&&getLensConfig().backend==='in-browser'&&!hasSettingsDraft()&&!hasKnowledgeLibraryDraft();
  if(!current())throw new Error('Switch back to the originating profile and enable its local Knowledge Base.');
  const job=beginKnowledgeImport(proposal,'selection'),watch=setInterval(()=>{if(!current())job.cancel();},250);
  // Must occur before the first await so the actual button retains user activation.
  const picking=pickFiles(job.signal,!!review.replacement);
  return (async():Promise<ChosenKnowledgeDraft[]|null>=>{
    let retained=false,descriptor:Awaited<ReturnType<typeof knowledgeFileInputs.select>>|null=null;
    try {
      const files=await picking;if(!files?.length||job.signal.aborted||!current())return null;
      // Keep settings ownership lazy; acquire it after the synchronous picker
      // gesture and before reading or retaining any chosen source contents.
      hasSettingsDraft=(await import('./knowledge-settings.js')).hasKnowledgeSettingsDraft;
      if(!current())throw new Error('Finish the open Knowledge Base settings draft before choosing source files.');
      job.message('Reading the chosen files locally…');
      descriptor=await knowledgeFileInputs.select(files,{signal:job.signal,isCurrent:current});
      if(review.replacement&&descriptor.documents.length!==1)throw new Error('Choose one document to replace the exact indexed source.');
      const records=await import('./knowledge-import-records.js'),fresh=await records.readCurrentKnowledgeImport(profile,proposal.recordId);
      if(!current()||job.signal.aborted)throw new Error('The profile or source changed while reading. Choose the files again.');
      const replacementId=review.replacement?.documentId??null;
      const next=normalizeAgentDataProposal({...proposal,baseline:JSON.stringify({version:2,source:fresh,selection:descriptor}),patch:JSON.stringify({input:'selectedFiles',replacementIds:descriptor.documents.map(()=>replacementId)}),effectiveDate:localDateKey(),recordedAt:Date.now()});
      if(!next)throw new Error('The chosen-file review is too large. Choose fewer files.');
      projectKnowledgeImport(next);await records.prepareReviewedKnowledgeImport(profile,next);
      if(!current()||job.signal.aborted)throw new Error('The source changed. Choose files again.');
      const id=crypto.randomUUID();
      retainKnowledgeFileInput(descriptor,job.cancel,()=>current()&&state.chatHistory.some(message=>message.agentDrafts?.some(draft=>draft.id===id&&['pending','applying'].includes(String(draft.status)))));retained=true;
      return [{id,kind:'data',status:'pending',summary:'Review chosen Knowledge Base files',payload:{...next}}];
    } finally {clearInterval(watch);job.close();if(!retained){if(descriptor)releaseKnowledgeFileInput(descriptor);job.cancel();}}
  })();
}
