import { parseKnowledgeFileDescriptor } from './knowledge-file-descriptor.js';
// Exact pasted-text imports; metadata snapshots never disclose saved document text.
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { displayKnowledgeLibrary } from './knowledge-library-proposals.js';
import type { KnowledgeLibraryRecord } from './knowledge-library-source.js';
import { displayKnowledgeDocument } from './knowledge-document-model.js';
import type { KnowledgeDocumentRecord } from './knowledge-document-model.js';
import { chunkText } from './lens-local-utils.js';
import { MODELS } from './lens-local-embedder-config.js';
export interface KnowledgeImportSnapshot { version: 1; scope: 'browser'; revision: string; configuration?: string; record: KnowledgeLibraryRecord; documents: KnowledgeDocumentRecord[] }
export const knowledgeImportFields = { input: 'Omit for pasted text, or chooseFiles to request a native file picker and a separate review. The model cannot supply selected-file tokens or contents.', source: 'Exact indexed filename, unique for a new document.', text: 'Exact user-pasted document text (1–4000 characters); never generated or reconstructed from search excerpts.', replaceDocumentId: 'Only for replacement: exact existing documentId in this library. source must match its indexed filename.' };
export function displayKnowledgeImport(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const row = agentDataObject(value);
  if (row.version === 1) return displayKnowledgeImport(row.record);
  const library = displayKnowledgeLibrary(row); if (!library) throw new Error('Read the exact target library.');
  return { ...library, ...(row.input === 'chooseFiles' || row.input === 'selectedFiles' ? { input: row.input, selectedDocuments: row.selectedDocuments } : {}), ...(typeof row.source === 'string' ? { source: row.source, characters: row.characters, newExcerpts: row.newExcerpts } : {}) };
}
export function projectKnowledgeImport(proposal: AgentDataProposal) {
  if (String(proposal.resource) !== 'knowledgeImports' || proposal.operation !== 'start' || !Number.isFinite(proposal.recordedAt) || proposal.recordedAt <= 0) throw new Error('Read the target library before proposing an import.');
  const outer = agentDataObject(JSON.parse(proposal.baseline)); if(outer.version===2)validateFieldNames(outer,['version','source','selection']);
  const raw = outer.version === 2 ? agentDataObject(outer.source) : outer, library = displayKnowledgeLibrary(raw.record);
  if (raw.version !== 1 || raw.scope !== 'browser' || typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision) || typeof raw.configuration !== 'string' || !/^[a-f0-9]{64}$/.test(raw.configuration) || !library || library.libraryId !== proposal.recordId || !Array.isArray(raw.documents)) throw new Error('Read a fresh target-library snapshot.');
  const documents = raw.documents.map(displayKnowledgeDocument);
  if (documents.some(row => !row || row.libraryId !== library.libraryId) || new Set(documents.map(row => row!.source)).size !== documents.length || new Set(documents.map(row => row!.documentId)).size !== documents.length) throw new Error('The indexed document identities need review.');
  const patch = parseAgentDataPatch(proposal.patch), input = patch.input === undefined ? 'text' : patch.input;
  if (typeof input !== 'string' || !['text','chooseFiles','selectedFiles'].includes(input) || (input === 'selectedFiles') !== (outer.version === 2)) throw new Error('Choose and review the source files through the native file picker.');
  const model = MODELS[library.modelKey]!;
  const shared = { browserWide: true, modelLabel: model.label, firstUseDownloadMB: model.downloadMB, retainsOriginalsAndRecovery: true };
  if (input === 'chooseFiles') {
    validateFieldNames(patch,['input','replaceDocumentId']);
    const replacement = patch.replaceDocumentId === undefined ? null : documents.find(row=>row!.documentId===patch.replaceDocumentId);
    if (patch.replaceDocumentId !== undefined && !replacement) throw new Error('Read the exact document to replace before requesting a file.');
    return { input, before:library, after:{...library,input,selectedDocuments:0}, text:'',source:replacement?.source??'',replacement:replacement??null, replacements:[] as Array<KnowledgeDocumentRecord|null>,indexNames:[] as string[],selection:null,snapshot:raw as unknown as KnowledgeImportSnapshot,
      effects:{...shared,replacesDocument:!!replacement,replacesChunks:replacement?.chunks??0,newExcerpts:0} };
  }
  if (input === 'selectedFiles') {
    validateFieldNames(patch,['input','replacementIds']);
    const selection=parseKnowledgeFileDescriptor(outer.selection);
    if (!Array.isArray(patch.replacementIds) || patch.replacementIds.length!==selection.documents.length) throw new Error('Review each chosen document and its replacement target.');
    const replacements=patch.replacementIds.map(id=>{if(id===null)return null;const record=documents.find(row=>row!.documentId===id);if(!record)throw new Error('An exact replacement document changed. Choose the file again.');return record;});
    const indexNames=selection.documents.map((doc,index)=>replacements[index]?.source??doc.source);
    if(new Set(indexNames).size!==indexNames.length || indexNames.some((source,index)=>documents.some(doc=>doc!.source===source&&doc!.documentId!==replacements[index]?.documentId)))throw new Error('An indexed filename is occupied. Request an explicit replacement of that document or choose a different file.');
    const newExcerpts=selection.documents.reduce((sum,doc)=>sum+doc.excerpts,0),characters=selection.documents.reduce((sum,doc)=>sum+doc.characters,0);
    return {input,before:library,after:{...library,input,selectedDocuments:indexNames.length,characters,newExcerpts},text:'',source:indexNames.length===1?indexNames[0]!:'',replacement:replacements.length===1?replacements[0]??null:null,replacements,indexNames,selection,snapshot:raw as unknown as KnowledgeImportSnapshot,
      effects:{...shared,replacesDocument:replacements.some(Boolean),replacesChunks:replacements.reduce((sum,doc)=>sum+(doc?.chunks??0),0),newExcerpts}};
  }
  validateFieldNames(patch, ['input','source', 'text', 'replaceDocumentId']);
  if (typeof patch.source !== 'string' || !patch.source.trim() || patch.source.trim().length > 4000 || typeof patch.text !== 'string' || !patch.text.trim() || patch.text.length > 4000) throw new Error('Supply an indexed filename and the exact pasted text, up to 4000 characters. Use the file importer for larger documents.');
  const source = patch.source.trim(), text = patch.text;
  const replacement = patch.replaceDocumentId === undefined ? null : documents.find(row => row!.documentId === patch.replaceDocumentId);
  if (patch.replaceDocumentId !== undefined && (!replacement || replacement.source !== source)) throw new Error('Read the exact document and retain its filename when replacing its text.');
  if (!replacement && documents.some(row => row!.source === source)) throw new Error('That indexed filename already exists. Read its documentId and review an explicit replacement.');
  const newExcerpts = chunkText(text, 800, 50, 50).length;
  if (!newExcerpts) throw new Error('The supplied text has no usable document passages. Nothing will be erased.');
  return {input,before:library,after:{...library,source,characters:text.length,newExcerpts},text,source,replacement:replacement??null,replacements:[replacement??null],indexNames:[source],selection:null,snapshot:raw as unknown as KnowledgeImportSnapshot,
    effects:{...shared,replacesDocument:!!replacement,replacesChunks:replacement?.chunks??0,newExcerpts}};
}
export function describeKnowledgeImport(value: unknown) {
  const row = displayKnowledgeImport(value);
  return row ? `Library: ${row.name}\nEmbedding model: ${row.modelLabel}\nActive for retrieval: ${row.active?'Yes':'No'}${row.input === 'chooseFiles' ? '\nChoose source files before reviewing a change' : row.input === 'selectedFiles' ? `\nSelected documents: ${row.selectedDocuments}` : ''}${row.source ? `\nIndexed filename: ${row.source}\nSupplied text: ${row.characters} characters · ${row.newExcerpts} excerpts` : ''}` : 'Unavailable';
}
