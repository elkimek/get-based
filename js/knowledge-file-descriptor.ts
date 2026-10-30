// Runtime-neutral facts for locally chosen sources, never their extracted text.
import { agentDataObject, validateFieldNames } from '../shared/agent-data-contract.js';
import { librarySourceDigest } from './knowledge-library-source.js';
export interface KnowledgeChosenFile { readonly name: string; readonly bytes: number; readonly contentHash: string; readonly type: string }
export interface KnowledgeChosenDocument { readonly source: string; readonly characters: number; readonly utf8Bytes: number; readonly contentHash: string; readonly excerpts: number }
export interface KnowledgeFileDescriptor { readonly version: 1; readonly token: string; readonly digest: string; readonly files: readonly KnowledgeChosenFile[]; readonly documents: readonly KnowledgeChosenDocument[]; readonly totalTextBytes: number }
const name = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 4000;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown, max: number) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= max;
export function knowledgeFileDescriptorDigest(value: KnowledgeFileDescriptor) {
  return librarySourceDigest(JSON.stringify({ version: value.version, token: value.token,
    files: value.files.map(row => ({ name: row.name, bytes: row.bytes, type: row.type, contentHash: row.contentHash })),
    documents: value.documents.map(row => ({ source: row.source, characters: row.characters, utf8Bytes: row.utf8Bytes, contentHash: row.contentHash, excerpts: row.excerpts })), totalTextBytes: value.totalTextBytes }));
}
export function parseKnowledgeFileDescriptor(value: unknown): KnowledgeFileDescriptor {
  const row = agentDataObject(value); validateFieldNames(row, ['version','token','digest','files','documents','totalTextBytes']);
  if (row.version !== 1 || typeof row.token !== 'string' || !/^knowledge-input-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.token) || !hash(row.digest) || !Array.isArray(row.files) || !row.files.length || row.files.length > 10 || !Array.isArray(row.documents) || !row.documents.length || row.documents.length > 100) throw new Error('Choose and review the exact source files again.');
  for (const raw of row.files) { const file = agentDataObject(raw); validateFieldNames(file, ['name','bytes','type','contentHash']); if (!name(file.name) || !count(file.bytes,20*1024*1024) || typeof file.type !== 'string' || file.type.length > 4000 || !hash(file.contentHash)) throw new Error('The chosen file facts are invalid.'); }
  for (const raw of row.documents) { const doc = agentDataObject(raw); validateFieldNames(doc, ['source','characters','utf8Bytes','contentHash','excerpts']); if (!name(doc.source) || !count(doc.characters,16*1024*1024) || !count(doc.utf8Bytes,16*1024*1024) || !count(doc.excerpts,1000000) || !hash(doc.contentHash)) throw new Error('The chosen document facts are invalid.'); }
  const typed = row as unknown as KnowledgeFileDescriptor;
  if (new Set(typed.documents.map(doc => doc.source)).size !== typed.documents.length || typed.files.reduce((sum,file)=>sum+file.bytes,0)>40*1024*1024 || typed.documents.reduce((sum,doc)=>sum+doc.utf8Bytes,0)!==typed.totalTextBytes || !count(typed.totalTextBytes,16*1024*1024) || knowledgeFileDescriptorDigest(typed)!==typed.digest) throw new Error('The exact chosen source changed. Choose and review it again.');
  return typed;
}
