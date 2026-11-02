// Every local library/corpus request owns the same origin-wide storage lock.
// Abort and ingest acknowledgement must bypass it: the current owner can be
// waiting for those messages before it can release the lock.
import { getErrorMessage } from './caught-error.js';
import type { WorkerRequest, WorkerReply } from './lens-local-protocol.js';
import { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
export { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
interface Port {
  location: { origin: string };
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerReply): void;
}
export function installLensLocalWorkerDispatch(port: Port, options: {
  dispatch(message: WorkerRequest): Promise<unknown>;
  refresh(message: WorkerRequest): Promise<void>;
  begin?(message: WorkerRequest, cancelledWhileWaiting: boolean): void;
  abort(): void;
  acknowledgeIngest(): void;
  acknowledgeLibrary?(message: WorkerRequest): void;
}) {
  let pending: Promise<unknown> = Promise.resolve(), abortVersion = 0;
  port.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    if (event.origin && event.origin !== port.location.origin) return;
    const message = event.data || {};
    if (message.type === 'abort') { abortVersion++; options.abort(); return; }
    if (message.type === 'commit_ingest') { options.acknowledgeIngest(); return; }
    if (message.type === 'commit_library') { options.acknowledgeLibrary?.(message); return; }
    const receivedAbortVersion = abortVersion;
    const operation = async () => { options.begin?.(message, receivedAbortVersion !== abortVersion); await options.refresh(message); await options.dispatch(message); };
    const run = () => navigator.locks?.request ? navigator.locks.request(LENS_LOCAL_STORAGE_LOCK, operation) : operation();
    pending = pending.then(run, run).catch(error => {
      port.postMessage({ type: 'error', message: getErrorMessage(error, String(error)),
        ...(error instanceof Error && 'requiresReload' in error && error.requiresReload === true ? { requiresReload: true } : {}),
        ...(error instanceof Error && 'noChangeApplied' in error && error.noChangeApplied === true ? { noChangeApplied: true } : {}) });
    });
  });
}
