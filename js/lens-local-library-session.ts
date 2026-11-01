// Metadata commands never initialize an embedder; reviewed content imports can
// load the selected model after a parent grant. Read/prepare use read-only source
// adapters instead of opening a native session.
import type { LensInputFile, IngestProgress } from './lens-local-ingest.js';
import type { ReplyPayloads, WorkerReply } from './lens-local-protocol.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { knowledgeLibraryCommandIdentity } from './knowledge-library-source.js';
type Command = 'init_metadata' | 'list_libraries' | 'create_library' | 'rename_library' | 'activate_library' | 'delete_library' | 'apply_library_change' | 'confirm_library_change' | 'apply_document_change' | 'confirm_document_change' | 'apply_document_import' | 'confirm_document_import';
export async function openLocalLibrarySession({ initialize = true, signal, onProgress }: { initialize?: boolean; signal?: AbortSignal; onProgress?: (value: IngestProgress) => void } = {}) {
  signal?.throwIfAborted();
  if (!navigator.locks?.request) throw new Error('Library management requires browser-wide storage locking. Open Knowledge Base in a supported browser.');
  const worker = new Worker(new URL('./lens-local-worker.js', import.meta.url), { type: 'module' });
  let closed = false, saving = false, pending: Promise<unknown> = Promise.resolve();
  let inflight: { resolve(reply: WorkerReply): void; reject(error: Error): void; authorization?: { commandId: string; check(): Promise<boolean> } } | null = null;
  const close = (error?: Error) => {
    if (closed) return; closed = true; signal?.removeEventListener('abort', abort); try { worker.terminate(); } catch { /* Still reject pending work. */ }
    const current = inflight; inflight = null;
    current?.reject(error ?? Object.assign(new Error('Library session closed before confirmation. Reopen Knowledge Base to review before retrying.'), { requiresReload: true }));
  };
  const abort = () => {
    if (!saving) close(Object.assign(new Error('Indexing stopped before saving. Nothing was changed.'), { noChangeApplied: true, cancelledBeforeSave: true }));
  };
  signal?.addEventListener('abort', abort, { once: true });
  worker.addEventListener('error', () => close());
  worker.addEventListener('messageerror', () => close());
  worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
    if (closed || !inflight) return;
    const reply = event.data;
    if (reply.type === 'progress') { saving = reply.stage === 'saving'; onProgress?.(reply); return; }
    if (reply.type === 'library_commit_ready') {
      const current = inflight;
      if (typeof reply.token !== 'string' || !reply.token || reply.token.length > 128) { close(); return; }
      void (async () => {
        let allowed = false;
        try { allowed = current.authorization?.commandId === reply.commandId && await current.authorization.check(); } catch { /* Revoked or unreadable scope denies the write. */ }
        if (!closed && inflight === current) { try { worker.postMessage({ type: 'commit_library', token: reply.token, allowed }); } catch { close(); } }
      })();
      return;
    }
    const current = inflight; inflight = null;
    if (reply.type === 'error') {
      current.reject(Object.assign(new Error(reply.message), reply.requiresReload ? { requiresReload: true } : {}, reply.noChangeApplied ? { noChangeApplied: true } : {}));
      if (reply.requiresReload) close();
    } else current.resolve(reply);
  });
  function send<Type extends Command>(type: Type, fields: Record<string, unknown> = {}, authorization?: { commandId: string; check(): Promise<boolean> }): Promise<ReplyPayloads[Type]> {
    const run = () => new Promise<ReplyPayloads[Type]>((resolve, reject) => {
      if (closed) { reject(new Error('This library session is closed. Open a new session.')); return; }
      inflight = { resolve: reply => resolve(reply as ReplyPayloads[Type]), reject, ...(authorization ? { authorization } : {}) };
      try { worker.postMessage({ type, ...fields }); } catch (error) { inflight = null; close(); reject(error); }
    });
    const result = pending.then(run, run); pending = result.then(() => undefined, () => undefined); return result;
  }
  if (initialize) { try { await send('init_metadata'); } catch (error) { close(); throw error; } }
  return {
    close,
    listLibraries: () => send('list_libraries'),
    createLibrary: (name: string, model?: string) => send('create_library', { name, model }),
    renameLibrary: (libraryId: string, name: string) => send('rename_library', { libraryId, name }),
    activateLibrary: (libraryId: string) => send('activate_library', { libraryId }),
    deleteLibrary: (libraryId: string) => send('delete_library', { libraryId }),
    applyLibraryChange: (proposal: AgentDataProposal, check: () => Promise<boolean>) => send('apply_library_change', { proposal }, { commandId: knowledgeLibraryCommandIdentity(proposal).id, check }),
    confirmLibraryChange: (proposal: AgentDataProposal, check: () => Promise<boolean>) => send('confirm_library_change', { proposal }, { commandId: knowledgeLibraryCommandIdentity(proposal).id, check }),
    applyDocumentImport: (proposal: AgentDataProposal, check: () => Promise<boolean>, files?: LensInputFile[]) => send('apply_document_import', { proposal, ...(files?{files}:{}) }, { commandId: knowledgeLibraryCommandIdentity(proposal).id, check }),
    confirmDocumentImport: (proposal: AgentDataProposal, check: () => Promise<boolean>) => send('confirm_document_import', { proposal }, { commandId: knowledgeLibraryCommandIdentity(proposal).id, check }),
    applyDocumentChange: (proposal: AgentDataProposal, check: () => Promise<boolean>) => send('apply_document_change', { proposal }, { commandId: knowledgeLibraryCommandIdentity(proposal).id, check }),
    confirmDocumentChange: (proposal: AgentDataProposal, check: () => Promise<boolean>) => send('confirm_document_change', { proposal }, { commandId: knowledgeLibraryCommandIdentity(proposal).id, check }),
  };
}
export async function applyLocalLibraryChange(proposal: AgentDataProposal, authorize: () => Promise<boolean>) {
  const session = await openLocalLibrarySession({ initialize: false });
  try { return await session.applyLibraryChange(proposal, authorize); } finally { session.close(); }
}
export async function confirmLocalLibraryChange(proposal: AgentDataProposal, authorize: () => Promise<boolean>) {
  const session = await openLocalLibrarySession({ initialize: false });
  try { return await session.confirmLibraryChange(proposal, authorize); } finally { session.close(); }
}
export async function applyLocalDocumentChange(proposal: AgentDataProposal, authorize: () => Promise<boolean>) {
  const session = await openLocalLibrarySession({ initialize: false });
  try { return await session.applyDocumentChange(proposal, authorize); } finally { session.close(); }
}
export async function confirmLocalDocumentChange(proposal: AgentDataProposal, authorize: () => Promise<boolean>) {
  const session = await openLocalLibrarySession({ initialize: false });
  try { return await session.confirmDocumentChange(proposal, authorize); } finally { session.close(); }
}

export async function applyLocalDocumentImport(proposal: AgentDataProposal, authorize: () => Promise<boolean>, signal: AbortSignal, onProgress: (value: IngestProgress) => void, files?: LensInputFile[]) {
  const session = await openLocalLibrarySession({ initialize: false, signal, onProgress });
  try { return await session.applyDocumentImport(proposal, authorize, files); } finally { session.close(); }
}
export async function confirmLocalDocumentImport(proposal: AgentDataProposal, authorize: () => Promise<boolean>) {
  const session = await openLocalLibrarySession({ initialize: false });
  try { return await session.confirmDocumentImport(proposal, authorize); } finally { session.close(); }
}
