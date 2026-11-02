// Parent grants are matched to one reviewed command and one live worker request.
import type { WorkerReply } from './lens-local-protocol.js';
let waiting: { token: string; resolve(allowed: boolean): void } | null = null;
export function acknowledgeKnowledgeLibraryCommit(token: unknown, allowed: unknown) {
  if (!waiting || token !== waiting.token) return; const current = waiting; waiting = null; current.resolve(allowed === true);
}
export function knowledgeCommitAuthorization(postMessage: (reply: WorkerReply) => void) {
  return (commandId: string) => new Promise<boolean>(resolve => {
    const token = crypto.randomUUID(); waiting = { token, resolve }; postMessage({ type: 'library_commit_ready', commandId, token });
  });
}
