import { createHash } from 'node:crypto';
// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { saveLensConfig } from '../js/lens.js';
import * as lens from '../js/lens.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { writeCorpusSnapshot } from '../js/lens-local-store.js';
import { setBlob } from '../js/blob-storage.js';
import * as blobStorage from '../js/blob-storage.js';
import { LENS_CONFIG_COMMIT_KEY } from '../js/lens-config-store.js';
import { DEFAULT_MODEL_KEY, MODELS } from '../js/lens-local-embedder-config.js';
import type { OpfsSyncHandle } from '../js/lens-local-store.js';
class MemoryFile {
  bytes = new Uint8Array(0); reportedSize?: number;
  async getFile() { const bytes = this.bytes.slice(); return { size: this.reportedSize ?? bytes.length, text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer } as File; }
  async createSyncAccessHandle(): Promise<OpfsSyncHandle> { return {
    getSize: () => this.bytes.length, read: (target, { at }) => { const part = this.bytes.subarray(at, at + target.length); target.set(part); return part.length; },
    truncate: size => { const next = new Uint8Array(size); next.set(this.bytes.subarray(0, size)); this.bytes = next; },
    write: (source, { at }) => { const next = new Uint8Array(Math.max(this.bytes.length, at + source.length)); next.set(this.bytes); next.set(source, at); this.bytes = next; return source.length; }, flush() {}, close() {},
  }; }
}
class Directory {
  files = new Map<string, MemoryFile>(); dirs = new Map<string, Directory>(); readonly = false; accesses: string[] = []; hook?: () => void;
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    this.accesses.push(`dir:${name}:${!!options?.create}`); this.hook?.(); if (this.readonly && options?.create) throw new Error('Unexpected create');
    if (!this.dirs.has(name)) { if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); this.dirs.set(name, new Directory()); } return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    this.accesses.push(`file:${name}:${!!options?.create}`); this.hook?.(); if (this.readonly && options?.create) throw new Error('Unexpected create');
    if (!this.files.has(name)) { if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); this.files.set(name, new MemoryFile()); } return this.files.get(name)!;
  }
  json(name: string, value: unknown) { const file = new MemoryFile(); file.bytes = new TextEncoder().encode(JSON.stringify(value)); this.files.set(name, file); }
}
const origin = { profile: state.currentProfile, data: state.importedData };
let root: Directory, saved: Directory, corpus: Directory, worker: ReturnType<typeof vi.fn>, fetcher: ReturnType<typeof vi.fn>;
const configKey = 'labcharts-lens-config';
const nativeRegistry = () => ({ activeId: 'default', revision: 1, updatedAt: 1, libraries: [{ id: 'default', name: 'My research', model: DEFAULT_MODEL_KEY, createdAt: 1 }, { id: 'empty', name: 'Empty library', model: DEFAULT_MODEL_KEY, createdAt: 2 }] });
const tools = () => createAgentToolRuntime({ readContext: () => '', ...createBrowserAgentToolDependencies(state.currentProfile) });
// Preserve native metadata owner checks without exposing a model inventory tool.
async function read(options: object = {}) {
  const data = await createBrowserAgentToolDependencies(state.currentProfile).readKnowledge({ libraryId: '', query: '', offset: 0, limit: 10, ...options }) as { available?: boolean };
  const text = JSON.stringify(data), result = { success: data.available !== false, contentItems: [{ text }] };
  return { result, text, data: result.success ? JSON.parse(text) : null };
}
beforeEach(async () => {
  state.currentProfile = 'knowledge-inventory'; state.importedData = createDefaultProfileData(); root = new Directory(); saved = await root.getDirectoryHandle('lens-local', { create: true }); corpus = await saved.getDirectoryHandle('default', { create: true }); saved.json('_libraries.json', nativeRegistry()); saved.json('_libraries.backup.json', nativeRegistry());
  const model = MODELS[DEFAULT_MODEL_KEY]!;
  await writeCorpusSnapshot(corpus, { manifest: { dim: model.dim, modelId: model.id, numChunks: 2, docs: [{ source: 'report.md', chunks: 1, hash: 'reported-hash' }, { source: 'notes.txt', chunks: 1 }] }, vectors: new Float32Array(model.dim * 2), chunks: [{ source: 'report.md', text: 'private-chunk-sentinel' }, { source: 'notes.txt', text: 'another-private-chunk-sentinel' }] });
  root.readonly = saved.readonly = corpus.readonly = true; root.accesses = []; saved.accesses = []; corpus.accesses = [];
  worker = vi.fn(function () { throw new Error('Worker must not start'); }); fetcher = vi.fn(async () => { throw new Error('Network must not run'); }); vi.stubGlobal('Worker', worker); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn(async () => root) } }); saveLensConfig({ backend: 'in-browser', enabled: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.removeItem(configKey); state.currentProfile = origin.profile; state.importedData = origin.data; });
