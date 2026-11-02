// Public library review facts; opaque registry fields and corpus bytes stay local.
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { DEFAULT_MODEL_KEY, MODELS } from './lens-local-embedder-config.js';
import { DEFAULT_LIBRARY_NAME, isSafeLibraryId } from './lens-local-store.js';
import type { KnowledgeLibraryRecord, KnowledgeLibrarySnapshot } from './knowledge-library-source.js';
export const knowledgeLibraryFields = {
  name: 'Library name, 1–4000 characters', modelKey: 'Required when adding: choose an exact model key from models; fixed for this library after creation',
  active: 'Required boolean when adding; update with true to switch every profile in this browser to this library',
};
export const knowledgeLibraryModels = Object.entries(MODELS).map(([key, model]) => ({ key, label: model.label, language: model.language, firstUseDownloadMB: model.downloadMB, notes: model.notes }));
export function displayKnowledgeLibrary(value: unknown): KnowledgeLibraryRecord | null {
  if (value === null) return null;
  const raw = agentDataObject(value); if (raw.version === 1) return displayKnowledgeLibrary(raw.record);
  if (!isSafeLibraryId(raw.libraryId) || typeof raw.libraryId !== 'string' || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 4000 || typeof raw.modelKey !== 'string' || !Object.hasOwn(MODELS, raw.modelKey) || typeof raw.active !== 'boolean') throw new Error('Read the exact saved library again.');
  const counts = (name: 'documentCount' | 'chunkCount') => { const count = raw[name]; if (count === undefined) return {}; if (!Number.isSafeInteger(count) || Number(count) < 0) throw new Error('Review the saved library counts.'); return { [name]: Number(count) }; };
  return { libraryId: raw.libraryId, name: raw.name, modelKey: raw.modelKey, modelLabel: MODELS[raw.modelKey]!.label, active: raw.active, ...counts('documentCount'), ...counts('chunkCount') };
}
export function projectKnowledgeLibrary(proposal: AgentDataProposal) {
  if (String(proposal.resource) !== 'knowledgeLibraries' || !['add', 'update', 'remove'].includes(proposal.operation) || !isSafeLibraryId(proposal.recordId) || !Number.isFinite(proposal.recordedAt) || proposal.recordedAt <= 0) throw new Error('Read the intended library before proposing this change.');
  const snapshot = agentDataObject(JSON.parse(proposal.baseline));
  if (snapshot.version !== 1 || snapshot.scope !== 'browser' || typeof snapshot.revision !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.revision) || typeof snapshot.configuration !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.configuration)) throw new Error('Read a fresh library snapshot.');
  const before = displayKnowledgeLibrary(snapshot.record), active = displayKnowledgeLibrary(snapshot.active), next = displayKnowledgeLibrary(snapshot.next);
  for (const row of [before, active, next]) if (row && (row.documentCount === undefined || row.chunkCount === undefined)) throw new Error('The library counts need verification before a change.');
  if (before && before.libraryId !== proposal.recordId || before && before.active !== (before.libraryId === active?.libraryId) || active && !active.active || next && (next.active || next.libraryId === before?.libraryId)) throw new Error('The saved library identities need review.');
  const patch = parseAgentDataPatch(proposal.patch); validateFieldNames(patch, proposal.operation === 'remove' ? [] : proposal.operation === 'add' ? ['name', 'modelKey', 'active'] : ['name', 'active']);
  if (proposal.operation === 'add' ? before !== null : before === null) throw new Error('Read the exact existing library, or a new-library snapshot.');
  const name = Object.hasOwn(patch, 'name') ? patch.name : before?.name;
  if (proposal.operation !== 'remove' && (typeof name !== 'string' || !name.trim() || name.trim().length > 4000)) throw new Error('Supply a library name with 1–4000 characters.');
  if (Object.hasOwn(patch, 'active') && typeof patch.active !== 'boolean' || proposal.operation === 'update' && patch.active === false) throw new Error('Switch by setting active to true on the intended library.');
  if (proposal.operation === 'add' && (typeof patch.modelKey !== 'string' || !Object.hasOwn(MODELS, patch.modelKey) || typeof patch.active !== 'boolean')) throw new Error('Choose the embedding model and whether the new library becomes active.');
  if (proposal.operation === 'add' && !active && patch.active !== true) throw new Error('The first library must be active. Include that choice in the review.');
  if (proposal.operation === 'update' && !Object.keys(patch).length) throw new Error('Supply the reported library change.');
  const after: KnowledgeLibraryRecord | null = proposal.operation === 'remove' ? null : proposal.operation === 'add'
    ? { libraryId: proposal.recordId, name: (name as string).trim(), modelKey: patch.modelKey as string, modelLabel: MODELS[patch.modelKey as string]!.label, active: patch.active === true, documentCount: 0, chunkCount: 0 }
    : { ...before!, name: Object.hasOwn(patch, 'name') ? (name as string).trim() : before!.name, active: patch.active === true || before!.active };
  let nextActive = after?.active ? after : active;
  if (proposal.operation === 'remove' && before!.active) {
    if (next) nextActive = { ...next, active: true };
    else {
      if (typeof snapshot.replacementId !== 'string' || !isSafeLibraryId(snapshot.replacementId) || snapshot.replacementId === proposal.recordId) throw new Error('Read the final library again to review its empty replacement.');
      nextActive = { libraryId: snapshot.replacementId, name: DEFAULT_LIBRARY_NAME, modelKey: DEFAULT_MODEL_KEY, modelLabel: MODELS[DEFAULT_MODEL_KEY]!.label, active: true, documentCount: 0, chunkCount: 0 };
    }
  }
  return { before, after, active, nextActive, snapshot: snapshot as unknown as KnowledgeLibrarySnapshot,
    effects: { browserWide: true, removesDocuments: proposal.operation === 'remove' ? before!.documentCount! : 0, removesChunks: proposal.operation === 'remove' ? before!.chunkCount! : 0,
      createsReplacement: proposal.operation === 'remove' && before!.active && !next, switchesActive: active?.libraryId !== nextActive?.libraryId, downloadsModel: false } };
}
export function describeKnowledgeLibrary(value: unknown) {
  const record = displayKnowledgeLibrary(value); if (!record) return 'Not recorded / removed';
  return `${record.name}\nEmbedding model: ${record.modelLabel}\nActive for all profiles: ${record.active ? 'Yes' : 'No'}${record.documentCount === undefined ? '' : `\nDocuments: ${record.documentCount} · Excerpts: ${record.chunkCount}`}`;
}
