// Verified native corpus generations; public records contain metadata only.
import { librarySourceDigest, readKnowledgeLibraryRegistry, readKnowledgeLibraryCorpus, librarySourceConflict } from './knowledge-library-source.js';
import type { KnowledgeLibraryIO } from './knowledge-library-source.js';
import type { LibraryRecord, CorpusSnapshot } from './lens-local-store.js';
import { DOCUMENT_ID_FIELD, documentLibraryPrefix, knowledgeDocumentId } from './knowledge-document-model.js';
import type { KnowledgeDocumentRecord, KnowledgeDocumentSnapshot } from './knowledge-document-model.js';
export function knowledgeDocumentRecords(library: LibraryRecord, corpus: CorpusSnapshot | null): KnowledgeDocumentRecord[] {
  if (!corpus) return [];
  const { chunks, vectors, manifest } = corpus.state, counts = new Map<string, number>();
  for (const chunk of chunks) { if (!chunk || typeof chunk !== 'object' || typeof chunk.source !== 'string' || typeof chunk.text !== 'string') throw librarySourceConflict(); counts.set(chunk.source, (counts.get(chunk.source) ?? 0) + 1); }
  for (const value of vectors) if (!Number.isFinite(value)) throw librarySourceConflict();
  const rows = manifest.docs.map(doc => {
    if (typeof doc.source !== 'string' || !doc.source.trim() || doc.source.length > 4000 || !Number.isSafeInteger(doc.chunks) || doc.chunks < 0 || doc.chunks !== (counts.get(doc.source) ?? 0) || !(doc.hash === undefined || typeof doc.hash === 'string' && doc.hash.length <= 256)) throw librarySourceConflict();
    return { documentId: knowledgeDocumentId(library.id, doc.source, doc[DOCUMENT_ID_FIELD]), libraryId: library.id, libraryName: library.name, source: doc.source, chunks: doc.chunks, contentHash: doc.hash ?? null };
  });
  if (new Set(rows.map(row => row.source)).size !== rows.length || new Set(rows.map(row => row.documentId)).size !== rows.length || [...counts.keys()].some(source => !rows.some(row => row.source === source))) throw librarySourceConflict();
  return rows;
}
export async function readKnowledgeDocumentSource(io: KnowledgeLibraryIO, documentId: string) {
  if (!/^doc-[a-f0-9]{32}-[a-f0-9]{64}$/.test(documentId)) throw librarySourceConflict();
  const registry = await readKnowledgeLibraryRegistry(io), matches = registry?.libraries.filter(library => documentId.startsWith(documentLibraryPrefix(library.id))) ?? [];
  if (matches.length !== 1) throw librarySourceConflict(); const library = matches[0]!;
  const corpus = await readKnowledgeLibraryCorpus(io, library), rows = knowledgeDocumentRecords(library, corpus), record = rows.find(row => row.documentId === documentId) ?? null;
  const revision = librarySourceDigest(JSON.stringify([...io.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => [path, bytes === null ? null : librarySourceDigest(bytes)])));
  return { library, registry: registry!, corpus, rows, snapshot: record ? { version: 1, scope: 'browser', revision, record } satisfies KnowledgeDocumentSnapshot : null };
}
