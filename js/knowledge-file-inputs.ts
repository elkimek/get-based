// In-page source leases. These facts never make extracted text a model argument.
import { createKnowledgeFileSelections } from './knowledge-file-selection.js';
import type { KnowledgeFileDescriptor } from './knowledge-file-descriptor.js';
import { projectKnowledgeImport } from './knowledge-import-model.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
export const knowledgeFileInputs = createKnowledgeFileSelections();
const leases=new Map<string,{digest:string;cancel():void;timer:ReturnType<typeof setInterval>}>();
export function retainKnowledgeFileInput(descriptor:KnowledgeFileDescriptor,cancel:()=>void,isCurrent:()=>boolean) {
  const timer=setInterval(()=>{if(!isCurrent()){releaseKnowledgeFileInput(descriptor);}},250);
  leases.set(descriptor.token,{digest:descriptor.digest,cancel,timer});
}
export function releaseKnowledgeFileInput(descriptor:KnowledgeFileDescriptor) {
  const lease=leases.get(descriptor.token);if(!lease){if(knowledgeFileInputs.has(descriptor))knowledgeFileInputs.release(descriptor,{signal:new AbortController().signal,isCurrent:()=>true});return;}if(lease.digest!==descriptor.digest)return;
  leases.delete(descriptor.token);clearInterval(lease.timer);lease.cancel();
}
export function releaseKnowledgeImportFiles(proposal:AgentDataProposal) {
  const review=projectKnowledgeImport(proposal);if(review.selection)releaseKnowledgeFileInput(review.selection);
}
export function requiresKnowledgeFileChoice(proposal:AgentDataProposal) {
  if(proposal.resource!=='knowledgeImports')return false;
  const review=projectKnowledgeImport(proposal);return review.input==='chooseFiles'||!!review.selection&&!knowledgeFileInputs.has(review.selection);
}
