import { readKnowledgeLibraryRegistry, readKnowledgeLibraryCorpus, publicKnowledgeLibrary, librarySourceDigest, librarySourceConflict } from './knowledge-library-source.js';
import type { KnowledgeLibraryIO } from './knowledge-library-source.js';
import { knowledgeDocumentRecords } from './knowledge-document-source.js';
import type { KnowledgeImportSnapshot } from './knowledge-import-model.js';
export async function readKnowledgeImportSource(io: KnowledgeLibraryIO, libraryId: string) {
  const registry = await readKnowledgeLibraryRegistry(io), library = registry?.libraries.find(row => row.id === libraryId);
  if (!registry || !library) throw librarySourceConflict();
  const corpus = await readKnowledgeLibraryCorpus(io, library), documents = knowledgeDocumentRecords(library, corpus);
  const revision = librarySourceDigest(JSON.stringify([...io.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => [path, bytes === null ? null : librarySourceDigest(bytes)])));
  const snapshot: KnowledgeImportSnapshot = { version: 1, scope: 'browser', revision, record: { ...publicKnowledgeLibrary(library, registry.activeId), documentCount: documents.length, chunkCount: corpus?.state.manifest.numChunks ?? 0 }, documents };
  return { registry, library, corpus, snapshot };
}
