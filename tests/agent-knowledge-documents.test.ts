// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import * as lens from '../js/lens.js';
import { renderAgentDraftCards } from '../js/agent-draft-component.js';
import { listCurrentKnowledgeDocuments, prepareReviewedKnowledgeDocument, commitReviewedKnowledgeDocument, confirmReviewedKnowledgeDocument } from '../js/knowledge-document-records.js';
import { displayKnowledgeDocument, projectKnowledgeDocument } from '../js/knowledge-document-model.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import { agentDataObject } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { commitKnowledgeDocumentChange, confirmKnowledgeDocumentReceipt } from '../js/knowledge-document-commit.js';
import { readCurrentKnowledgeDocument } from '../js/knowledge-document-records.js';
import { knowledgeDocumentId, DOCUMENT_ID_FIELD } from '../js/knowledge-document-model.js';
import { FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, writeCorpusSnapshot, readLatestCorpusSnapshot } from '../js/lens-local-store.js';
import { buildLocalIngestTransaction } from '../js/lens-local-ingest.js';
import { DEFAULT_MODEL_KEY, MODELS } from '../js/lens-local-embedder-config.js';
import { KnowledgeMemoryDirectory, knowledgeTestLocks } from './helpers/knowledge-library-opfs.js';
import { setBlob } from '../js/blob-storage.js';
import { LENS_CONFIG_COMMIT_KEY } from '../js/lens-config-store.js';
import type { WorkerRequest, WorkerReply } from '../js/lens-local-protocol.js';
const origin = { profile: state.currentProfile, data: state.importedData }, model = MODELS[DEFAULT_MODEL_KEY]!;
const documentId = (libraryId = 'default') => knowledgeDocumentId(libraryId, 'report.md');
let root: KnowledgeMemoryDirectory, saved: KnowledgeMemoryDirectory, locks: ReturnType<typeof knowledgeTestLocks>, workers: DocumentWorker[], loseReply = false;
let onGrant: (() => void | Promise<void>) | null = null;
class DocumentWorker {
  messages: WorkerRequest[] = []; terminated = false; gate: ((allowed: boolean) => void) | null = null;
  listeners = new Map<string, Set<(event: { data?: WorkerReply }) => void>>();
  constructor() { workers.push(this); }
  addEventListener(type: string, listener: (event: { data?: WorkerReply }) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  emit(type: string, data?: WorkerReply) { if (!this.terminated) for (const listener of this.listeners.get(type) ?? []) listener(data ? { data } : {}); }
  terminate() { this.terminated = true; this.gate?.(false); this.gate = null; }
  postMessage(message: WorkerRequest) {
    this.messages.push(structuredClone(message));
    if (message.type === 'commit_library') { this.gate?.(message.allowed === true); this.gate = null; return; }
    if (!['apply_document_change', 'confirm_document_change'].includes(String(message.type))) throw new Error('Document metadata must not initialize the worker');
    void locks.request('getbased-knowledge-local-storage', async () => {
      try {
        const execute = message.type === 'confirm_document_change' ? confirmKnowledgeDocumentReceipt : commitKnowledgeDocumentChange;
        const result = await execute(message.proposal, async commandId => {
          await onGrant?.(); return new Promise<boolean>(resolve => { this.gate = resolve; this.emit('message', { type: 'library_commit_ready', token: 'document-test-grant', commandId }); });
        });
        if (loseReply) { loseReply = false; this.emit('error'); } else this.emit('message', result);
      } catch (error) { this.emit('message', { type: 'error', message: error instanceof Error ? error.message : 'Synthetic error', ...(error instanceof Error && 'noChangeApplied' in error ? { noChangeApplied: true } : {}), ...(error instanceof Error && 'requiresReload' in error ? { requiresReload: true } : {}) }); }
    });
  }
}
// Native indexed-document ownership and recovery remain covered independently of chat.
async function proposal(operation: 'update' | 'remove' = 'update', patch: object = { source: 'renamed.md' }, libraryId = 'default') {
  const baseline = await readCurrentKnowledgeDocument(state.currentProfile, documentId(libraryId));
  if (!baseline) throw new Error('Missing native document');
  const payload: AgentDataProposal = { resource: 'knowledgeDocuments', operation, recordId: documentId(libraryId), baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence: 'Native document request.', reason: 'Native document review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  projectKnowledgeDocument(payload); await prepareReviewedKnowledgeDocument(state.currentProfile, payload);
  return { read: { current: agentDataObject(displayKnowledgeDocument(baseline)) }, draft: { kind: 'data' as const, status: 'pending' as 'pending' | 'applying' | 'failed', id: crypto.randomUUID(), profileId: state.currentProfile, payload } };
}
function applyNativeDocument(draft: { payload: AgentDataProposal; profileId: string }) { return commitReviewedKnowledgeDocument(draft.profileId, draft.payload, () => state.currentProfile === draft.profileId && isAgentDataEnabled('knowledgeDocuments')); }
function confirmNativeDocument(draft: { payload: AgentDataProposal; profileId: string }) { return confirmReviewedKnowledgeDocument(draft.profileId, draft.payload, () => state.currentProfile === draft.profileId); }
const corpus = async (libraryId = 'default') => (await readLatestCorpusSnapshot(saved.dirs.get(libraryId)!, { dim: model.dim, modelId: model.id }))!;
const config = () => localStorage.getItem('labcharts-lens-config');
beforeEach(async () => {
  root = new KnowledgeMemoryDirectory(); saved = await root.getDirectoryHandle('lens-local', { create: true }); locks = knowledgeTestLocks(); workers = []; loseReply = false; onGrant = null;
  const registry = { revision: 4, updatedAt: 1, activeId: 'default', privateExtension: 'private-registry-sentinel', libraries: ['default', 'other'].map((id, index) => ({ id, name: index ? 'Other Research' : 'Research', createdAt: index + 1, model: DEFAULT_MODEL_KEY, opaque: 'private-library-sentinel' })) };
  for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, registry);
  for (const id of ['default', 'other']) {
    const directory = await saved.getDirectoryHandle(id, { create: true }), vectors = Float32Array.from({ length: model.dim * 4 }, (_, i) => i / 10);
    await writeCorpusSnapshot(directory, { manifest: { dim: model.dim, modelId: model.id, indexedAt: 123, numChunks: 4, opaque: 'private-manifest-sentinel', docs: [{ source: 'report.md', chunks: 2, hash: 'reported-hash', original: { retain: 'private-document-sentinel' } }, { source: 'notes.txt', chunks: 2, hash: 'other-hash', extra: 7 }] }, vectors,
      chunks: Array.from({ length: 4 }, (_, i) => ({ source: i < 2 ? 'report.md' : 'notes.txt', text: `private-corpus-sentinel-${id}-${i}`, nativeChunkId: `retain-${i}`, extra: { keep: i } })) });
  }
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root }, locks }); vi.stubGlobal('Worker', DocumentWorker); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network'); }));
  state.currentProfile = `document-${crypto.randomUUID()}`; localStorage.setItem('labcharts-active-profile', state.currentProfile); state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'private-profile-sentinel';
  lens.saveLensConfig({ enabled: true, backend: 'in-browser', name: 'Private alias', url: 'https://private.invalid/source', topK: 5, multiQuery: false });
});
afterEach(() => { for (const worker of workers) worker.terminate(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.removeItem('labcharts-lens-config'); document.body.innerHTML = ''; state.currentProfile = origin.profile; state.importedData = origin.data; });
it('lists duplicate filenames as distinct exact library-scoped IDs and prepares metadata without workers or writes', async () => {
  const before = root.snapshot(), profile = JSON.stringify(state.importedData), cfg = config(), list = await listCurrentKnowledgeDocuments(state.currentProfile);
  const records = list; expect(records).toHaveLength(4); expect(new Set(records.map((row: { documentId: string }) => row.documentId)).size).toBe(4);
  const prepared = await proposal(); expect(prepared.read.current).toMatchObject({ documentId: documentId(), libraryId: 'default', source: 'report.md', chunks: 2 });
  expect(JSON.stringify({ list, prepared })).not.toMatch(/private-.*sentinel|private.invalid/); expect(Object.keys(prepared.read.current).sort()).toEqual(['chunks', 'contentHash', 'documentId', 'libraryId', 'libraryName', 'source']); expect(root.snapshot()).toEqual(before); expect(config()).toBe(cfg); expect(JSON.stringify(state.importedData)).toBe(profile); expect(workers).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
});
it('renames only the indexed source, keeps stable ID/text/vector bytes and opaque fields, and never writes the registry or profile', async () => {
  const prepared = await proposal(); const before = await corpus(), other = saved.dirs.get('other')!.snapshot(), registry = saved.files.get(FILE_LIBRARIES)!.bytes.slice(), profile = JSON.stringify(state.importedData), cfg = config();
  const html = renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0); expect(html).toContain('Managed in native UI'); expect(html).not.toContain('data-chat-message-action');
  await expect(applyNativeDocument(prepared.draft)).resolves.toContain('Document index change saved'); const after = await corpus();
  expect(new Uint8Array(after.state.vectors.buffer)).toEqual(new Uint8Array(before.state.vectors.buffer)); expect(after.state.chunks).toEqual(before.state.chunks.map(row => row.source === 'report.md' ? { ...row, source: 'renamed.md' } : row));
  expect(after.state.manifest.docs).toEqual([{ ...before.state.manifest.docs[0], source: 'renamed.md', [DOCUMENT_ID_FIELD]: documentId() }, before.state.manifest.docs[1]]); expect(after.state.manifest.indexedAt).toBe(123); expect(after.state.manifest.opaque).toBe('private-manifest-sentinel');
  expect((await readCurrentKnowledgeDocument(state.currentProfile, documentId()))?.record.source).toBe('renamed.md'); expect(saved.dirs.get('other')!.snapshot()).toEqual(other); expect(saved.files.get(FILE_LIBRARIES)!.bytes).toEqual(registry); expect(config()).toBe(cfg); expect(JSON.stringify(state.importedData)).toBe(profile); expect(workers[0]!.messages.map(row => row.type)).toEqual(['apply_document_change', 'commit_library']); expect(fetch).not.toHaveBeenCalled();
});
it('deindexes only the selected document and vector rows while explicitly retaining the native recovery snapshot', async () => {
  const prepared = await proposal('remove', {}), before = await corpus();
  await applyNativeDocument(prepared.draft); const after = await corpus(); expect(after.state.manifest.docs).toEqual([before.state.manifest.docs[1]]); expect(after.state.manifest.numChunks).toBe(2); expect(after.state.chunks).toEqual(before.state.chunks.slice(2)); expect(after.state.vectors).toEqual(before.state.vectors.slice(model.dim * 2));
  expect([...saved.dirs.get('default')!.files.get('chunks.a.json')!.bytes]).toEqual([...new TextEncoder().encode(JSON.stringify(before.state.chunks))]); expect(after.state.manifest._getbasedDocumentCommands).toMatchObject({ entries: [expect.objectContaining({ documentId: documentId(), operation: 'remove' })] });
  expect(await readCurrentKnowledgeDocument(state.currentProfile, documentId())).toBeNull();
});
it('changes an inactive library without changing active identity or the active corpus', async () => {
  const prepared = await proposal('remove', {}, 'other'), before = saved.dirs.get('default')!.snapshot(), registry = saved.files.get(FILE_LIBRARIES)!.bytes.slice(); await applyNativeDocument(prepared.draft);
  expect((await corpus('other')).state.manifest.docs).toHaveLength(1); expect(saved.dirs.get('default')!.snapshot()).toEqual(before); expect(saved.files.get(FILE_LIBRARIES)!.bytes).toEqual(registry);
});
it('refuses a filename collision before creating an approval card or merging any data', async () => {
  const before = root.snapshot(); await expect(proposal('update', { source: 'notes.txt' })).rejects.toThrow(); expect(root.snapshot()).toEqual(before); expect(workers).toHaveLength(0);
});
it.each(['registry', 'corpus'] as const)('rejects stale %s bytes before a grant or any persistent write', async changed => {
  const prepared = await proposal();
  if (changed === 'registry') for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, { ...JSON.parse(new TextDecoder().decode(saved.files.get(name)!.bytes)), opaquePeer: 'keep' });
  else { const before = await corpus(); await writeCorpusSnapshot(saved.dirs.get('default')!, { ...before.state, manifest: { ...before.state.manifest, opaquePeer: 'keep' } }, { activeSlot: before.slot, revision: before.revision }); }
  const before = root.snapshot(); await expect(applyNativeDocument(prepared.draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(root.snapshot()).toEqual(before); expect(workers[0]!.messages.map(row => row.type)).toEqual(['apply_document_change']);
});
it.each(['profile', 'root', 'draft', 'disabled'] as const)('denies a %s retirement at final authorization before even creating the inactive slot', async change => {
  const prepared = await proposal(), before = root.snapshot(); onGrant = async () => {
    if (change === 'profile') state.currentProfile = 'retired';
    if (change === 'root') state.importedData = createDefaultProfileData();
    if (change === 'draft') { document.body.innerHTML = '<div id="kb-modal-overlay" class="show"><input id="lens-topk-input" value="5"></div>'; (document.getElementById('lens-topk-input') as HTMLInputElement).value = '3'; }
    if (change === 'disabled') await setBlob(LENS_CONFIG_COMMIT_KEY, { version: 1, id: 'peer-disable-documents', raw: JSON.stringify({ ...lens.getLensConfig(), enabled: false }) });
  };
  await expect(applyNativeDocument(prepared.draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(root.snapshot()).toEqual(before);
});
it('confirms a lost reply read-only with the original timestamp and no replay, even after settings or native draft changes', async () => {
  const prepared = await proposal(); loseReply = true; await expect(applyNativeDocument(prepared.draft)).rejects.toMatchObject({ requiresReload: true }); const after = root.snapshot();
  prepared.draft!.status = 'failed'; lens.saveLensConfig({ topK: 3 }); document.body.innerHTML = '<div id="kb-modal-overlay" class="show"><input id="lens-topk-input" value="3"></div>'; (document.getElementById('lens-topk-input') as HTMLInputElement).value = '2'; const cfg = config();
  expect(renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0)).toContain('Managed in native UI'); expect(renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0)).not.toContain('data-chat-message-action');
  const result = await confirmNativeDocument(prepared.draft); expect(result).toMatchObject({ type: 'document_change_applied', alreadyApplied: true, appliedAt: ((await corpus()).state.manifest._getbasedDocumentCommands as { entries: Array<{ savedAt: number }> }).entries[0]!.savedAt });
  expect(root.snapshot()).toEqual(after); expect(config()).toBe(cfg); expect(workers.flatMap(worker => worker.messages.map(row => row.type))).toEqual(['apply_document_change', 'commit_library', 'confirm_document_change', 'commit_library']);
});
it('does not interpret an absent receipt as an unapplied mutation or create any files during confirmation', async () => {
  const prepared = await proposal(); prepared.draft!.status = 'failed'; const before = root.snapshot(); expect(await confirmNativeDocument(prepared.draft)).toMatchObject({ type: 'document_change_unconfirmed' }); expect(root.snapshot()).toEqual(before);
});
it('keeps the last valid current generation after a partial write and leaves its outcome unconfirmed', async () => {
  const prepared = await proposal(), before = await corpus(); const file = await saved.dirs.get('default')!.getFileHandle('vectors.b.bin', { create: true }); file.fault = stage => { if (stage === 'flush') throw new Error('Synthetic flush failure'); };
  // Creating this test fault changes the exact source, so prepare a fresh read.
  const fresh = await proposal(); await expect(applyNativeDocument(fresh.draft)).rejects.toMatchObject({ requiresReload: true }); expect((await corpus()).state).toEqual(before.state);
  fresh.draft!.status = 'failed'; expect(await confirmNativeDocument(fresh.draft)).toMatchObject({ type: 'document_change_unconfirmed' }); expect(prepared.draft!.status).toBe('pending');
});
it('preserves stable document identity, private metadata and command receipts when native ingest replaces the renamed file', async () => {
  const prepared = await proposal(); await applyNativeDocument(prepared.draft); const before = (await corpus()).state;
  const result = await buildLocalIngestTransaction({ files: [{ name: 'renamed.md', text: 'Explicitly chosen replacement document content for the native importer. '.repeat(12) }], current: before, dim: model.dim, backend: 'wasm', embedder: async () => ({ data: new Float32Array(model.dim).fill(0.25) }), postProgress() {}, yieldTask: async () => {}, isAbortRequested: () => false });
  if (!result?.nextState) throw new Error('The chosen replacement must produce a native ingest transaction.');
  expect(result.nextState.manifest.docs.find(row => row.source === 'renamed.md')).toMatchObject({ [DOCUMENT_ID_FIELD]: documentId(), original: { retain: 'private-document-sentinel' } }); expect(result.nextState.manifest._getbasedDocumentCommands).toEqual(before.manifest._getbasedDocumentCommands);
});
it.each(['duplicate identity', 'nonfinite vector', 'oversized file'] as const)('refuses unverified %s data without writing or presenting source contents', async bad => {
  if (bad === 'oversized file') saved.dirs.get('default')!.files.get('vectors.a.bin')!.reportedSize = 33 * 1024 * 1024;
  else { const before = await corpus(), next = structuredClone(before.state); if (bad === 'duplicate identity') next.manifest.docs.forEach(doc => { doc[DOCUMENT_ID_FIELD] = documentId(); }); else next.vectors[0] = NaN; await writeCorpusSnapshot(saved.dirs.get('default')!, next, { activeSlot: before.slot, revision: before.revision }); }
  const before = root.snapshot(), error = await readCurrentKnowledgeDocument(state.currentProfile, documentId()).catch(error => error);
  expect(error).toBeInstanceOf(Error); expect(String(error)).not.toMatch(/private-.*sentinel|private.invalid/); expect(root.snapshot()).toEqual(before);
});
