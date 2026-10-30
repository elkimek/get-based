// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn<(hint: unknown, options?: Record<string, unknown>) => Promise<{ chunks: Array<{ text: string; source: string; score: number }>; sourceName: string }>>(), rewrite: vi.fn<(request: unknown) => Promise<{ text: string }>>() }));
vi.mock('../js/lens-local.js', async original => ({ ...await original<typeof import('../js/lens-local.js')>(), queryLensLocal: mocks.query }));
vi.mock('../js/ai-feature-routing.js', async original => ({ ...await original<typeof import('../js/ai-feature-routing.js')>(), callAssistantFeatureAI: mocks.rewrite, hasAssistantFeatureProvider: () => true }));
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import * as lens from '../js/lens.js';
import { FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, writeCorpusSnapshot } from '../js/lens-local-store.js';
import { DEFAULT_MODEL_KEY, MODELS } from '../js/lens-local-embedder-config.js';
import { KnowledgeMemoryDirectory, knowledgeTestLocks } from './helpers/knowledge-library-opfs.js';
import { setBlob } from '../js/blob-storage.js';
import { LENS_CONFIG_COMMIT_KEY } from '../js/lens-config-store.js';
const origin = { profile: state.currentProfile, data: state.importedData };
let root: KnowledgeMemoryDirectory, saved: KnowledgeMemoryDirectory, locks: ReturnType<typeof knowledgeTestLocks>;
const rawRegistry = () => JSON.parse(new TextDecoder().decode(saved.files.get(FILE_LIBRARIES)!.bytes));
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
async function corpus(id: string, text: string) {
  const directory = await saved.getDirectoryHandle(id, { create: true }), model = MODELS[DEFAULT_MODEL_KEY]!;
  await writeCorpusSnapshot(directory, { manifest: { dim: model.dim, modelId: model.id, numChunks: 1, docs: [{ source: `${id}.md`, chunks: 1 }] }, vectors: new Float32Array(model.dim), chunks: [{ text, source: `${id}.md` }] });
}
async function active(id: string) { await locks.request('getbased-knowledge-local-storage', () => { const registry = { ...rawRegistry(), activeId: id, revision: rawRegistry().revision + 1 }; for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, registry); }); }
beforeEach(async () => {
  root = new KnowledgeMemoryDirectory(); saved = await root.getDirectoryHandle('lens-local', { create: true }); locks = knowledgeTestLocks();
  const registry = { revision: 1, updatedAt: 1, activeId: 'default', libraries: [{ id: 'default', name: 'Alpha notes', createdAt: 1, model: DEFAULT_MODEL_KEY }, { id: 'second', name: 'Beta notes', createdAt: 2, model: DEFAULT_MODEL_KEY }, { id: 'empty', name: 'Empty notes', createdAt: 3, model: DEFAULT_MODEL_KEY }] };
  for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) saved.json(name, registry); await corpus('default', 'private-alpha'); await corpus('second', 'private-beta');
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root }, locks }); vi.stubGlobal('Worker', vi.fn(function () { throw new Error('Embedding transport is mocked in these source-fence tests'); })); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network must not run'); }));
  state.currentProfile = `query-${crypto.randomUUID()}`; localStorage.setItem('labcharts-active-profile', state.currentProfile); state.importedData = createDefaultProfileData();
  lens.clearLensCache(); lens._resetRewriteCache(); lens.saveLensConfig({ enabled: true, backend: 'in-browser', name: 'Display alias', multiQuery: false }); localStorage.setItem('labcharts-lens-local-count', '0');
  mocks.query.mockReset(); mocks.query.mockImplementation(async () => { const id = rawRegistry().activeId; return { chunks: [{ text: id === 'default' ? 'alpha-result' : 'beta-result', source: `${id}.md`, score: 1 }], sourceName: 'Transport label is not the source identity' }; });
  mocks.rewrite.mockReset(); mocks.rewrite.mockResolvedValue({ text: 'sleep question\nbetter rest\nnight time habits' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.removeItem('labcharts-lens-config'); state.currentProfile = origin.profile; state.importedData = origin.data; });