it('lists exact saved libraries without a worker, network, migration, persistence request or writes', async () => {
  const before = [...saved.files].map(([name, file]) => [name, [...file.bytes]]), result = await read(); expect(result.result.success, result.text).toBe(true); expect(result.data).toMatchObject({ scope: 'browser', metadataOnly: true, registryRevision: 1, activeId: 'default', total: 2 }); expect(result.data.libraries.map((row: { libraryId: string }) => row.libraryId)).toEqual(['default', 'empty']); expect(corpus.accesses).toEqual([]); expect([...saved.files].map(([name, file]) => [name, [...file.bytes]])).toEqual(before); expect(worker).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled(); expect([...root.accesses, ...saved.accesses]).not.toContainEqual(expect.stringMatching(/:true$/));
});
it('withholds opaque registry and library metadata while preserving it byte for byte', async () => {
  const registry = { ...nativeRegistry(), extension: 'private-registry-sentinel', libraries: nativeRegistry().libraries.map(row => ({ ...row, source: 'private-library-sentinel' })) };
  saved.json('_libraries.json', registry); saved.json('_libraries.backup.json', registry); const before = [...saved.files].map(([name, file]) => [name, [...file.bytes]]);
  const result = await read(); expect(result.result.success, result.text).toBe(true); expect(result.text).not.toMatch(/private-registry-sentinel|private-library-sentinel/); expect([...saved.files].map(([name, file]) => [name, [...file.bytes]])).toEqual(before);
});
it('withholds an in-flight document inventory after a peer durably disables disclosure before the Storage event arrives', async () => {
  await lens.commitLensConfig({ enabled: true }); const config = JSON.parse(localStorage.getItem(configKey)!); let release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(navigator.storage.getDirectory).mockImplementationOnce(async () => { entered(); await gate; return root as unknown as FileSystemDirectoryHandle; });
  const pending = read({ libraryId: 'default' }); await started;
  try { await setBlob(LENS_CONFIG_COMMIT_KEY, { version: 1, id: 'peer-disables-inventory', raw: JSON.stringify({ ...config, enabled: false }) }); } finally { release(); }
  const result = await pending; expect(result.result.success).toBe(false); expect(result.text).not.toMatch(/private-chunk-sentinel|report\.md|notes\.txt/); expect(worker).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it('does not dispatch a search from a stale enabled Storage snapshot after a peer disables retrieval', async () => {
  await lens.commitLensConfig({ enabled: true }); const config = JSON.parse(localStorage.getItem(configKey)!);
  await setBlob(LENS_CONFIG_COMMIT_KEY, { version: 1, id: 'peer-disables-search', raw: JSON.stringify({ ...config, enabled: false }) });
  const result = await tools().execute({ tool: 'getbased_search_knowledge', arguments: { query: 'Synthetic private query' } }); expect(result.success).toBe(false); expect(fetcher).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
});
it('withholds an unreadable optional Knowledge Base without blocking ordinary chat and preserves user aborts', async () => {
  vi.spyOn(blobStorage, 'getBlob').mockRejectedValue(new Error('Synthetic settings storage unavailable'));
  await expect(lens.queryLens('Synthetic private query')).resolves.toBeNull(); await expect(lens.queryLensMulti('Another synthetic private query')).resolves.toBeNull(); expect(fetcher).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
  const controller = new AbortController(); controller.abort(); await expect(lens.queryLens('Aborted', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
});
it('lists document metadata from the same checksum-verified generation as the native reader', async () => {
  const result = await read({ libraryId: 'default' }); expect(result.result.success, result.text).toBe(true); const documentId = (source: string) => `doc-${createHash('sha256').update('default').digest('hex').slice(0, 32)}-${createHash('sha256').update(source).digest('hex')}`; expect(result.data.documents).toEqual([{ documentId: documentId('report.md'), source: 'report.md', chunks: 1, hash: 'reported-hash' }, { documentId: documentId('notes.txt'), source: 'notes.txt', chunks: 1, hash: null }]); expect(result.data.corpusRevision).toBe(1); expect(result.text).not.toMatch(/private-chunk-sentinel|vectors|text/); expect(worker).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it('filters and paginates metadata without using a retrieval model', async () => {
  const first = await read({ limit: 1 }); expect(first.data.nextOffset).toBe(1); const next = await read({ offset: 1, limit: 1 }); expect(next.data.libraries[0].libraryId).toBe('empty'); expect(next.data.nextOffset).toBeNull(); const match = await read({ libraryId: 'default', query: 'REPORT' }); expect(match.data.documents).toHaveLength(1); expect(match.data.documents[0].source).toBe('report.md'); expect(worker).not.toHaveBeenCalled();
});
it.each([{ enabled: false }, { backend: 'external-server' }])('does not open OPFS for disabled or external connections: %j', async change => {
  saveLensConfig(change); const result = await read(); expect(result.result.success).toBe(false); expect(navigator.storage.getDirectory).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it('returns an empty inventory on a fresh origin without creating its store', async () => {
  root.dirs.clear(); const result = await read(); expect(result.result.success).toBe(true); expect(result.data.libraries).toEqual([]); expect(root.dirs.size).toBe(0); expect(root.accesses).toEqual(['dir:lens-local:false']);
});
it('uses a newer committed backup registry without repairing the primary', async () => {
  const backup = { ...nativeRegistry(), revision: 2, libraries: nativeRegistry().libraries.map(row => ({ ...row, name: row.id === 'default' ? 'Renamed research' : row.name })) }; saved.json('_libraries.backup.json', backup); const before = saved.files.get('_libraries.json')!.bytes.slice(); const result = await read(); expect(result.result.success).toBe(true); expect(result.data.recoveryRequired).toBe(true); expect(result.data.libraries[0].name).toBe('Renamed research'); expect(saved.files.get('_libraries.json')!.bytes).toEqual(before);
});
it('refuses conflicting registries and malformed identities without inventing metadata', async () => {
  saved.json('_libraries.backup.json', { ...nativeRegistry(), libraries: [{ ...nativeRegistry().libraries[0], name: 'Conflict' }] }); expect((await read()).result.success).toBe(false);
  saved.json('_libraries.json', { ...nativeRegistry(), libraries: [{ ...nativeRegistry().libraries[0], id: '../unsafe' }] }); saved.files.delete('_libraries.backup.json'); expect((await read()).result.success).toBe(false); expect(root.dirs.size).toBe(1);
});
it.each(['../unsafe', 'default/../../', 'missing'])('never reads an unlisted or unsafe library path: %s', async libraryId => {
  const result = await read({ libraryId }); expect(result.result.success).toBe(false); expect(saved.accesses.some(name => name.startsWith('dir:'))).toBe(false);
});
it('returns the previous complete corpus when the newer generation has corrupted bytes', async () => {
  corpus.readonly = false; const model = MODELS[DEFAULT_MODEL_KEY]!; await writeCorpusSnapshot(corpus, { manifest: { dim: model.dim, modelId: model.id, numChunks: 1, docs: [{ source: 'corrupt-new.md', chunks: 1 }] }, vectors: new Float32Array(model.dim), chunks: [{ source: 'corrupt-new.md', text: 'new private text' }] }, { activeSlot: 'a', revision: 1 }); corpus.files.get('vectors.b.bin')!.bytes[0] = corpus.files.get('vectors.b.bin')!.bytes[0]! ^ 1; corpus.readonly = true;
  const result = await read({ libraryId: 'default' }); expect(result.result.success, result.text).toBe(true); expect(result.data.corpusRevision).toBe(1); expect(result.text).not.toContain('corrupt-new.md');
});
it('does not turn a corrupt or oversized corpus into a successful empty document list', async () => {
  corpus.files.get('vectors.a.bin')!.bytes[0] = corpus.files.get('vectors.a.bin')!.bytes[0]! ^ 1; expect((await read({ libraryId: 'default' })).result.success).toBe(false); corpus.files.get('vectors.a.bin')!.reportedSize = 33 * 1024 * 1024; expect((await read({ libraryId: 'default' })).result.success).toBe(false);
});
it.each(['profile', 'root', 'configuration'])('withholds metadata when its %s owner retires during the read', async mode => {
  saved.hook = () => { if (mode === 'profile') state.currentProfile = 'replacement'; else if (mode === 'root') state.importedData = createDefaultProfileData(); else saveLensConfig({ enabled: false }); };
  const result = await read(); expect(result.result.success).toBe(false); expect(result.text).not.toMatch(/My research|report.md|notes.txt/); expect(worker).not.toHaveBeenCalled();
});

it('does not treat an exact library lookup on an empty origin as a successful inventory', async () => { root.dirs.clear(); expect((await read({ libraryId: 'default' })).result.success).toBe(false); expect(root.dirs.size).toBe(0); });
it.each(['profile', 'root', 'configuration'])('withholds late retrieval chunks after %s retirement', async mode => {
  vi.spyOn(lens, 'queryLensMulti').mockImplementationOnce(async () => {
    if (mode === 'profile') state.currentProfile = 'replacement'; else if (mode === 'root') state.importedData = createDefaultProfileData(); else saveLensConfig({ enabled: false });
    return { sourceName: 'Private source title', chunks: [{ source: 'notes.md', text: 'late-private-chunk-sentinel' }] };
  });
  const result = await tools().execute({ tool: 'getbased_search_knowledge', arguments: { query: 'Synthetic question' } }); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/late-private-chunk-sentinel|Private source title/);
});
