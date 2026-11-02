// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import * as lens from '../js/lens.js';
import { prepareReviewedKnowledgeLibrary, commitReviewedKnowledgeLibrary, confirmReviewedKnowledgeLibrary } from '../js/knowledge-library-records.js';
import { displayKnowledgeLibrary, projectKnowledgeLibrary } from '../js/knowledge-library-proposals.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { renderAgentDraftCards } from '../js/agent-draft-component.js';
import { commitKnowledgeLibraryChange, confirmKnowledgeLibraryReceipt } from '../js/knowledge-library-commit.js';
import { readCurrentKnowledgeLibrary } from '../js/knowledge-library-records.js';
import { FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, writeCorpusSnapshot } from '../js/lens-local-store.js';
import { DEFAULT_MODEL_KEY, MODELS } from '../js/lens-local-embedder-config.js';
import { KnowledgeMemoryDirectory, knowledgeTestLocks } from './helpers/knowledge-library-opfs.js';
import { setBlob } from '../js/blob-storage.js';
import { LENS_CONFIG_COMMIT_KEY } from '../js/lens-config-store.js';
import type { WorkerRequest, WorkerReply } from '../js/lens-local-protocol.js';
const origin = { profile: state.currentProfile, data: state.importedData }, configKey = 'labcharts-lens-config';
const evidence = 'Create a library named Research, using MiniLM, and make it active.';
let root: KnowledgeMemoryDirectory, saved: KnowledgeMemoryDirectory, workers: LibraryWorker[], loseReply = false;
let locks: ReturnType<typeof knowledgeTestLocks>;
class LibraryWorker {
  messages: WorkerRequest[] = []; terminated = false;
  listeners = new Map<string, Set<(event: { data?: WorkerReply }) => void>>();
  gate: ((allowed: boolean) => void) | null = null;
  constructor() { workers.push(this); }
  addEventListener(type: string, listener: (event: { data?: WorkerReply }) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  emit(type: string, data?: WorkerReply) { if (!this.terminated) for (const listener of this.listeners.get(type) ?? []) listener(data ? { data } : {}); }
  terminate() { this.terminated = true; this.gate?.(false); this.gate = null; }
  postMessage(message: WorkerRequest) {
    this.messages.push(structuredClone(message));
    if (message.type === 'commit_library') { this.gate?.(message.allowed === true); this.gate = null; return; }
    if (!['apply_library_change', 'confirm_library_change'].includes(String(message.type))) throw new Error('A reviewed change must not initialize the native worker');
    void locks.request('getbased-knowledge-local-storage', async () => {
      try {
        const operation = message.type === 'confirm_library_change' ? confirmKnowledgeLibraryReceipt : commitKnowledgeLibraryChange;
        const result = await operation(message.proposal, commandId => new Promise(resolve => { this.gate = resolve; this.emit('message', { type: 'library_commit_ready', token: 'fixture-token', commandId }); }));
        if (loseReply) { loseReply = false; this.emit('error'); } else this.emit('message', result);
      } catch (error) { this.emit('message', { type: 'error', message: error instanceof Error ? error.message : 'Synthetic worker error', ...(error instanceof Error && 'noChangeApplied' in error ? { noChangeApplied: true } : {}), ...(error instanceof Error && 'requiresReload' in error ? { requiresReload: true } : {}) }); }
    });
  }
}
const registry = () => JSON.parse(new TextDecoder().decode(saved.files.get(FILE_LIBRARIES)!.bytes));
// Native library transaction and receipt coverage; no public chat tool can call this workflow.
async function proposal(operation: 'add' | 'update' | 'remove' = 'add', patch: object = { name: 'Research', modelKey: DEFAULT_MODEL_KEY, active: true }, id = 'default') {
  const recordId = operation === 'add' ? `lib-${crypto.randomUUID()}` : id, baseline = await readCurrentKnowledgeLibrary(state.currentProfile, recordId, operation === 'add');
  if (!baseline) throw new Error('Missing native library');
  const payload: AgentDataProposal = { resource: 'knowledgeLibraries', operation, recordId, baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence, reason: 'Native library review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  projectKnowledgeLibrary(payload); await prepareReviewedKnowledgeLibrary(state.currentProfile, payload);
  return { read: { current: displayKnowledgeLibrary(baseline) }, draft: { kind: 'data' as const, status: 'pending' as 'pending' | 'applying' | 'failed', id: crypto.randomUUID(), profileId: state.currentProfile, payload } };
}
function applyNativeLibrary(draft: { payload: AgentDataProposal; profileId: string }) { return commitReviewedKnowledgeLibrary(draft.profileId, draft.payload, () => state.currentProfile === draft.profileId && isAgentDataEnabled('knowledgeLibraries')); }
function confirmNativeLibrary(draft: { payload: AgentDataProposal; profileId: string }) { return confirmReviewedKnowledgeLibrary(draft.profileId, draft.payload, () => state.currentProfile === draft.profileId); }
beforeEach(async () => {
  root = new KnowledgeMemoryDirectory(); saved = await root.getDirectoryHandle('lens-local', { create: true }); workers = []; loseReply = false; locks = knowledgeTestLocks();
  const rows = [{ id: 'default', name: 'Saved Notes', createdAt: 1, model: DEFAULT_MODEL_KEY, origin: 'private-origin-sentinel' }, { id: 'second', name: 'Other Notes', createdAt: 2, model: DEFAULT_MODEL_KEY }];
  for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, { revision: 4, updatedAt: 1, activeId: 'default', libraries: rows, extension: { keep: 'private-registry-sentinel' } });
  const corpus = await saved.getDirectoryHandle('default', { create: true }), model = MODELS[DEFAULT_MODEL_KEY]!;
  await writeCorpusSnapshot(corpus, { manifest: { dim: model.dim, modelId: model.id, numChunks: 2, docs: [{ source: 'one.md', chunks: 1 }, { source: 'two.txt', chunks: 1 }] }, vectors: new Float32Array(model.dim * 2), chunks: [{ source: 'one.md', text: 'private-corpus-sentinel-one' }, { source: 'two.txt', text: 'private-corpus-sentinel-two' }] });
  for (const file of saved.files.values()) { file.opens = 0; file.flushed = []; }
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root }, locks }); vi.stubGlobal('Worker', LibraryWorker); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network must not run'); }));
  state.currentProfile = `library-${crypto.randomUUID()}`; localStorage.setItem('labcharts-active-profile', state.currentProfile); state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'private-profile-sentinel';
  lens.saveLensConfig({ enabled: true, backend: 'in-browser', name: 'Private alias', url: 'https://private.invalid/source', topK: 5, multiQuery: false });
});
afterEach(() => { for (const worker of workers) worker.terminate(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.removeItem(configKey); document.body.innerHTML = ''; state.currentProfile = origin.profile; state.importedData = origin.data; });
it('reads and prepares exact metadata without starting a worker, network, migration or writes and withholds private source fields', async () => {
  const before = root.snapshot(), profile = JSON.stringify(state.importedData), config = localStorage.getItem(configKey), read = await proposal('update', { name: 'Renamed Notes' });
  const text = JSON.stringify(read); expect(text).not.toContain('private-origin-sentinel'); expect(text).not.toContain('private-registry-sentinel'); expect(text).not.toContain('private-corpus-sentinel'); expect(text).not.toContain('private.invalid'); expect(text).not.toContain('private-profile-sentinel');
  expect(read.read.current).toMatchObject({ libraryId: 'default', name: 'Saved Notes', documentCount: 2, chunkCount: 2 }); expect(workers).toHaveLength(0); expect(fetch).not.toHaveBeenCalled(); expect(root.snapshot()).toEqual(before); expect(JSON.stringify(state.importedData)).toBe(profile); expect(localStorage.getItem(configKey)).toBe(config);
});
it('atomically creates and activates one stable library with one durable receipt and preserves the whole profile and existing corpus', async () => {
  const prepared = await proposal(), profile = JSON.stringify(state.importedData), corpus = saved.dirs.get('default')!.snapshot();
  const html = renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0); expect(html).toContain('Managed in native UI'); expect(html).not.toContain('data-chat-message-action'); expect(registry().libraries).toHaveLength(2);
  await expect(applyNativeLibrary(prepared.draft)).resolves.toContain('Library change saved');
  const accepted = registry(); expect(accepted.libraries).toHaveLength(3); expect(accepted.activeId).toBe(prepared.draft.payload.recordId); expect(accepted._getbasedLibraryReceipts.entries).toHaveLength(1); expect(accepted.extension).toEqual({ keep: 'private-registry-sentinel' }); expect(accepted.libraries[0].origin).toBe('private-origin-sentinel');
  for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) { const writes = saved.files.get(name)!.flushed; expect(writes).toHaveLength(1); expect(JSON.parse(new TextDecoder().decode(writes[0]!))).toMatchObject({ activeId: prepared.draft.payload.recordId, libraries: expect.arrayContaining([expect.objectContaining({ id: prepared.draft.payload.recordId, name: 'Research', model: DEFAULT_MODEL_KEY })]) }); }
  expect(saved.dirs.get('default')!.snapshot()).toEqual(corpus); expect(JSON.stringify(state.importedData)).toBe(profile); expect(fetch).not.toHaveBeenCalled(); expect(workers[0]!.messages.map(message => message.type)).toEqual(['apply_library_change', 'commit_library']);
});
it('confirms a previously accepted command after a lost acknowledgement without creating a second library or replaying a write', async () => {
  const prepared = await proposal(); loseReply = true; await expect(applyNativeLibrary(prepared.draft)).rejects.toMatchObject({ requiresReload: true });
  const accepted = saved.snapshot(); expect(registry().libraries).toHaveLength(3); expect(registry()._getbasedLibraryReceipts.entries).toHaveLength(1);
  await expect(applyNativeLibrary(prepared.draft)).resolves.toContain('already saved'); expect(saved.snapshot()).toEqual(accepted); expect(registry().libraries.filter((row: { id: string }) => row.id === prepared.draft.payload.recordId)).toHaveLength(1); expect(workers).toHaveLength(2);
});
it('rejects a stale proposal after an opaque registry change rather than overwriting that data', async () => {
  const prepared = await proposal('update', { name: 'Renamed Notes' }), next = { ...registry(), extension: { keep: 'new-private-extension' } }; for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, next); const before = root.snapshot();
  await expect(applyNativeLibrary(prepared.draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(root.snapshot()).toEqual(before); expect(workers[0]!.messages.map(message => message.type)).toEqual(['apply_library_change']);
});
it.each(['profile', 'root', 'draft', 'disabled'] as const)('rechecks %s at the final backup handle before any byte is truncated', async change => {
  const prepared = await proposal('update', { name: 'Renamed Notes' }), before = root.snapshot();
  saved.files.get(FILE_LIBRARIES_BACKUP)!.onOpen = async count => { if (count !== 2) return;
    if (change === 'profile') state.currentProfile = 'retired-library-profile';
    if (change === 'root') state.importedData = createDefaultProfileData();
    if (change === 'draft') { document.body.innerHTML = '<div id="kb-modal-overlay" class="show"><input id="lens-topk-input" value="5"></div>'; (document.getElementById('lens-topk-input') as HTMLInputElement).value = '3'; }
    if (change === 'disabled') await setBlob(LENS_CONFIG_COMMIT_KEY, { version: 1, id: 'peer-disable', raw: JSON.stringify({ ...lens.getLensConfig(), enabled: false }) });
  };
  await expect(applyNativeLibrary(prepared.draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(root.snapshot()).toEqual(before); expect(registry().libraries[0].name).toBe('Saved Notes'); expect(workers[0]!.messages.map(message => message.type)).toEqual(['apply_library_change', 'commit_library']);
});
it('rejects malformed or mismatched recovery copies without repairing or initializing storage', async () => {
  saved.files.get(FILE_LIBRARIES_BACKUP)!.bytes = new TextEncoder().encode('{broken'); const before = root.snapshot();
  await expect(readCurrentKnowledgeLibrary(state.currentProfile, 'default')).rejects.toThrow('needs review'); expect(root.snapshot()).toEqual(before); expect(workers).toHaveLength(0);
});
it('creates no first-library storage when final authorization is denied', async () => {
  root.dirs.delete('lens-local'); const prepared = await proposal(), before = root.snapshot();
  await expect(commitKnowledgeLibraryChange(prepared.draft.payload, async () => false)).rejects.toMatchObject({ noChangeApplied: true }); expect(root.snapshot()).toEqual(before); expect(root.dirs.has('lens-local')).toBe(false);
});
it('retains the old corpus as pending cleanup without making it the final-library replacement', async () => {
  const one = registry(); one.libraries = [one.libraries[0]]; for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, one); const corpus = saved.dirs.get('default')!.snapshot(); saved.failRemoval = true;
  const prepared = await proposal('remove', {}); const html = renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0); expect(prepared.read.current).toMatchObject({ documentCount: 2 }); expect(html).toContain('Managed in native UI'); const planned = projectKnowledgeLibrary(prepared.draft.payload); expect(planned.effects.createsReplacement).toBe(true); expect(planned.nextActive).toMatchObject({ documentCount: 0, chunkCount: 0 }); expect(planned.nextActive!.libraryId).not.toBe('default');
  await expect(applyNativeLibrary(prepared.draft)).resolves.toContain('could not be erased'); expect(registry().activeId).not.toBe('default'); expect(registry().libraries).toHaveLength(1); expect(saved.dirs.get('default')!.snapshot()).toEqual(corpus); expect(registry()._getbasedLibraryReceipts.entries).toHaveLength(1);
});

it('checks an unknown card by receipt without rewriting library data or applying another command, even after retrieval preferences change', async () => {
  const prepared = await proposal(); loseReply = true; await expect(applyNativeLibrary(prepared.draft)).rejects.toMatchObject({ requiresReload: true }); prepared.draft.status = 'failed';
  lens.saveLensConfig({ topK: 7 }); const before = root.snapshot(), config = localStorage.getItem(configKey);
  document.body.innerHTML = '<div id="kb-modal-overlay" class="show"><input id="lens-topk-input" value="7"></div>'; (document.getElementById('lens-topk-input') as HTMLInputElement).value = '6';
  expect(renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0)).toContain('Managed in native UI'); expect(renderAgentDraftCards({ agentDrafts: [prepared.draft] }, 0)).not.toContain('data-chat-message-action');
  await expect(confirmNativeLibrary(prepared.draft)).resolves.toMatchObject({ type: 'library_change_applied', alreadyApplied: true, appliedAt: expect.any(Number) });
  expect(root.snapshot()).toEqual(before); expect(localStorage.getItem(configKey)).toBe(config); expect((document.getElementById('lens-topk-input') as HTMLInputElement).value).toBe('6'); expect(workers[1]!.messages.map(message => message.type)).toEqual(['confirm_library_change', 'commit_library']);
});
it('an absent or expired receipt remains unconfirmed and never triggers a create as part of checking', async () => {
  const prepared = await proposal(); prepared.draft.status = 'failed'; const before = root.snapshot();
  await expect(confirmNativeLibrary(prepared.draft)).resolves.toMatchObject({ type: 'library_change_unconfirmed' }); expect(root.snapshot()).toEqual(before); expect(registry().libraries).toHaveLength(2);
  expect(workers[0]!.messages.map(message => message.type)).toEqual(['confirm_library_change', 'commit_library']);
});
it('checking an accepted receipt withholds confirmation when the originating root changes before the parent grant', async () => {
  const prepared = await proposal(); loseReply = true; await expect(applyNativeLibrary(prepared.draft)).rejects.toMatchObject({ requiresReload: true }); prepared.draft.status = 'failed';
  const before = root.snapshot(); saved.files.get(FILE_LIBRARIES_BACKUP)!.opens = 0; saved.files.get(FILE_LIBRARIES_BACKUP)!.onOpen = count => { if (count === 1) state.importedData = createDefaultProfileData(); };
  await expect(confirmNativeLibrary(prepared.draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(root.snapshot()).toEqual(before); expect(registry().libraries).toHaveLength(3);
});
