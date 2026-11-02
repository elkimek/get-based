import { File as TestFile } from 'node:buffer';
import { knowledgeFileInputs } from '../js/knowledge-file-inputs.js';
import { assertKnowledgeSourceWriteBudget, knowledgeLibraryReadBudget } from '../js/knowledge-library-source.js';
import { supersedePendingDataProposals } from '../shared/agent-data-contract.js';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import * as lens from '../js/lens.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft as applyChatDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { commitKnowledgeImport, confirmKnowledgeImportReceipt } from '../js/knowledge-import-commit.js';
import type { KnowledgeImportRuntime } from '../js/knowledge-import-commit.js';
import { readCurrentKnowledgeImport, prepareReviewedKnowledgeImport, commitReviewedKnowledgeImport, confirmReviewedKnowledgeImport } from '../js/knowledge-import-records.js';
import { projectKnowledgeImport, displayKnowledgeImport } from '../js/knowledge-import-model.js';
import { knowledgeDocumentId, DOCUMENT_ID_FIELD } from '../js/knowledge-document-model.js';
import { beginKnowledgeImport, stopKnowledgeImport } from '../js/knowledge-import-jobs.js';
import { FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, writeCorpusSnapshot, readLatestCorpusSnapshot } from '../js/lens-local-store.js';
import { DEFAULT_MODEL_KEY, MODELS } from '../js/lens-local-embedder-config.js';
import { KnowledgeMemoryDirectory, knowledgeTestLocks } from './helpers/knowledge-library-opfs.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { WorkerRequest, WorkerReply } from '../js/lens-local-protocol.js';
const original = { profile: state.currentProfile, data: state.importedData }, model = MODELS[DEFAULT_MODEL_KEY]!;
const text = 'This is the exact synthetic user supplied replacement passage. It contains enough content for the native document chunker to retain a useful indexed passage. '.repeat(7);
let root: KnowledgeMemoryDirectory, saved: KnowledgeMemoryDirectory, workers: ImportWorker[], locks: ReturnType<typeof knowledgeTestLocks>, loseReply = false;
let runtime: KnowledgeImportRuntime, loadCalls: number, grantCalls: number;
class ImportWorker {
  terminated = false; gate: ((allow: boolean) => void) | null = null;
  listeners = new Map<string, Set<(event: { data?: WorkerReply }) => void>>();
  constructor() { workers.push(this); }
  addEventListener(type: string, listener: (event: { data?: WorkerReply }) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  emit(type: string, data?: WorkerReply) { if (!this.terminated) for (const listener of this.listeners.get(type) ?? []) listener(data ? { data } : {}); }
  terminate() { this.terminated = true; this.gate?.(false); }
  postMessage(message: WorkerRequest) {
    if (message.type === 'commit_library') { this.gate?.(message.allowed === true); this.gate = null; return; }
    if (!['apply_document_import', 'confirm_document_import'].includes(String(message.type))) throw new Error('Import must not initialize or repair OPFS.');
    void locks.request('getbased-knowledge-local-storage', async () => {
      const authorize = async (commandId: string) => new Promise<boolean>(resolve => { grantCalls++; this.gate = resolve; this.emit('message', { type: 'library_commit_ready', token: 'import-grant', commandId }); });
      try {
        const result = message.type === 'confirm_document_import' ? await confirmKnowledgeImportReceipt(message.proposal, authorize) : await commitKnowledgeImport(message.proposal, authorize, { ...runtime, progress: value => { runtime.progress(value); this.emit('message', { type: 'progress', ...value }); } }, message.files);
        if (loseReply) { loseReply = false; this.emit('error'); } else this.emit('message', result);
      } catch (error) { this.emit('message', { type: 'error', message: error instanceof Error ? error.message : 'Unexpected failure', ...(error instanceof Error && 'noChangeApplied' in error ? { noChangeApplied: true } : {}), ...(error instanceof Error && 'requiresReload' in error ? { requiresReload: true } : {}) }); }
    });
  }
}
const toolsFor = (message = `Import the following text as new.md: ${text}`) => createAgentToolRuntime({ readContext: () => '', userMessage: message, ...createBrowserAgentToolDependencies(state.currentProfile) });
// Native planner/transaction coverage remains independent of the retired chat API.
async function prepare(patch: object = { source: 'new.md', text }, libraryId = 'other') {
  const baseline = await readCurrentKnowledgeImport(state.currentProfile, libraryId);
  const proposal: AgentDataProposal = { resource: 'knowledgeImports', operation: 'start', recordId: libraryId, baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence: 'Import the following text', reason: 'Native chosen source review', effectiveDate: '2026-10-30', recordedAt: Date.now() };
  const draft = { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), profileId: state.currentProfile, payload: proposal };
  try {
    projectKnowledgeImport(proposal); await prepareReviewedKnowledgeImport(state.currentProfile, proposal);
    return { read: { current: displayKnowledgeImport(baseline), documents: baseline.documents }, reply: { success: true, contentItems: [{ text: '' }] as const }, draft, proposal };
  } catch (error) {
    return { read: { current: displayKnowledgeImport(baseline) }, reply: { success: false, contentItems: [{ text: error instanceof Error ? error.message : 'Native validation failed' }] as const }, draft, proposal };
  }
}
function applyNativeImport(draft: Awaited<ReturnType<typeof prepare>>['draft']) {
  return commitReviewedKnowledgeImport(draft.profileId, draft.payload, () => state.currentProfile === draft.profileId);
}
function confirmNativeImport(draft: Awaited<ReturnType<typeof prepare>>['draft']) {
  return confirmReviewedKnowledgeImport(draft.profileId, draft.payload, () => state.currentProfile === draft.profileId);
}
const corpus = async (id = 'other') => (await readLatestCorpusSnapshot(saved.dirs.get(id)!, { dim: model.dim, modelId: model.id }))!;
beforeEach(async () => {
  root = new KnowledgeMemoryDirectory(); saved = await root.getDirectoryHandle('lens-local', { create: true }); locks = knowledgeTestLocks(); workers = []; loseReply = false; loadCalls = 0; grantCalls = 0;
  const registry = { revision: 4, updatedAt: 1, activeId: 'default', privateExtension: 'private-registry', libraries: ['default', 'other'].map(id => ({ id, name: id, createdAt: 1, model: DEFAULT_MODEL_KEY })) };
  for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, registry);
  for (const id of ['default', 'other']) await writeCorpusSnapshot(await saved.getDirectoryHandle(id, { create: true }), { manifest: { dim: model.dim, modelId: model.id, numChunks: 2, opaque: 'private-manifest', docs: [{ source: 'old.md', chunks: 1, opaque: 7 }, { source: 'keep.md', chunks: 1 }] }, vectors: Float32Array.from({ length: model.dim * 2 }, (_, i) => i / 10), chunks: [{ source: 'old.md', text: 'private existing source content', opaque: true }, { source: 'keep.md', text: 'private kept source content', opaque: true }] });
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root }, locks }); vi.stubGlobal('Worker', ImportWorker); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network'); }));
  state.currentProfile = `import-${crypto.randomUUID()}`; localStorage.setItem('labcharts-active-profile', state.currentProfile); state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'private-profile';
  lens.saveLensConfig({ enabled: true, backend: 'in-browser', topK: 5, multiQuery: false });
  runtime = { load: async () => { loadCalls++; return { embedder: input => ({ data: Float32Array.from({ length: model.dim * (Array.isArray(input) ? input.length : 1) }, () => 0.25) }), backend: 'wasm' }; }, yieldTask: async () => {}, isAbortRequested: () => false, progress: () => {} };
});
afterEach(() => { knowledgeFileInputs.clear(); for (const worker of workers) worker.terminate(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.removeItem('labcharts-lens-config'); document.body.innerHTML = ''; state.currentProfile = original.profile; state.importedData = original.data; });
it('reads/prepares metadata and exact supplied text without writes, workers, models or private source disclosure', async () => {
  const before = root.snapshot(), p = await prepare(); expect(p.reply.success, p.reply.contentItems[0].text).toBe(true); expect(root.snapshot()).toEqual(before); expect(workers).toHaveLength(0); expect(loadCalls).toBe(0);
  const publicRead = JSON.stringify(p.read); for (const secret of ['private existing', 'private kept', 'private-manifest', 'private-registry', 'private-profile']) expect(publicRead).not.toContain(secret);
  const review = projectKnowledgeImport(p.proposal); expect(review.text).toBe(text); expect(review.effects.firstUseDownloadMB).toBe(22);
  expect(projectAgentDraftCards({ agentDrafts: [p.draft] })[0]).toMatchObject({ nativeOnly: true, id: undefined, status: 'failed', requiresRefresh: false });
});
it('indexes an inactive library through the native planner, preserving profile, active registry, other document bytes and vectors', async () => {
  const p = await prepare(), before = await corpus(), registry = saved.files.get(FILE_LIBRARIES)!.bytes.slice(), active = saved.dirs.get('default')!.snapshot(), profile = JSON.stringify(state.importedData);
  await applyNativeImport(p.draft); const after = await corpus(); expect(loadCalls).toBe(1); expect(grantCalls).toBe(3); expect(after.revision).toBe(before.revision + 1); expect(after.state.chunks.slice(0, 2)).toEqual(before.state.chunks); expect(after.state.vectors.slice(0, model.dim * 2)).toEqual(before.state.vectors);
  expect(after.state.manifest.docs.find(row => row.source === 'new.md')?.[DOCUMENT_ID_FIELD]).toBe(knowledgeDocumentId('other', 'new.md')); expect(after.state.manifest.opaque).toBe('private-manifest'); expect(saved.files.get(FILE_LIBRARIES)!.bytes).toEqual(registry); expect(saved.dirs.get('default')!.snapshot()).toEqual(active); expect(JSON.stringify(state.importedData)).toBe(profile);
});
it('replaces only the exact selected document while retaining its stable identity and opaque metadata', async () => {
  const id = knowledgeDocumentId('other', 'old.md'), p = await prepare({ source: 'old.md', text, replaceDocumentId: id }), before = await corpus(); await applyNativeImport(p.draft); const after = await corpus();
  expect(after.state.chunks[0]).toEqual(before.state.chunks[1]); expect(after.state.vectors.slice(0, model.dim)).toEqual(before.state.vectors.slice(model.dim)); expect(after.state.chunks.filter(row => row.source === 'old.md').map(row => row.text).join(' ')).toContain('exact synthetic'); expect(after.state.manifest.docs.find(row => row.source === 'old.md')).toMatchObject({ opaque: 7, [DOCUMENT_ID_FIELD]: id });
});
it.each([{}, { source: 'old.md', text }, { source: 'old.md', text, replaceDocumentId: knowledgeDocumentId('default', 'old.md') }, { source: 'new.md', text: '  ' }, { source: 'new.md', text, arbitrary: true }])('rejects missing text, implicit/cross-library replacement and unsupported fields, case %#', async patch => {
  const p = await prepare(patch); expect(p.reply.success).toBe(false); expect(workers).toHaveLength(0); expect(loadCalls).toBe(0);
});
it('refuses any model-prepared import, including reconstructed text, before reaching native storage', async () => {
  const tools = toolsFor(); const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'knowledgeImports', operation: 'start', snapshotId: 'retired', patch: JSON.stringify({ source: 'new.md', text: 'The model invented this document body.' }), reason: 'Import', evidence: 'Import the following text' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).toContain('native'); expect(tools.getDrafts()).toEqual([]); expect(workers).toHaveLength(0);
});
it('rejects a stale corpus before loading a model', async () => {
  const p = await prepare(), dir = saved.dirs.get('other')!; dir.json('unexpected', {}); const before = await corpus(); await writeCorpusSnapshot(dir, { ...before.state, chunks: before.state.chunks.map(row => ({ ...row, text: row.text + ' changed' })) }, { activeSlot: before.slot, revision: before.revision });
  await expect(commitKnowledgeImport(p.proposal, async () => true, runtime)).rejects.toThrow(); expect(loadCalls).toBe(0);
});
it.each([1, 2, 3])('revokes before model initialization or the final first write at grant %i', async deniedGrant => {
  const p = await prepare(), before = root.snapshot(); let count = 0; await expect(commitKnowledgeImport(p.proposal, async () => ++count !== deniedGrant, runtime)).rejects.toThrow(); expect(root.snapshot()).toEqual(before); expect(loadCalls).toBe(deniedGrant === 1 ? 0 : 1);
});
it('cancels after a completed embedding batch without changing any stored generation', async () => {
  const p = await prepare(), before = root.snapshot(); let abort = false; runtime.progress = value => { if (value.stage === 'embed') abort = true; }; runtime.isAbortRequested = () => abort;
  await expect(commitKnowledgeImport(p.proposal, async () => true, runtime)).rejects.toThrow(); expect(root.snapshot()).toEqual(before);
});
it('rejects nonfinite embeddings without writing a corpus', async () => {
  const p = await prepare(), before = root.snapshot(); runtime.load = async () => ({ embedder: input => ({ data: Float32Array.from({ length: model.dim * (Array.isArray(input) ? input.length : 1) }, () => NaN) }), backend: 'wasm' });
  await expect(commitKnowledgeImport(p.proposal, async () => true, runtime)).rejects.toThrow('invalid values'); expect(root.snapshot()).toEqual(before);
});
it('confirms a lost reply read-only with original timestamp, no model load and no replay', async () => {
  const p = await prepare(); loseReply = true; await expect(applyNativeImport(p.draft)).rejects.toMatchObject({ requiresReload: true }); const before = root.snapshot(), count = loadCalls;
  const result = await confirmNativeImport(p.draft); expect(result).toMatchObject({ type: 'document_change_applied', alreadyApplied: true }); expect(root.snapshot()).toEqual(before); expect(loadCalls).toBe(count);
  if (result.type !== 'document_change_applied') throw new Error('Expected confirmed document receipt');
  expect(await confirmKnowledgeImportReceipt(p.proposal, async () => true)).toMatchObject({ appliedAt: result.appliedAt });
});
it('returns unconfirmed without writes or initialization when no receipt exists', async () => {
  const p = await prepare(), before = root.snapshot(); expect(await confirmKnowledgeImportReceipt(p.proposal, async () => true)).toMatchObject({ type: 'document_change_unconfirmed' }); expect(root.snapshot()).toEqual(before); expect(loadCalls).toBe(0);
});
it('keeps the last valid generation after an inactive-slot write failure', async () => {
  const p = await prepare(), before = await corpus(), dir = saved.dirs.get('other')!; const getFile = dir.getFileHandle.bind(dir); vi.spyOn(dir, 'getFileHandle').mockImplementation(async (name, options) => { const file = await getFile(name, options); if (name === 'vectors.b.bin' && options?.create) file.fault = stage => { if (stage === 'write') throw new Error('Synthetic disk failure'); }; return file; });
  await expect(commitKnowledgeImport(p.proposal, async () => true, runtime)).rejects.toMatchObject({ requiresReload: true }); expect(await corpus()).toEqual(before);
});
it('exposes Stop until the saving boundary and never cancels an accepted save', async () => {
  const p = await prepare(), job = beginKnowledgeImport(p.proposal); expect(stopKnowledgeImport(p.proposal)).toBe(true); expect(job.signal.aborted).toBe(true); job.close();
  const saving = beginKnowledgeImport(p.proposal); saving.progress({ stage: 'saving', total: 1 }); expect(stopKnowledgeImport(p.proposal)).toBe(false); expect(saving.signal.aborted).toBe(false); saving.close();
});
it('reads an empty target library without initializing its corpus or changing the active library', async () => {
  saved.dirs.delete('other'); const before = root.snapshot(), snapshot = await readCurrentKnowledgeImport(state.currentProfile, 'other'); expect(snapshot.documents).toEqual([]); expect(root.snapshot()).toEqual(before); const p = await prepare(); await applyNativeImport(p.draft); expect((await corpus()).state.manifest.docs).toHaveLength(1);
});
it('validates reviewed filenames and exact replacement selection again at commit', async () => {
  const p = await prepare(); expect(() => projectKnowledgeImport({ ...p.proposal, patch: JSON.stringify({ source: 'keep.md', text }) })).toThrow('already exists');
});

