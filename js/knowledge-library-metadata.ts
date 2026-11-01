// Native display metadata from verified saved bytes; no embedding initialization.
import { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
import { MODELS } from './lens-local-embedder-config.js';
import { openKnowledgeLibraryIO, readKnowledgeLibraryRegistry, readKnowledgeLibrarySource } from './knowledge-library-source.js';
import type { LibraryRecord } from './lens-local-store.js';
import type { StatsReply } from './lens-local-protocol.js';
export interface KnowledgeLibraryUiState { libraries: LibraryRecord[]; activeId: string; activeName: string; modelLabel: string; revision: string; stats: Omit<StatsReply, 'type'> }
export async function readKnowledgeLibraryMetadata(): Promise<KnowledgeLibraryUiState | null> {
  if (!navigator.locks?.request) throw new Error('Library metadata requires browser-wide storage locking.');
  return navigator.locks.request(LENS_LOCAL_STORAGE_LOCK, async () => {
    const io = await openKnowledgeLibraryIO(), registry = await readKnowledgeLibraryRegistry(io); if (!registry) return null;
    const source = await readKnowledgeLibrarySource(io, registry.activeId, false, true), active = source.snapshot.active!, manifest = source.manifests.get(active.libraryId), model = MODELS[active.modelKey]!;
    return { libraries: registry.libraries.map(({ id, name, model, createdAt }) => ({ id, name, model, createdAt })), activeId: registry.activeId, activeName: active.name, modelLabel: active.modelLabel, revision: source.snapshot.revision,
      stats: { total_chunks: active.chunkCount!, documents: manifest?.docs.map(row => ({ source: row.source, chunks: row.chunks })) ?? [], dim: model.dim, model: model.id, backend: 'not-loaded', ms_per_embed: null } };
  });
}
