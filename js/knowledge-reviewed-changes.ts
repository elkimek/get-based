import { commitKnowledgeImport, confirmKnowledgeImportReceipt } from './knowledge-import-commit.js';
import type { LensInputFile } from './lens-local-ingest.js';
import type { KnowledgeImportRuntime } from './knowledge-import-commit.js';
import { commitKnowledgeLibraryChange, confirmKnowledgeLibraryReceipt } from './knowledge-library-commit.js';
import { commitKnowledgeDocumentChange, confirmKnowledgeDocumentReceipt } from './knowledge-document-commit.js';
import { knowledgeCommitAuthorization } from './knowledge-change-authorization.js';
import type { WorkerReply } from './lens-local-protocol.js';
export { acknowledgeKnowledgeLibraryCommit } from './knowledge-change-authorization.js';
export async function handleReviewedKnowledgeChange(value: unknown, post: (reply: WorkerReply) => void, confirmOnly = false, runtime?: KnowledgeImportRuntime, files?: LensInputFile[]) {
  if (value && typeof value === 'object' && 'resource' in value && value.resource === 'knowledgeImports') {
    if (confirmOnly) { post(await confirmKnowledgeImportReceipt(value, knowledgeCommitAuthorization(post))); return; }
    if (!runtime) throw new Error('The content indexing runtime is unavailable.');
    post(await commitKnowledgeImport(value, knowledgeCommitAuthorization(post), runtime, files)); return;
  }
  const document = !!value && typeof value === 'object' && 'resource' in value && value.resource === 'knowledgeDocuments';
  const execute = document ? confirmOnly ? confirmKnowledgeDocumentReceipt : commitKnowledgeDocumentChange : confirmOnly ? confirmKnowledgeLibraryReceipt : commitKnowledgeLibraryChange;
  post(await execute(value, knowledgeCommitAuthorization(post)));
}
