// Shared wire contracts for the actual Lens client and dedicated worker.
import type { MODELS } from './lens-local-embedder-config.js';
import type { LibraryRecord } from './lens-local-store.js';
import type { IngestProgress, LensInputFile, buildLocalIngestTransaction } from './lens-local-ingest.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';

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
  init: ReadyReply; init_metadata: ReadyReply; activate_library: ReadyReply;
  ingest: { type: 'ingest_done'; stats: IngestStats };
  query: { type: 'query_result'; chunks: LensQueryChunk[] }; stats: StatsReply;
  delete: { type: 'delete_done'; deleted_chunks: number }; clear: { type: 'clear_done' };
  list_libraries: { type: 'libraries_list'; libraries: LibraryRecord[]; activeId: string };
  create_library: { type: 'library_created'; id: string; name: string; model: string; libraries: LibraryRecord[]; activeId: string };
  rename_library: { type: 'library_renamed'; id: string; name: string; libraries: LibraryRecord[]; activeId: string };
  delete_library: { type: 'library_deleted'; id: string; libraries: LibraryRecord[]; activeId: string; numChunks: number; numDocs: number; cleanupPending?: boolean };
  apply_library_change: { type: 'library_change_applied'; commandId: string; alreadyApplied: boolean; cleanupPending: boolean | null; appliedAt: number };
  confirm_library_change: ReplyPayloads['apply_library_change'] | { type: 'library_change_unconfirmed'; commandId: string };
  apply_document_import: ReplyPayloads['apply_document_change'];
  confirm_document_import: ReplyPayloads['confirm_document_change'];
  apply_document_change: { type: 'document_change_applied'; commandId: string; alreadyApplied: boolean; appliedAt: number; cleanupPending: false };
  confirm_document_change: ReplyPayloads['apply_document_change'] | { type: 'document_change_unconfirmed'; commandId: string };
}
export type WorkerReply = ReplyPayloads[keyof ReplyPayloads] | { type: 'library_commit_ready'; commandId: string; token: string } | ({ type: 'progress' } & IngestProgress) | { type: 'error'; message: string; requiresReload?: boolean; noChangeApplied?: boolean };

// Incoming data remains a compatibility view: unknown message types reach the original error branch.
export interface WorkerRequest {
  type?: string; files?: LensInputFile[]; text?: unknown; topK?: number; source?: unknown;
  libraryId?: string; name?: unknown; model?: string;
  expectedLibraryId?: string;
  expectedSourceRevision?: string;
  proposal?: AgentDataProposal; token?: string; allowed?: boolean;
}
