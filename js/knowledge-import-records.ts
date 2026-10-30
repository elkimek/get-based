import { knowledgeFileInputs, releaseKnowledgeImportFiles } from './knowledge-file-inputs.js';
// Browser ownership, source review and transient job controls for pasted imports.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { projectKnowledgeImport } from './knowledge-import-model.js';
import { readKnowledgeImportSource } from './knowledge-import-source.js';
import { withKnowledgeSource, knowledgeLibraryConfiguration } from './knowledge-library-records.js';
import { librarySourceConflict } from './knowledge-library-source.js';
import { readKnowledgeSettings, hasKnowledgeSettingsDraft } from './knowledge-settings.js';
import { state } from './state.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { getLensConfig, hasKnowledgeLibraryDraft, clearLensCache, notifyKnowledgeLibraryChange, refreshKnowledgeLibraryMetadata } from './lens.js';
import { applyLocalDocumentImport, confirmLocalDocumentImport } from './lens-local-library-session.js';
import { beginKnowledgeImport } from './knowledge-import-jobs.js';
export function readCurrentKnowledgeImport(profileId: string, libraryId: string) {
  return withKnowledgeSource(profileId, async (io, configuration) => ({ ...(await readKnowledgeImportSource(io, libraryId)).snapshot, configuration }));
}
export async function prepareReviewedKnowledgeImport(profileId: string, proposal: AgentDataProposal) {
  const review=projectKnowledgeImport(proposal);
  if(review.selection&&!knowledgeFileInputs.has(review.selection))throw librarySourceConflict();
  if (JSON.stringify(await readCurrentKnowledgeImport(profileId, proposal.recordId)) !== JSON.stringify(review.snapshot)) throw librarySourceConflict();
}
export async function confirmReviewedKnowledgeImport(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  projectKnowledgeImport(proposal); const root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => authorized() && state.currentProfile === profileId && state.importedData === root && disclosure === getContextDisclosureFingerprint();
  const check = async () => { if (!current()) return false; const settings = await readKnowledgeSettings(); return current() && settings.record.enabled && settings.record.backend === 'in-browser'; };
  if (!await check()) throw librarySourceConflict(); return confirmLocalDocumentImport(proposal, check);
}
export async function commitReviewedKnowledgeImport(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const review = projectKnowledgeImport(proposal);if(review.input==='chooseFiles')throw librarySourceConflict();
  const root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => authorized() && state.currentProfile === profileId && state.importedData === root && disclosure === getContextDisclosureFingerprint() && !hasKnowledgeSettingsDraft() && !hasKnowledgeLibraryDraft() && (!review.selection||knowledgeFileInputs.has(review.selection));
  const check = async () => { if (!current()) return false; await readKnowledgeSettings(); return current() && knowledgeLibraryConfiguration() === review.snapshot.configuration && getLensConfig().enabled && getLensConfig().backend === 'in-browser'; };
  if (!await check()) throw librarySourceConflict();
  const job = beginKnowledgeImport(proposal), retirement = setInterval(() => { if (!current()) job.cancel(); }, 250);
  try {
    const files=review.selection?knowledgeFileInputs.resolve(review.selection,{signal:job.signal,isCurrent:current}):undefined;
    const result = await applyLocalDocumentImport(proposal, check, job.signal, job.progress, files);
    clearLensCache(); notifyKnowledgeLibraryChange(); let refreshFailed = false;
    try { if (current() && !await refreshKnowledgeLibraryMetadata()) refreshFailed = true; } catch { refreshFailed = true; }
    return `${result.alreadyApplied ? 'This import was already saved.' : 'Document text indexed for all profiles in this browser.'} Original files and native recovery snapshots remain.${refreshFailed ? ' Reopen Knowledge Base to refresh its display.' : ''}`;
  } finally { clearInterval(retirement); job.close(); if(review.selection)releaseKnowledgeImportFiles(proposal); }
}
