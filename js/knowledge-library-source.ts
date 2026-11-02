// Exact bounded source proofs. No worker initialization, storage creation,
// migration or repair; only the returned public snapshot crosses the tool boundary.
import { sha256 } from '../vendor/sha256.js';
import { DEFAULT_MODEL_KEY, MODELS } from './lens-local-embedder-config.js';
import { OPFS_SUBDIR, FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, isSafeLibraryId, readBinaryFrom, readLatestCorpusSnapshot } from './lens-local-store.js';
import type { LibraryRecord, LibraryRegistry, OpfsDirectory, CorpusManifest, CorpusSnapshot } from './lens-local-store.js';
import type { LibraryDirectory } from './lens-local-library-registry.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
export const librarySourceDigest = (value: string | Uint8Array) => [...sha256(typeof value === 'string' ? new TextEncoder().encode(value) : value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const librarySourceConflict = () => Object.assign(new Error('The library or Knowledge Base source changed. Review a fresh proposal. Nothing was applied.'), { noChangeApplied: true as const });
export function knowledgeLibraryCommandIdentity(proposal: AgentDataProposal) {
  const intent = librarySourceDigest(JSON.stringify({ resource: proposal.resource, operation: proposal.operation, recordId: proposal.recordId, baseline: proposal.baseline, patch: proposal.patch, recordedAt: proposal.recordedAt }));
  return { id: librarySourceDigest(`knowledge-library-command:${intent}`), intent };
}
const needsReview = () => new Error('Saved Knowledge Base data needs review in the native workflow. Nothing was changed.');
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const MAX_FILE = 32 * 1024 * 1024, MAX_TOTAL = 64 * 1024 * 1024, MAX_REGISTRY = 2 * 1024 * 1024;
export const knowledgeLibraryReadBudget = Object.freeze({file:MAX_FILE,total:MAX_TOTAL,registry:MAX_REGISTRY});
export function assertKnowledgeSourceWriteBudget(current:ReadonlyMap<string,number|null>,planned:ReadonlyMap<string,number>) {
  const after=new Map(current);for(const [name,size] of planned)after.set(name,size);
  let total=0;for(const [name,size] of after){if(size===null)continue;const limit=name===FILE_LIBRARIES||name===FILE_LIBRARIES_BACKUP?MAX_REGISTRY:MAX_FILE;if(!Number.isSafeInteger(size)||size<0||size>limit)throw Object.assign(new Error('This selection would exceed the supported reviewed index size. Choose fewer or smaller documents.'),{noChangeApplied:true});total+=size;}
  if(total>MAX_TOTAL)throw Object.assign(new Error('This selection and its recovery generation would exceed the supported reviewed index size. Choose a smaller selection.'),{noChangeApplied:true});
}
const CORPUS_FILES = ['manifest.a.json', 'manifest.b.json', 'vectors.a.bin', 'vectors.b.bin', 'chunks.a.json', 'chunks.b.json', 'manifest.json', 'vectors.bin', 'chunks.json'];
export interface KnowledgeLibraryRecord { libraryId: string; name: string; modelKey: string; modelLabel: string; active: boolean; documentCount?: number; chunkCount?: number }
export interface KnowledgeLibrarySnapshot { version: 1; scope: 'browser'; revision: string; configuration?: string; record: KnowledgeLibraryRecord | null; active: KnowledgeLibraryRecord | null; next: KnowledgeLibraryRecord | null; replacementId: string | null }
export interface KnowledgeLibraryIO {
  directory: LibraryDirectory | null;
  files: Map<string, Uint8Array | null>;
  read(path: readonly string[]): Promise<Uint8Array | null>;
  directoryExists(id: string): Promise<boolean>;
}
export async function openKnowledgeLibraryIO(sync = false): Promise<KnowledgeLibraryIO> {
  const root = await navigator.storage.getDirectory(); let saved: FileSystemDirectoryHandle | null;
  try { saved = await root.getDirectoryHandle(OPFS_SUBDIR); } catch (error) { if (!missing(error)) throw needsReview(); saved = null; }
  const files = new Map<string, Uint8Array | null>(); let total = 0;
  return {
    directory: saved as unknown as LibraryDirectory | null, files,
    async directoryExists(id) {
      if (!isSafeLibraryId(id)) throw needsReview(); if (!saved) return false;
      try { await saved.getDirectoryHandle(id); return true; } catch (error) { if (missing(error)) return false; throw needsReview(); }
    },
    async read(path) {
      const key = path.join('/'); if (files.has(key)) return files.get(key)!;
      if (!saved) { files.set(key, null); return null; }
      try {
        let directory = saved; for (const segment of path.slice(0, -1)) { if (!isSafeLibraryId(segment)) throw needsReview(); directory = await directory.getDirectoryHandle(segment); }
        const filename = path.at(-1)!; if (![FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, ...CORPUS_FILES].includes(filename)) throw needsReview();
        const limit = Math.min(filename.startsWith('_libraries') ? MAX_REGISTRY : MAX_FILE, MAX_TOTAL - total);
        let bytes: Uint8Array;
        if (sync) bytes = new Uint8Array(await readBinaryFrom(directory as unknown as OpfsDirectory, filename, limit));
        else { const file = await (await directory.getFileHandle(filename)).getFile(); if (file.size > limit) throw needsReview(); bytes = new Uint8Array(await file.arrayBuffer()); }
        total += bytes.length; files.set(key, bytes); return bytes;
      } catch (error) { if (missing(error)) { files.set(key, null); return null; } throw needsReview(); }
    },
  };
}
function parseRegistry(bytes: Uint8Array | null): LibraryRegistry | null {
  if (bytes === null) return null;
  let value: unknown; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw needsReview(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw needsReview();
  const row = value as LibraryRegistry;
  if (!Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision >= Number.MAX_SAFE_INTEGER || !Array.isArray(row.libraries) || row.libraries.length < 1 || !row.libraries.every(library => library && typeof library === 'object' && isSafeLibraryId(library.id) && typeof library.name === 'string' && !!library.name.trim() && library.name.length <= 4000 && Number.isFinite(library.createdAt) && library.createdAt > 0 && typeof library.model === 'string' && Object.hasOwn(MODELS, library.model)) || new Set(row.libraries.map(library => library.id)).size !== row.libraries.length || !row.libraries.some(library => library.id === row.activeId)) throw needsReview();
  return row;
}
export async function readKnowledgeLibraryRegistry(io: KnowledgeLibraryIO, allowRecovery = false) {
  const primary = await io.read([FILE_LIBRARIES]), backup = await io.read([FILE_LIBRARIES_BACKUP]);
  if (!io.directory && !primary && !backup) return null;
  const parse = (bytes: Uint8Array | null) => { try { return parseRegistry(bytes); } catch (error) { if (allowRecovery) return null; throw error; } };
  const left = parse(primary), right = parse(backup);
  if (allowRecovery) {
    if (left && right && left.revision === right.revision && librarySourceDigest(primary!) !== librarySourceDigest(backup!)) throw needsReview();
    const selected = right && (!left || right.revision > left.revision) ? right : left;
    if (!selected) throw needsReview(); return selected;
  }
  if (!left || !right || librarySourceDigest(primary!) !== librarySourceDigest(backup!)) throw needsReview();
  return left;
}
export function publicKnowledgeLibrary(library: LibraryRecord, activeId: string): KnowledgeLibraryRecord {
  return { libraryId: library.id, name: library.name, modelKey: library.model!, modelLabel: MODELS[library.model!]!.label, active: library.id === activeId };
}
export async function readKnowledgeLibraryCorpus(io: KnowledgeLibraryIO, library: LibraryRecord): Promise<CorpusSnapshot | null> {
  const bytes = new Map<string, Uint8Array | null>();
  for (const name of CORPUS_FILES) bytes.set(name, await io.read([library.id, name]));
  const adapter: OpfsDirectory = { async getFileHandle(name) {
    const source = bytes.get(name); if (!source) throw new DOMException('Missing corpus file', 'NotFoundError');
    return { async createSyncAccessHandle() { return { getSize: () => source.length, read(target, { at }) { const part = source.subarray(at, at + target.length); target.set(part); return part.length; }, truncate() { throw needsReview(); }, write() { throw needsReview(); }, flush() {}, close() {} }; } };
  } };
  const model = MODELS[library.model!]!; const snapshot = await readLatestCorpusSnapshot(adapter, { dim: model.dim, modelId: model.id });
  if (!snapshot && [...bytes.values()].some(value => value !== null)) throw needsReview();
  return snapshot;
}
export async function readKnowledgeLibrarySource(io: KnowledgeLibraryIO, libraryId: string, create = false, query = false) {
  if (!isSafeLibraryId(libraryId)) throw needsReview();
  const registry = await readKnowledgeLibraryRegistry(io), rows = registry?.libraries ?? [];
  const selected = rows.find(row => row.id === libraryId) ?? null, active = rows.find(row => row.id === registry?.activeId) ?? null;
  if (create && (selected || await io.directoryExists(libraryId))) throw librarySourceConflict();
  const next = !query && selected && selected.id === active?.id ? rows.find(row => row.id !== selected.id) ?? null : null;
  const records = new Map<string, KnowledgeLibraryRecord>(), manifests = new Map<string, CorpusManifest | null>();
  for (const row of [selected, active, next]) if (row && !records.has(row.id)) { const manifest = (await readKnowledgeLibraryCorpus(io, row))?.state.manifest ?? null; manifests.set(row.id, manifest); records.set(row.id, { ...publicKnowledgeLibrary(row, registry!.activeId), documentCount: manifest?.docs.length ?? 0, chunkCount: manifest?.numChunks ?? 0 }); }
  const revision = librarySourceDigest(JSON.stringify([...io.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => [path, bytes === null ? null : librarySourceDigest(bytes)])));
  const snapshot: KnowledgeLibrarySnapshot = { version: 1, scope: 'browser', revision, record: selected ? records.get(selected.id)! : null, active: active ? records.get(active.id)! : null, next: next ? records.get(next.id)! : null,
    replacementId: selected && rows.length === 1 ? `lib-${librarySourceDigest(`replacement:${revision}:${selected.id}`).slice(0, 40)}` : null };
  return { registry, snapshot, manifests };
}
export async function verifyKnowledgeLibraryExpectation(expected: { expectedLibraryId?: string; expectedSourceRevision?: string }) {
  if (!expected.expectedLibraryId && !expected.expectedSourceRevision) return;
  const io = await openKnowledgeLibraryIO(true), registry = await readKnowledgeLibraryRegistry(io, !expected.expectedSourceRevision);
  if (!registry || expected.expectedLibraryId && registry.activeId !== expected.expectedLibraryId) throw librarySourceConflict();
  if (expected.expectedSourceRevision) {
    const source = await readKnowledgeLibrarySource(io, registry.activeId, false, true);
    if (source.snapshot.revision !== expected.expectedSourceRevision) throw librarySourceConflict();
  }
}
export { DEFAULT_MODEL_KEY };
