// Browser scope and review gates around the native document transaction owner.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { KnowledgeDocumentSnapshot } from './knowledge-document-model.js';
import { projectKnowledgeDocument } from './knowledge-document-model.js';
import { state } from './state.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { readKnowledgeSettings, hasKnowledgeSettingsDraft } from './knowledge-settings.js';
import { withKnowledgeSource, knowledgeLibraryConfiguration } from './knowledge-library-records.js';
import { readKnowledgeLibraryRegistry, readKnowledgeLibraryCorpus, librarySourceConflict } from './knowledge-library-source.js';
import { knowledgeDocumentRecords, readKnowledgeDocumentSource } from './knowledge-document-source.js';
import { applyLocalDocumentChange, confirmLocalDocumentChange } from './lens-local-library-session.js';
import { getLensConfig, hasKnowledgeLibraryDraft, clearLensCache, notifyKnowledgeLibraryChange, refreshKnowledgeLibraryMetadata } from './lens.js';
export function listCurrentKnowledgeDocuments(profileId: string) {
  return withKnowledgeSource(profileId, async io => {
    const registry = await readKnowledgeLibraryRegistry(io); if (!registry) return [];
    const rows = [];
    for (const library of registry.libraries) rows.push(...knowledgeDocumentRecords(library, await readKnowledgeLibraryCorpus(io, library)));
    return rows;
  });
}
export function readCurrentKnowledgeDocument(profileId: string, documentId: string): Promise<KnowledgeDocumentSnapshot | null> {
  return withKnowledgeSource(profileId, async (io, configuration) => {
    const source = await readKnowledgeDocumentSource(io, documentId);
    return source.snapshot ? { ...source.snapshot, configuration } : null;
  });
}
export async function prepareReviewedKnowledgeDocument(profileId: string, proposal: AgentDataProposal) {
  const review = projectKnowledgeDocument(proposal);
  await withKnowledgeSource(profileId, async (io, configuration) => {
    const source = await readKnowledgeDocumentSource(io, proposal.recordId);
    if (!source.snapshot || JSON.stringify({ ...source.snapshot, configuration }) !== proposal.baseline) throw librarySourceConflict();
    if (review.after && source.rows.some(row => row.documentId !== proposal.recordId && row.source === review.after!.source)) throw librarySourceConflict();
  });
}
export async function confirmReviewedKnowledgeDocument(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  projectKnowledgeDocument(proposal); const root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => authorized() && state.currentProfile === profileId && state.importedData === root && getContextDisclosureFingerprint() === disclosure;
  const authorize = async () => { if (!current()) return false; const settings = await readKnowledgeSettings(); return current() && settings.record.enabled && settings.record.backend === 'in-browser'; };
  if (!await authorize()) throw librarySourceConflict(); return confirmLocalDocumentChange(proposal, authorize);
}
export async function commitReviewedKnowledgeDocument(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const review = projectKnowledgeDocument(proposal), root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => authorized() && state.currentProfile === profileId && state.importedData === root && getContextDisclosureFingerprint() === disclosure && !hasKnowledgeSettingsDraft() && !hasKnowledgeLibraryDraft();
  const authorize = async () => { if (!current()) return false; await readKnowledgeSettings(); return current() && knowledgeLibraryConfiguration() === review.snapshot.configuration && getLensConfig().enabled && getLensConfig().backend === 'in-browser'; };
  if (!await authorize()) throw librarySourceConflict();
  const applied = await applyLocalDocumentChange(proposal, authorize);
  clearLensCache(); notifyKnowledgeLibraryChange(); let refreshFailed = false;
  try { if (current() && !await refreshKnowledgeLibraryMetadata()) refreshFailed = true; } catch { refreshFailed = true; }
  return `${applied.alreadyApplied ? 'This document change was already saved.' : 'Document index change saved for this browser (all profiles).'}${review.after ? ' Original files and indexed contents are unchanged.' : ' The document was removed from the current index. Original files, recovery snapshots, conversations, exports and backups remain.'}${refreshFailed ? ' Reopen Knowledge Base to refresh its display.' : ''}`;
}
