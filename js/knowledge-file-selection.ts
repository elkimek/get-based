// Local chosen-content staging. Public descriptors never contain extracted text;
// pending contents live only in this page and are invalid after reload/retirement.
import { librarySourceDigest } from './knowledge-library-source.js';
import { chunkText } from './lens-local-utils.js';
import type { ExtractedLensDocument } from './lens-local-parsers.js';
export const KNOWLEDGE_FILE_LIMITS = Object.freeze({ files: 10, fileBytes: 20 * 1024 * 1024, inputBytes: 40 * 1024 * 1024, documents: 100, extractedBytes: 16 * 1024 * 1024, pendingBytes: 32 * 1024 * 1024, selections: 4 });
export type { KnowledgeChosenFile, KnowledgeChosenDocument, KnowledgeFileDescriptor } from './knowledge-file-descriptor.js';
import type { KnowledgeChosenFile, KnowledgeChosenDocument, KnowledgeFileDescriptor } from './knowledge-file-descriptor.js';
import { parseKnowledgeFileDescriptor } from './knowledge-file-descriptor.js';
interface Scope { signal: AbortSignal; isCurrent(): boolean }
interface Selection { descriptor: KnowledgeFileDescriptor; documents: ExtractedLensDocument[]; scope: Scope; retire(): void }
type Extractor = (file: File, signal: AbortSignal) => Promise<ExtractedLensDocument[]>;
const failure = (message: string) => Object.assign(new Error(message), { noChangeApplied: true });
const current = (scope: Scope) => { try { return !scope.signal.aborted && scope.isCurrent(); } catch { return false; } };
const check = (scope: Scope) => { if (!current(scope)) throw failure('The file selection was cancelled or its profile/conversation changed. Choose the source again.'); };
const safeName = (name: unknown): name is string => typeof name === 'string' && !!name.trim() && name.length <= 4000;
const extractNative: Extractor = async (file, signal) => {
  signal.throwIfAborted();
  // Archive review needs bounded entry extraction and explicit per-document
  // collision choices. Do not inherit the native legacy ZIP partial-success path.
  if (/\.zip$/i.test(file.name)) throw failure('Choose individual documents for this review. Archive review is not available yet.');
  const { extractFromFile } = await import('./lens-local-parsers.js');
  const documents = await extractFromFile(file); signal.throwIfAborted(); return documents;
};
export function createKnowledgeFileSelections(extract: Extractor = extractNative) {
  const selections = new Map<string, Selection>();
  const drop = (token: string) => { const previous = selections.get(token); if (!previous) return false; selections.delete(token); previous.retire(); return true; };
  const prune = () => { for (const [token, entry] of selections) if (!current(entry.scope)) drop(token); };
  function resolve(descriptor: KnowledgeFileDescriptor, scope: Scope) {
    check(scope); prune();
    const stored = selections.get(descriptor.token);
    let matches = false; try { matches = !!stored && stored.descriptor.digest === descriptor.digest && parseKnowledgeFileDescriptor(descriptor).digest === stored.descriptor.digest; } catch { /* Invalid descriptors do not disclose retained contents. */ }
    if (!stored || !matches) throw failure('The exact chosen source is no longer available in this page. Choose the same files again and review them before Apply.');
    check(stored.scope);
    return stored.documents.map(row => ({ ...row }));
  }
  async function select(files: readonly File[], scope: Scope): Promise<KnowledgeFileDescriptor> {
    check(scope); prune();
    const chosen = [...files];
    if (!chosen.length || chosen.length > KNOWLEDGE_FILE_LIMITS.files) throw failure(`Choose between 1 and ${KNOWLEDGE_FILE_LIMITS.files} files.`);
    let totalInputBytes = 0;
    for (const file of chosen) {
      if (!safeName(file.name) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > KNOWLEDGE_FILE_LIMITS.fileBytes) throw failure('Each chosen file needs a valid name and must contain at most 20 MB.');
      totalInputBytes += file.size;
    }
    if (totalInputBytes > KNOWLEDGE_FILE_LIMITS.inputBytes) throw failure('Choose at most 40 MB of source files for one review.');
    const fileFacts: KnowledgeChosenFile[] = [], facts: KnowledgeChosenDocument[] = [], contents: ExtractedLensDocument[] = [], names = new Set<string>();
    let totalTextBytes = 0;
    for (const file of chosen) {
      check(scope);
      const bytes = new Uint8Array(await file.arrayBuffer()); check(scope);
      if (bytes.length !== file.size) throw failure('A chosen file changed while it was being read. Choose it again.');
      const contentHash = librarySourceDigest(bytes), parsed = await extract(file, scope.signal); check(scope);
      if (!Array.isArray(parsed) || !parsed.length || parsed.length + contents.length > KNOWLEDGE_FILE_LIMITS.documents) throw failure('The selection needs usable documents, with at most 100 documents per review.');
      for (const doc of parsed) {
        if (!doc || !safeName(doc.name) || typeof doc.text !== 'string' || !doc.text.trim()) throw failure('A chosen document has no usable text or indexed filename.');
        if (names.has(doc.name)) throw failure('Two chosen documents have the same indexed filename. Choose them separately or rename the source files before review.');
        const utf8 = new TextEncoder().encode(doc.text); totalTextBytes += utf8.length;
        if (totalTextBytes > KNOWLEDGE_FILE_LIMITS.extractedBytes) throw failure('The extracted text exceeds 16 MB. Choose a smaller selection.');
        const excerpts = chunkText(doc.text, 800, 50, 50).length;
        if (!excerpts) throw failure('A chosen document has no passages that can be indexed.');
        names.add(doc.name); contents.push({ name: doc.name, text: doc.text });
        facts.push(Object.freeze({ source: doc.name, characters: doc.text.length, utf8Bytes: utf8.length, contentHash: librarySourceDigest(utf8), excerpts }));
      }
      fileFacts.push(Object.freeze({ name: file.name, bytes: file.size, type: file.type, contentHash }));
    }
    check(scope); prune();
    const pendingBytes = [...selections.values()].reduce((sum, entry) => sum + entry.descriptor.totalTextBytes, 0);
    if (selections.size >= KNOWLEDGE_FILE_LIMITS.selections || pendingBytes + totalTextBytes > KNOWLEDGE_FILE_LIMITS.pendingBytes) throw failure('Finish or discard an existing chosen-file review before selecting more files.');
    const token = `knowledge-input-${crypto.randomUUID()}`, detail = { version: 1 as const, token, files: Object.freeze(fileFacts), documents: Object.freeze(facts), totalTextBytes };
    const descriptor = Object.freeze({ ...detail, digest: librarySourceDigest(JSON.stringify(detail)) });
    const abort = () => { drop(token); };
    selections.set(token, { descriptor, documents: contents, scope, retire: () => scope.signal.removeEventListener('abort', abort) });
    scope.signal.addEventListener('abort', abort, { once: true });
    return descriptor;
  }
  return { select, resolve, has(descriptor: KnowledgeFileDescriptor) { try { prune(); const entry=selections.get(descriptor.token); return !!entry && current(entry.scope) && parseKnowledgeFileDescriptor(descriptor).digest===entry.descriptor.digest; } catch { return false; } }, release(descriptor: KnowledgeFileDescriptor, scope: Scope) { resolve(descriptor, scope); return drop(descriptor.token); }, clear() { for (const token of selections.keys()) drop(token); } };
}
