/** Only the process events, cancellation and stdin errors used by the observer. */
export interface AgentProcess {
  stdin?: { on(event: 'error', listener: (error: Error) => void): unknown } | null;
  kill(signal: 'SIGTERM'): unknown;
  once(event: 'close', listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
}

export interface ObservedAgentProcess {
  completion: Promise<number | null>;
  stop(): void;
  dispose(retryCleanup?: () => Promise<unknown>): void;
}

export function agentAbortError(): Error {
  const error = new Error('Agent request cancelled.');
  error.name = 'AbortError';
  return error;
}
export function assertAgentNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw agentAbortError();
}

/**
 * Observe process failure immediately and settle cancellation even if the CLI
 * ignores SIGTERM. The caller still owns stdout parsing and private-file cleanup.
 */
export function observeAgentProcess(child: AgentProcess, signal?: AbortSignal): ObservedAgentProcess {
  let exited = false;
  let closed = false;
  child.once('close', () => { closed = true; });
  let terminated = false;
  let rejectCompletion: (reason: Error) => void = () => {};
  const completion = new Promise<number | null>((resolve, reject) => {
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
    dispose(retryCleanup?: () => Promise<unknown>): void {
      // On Windows an inherited file may remain locked until stdio closes.
      if (retryCleanup && !closed) child.once('close', () => { void retryCleanup().catch(() => {}); });
      signal?.removeEventListener('abort', stop);
      if (!exited) stop();
    },
  };
}
