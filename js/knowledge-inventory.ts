import { knowledgeDocumentId, DOCUMENT_ID_FIELD } from './knowledge-document-model.js';
// Exact metadata reads use existing saved OPFS generations, never worker init.
import { state } from './state.js';
import { readKnowledgeSettings } from './knowledge-settings.js';
import { LENS_CONFIG_STORAGE_KEY, readCommittedLensConfigRaw } from './lens-config-store.js';
import { DEFAULT_MODEL_KEY, MODELS } from './lens-local-embedder-config.js';
import { OPFS_SUBDIR, FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, isSafeLibraryId, readLatestCorpusSnapshot } from './lens-local-store.js';
import type { OpfsDirectory, LibraryRecord } from './lens-local-store.js';
export interface KnowledgeInventoryOptions { libraryId: string; query: string; offset: number; limit: number }
const MAX_FILE_BYTES = 32 * 1024 * 1024, MAX_TOTAL_BYTES = 64 * 1024 * 1024, MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const unavailable = (reason: string) => ({ available: false as const, reason });
function registry(raw: string) {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid registry');
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.libraries) || !row.libraries.length || !row.libraries.every(item => item && typeof item === 'object' && typeof item.id === 'string' && isSafeLibraryId(item.id) && typeof item.name === 'string' && item.name.length <= 4000 && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt > 0 && (item.model === undefined || typeof item.model === 'string'))) throw new Error('Invalid registry');
  const libraries = row.libraries as LibraryRecord[];
  if (new Set(libraries.map(item => item.id)).size !== libraries.length || typeof row.activeId !== 'string' || !libraries.some(item => item.id === row.activeId)) throw new Error('Invalid registry identities');
  const revision = row.revision === undefined ? 0 : row.revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new Error('Invalid registry revision');
  return { libraries, activeId: row.activeId, revision: Number(revision) };
}
export async function readKnowledgeInventory(options: KnowledgeInventoryOptions) {
  const profile = state.currentProfile, root = state.importedData, source = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
  const current = () => state.currentProfile === profile && state.importedData === root && localStorage.getItem(LENS_CONFIG_STORAGE_KEY) === source;
  let config;
  try { config = (await readKnowledgeSettings()).record; } catch { return unavailable('Review the saved Knowledge Base settings before reading its inventory.'); }
  const disclose = async <Result>(result: Result) => { await readCommittedLensConfigRaw(); return current() ? result : unavailable('The profile or Knowledge Base source changed during this read.'); };
  if (!current()) return unavailable('The profile or Knowledge Base source changed during this read.');
  if (!config.enabled) return unavailable('Knowledge Base disclosure is disabled. Its nonsecret preferences are available through knowledgeSettings.');
  if (config.backend !== 'in-browser') return unavailable('The external Knowledge Base connection exposes search, not a local library inventory.');
  if (!navigator.storage?.getDirectory) return unavailable('Local Knowledge Base inventory requires OPFS support in this browser.');
  if (options.libraryId && !isSafeLibraryId(options.libraryId)) return unavailable('Choose an exact listed library ID.');
  try {
    const directory = await navigator.storage.getDirectory(); if (!current()) return unavailable('The profile or Knowledge Base source changed during this read.');
    let saved: FileSystemDirectoryHandle;
    try { saved = await directory.getDirectoryHandle(OPFS_SUBDIR); }
    catch (error) { if (!missing(error)) throw error; if (!current()) return unavailable('The Knowledge Base source changed.'); if (options.libraryId) return unavailable('This saved library is no longer available.'); return await disclose({ available: true, scope: 'browser', metadataOnly: true, libraries: [], activeId: null, total: 0, nextOffset: null }); }
    const readRegistry = async (name: string) => {
      try { const file = await (await saved.getFileHandle(name)).getFile(); if (file.size > MAX_REGISTRY_BYTES) throw new Error('Registry exceeds read budget'); return registry(await file.text()); }
      catch (error) { if (missing(error) || error instanceof SyntaxError || error instanceof Error && error.message.startsWith('Invalid registry')) return null; throw error; }
    };
    const [primary, backup] = await Promise.all([readRegistry(FILE_LIBRARIES), readRegistry(FILE_LIBRARIES_BACKUP)]);
    const indexed = backup && (!primary || backup.revision > primary.revision) ? backup : primary;
    if (!indexed) return unavailable('Saved library metadata needs review in the native Knowledge Base workflow. Nothing was created or migrated.');
    if (primary && backup && primary.revision === backup.revision && JSON.stringify(primary) !== JSON.stringify(backup)) return unavailable('The saved library registries disagree. Review the native Knowledge Base before continuing.');
    if (!current()) return unavailable('The profile or Knowledge Base source changed during this read.');
    const base = { available: true, scope: 'browser', metadataOnly: true, activeId: indexed.activeId, registryRevision: indexed.revision, recoveryRequired: !primary || !backup || JSON.stringify(primary) !== JSON.stringify(backup) };
    if (!options.libraryId) {
      const libraries = indexed.libraries.filter(row => !options.query || row.name.toLowerCase().includes(options.query.toLowerCase()));
      return await disclose({ ...base, libraries: libraries.slice(options.offset, options.offset + options.limit).map(row => ({ libraryId: row.id, name: row.name, active: row.id === indexed.activeId, embeddingModel: (MODELS[row.model || DEFAULT_MODEL_KEY] || MODELS[DEFAULT_MODEL_KEY])!.label })), total: libraries.length, nextOffset: options.offset + options.limit < libraries.length ? options.offset + options.limit : null });
    }
    const library = indexed.libraries.find(row => row.id === options.libraryId); if (!library) return unavailable('This library is no longer in the saved registry.');
    let corpus: FileSystemDirectoryHandle;
    try { corpus = await saved.getDirectoryHandle(library.id); }
    catch (error) { if (!missing(error)) throw error; if (!current()) return unavailable('The Knowledge Base source changed.'); return await disclose({ ...base, libraryId: library.id, documents: [], total: 0, nextOffset: null }); }
    let readBytes = 0, readFailure: unknown = null, manifests = 0;
    const adapter: OpfsDirectory = { async getFileHandle(name) {
      try {
        const file = await (await corpus.getFileHandle(name)).getFile(); if (name.startsWith('manifest')) manifests++;
        readBytes += file.size; if (file.size > MAX_FILE_BYTES || readBytes > MAX_TOTAL_BYTES) throw new Error('Library exceeds the bounded metadata verification budget');
        const bytes = new Uint8Array(await file.arrayBuffer()); if (!current()) throw new Error('Knowledge Base source changed');
        return { async createSyncAccessHandle() { return { getSize: () => bytes.length, read(target, { at }) { const part = bytes.subarray(at, at + target.length); target.set(part); return part.length; }, truncate() { throw new Error('Readonly inventory'); }, write() { throw new Error('Readonly inventory'); }, flush() {}, close() {} }; } };
      } catch (error) { if (!missing(error)) readFailure = error; throw error; }
    } };
    const model = (MODELS[library.model || DEFAULT_MODEL_KEY] || MODELS[DEFAULT_MODEL_KEY])!, snapshot = await readLatestCorpusSnapshot(adapter, { dim: model.dim, modelId: model.id });
    if (readFailure) throw readFailure;
    if (!current()) return unavailable('The profile or Knowledge Base source changed during this read.');
    if (!snapshot && manifests) return unavailable('No complete saved corpus generation could be verified. Review the native Knowledge Base.');
    const documents = snapshot?.state.manifest.docs || [], counts = new Map<string, number>();
    for (const chunk of snapshot?.state.chunks || []) { if (typeof chunk.source !== 'string') throw new Error('Invalid saved chunk source'); counts.set(chunk.source, (counts.get(chunk.source) || 0) + 1); }
    if (new Set(documents.map(row => row.source)).size !== documents.length || documents.some(row => typeof row.source !== 'string' || row.source.length > 4000 || !Number.isSafeInteger(row.chunks) || row.chunks < 0 || row.chunks !== (counts.get(row.source) || 0) || row.hash != null && (typeof row.hash !== 'string' || row.hash.length > 256)) || [...counts.keys()].some(source => !documents.some(row => row.source === source))) return unavailable('The saved document inventory needs native review.');
    const matches = documents.filter(row => !options.query || row.source.toLowerCase().includes(options.query.toLowerCase()));
    return await disclose({ ...base, libraryId: library.id, corpusRevision: snapshot?.revision ?? 0, legacy: snapshot?.legacy ?? false, documents: matches.slice(options.offset, options.offset + options.limit).map(row => ({ documentId: knowledgeDocumentId(library.id, row.source, row[DOCUMENT_ID_FIELD]), source: row.source, chunks: row.chunks, hash: row.hash || null })), total: matches.length, nextOffset: options.offset + options.limit < matches.length ? options.offset + options.limit : null });
  } catch { return unavailable('The saved Knowledge Base inventory could not be verified within its read budget. Retry or review it in the native Knowledge Base. No data was changed.'); }
}