it('supersedes only a newer import of the same filename, retaining separate document proposals in one library', async () => {
 const first = await prepare(), separate = await prepare({source:'separate.md',text}), newer = await prepare();
 const messages = [{agentDrafts:[first.draft,separate.draft,newer.draft]}];
 supersedePendingDataProposals(messages);
 expect(first.draft?.status).toBe('superseded'); expect(separate.draft?.status).toBe('pending'); expect(newer.draft?.status).toBe('pending');
});

async function chosenProposal(names=['chosen.md'],replacement:string|null=null) {
 const owner={signal:new AbortController().signal,isCurrent:()=>true};
 const selected=await knowledgeFileInputs.select(names.map(name=>new TestFile([text.repeat(5)],name,{type:'text/markdown'}) as unknown as File),owner);
 const source=await readCurrentKnowledgeImport(state.currentProfile,'other');
 const proposal:AgentDataProposal={resource:'knowledgeImports',operation:'start',recordId:'other',baseline:JSON.stringify({version:2,source,selection:selected}),patch:JSON.stringify({input:'selectedFiles',replacementIds:names.map(()=>replacement)}),effectiveDate:'2026-10-26',recordedAt:Date.now(),reason:'The user chose these exact local files.',evidence:'Import the following text'};
 return {proposal,selected,files:knowledgeFileInputs.resolve(selected,owner)};
}
it('requests a native file step without initializing a model or granting a write',async()=>{
 const before=root.snapshot(),p=await prepare({input:'chooseFiles'});expect(p.reply.success,p.reply.contentItems[0].text).toBe(true);expect(projectKnowledgeImport(p.proposal).input).toBe('chooseFiles');
 await expect(applyChatDraft(p.draft)).rejects.toMatchObject({noChangeApplied:true});expect(loadCalls).toBe(0);expect(workers).toHaveLength(0);expect(root.snapshot()).toEqual(before);
});
it('rejects model-supplied selected-file tokens before reaching the private input owner',async()=>{
 const p=await prepare({input:'selectedFiles',replacementIds:[null]});expect(p.reply.success).toBe(false);expect(p.reply.contentItems[0].text).toContain('native file picker');expect(workers).toHaveLength(0);
});
it('indexes multiple chosen documents atomically without storing their contents in the proposal',async()=>{
 const p=await chosenProposal(['one.md','two.md']),before=await corpus(),profile=JSON.stringify(state.importedData),registry=saved.files.get(FILE_LIBRARIES)!.bytes.slice();
 expect(JSON.stringify(p.proposal)).not.toContain('Synthetic user supplied');expect(p.proposal.baseline).not.toContain(text);
 const reply=await commitKnowledgeImport(p.proposal,async()=>true,runtime,p.files),after=await corpus();expect(reply.type).toBe('document_change_applied');expect(after.revision).toBe(before.revision+1);expect(after.state.manifest.docs.map(d=>d.source)).toEqual(['old.md','keep.md','one.md','two.md']);expect(after.state.chunks.slice(0,2)).toEqual(before.state.chunks);expect(after.state.vectors.slice(0,model.dim*2)).toEqual(before.state.vectors);expect(JSON.stringify(state.importedData)).toBe(profile);expect(saved.files.get(FILE_LIBRARIES)!.bytes).toEqual(registry);
});
it('replaces the exact indexed document with differently named chosen content while retaining its identity',async()=>{
 const target=knowledgeDocumentId('other','old.md'),p=await chosenProposal(['replacement.txt'],target),before=await corpus();
 await commitKnowledgeImport(p.proposal,async()=>true,runtime,p.files);const after=await corpus();expect(after.state.manifest.docs.map(d=>d.source)).toEqual(['keep.md','old.md']);expect(after.state.manifest.docs[1]).toMatchObject({[DOCUMENT_ID_FIELD]:target,opaque:7});expect(after.state.chunks[0]).toEqual(before.state.chunks[1]);expect(after.state.vectors.slice(0,model.dim)).toEqual(before.state.vectors.slice(model.dim));
});
it('rejects substituted private text or renamed file inputs before any embedding/model call',async()=>{
 const p=await chosenProposal(),before=root.snapshot();await expect(commitKnowledgeImport(p.proposal,async()=>true,runtime,[{name:'chosen.md',text:'forged content'}])).rejects.toThrow();await expect(commitKnowledgeImport(p.proposal,async()=>true,runtime,[{...p.files[0],name:'renamed.md'}])).rejects.toThrow();expect(loadCalls).toBe(0);expect(root.snapshot()).toEqual(before);
});
it('checks chosen-file receipts without needing a surviving in-page source or replaying indexing',async()=>{
 const p=await chosenProposal();const savedReply=await commitKnowledgeImport(p.proposal,async()=>true,runtime,p.files);knowledgeFileInputs.clear();const before=root.snapshot(),calls=loadCalls;expect(await confirmKnowledgeImportReceipt(p.proposal,async()=>true)).toMatchObject({alreadyApplied:true,appliedAt:savedReply.appliedAt});expect(root.snapshot()).toEqual(before);expect(loadCalls).toBe(calls);
});
it('retains independent selected-file proposals and supersedes an entire batch on an overlapping newer filename',async()=>{
 const p=await chosenProposal(['one.md','two.md']),other=await chosenProposal(['different.md']),newer=await chosenProposal(['two.md']);
 const drafts=[p,other,newer].map((item,index)=>({id:String(index),kind:'data',status:'pending',profileId:state.currentProfile,payload:item.proposal}));supersedePendingDataProposals([{agentDrafts:drafts}]);expect(drafts.map(d=>d.status)).toEqual(['superseded','pending','pending']);
});
it('preflights exact persisted source sizes without double-counting the overwritten recovery slot',()=>{
 const mib=1024*1024,current=new Map<string,number|null>([['lib/vectors.a.bin',16*mib],['lib/vectors.b.bin',16*mib],['lib/chunks.a.json',12*mib],['lib/chunks.b.json',12*mib]]);
 expect(()=>assertKnowledgeSourceWriteBudget(current,new Map([['lib/vectors.b.bin',20*mib]]))).not.toThrow();
 expect(()=>assertKnowledgeSourceWriteBudget(current,new Map([['lib/vectors.b.bin',28*mib]]))).toThrow('recovery generation');
 expect(()=>assertKnowledgeSourceWriteBudget(new Map(),new Map([['lib/vectors.a.bin',knowledgeLibraryReadBudget.file+1]]))).toThrow('reviewed index size');
 expect(()=>assertKnowledgeSourceWriteBudget(new Map(),new Map([['_libraries-custom/vectors.a.bin',3*mib]]))).not.toThrow();
});
it('runs corpus write preflight before any file handle creation and leaves the previous snapshot untouched on rejection',async()=>{
 const before=await corpus(),directory=saved.dirs.get('other')!,snapshot=directory.snapshot();let called=false;
 await expect(writeCorpusSnapshot(directory,before.state,{activeSlot:before.slot,revision:before.revision,validateWrites:async writes=>{called=true;expect([...writes.keys()]).toEqual(['vectors.b.bin','chunks.b.json','manifest.b.json']);throw Object.assign(new Error('Too large'),{noChangeApplied:true});}})).rejects.toThrow('Too large');expect(called).toBe(true);expect(directory.snapshot()).toEqual(snapshot);expect(await corpus()).toEqual(before);
});
