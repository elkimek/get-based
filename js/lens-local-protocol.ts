// Shared wire contracts for the actual Lens client and dedicated worker.
import type { MODELS } from './lens-local-embedder-config.js';
import type { LibraryRecord } from './lens-local-store.js';
import type { IngestProgress, LensInputFile, buildLocalIngestTransaction } from './lens-local-ingest.js';

export type IngestStats = Awaited<ReturnType<typeof buildLocalIngestTransaction>>['stats'];
export interface ReadyReply {
  type: 'ready'; numChunks: number; numDocs: number; libraries: LibraryRecord[]; activeId: string;
  activeName: string; activeModel: string; models: typeof MODELS;
  embedder?: { backend: string; modelKey: string; modelId: string; dim: number; msPerEmbed: number; tier: number; tierLabel: string } | null;
}
export interface StatsReply {
  type: 'stats_result'; total_chunks: number; documents: Array<{ source: string; chunks: number }>;
  dim: number; model: string; backend: string; ms_per_embed: number | null;
}
export interface LensQueryChunk { text: string; source: string; score: number }
export interface ReplyPayloads {
  init: ReadyReply; activate_library: ReadyReply;
  ingest: { type: 'ingest_done'; stats: IngestStats };
  query: { type: 'query_result'; chunks: LensQueryChunk[] }; stats: StatsReply;
  delete: { type: 'delete_done'; deleted_chunks: number }; clear: { type: 'clear_done' };
  list_libraries: { type: 'libraries_list'; libraries: LibraryRecord[]; activeId: string };
  create_library: { type: 'library_created'; id: string; name: string; model: string; libraries: LibraryRecord[]; activeId: string };
  rename_library: { type: 'library_renamed'; id: string; name: string; libraries: LibraryRecord[]; activeId: string };
  delete_library: { type: 'library_deleted'; id: string; libraries: LibraryRecord[]; activeId: string; numChunks: number; numDocs: number };
}
export type WorkerReply = ReplyPayloads[keyof ReplyPayloads] | ({ type: 'progress' } & IngestProgress) | { type: 'error'; message: string };

// Incoming data remains a compatibility view: unknown message types reach the original error branch.
export interface WorkerRequest {
  type?: string; files?: LensInputFile[]; text?: unknown; topK?: number; source?: unknown;
  libraryId?: string; name?: unknown; model?: string;
}
