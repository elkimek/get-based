// Transient UI controls; persisted proposals and native receipts remain authoritative.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { IngestProgress } from './lens-local-ingest.js';
import { knowledgeLibraryCommandIdentity } from './knowledge-library-source.js';
const jobs = new Map<string, { controller: AbortController; saving: boolean; message: string; kind:'index'|'selection' }>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* Display failure cannot revoke a saved transaction. */ } } };
export function subscribeKnowledgeImports(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function knowledgeImportJob(proposal: AgentDataProposal) { const job = jobs.get(knowledgeLibraryCommandIdentity(proposal).id); return job ? { canStop: !job.saving, message: job.message, kind:job.kind } : null; }
export function stopKnowledgeImport(proposal: AgentDataProposal) { const job = jobs.get(knowledgeLibraryCommandIdentity(proposal).id); if (!job || job.saving) return false; job.controller.abort(); return true; }
export function beginKnowledgeImport(proposal: AgentDataProposal, kind:'index'|'selection'='index') {
  const id = knowledgeLibraryCommandIdentity(proposal).id;
  if (jobs.has(id)) throw new Error('This import is already running.');
  const job = { controller: new AbortController(), saving: false, kind, message: kind==='selection'?'Choose source files…':'Preparing the reviewed import…' }; jobs.set(id, job); notify();
  return { signal: job.controller.signal, message(value:string){job.message=value;notify();}, cancel: () => job.controller.abort(),
    progress(value: IngestProgress) {
      job.saving = value.stage === 'saving';
      job.message = value.stage === 'loading' ? 'Loading the selected embedding model…' : value.stage === 'saving' ? 'Saving the updated library…' : value.stage === 'embed' ? `Indexing ${value.index}/${value.total} excerpts…` : `Preparing ${value.total} excerpts…`; notify();
    }, close() { if (jobs.get(id) === job) { jobs.delete(id); notify(); } } };
}
