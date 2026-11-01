// Reviewed content indexing shares the native ingest planner and atomic corpus owner.
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import { chunkText } from './lens-local-utils.js';
import type { LensInputFile } from './lens-local-ingest.js';
import { assertKnowledgeSourceWriteBudget, knowledgeLibraryReadBudget, librarySourceDigest, openKnowledgeLibraryIO, librarySourceConflict, knowledgeLibraryCommandIdentity } from './knowledge-library-source.js';
import { readKnowledgeImportSource } from './knowledge-import-source.js';
import { projectKnowledgeImport } from './knowledge-import-model.js';
import { knowledgeDocumentId, DOCUMENT_ID_FIELD } from './knowledge-document-model.js';
import { buildLocalIngestTransaction } from './lens-local-ingest.js';
import type { LensEmbedder, IngestProgress } from './lens-local-ingest.js';
import { MODELS } from './lens-local-embedder-config.js';
import { writeCorpusSnapshot } from './lens-local-store.js';
import type { CorpusState } from './lens-local-store.js';
const RECEIPTS = '_getbasedDocumentImports';
interface Receipt { id: string; intent: string; documentId: string; savedAt: number }
export interface KnowledgeImportRuntime {
  load(modelKey: string): Promise<{ embedder: LensEmbedder; backend: string }>;
  yieldTask(): Promise<void>; isAbortRequested(): boolean; progress(value: IngestProgress): void;
}
function receipts(value: unknown): Receipt[] {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('entries' in value) || !Array.isArray(value.entries) || value.entries.length > 64 || !value.entries.every(row => row && typeof row === 'object' && /^[a-f0-9]{64}$/.test(row.id) && /^[a-f0-9]{64}$/.test(row.intent) && /^doc-[a-f0-9]{32}-[a-f0-9]{64}$/.test(row.documentId) && Number.isFinite(row.savedAt) && row.savedAt > 0 && Number.isFinite(new Date(row.savedAt).valueOf()) && (row.documentIds===undefined||Array.isArray(row.documentIds)&&row.documentIds.length>0&&row.documentIds.length<=100&&row.documentIds[0]===row.documentId&&row.documentIds.every((id:unknown)=>typeof id==='string'&&/^doc-[a-f0-9]{32}-[a-f0-9]{64}$/.test(id)))) || new Set(value.entries.map(row => row.id)).size !== value.entries.length) throw librarySourceConflict();
  return value.entries as Receipt[];
}
async function reviewed(value: unknown) {
  if (!navigator.locks?.request) throw librarySourceConflict();
  const proposal = normalizeAgentDataProposal(value); if (!proposal) throw librarySourceConflict();
  const review = projectKnowledgeImport(proposal), identity = knowledgeLibraryCommandIdentity(proposal), io = await openKnowledgeLibraryIO(true), source = await readKnowledgeImportSource(io, proposal.recordId);
  const history = receipts(source.corpus?.state.manifest[RECEIPTS]), previous = history.find(row => row.id === identity.id);
  if (previous && previous.intent !== identity.intent) throw librarySourceConflict();
  return { proposal, review, identity, io, source, history, previous };
}
const applied = (commandId: string, savedAt: number, alreadyApplied: boolean) => ({ type: 'document_change_applied' as const, commandId, appliedAt: savedAt, alreadyApplied, cleanupPending: false as const });
export async function confirmKnowledgeImportReceipt(value: unknown, authorize: (id: string) => Promise<boolean>) {
  const { identity, previous } = await reviewed(value);
  if (!await authorize(identity.id)) throw librarySourceConflict();
  return previous ? applied(identity.id, previous.savedAt, true) : { type: 'document_change_unconfirmed' as const, commandId: identity.id };
}
export async function commitKnowledgeImport(value: unknown, authorize: (id: string) => Promise<boolean>, runtime: KnowledgeImportRuntime, chosenFiles?: LensInputFile[]) {
  const { review, identity, io, source, history, previous } = await reviewed(value);
  if (previous) { if (!await authorize(identity.id)) throw librarySourceConflict(); return applied(identity.id, previous.savedAt, true); }
  if (JSON.stringify({ ...source.snapshot, configuration: review.snapshot.configuration }) !== JSON.stringify(review.snapshot)) throw librarySourceConflict();
  if(review.input==='chooseFiles')throw librarySourceConflict();
  const files = review.selection ? (()=>{
    if(!Array.isArray(chosenFiles)||chosenFiles.length!==review.selection.documents.length)throw librarySourceConflict();
    return chosenFiles.map((file,index)=>{const expected=review.selection!.documents[index]!;if(file.name!==expected.source||typeof file.text!=='string'||file.text.length!==expected.characters)throw librarySourceConflict();const bytes=new TextEncoder().encode(file.text);if(bytes.length!==expected.utf8Bytes||librarySourceDigest(bytes)!==expected.contentHash||chunkText(file.text,800,50,50).length!==expected.excerpts)throw librarySourceConflict();return{name:review.indexNames[index]!,text:file.text};});
  })() : [{name:review.source,text:review.text}];
  const check = async () => { await runtime.yieldTask(); if (runtime.isAbortRequested() || !await authorize(identity.id)) throw librarySourceConflict(); };
  const model = MODELS[source.library.model!]!;
  const projectedRows=(source.corpus?.state.chunks.length??0)-review.effects.replacesChunks+review.effects.newExcerpts;
  if(projectedRows*model.dim*4>knowledgeLibraryReadBudget.file)throw Object.assign(new Error('This selection would exceed the supported reviewed index size. Choose fewer documents.'),{noChangeApplied:true});
  // Approval and current source are required before any model initialization/download.
  await check(); runtime.progress({ stage: 'loading', total: review.effects.newExcerpts });
  const { embedder, backend } = await runtime.load(source.library.model!); await check();
  const current: CorpusState = source.corpus?.state ?? { chunks: [], vectors: new Float32Array(), manifest: { modelId: model.id, dim: model.dim, numChunks: 0, docs: [] } };
  const transaction = await buildLocalIngestTransaction({ files, embedder, backend, dim: model.dim, current, yieldTask: runtime.yieldTask, isAbortRequested: runtime.isAbortRequested, postProgress: runtime.progress });
  if (transaction.stats.cancelled) throw librarySourceConflict();
  // Same-content imports still record their durable result, without recomputing vectors.
  const next = transaction.nextState ?? structuredClone(current), savedAt = Date.now();
  const documentIds=review.indexNames.map((name,index)=>review.replacements[index]?.documentId??knowledgeDocumentId(source.library.id,name));
  next.manifest.docs=next.manifest.docs.map(doc=>{const index=review.indexNames.indexOf(doc.source);return index<0?doc:{...doc,[DOCUMENT_ID_FIELD]:documentIds[index]};});
  next.manifest[RECEIPTS] = { version: 1, entries: [...history, { ...identity, documentId:documentIds[0]!,documentIds,savedAt }].slice(-64) };
  for (const vector of next.vectors) if (!Number.isFinite(vector)) throw new Error('The embedding model returned invalid values. Nothing was saved.');
  runtime.progress({ stage: 'saving', total: transaction.stats.chunks_planned });
  await check();
  // The origin lock is held throughout loading/planning; the final parent grant
  // checks current browser scope. Inactive-slot creation also follows that grant.
  const directory = await io.directory!.getDirectoryHandle(source.library.id, { create: true });
  try { await writeCorpusSnapshot(directory, next, { activeSlot: source.corpus?.slot ?? null, revision: source.corpus?.revision ?? 0, validateWrites:writes=>assertKnowledgeSourceWriteBudget(new Map([...io.files].map(([name,bytes])=>[name,bytes?.length??null])),new Map([...writes].map(([name,bytes])=>[`${source.library.id}/${name}`,bytes.length]))) }); }
  catch(error) { if(error instanceof Error&&'noChangeApplied'in error&&error.noChangeApplied===true)throw error;throw Object.assign(new Error('Index save not confirmed. Use Check saved change; do not replay the import.'), { requiresReload: true }); }
  return applied(identity.id, savedAt, false);
}
