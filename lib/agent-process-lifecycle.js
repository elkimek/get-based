// @ts-check
/** @returns {Error} */
export function agentAbortError() {
  const error = new Error('Agent request cancelled.');
  error.name = 'AbortError';
  return error;
}
/** @param {AbortSignal | undefined} signal */
export function assertAgentNotAborted(signal) {
  if (signal?.aborted) throw agentAbortError();
}

/**
 * Observe process failure immediately and settle cancellation even if the CLI
 * ignores SIGTERM. The caller still owns stdout parsing and private-file cleanup.
 * @param {import('node:child_process').ChildProcess} child
 * @param {AbortSignal | undefined} signal
 */
export function observeAgentProcess(child, signal) {
  let exited = false;
  let closed = false;
  child.once('close', () => { closed = true; });
  let terminated = false;
  /** @type {(reason: Error) => void} */
  let rejectCompletion = () => {};
  const completion = new Promise((resolve, reject) => {
    rejectCompletion = reject;
    child.once('error', reject);
    child.stdin?.on('error', reject);
    child.once('exit', code => { exited = true; resolve(code); });
  });
  // File and stream setup may still be in progress when the process fails.
  void completion.catch(() => {});
  const stop = () => {
    rejectCompletion(agentAbortError());
    if (!exited && !terminated) {
      terminated = true;
      try { child.kill('SIGTERM'); } catch {}
    }
  };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  return {
    completion,
    stop,
    /** @param {(() => Promise<unknown>) | undefined} [retryCleanup] */
    dispose(retryCleanup) {
      // On Windows an inherited file may remain locked until stdio closes.
      if (retryCleanup && !closed) child.once('close', () => { void retryCleanup().catch(() => {}); });
      signal?.removeEventListener('abort', stop);
      if (!exited) stop();
    },
  };
}