it('uses saved source proofs before cache lookup, bypasses a stale zero count, and never reuses another active library’s cached excerpts', async () => {
  expect(lens.hasLens()).toBe(false); expect(lens.canQueryLens()).toBe(true);
  await expect(lens.queryLens('sleep')).resolves.toMatchObject({ sourceName: 'Alpha notes', chunks: [{ text: 'alpha-result' }] });
  await expect(lens.queryLens('sleep')).resolves.toMatchObject({ sourceName: 'Alpha notes' }); expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.query.mock.calls[0]![1]).toMatchObject({ expectedLibraryId: 'default', expectedSourceRevision: expect.stringMatching(/^[a-f0-9]{64}$/) });
  await active('second');
  await expect(lens.queryLens('sleep')).resolves.toMatchObject({ sourceName: 'Beta notes', chunks: [{ text: 'beta-result' }] }); expect(mocks.query).toHaveBeenCalledTimes(2); expect(fetch).not.toHaveBeenCalled(); expect(Worker).not.toHaveBeenCalled();
});
it('invalidates cached excerpts when the active corpus changes without a registry edit', async () => {
  await lens.queryLens('sleep'); const registry = rawRegistry(); await locks.request('getbased-knowledge-local-storage', () => corpus('default', 'changed-private-alpha'));
  mocks.query.mockResolvedValue({ chunks: [{ text: 'updated-result', source: 'default.md', score: 1 }], sourceName: 'unused' });
  await expect(lens.queryLens('sleep')).resolves.toMatchObject({ chunks: [{ text: 'updated-result' }] }); expect(rawRegistry()).toEqual(registry); expect(mocks.query).toHaveBeenCalledTimes(2);
});
it.each(['source', 'disabled', 'profile', 'root'] as const)('withholds an in-flight result after its %s changes', async change => {
  const started = gate(), finish = gate(); mocks.query.mockImplementationOnce(async () => { started.resolve(); await finish.promise; return { chunks: [{ text: 'old-result', source: 'default.md', score: 1 }], sourceName: 'old' }; });
  const pending = lens.queryLens('sleep'); await started.promise;
  if (change === 'source') await active('second');
  if (change === 'disabled') await setBlob(LENS_CONFIG_COMMIT_KEY, { version: 1, id: 'peer-query-disable', raw: JSON.stringify({ ...lens.getLensConfig(), enabled: false }) });
  if (change === 'profile') state.currentProfile = 'other-query-profile';
  if (change === 'root') state.importedData = createDefaultProfileData();
  finish.resolve(); await expect(pending).resolves.toBeNull();
});
it('keeps a display-alias refresh from invalidating a query whose actual library and disclosure source remain unchanged', async () => {
  const started = gate(), finish = gate(); mocks.query.mockImplementationOnce(async () => { started.resolve(); await finish.promise; return { chunks: [{ text: 'alpha-result', source: 'default.md', score: 1 }], sourceName: 'unused' }; });
  const pending = lens.queryLens('sleep'); await started.promise; lens.saveLensConfig({ name: 'Updated display alias' }); finish.resolve();
  await expect(pending).resolves.toMatchObject({ sourceName: 'Alpha notes', chunks: [{ text: 'alpha-result' }] });
});
it('does not rewrite or initialize a model for an empty local source even if the advisory count is stale and positive', async () => {
  await active('empty'); lens.saveLensConfig({ multiQuery: true }); localStorage.setItem('labcharts-lens-local-count', '99');
  await expect(lens.queryLensMulti('tell me about better sleep')).resolves.toBeNull(); expect(mocks.rewrite).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled(); expect(Worker).not.toHaveBeenCalled();
});
it('stops multi-query retrieval before dispatch when the active source changes during rewriting', async () => {
  const started = gate(), finish = gate(); lens.saveLensConfig({ multiQuery: true }); mocks.rewrite.mockImplementationOnce(async () => { started.resolve(); await finish.promise; return { text: 'sleep details\nresting habits\nnight time' }; });
  const pending = lens.queryLensMulti('tell me about better sleep'); await started.promise; await active('second'); finish.resolve();
  await expect(pending).resolves.toBeNull(); expect(mocks.query).not.toHaveBeenCalled(); expect(JSON.stringify(mocks.rewrite.mock.calls)).not.toMatch(/private-alpha|private-beta/);
});
it('preserves the caller’s exact Stop reason after a local retrieval returns', async () => {
  const started = gate(), finish = gate(), controller = new AbortController(), reason = new Error('Synthetic exact Stop reason'); mocks.query.mockImplementationOnce(async () => { started.resolve(); await finish.promise; return { chunks: [], sourceName: 'unused' }; });
  const pending = lens.queryLens('sleep', { signal: controller.signal }); const rejected = expect(pending).rejects.toBe(reason); await started.promise; controller.abort(reason); finish.resolve(); await rejected;
});
