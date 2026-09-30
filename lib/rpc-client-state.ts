import type { ChildProcessWithoutNullStreams, SpawnOptionsWithStdioTuple } from 'node:child_process';

export type RpcProcessSpawner = (command: string, args: readonly string[], options: SpawnOptionsWithStdioTuple<'pipe', 'pipe', 'pipe'>) => ChildProcessWithoutNullStreams;

export interface RpcClientOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  spawnImpl?: RpcProcessSpawner;
}

/** Type-only state shared by the two wire protocols; constructors retain their own assignments. */
export interface RpcClientState<K, Initialization> {
  command: string;
  args: string[];
  cwd: string | undefined;
  env: NodeJS.ProcessEnv | undefined;
  requestTimeoutMs: number;
  spawnImpl: RpcProcessSpawner;
  child: ChildProcessWithoutNullStreams | null;
  nextRequestId: number;
  pending: Map<K, PendingRpcRequest>;
  initializePromise: Promise<Initialization> | null;
  closed: boolean;
}

export interface PendingRpcRequest {
  resolve(value: unknown): void;
  reject(reason?: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Keep live-map iteration and per-request error creation in their original order. */
export function rejectPendingRequests<K>(
  getPending: () => Map<K, PendingRpcRequest>,
  reason: () => unknown,
): void {
  for (const pending of getPending().values()) {
    clearTimeout(pending.timer);
    pending.reject(reason());
  }
  getPending().clear();
}
