// Metadata edits use the native manifest-last corpus transaction, without a model.
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import { librarySourceConflict, knowledgeLibraryCommandIdentity, openKnowledgeLibraryIO, readKnowledgeLibraryRegistry, readKnowledgeLibraryCorpus } from './knowledge-library-source.js';
import { readKnowledgeDocumentSource } from './knowledge-document-source.js';
import { documentLibraryPrefix, DOCUMENT_ID_FIELD, projectKnowledgeDocument } from './knowledge-document-model.js';
import { writeCorpusSnapshot, isSafeLibraryId } from './lens-local-store.js';
import type { CorpusState } from './lens-local-store.js';
const RECEIPTS = '_getbasedDocumentCommands';
interface Receipt { id: string; intent: string; documentId: string; libraryId: string; operation: string; savedAt: number }
function receipts(value: unknown): Receipt[] {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('entries' in value) || !Array.isArray(value.entries) || value.entries.length > 64 || !value.entries.every(row => row && typeof row === 'object' && /^[a-f0-9]{64}$/.test(row.id) && /^[a-f0-9]{64}$/.test(row.intent) && isSafeLibraryId(row.libraryId) && typeof row.documentId === 'string' && /^doc-[a-f0-9]{32}-[a-f0-9]{64}$/.test(row.documentId) && row.documentId.startsWith(documentLibraryPrefix(row.libraryId)) && ['update', 'remove'].includes(row.operation) && Number.isFinite(row.savedAt) && row.savedAt > 0 && Number.isFinite(new Date(row.savedAt).valueOf())) || new Set(value.entries.map(row => row.id)).size !== value.entries.length) throw new Error('Document change history needs native review.');
  return value.entries as Receipt[];
}
async function reviewedSource(value: unknown) {
  if (!navigator.locks?.request) throw librarySourceConflict();
  const proposal = normalizeAgentDataProposal(value); if (!proposal) throw librarySourceConflict();
  const review = projectKnowledgeDocument(proposal), identity = knowledgeLibraryCommandIdentity(proposal), io = await openKnowledgeLibraryIO(true);
  const registry = await readKnowledgeLibraryRegistry(io, true), library = registry?.libraries.find(row => row.id === review.before.libraryId);
  const corpus = library ? await readKnowledgeLibraryCorpus(io, library) : null, history = receipts(corpus?.state.manifest[RECEIPTS]), previous = history.find(row => row.id === identity.id);
  if (previous && (previous.intent !== identity.intent || previous.documentId !== proposal.recordId || previous.libraryId !== review.before.libraryId || previous.operation !== proposal.operation)) throw librarySourceConflict();
  return { proposal, review, identity, history, previous };
}
const appliedReply = (commandId: string, savedAt: number, alreadyApplied: boolean) => ({ type: 'document_change_applied' as const, commandId, alreadyApplied, appliedAt: savedAt, cleanupPending: false as const });
export async function confirmKnowledgeDocumentReceipt(value: unknown, authorize: (commandId: string) => Promise<boolean>) {
  const { identity, previous } = await reviewedSource(value);
  if (!await authorize(identity.id)) throw librarySourceConflict();
  return previous ? appliedReply(identity.id, previous.savedAt, true) : { type: 'document_change_unconfirmed' as const, commandId: identity.id };
}
export async function commitKnowledgeDocumentChange(value: unknown, authorize: (commandId: string) => Promise<boolean>) {
  const { proposal, review, identity, previous, history } = await reviewedSource(value);
  if (previous) { if (!await authorize(identity.id)) throw librarySourceConflict(); return appliedReply(identity.id, previous.savedAt, true); }
  // Use a fresh read-only view: the recovery check must not cache a different
  // registry generation into the exact-source comparison for a new write.
  const io = await openKnowledgeLibraryIO(true), source = await readKnowledgeDocumentSource(io, proposal.recordId);
  if (!source.snapshot || !source.corpus || JSON.stringify({ ...source.snapshot, configuration: review.snapshot.configuration }) !== proposal.baseline) throw librarySourceConflict();
  if (review.after && source.rows.some(row => row.documentId !== proposal.recordId && row.source === review.after!.source)) throw Object.assign(new Error('That indexed filename already exists in this library. Choose another name; documents were not merged.'), { noChangeApplied: true });
  const current = source.corpus.state, keep = current.chunks.map((chunk, index) => ({ chunk, index })).filter(row => review.after || row.chunk.source !== review.before.source);
  const vectors = review.after ? current.vectors : new Float32Array(keep.length * current.manifest.dim);
  if (!review.after) keep.forEach((row, index) => vectors.set(current.vectors.subarray(row.index * current.manifest.dim, (row.index + 1) * current.manifest.dim), index * current.manifest.dim));
  const savedAt = Date.now(), receipt: Receipt = { ...identity, libraryId: review.before.libraryId, documentId: proposal.recordId, operation: proposal.operation, savedAt };
  const next: CorpusState = { vectors, chunks: keep.map(({ chunk }) => review.after && chunk.source === review.before.source ? { ...chunk, source: review.after.source } : chunk),
    manifest: { ...current.manifest, numChunks: keep.length,
      docs: current.manifest.docs.filter(doc => review.after || doc.source !== review.before.source).map(doc => review.after && doc.source === review.before.source ? { ...doc, source: review.after.source, [DOCUMENT_ID_FIELD]: proposal.recordId } : doc),
      [RECEIPTS]: { ...(current.manifest[RECEIPTS] as Record<string, unknown> | undefined), version: 1, entries: [...history, receipt].slice(-64) } } };
  // Grant before the first persistent action. An inactive slot may not exist;
  // even creating its first empty file must follow approval. Finish in the
  // original accepted scope once granted; never replay an uncertain write.
  if (!await authorize(identity.id)) throw librarySourceConflict();
  const directory = await io.directory!.getDirectoryHandle(source.library.id);
  try { await writeCorpusSnapshot(directory, next, { activeSlot: source.corpus.slot, revision: source.corpus.revision }); }
  catch { throw Object.assign(new Error('The document save was not confirmed. Use Check saved change before proposing another mutation.'), { requiresReload: true }); }
  return appliedReply(identity.id, savedAt, false);
}
