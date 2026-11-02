// Public indexed-document identities and review facts, never text or vectors.
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { librarySourceDigest } from './knowledge-library-source.js';
import { isSafeLibraryId } from './lens-local-store.js';
export const DOCUMENT_ID_FIELD = '_getbasedDocumentId';
export const documentLibraryPrefix = (libraryId: string) => `doc-${librarySourceDigest(libraryId).slice(0, 32)}-`;
export function knowledgeDocumentId(libraryId: string, source: string, stored?: unknown) {
  const prefix = documentLibraryPrefix(libraryId);
  if (stored === undefined) return prefix + librarySourceDigest(source);
  if (typeof stored !== 'string' || !stored.startsWith(prefix) || !/^doc-[a-f0-9]{32}-[a-f0-9]{64}$/.test(stored)) throw new Error('The saved document identity needs native review.');
  return stored;
}
export interface KnowledgeDocumentRecord { documentId: string; libraryId: string; libraryName: string; source: string; chunks: number; contentHash: string | null }
export interface KnowledgeDocumentSnapshot { version: 1; scope: 'browser'; revision: string; configuration?: string; record: KnowledgeDocumentRecord }
export const knowledgeDocumentFields = { source: 'New indexed filename, 1–4000 characters. Original files and document contents are unchanged.' };
export function displayKnowledgeDocument(value: unknown): KnowledgeDocumentRecord | null {
  if (value === null) return null;
  const row = agentDataObject(value); if (row.version === 1) return displayKnowledgeDocument(row.record);
  if (typeof row.libraryId !== 'string' || !isSafeLibraryId(row.libraryId) || typeof row.libraryName !== 'string' || !row.libraryName.trim() || row.libraryName.length > 4000 || typeof row.source !== 'string' || !row.source.trim() || row.source.length > 4000 || !Number.isSafeInteger(row.chunks) || Number(row.chunks) < 0 || !(row.contentHash === null || typeof row.contentHash === 'string' && row.contentHash.length <= 256)) throw new Error('Read the exact indexed document again.');
  return { documentId: knowledgeDocumentId(row.libraryId, row.source, row.documentId), libraryId: row.libraryId, libraryName: row.libraryName, source: row.source, chunks: Number(row.chunks), contentHash: row.contentHash };
}
export function projectKnowledgeDocument(proposal: AgentDataProposal) {
  if (String(proposal.resource) !== 'knowledgeDocuments' || !['update', 'remove'].includes(proposal.operation) || !Number.isFinite(proposal.recordedAt) || proposal.recordedAt <= 0) throw new Error('Read the indexed document before proposing this change.');
  const snapshot = agentDataObject(JSON.parse(proposal.baseline));
  if (snapshot.version !== 1 || snapshot.scope !== 'browser' || typeof snapshot.revision !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.revision) || typeof snapshot.configuration !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.configuration)) throw new Error('Read a fresh document snapshot.');
  const before = displayKnowledgeDocument(snapshot.record); if (!before || before.documentId !== proposal.recordId) throw new Error('Select the exact indexed document.');
  const patch = parseAgentDataPatch(proposal.patch); validateFieldNames(patch, proposal.operation === 'remove' ? [] : ['source']);
  if (proposal.operation === 'update' && (typeof patch.source !== 'string' || !patch.source.trim() || patch.source.trim().length > 4000 || patch.source.trim() === before.source)) throw new Error('Supply a different indexed filename with 1–4000 characters.');
  const after = proposal.operation === 'remove' ? null : { ...before, source: (patch.source as string).trim() };
  return { before, after, snapshot: snapshot as unknown as KnowledgeDocumentSnapshot,
    effects: { browserWide: true, removesDocuments: after ? 0 : 1, removesChunks: after ? 0 : before.chunks, retainsRecoverySnapshots: true, downloadsModel: false, changesOriginalFile: false } };
}
export function describeKnowledgeDocument(value: unknown) {
  const row = displayKnowledgeDocument(value);
  return row ? `${row.source}\nLibrary: ${row.libraryName}\nIndexed excerpts: ${row.chunks}` : 'Removed from the current index';
}
