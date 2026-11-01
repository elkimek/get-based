// Runs only inside the existing origin-wide native storage owner. The parent
// grants the final write after checking its current profile, source and draft.
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import { MODELS, DEFAULT_MODEL_KEY } from './lens-local-embedder-config.js';
import { LensLocalLibraryRegistry } from './lens-local-library-registry.js';
import { OPFS_SUBDIR, isSafeLibraryId } from './lens-local-store.js';
import { knowledgeLibraryCommandIdentity, librarySourceConflict, openKnowledgeLibraryIO, readKnowledgeLibraryRegistry, readKnowledgeLibrarySource } from './knowledge-library-source.js';
import { projectKnowledgeLibrary } from './knowledge-library-proposals.js';
import type { LibraryDirectory } from './lens-local-library-registry.js';
import type { LibraryRecord } from './lens-local-store.js';
import type { WorkerReply } from './lens-local-protocol.js';
import { knowledgeCommitAuthorization } from './knowledge-change-authorization.js';
export { acknowledgeKnowledgeLibraryCommit } from './knowledge-change-authorization.js';
const RECEIPTS = '_getbasedLibraryReceipts';
interface Receipt { id: string; intent: string; libraryId: string; operation: string; savedAt: number }
function receipts(value: unknown): Receipt[] {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('entries' in value) || !Array.isArray(value.entries) || value.entries.length > 64 || !value.entries.every(row => row && typeof row === 'object' && typeof row.id === 'string' && /^[a-f0-9]{64}$/.test(row.id) && typeof row.intent === 'string' && /^[a-f0-9]{64}$/.test(row.intent) && isSafeLibraryId(row.libraryId) && ['add', 'update', 'remove'].includes(row.operation) && Number.isFinite(row.savedAt) && row.savedAt > 0 && Number.isFinite(new Date(row.savedAt).valueOf())) || new Set(value.entries.map(row => row.id)).size !== value.entries.length) throw new Error('Library command history needs review before another change.');
  return value.entries as Receipt[];
}
async function reviewedCommandSource(value: unknown) {
  if (!navigator.locks?.request) throw librarySourceConflict();
  const proposal = normalizeAgentDataProposal(value); if (!proposal) throw librarySourceConflict();
  const review = projectKnowledgeLibrary(proposal), identity = knowledgeLibraryCommandIdentity(proposal), io = await openKnowledgeLibraryIO(true);
  const committed = await readKnowledgeLibraryRegistry(io, true), history = receipts(committed?.[RECEIPTS]), previous = history.find(row => row.id === identity.id);
  if (previous && (previous.intent !== identity.intent || previous.libraryId !== proposal.recordId || previous.operation !== proposal.operation)) throw librarySourceConflict();
  return { proposal, review, identity, io, history, previous };
}
export async function confirmKnowledgeLibraryReceipt(value: unknown, authorize: (commandId: string) => Promise<boolean>) {
  const { proposal, identity, previous } = await reviewedCommandSource(value);
  if (!await authorize(identity.id)) throw librarySourceConflict();
  if (!previous) return { type: 'library_change_unconfirmed' as const, commandId: identity.id };
  return { type: 'library_change_applied' as const, commandId: identity.id, alreadyApplied: true, appliedAt: previous.savedAt, cleanupPending: proposal.operation === 'remove' ? null : false };
}
export async function commitKnowledgeLibraryChange(value: unknown, authorize: (commandId: string) => Promise<boolean>) {
  const { proposal, review, identity, io, history, previous } = await reviewedCommandSource(value);
  if (previous) {
    if (previous.intent !== identity.intent || !await authorize(identity.id)) throw librarySourceConflict();
    return { type: 'library_change_applied' as const, commandId: identity.id, alreadyApplied: true, appliedAt: previous.savedAt, cleanupPending: proposal.operation === 'remove' ? null : false };
  }
  const source = await readKnowledgeLibrarySource(io, proposal.recordId, proposal.operation === 'add');
  if (JSON.stringify({ ...source.snapshot, configuration: review.snapshot.configuration }) !== proposal.baseline) throw librarySourceConflict();
  const { after, nextActive } = review; if (!nextActive) throw librarySourceConflict();
  const rows: LibraryRecord[] = source.registry?.libraries ?? [];
  const savedAt = Date.now();
  let libraries = proposal.operation === 'add'
    ? [...rows, { id: proposal.recordId, name: after!.name, model: after!.modelKey, createdAt: savedAt }]
    : proposal.operation === 'remove' ? rows.filter(row => row.id !== proposal.recordId)
      : rows.map(row => row.id === proposal.recordId ? { ...row, name: after!.name } : row);
  if (libraries.length === 0) {
    if (await io.directoryExists(nextActive.libraryId)) throw librarySourceConflict();
    libraries = [{ id: nextActive.libraryId, name: nextActive.name, model: nextActive.modelKey, createdAt: savedAt }];
  }
  let granted = false;
  const beforeCommit = async () => { if (!granted) { if (!await authorize(identity.id)) throw librarySourceConflict(); granted = true; } };
  let directory = io.directory;
  // A first-library command grants the transaction before its first persistent
  // action (creating the store). Existing stores grant after opening the saved
  // backup handle and immediately before its synchronous truncate/write/flush.
  if (!directory) { await beforeCommit(); directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(OPFS_SUBDIR, { create: true }) as unknown as LibraryDirectory; }
  const owner = new LensLocalLibraryRegistry(directory, MODELS, DEFAULT_MODEL_KEY);
  if (source.registry) { owner.libraries = source.registry.libraries; owner.activeId = source.registry.activeId; owner.revision = source.registry.revision; owner.extensions = Object.fromEntries(Object.entries(source.registry).filter(([key]) => !['libraries', 'activeId', 'revision', 'updatedAt'].includes(key))); }
  const receipt: Receipt = { ...identity, libraryId: proposal.recordId, operation: proposal.operation, savedAt };
  const extensions = { ...owner.extensions, [RECEIPTS]: { ...(owner.extensions[RECEIPTS] as Record<string, unknown> | undefined), version: 1, entries: [...history, receipt].slice(-64) } };
  await owner.commitState(libraries, nextActive.libraryId, extensions, beforeCommit);
  const cleanupPending = proposal.operation === 'remove' ? await owner.cleanupLibraryFiles(proposal.recordId) : false;
  return { type: 'library_change_applied' as const, commandId: identity.id, alreadyApplied: false, appliedAt: savedAt, cleanupPending };
}
export async function handleKnowledgeLibraryChange(value: unknown, postMessage: (reply: WorkerReply) => void, confirmOnly = false) {
  const authorize = knowledgeCommitAuthorization(postMessage);
  const result = confirmOnly ? await confirmKnowledgeLibraryReceipt(value, authorize) : await commitKnowledgeLibraryChange(value, authorize);
  postMessage(result);
}
