// A cache hit must still identify the current saved active library/corpus.
import { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
import { openKnowledgeLibraryIO, readKnowledgeLibraryRegistry, readKnowledgeLibrarySource } from './knowledge-library-source.js';
export async function readLocalKnowledgeQuerySource() {
  if (!navigator.storage?.getDirectory || !navigator.locks?.request) throw new Error('Local Knowledge Base source verification is unavailable.');
  return navigator.locks.request(LENS_LOCAL_STORAGE_LOCK, async () => {
    const io = await openKnowledgeLibraryIO(), registry = await readKnowledgeLibraryRegistry(io); if (!registry) return null;
    const source = await readKnowledgeLibrarySource(io, registry.activeId, false, true), active = source.snapshot.active!;
    return { revision: source.snapshot.revision, libraryId: active.libraryId, name: active.name, numChunks: active.chunkCount!, numDocs: active.documentCount! };
  });
}
