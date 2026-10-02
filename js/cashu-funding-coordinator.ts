interface FundingMessage<Result> { type?: unknown; result: Result }
interface FundingChannel<Result> {
  onmessage: ((event: MessageEvent<FundingMessage<Result>>) => unknown) | null;
  postMessage(message: { type: 'wake' } | { type: 'result'; result: Result }): void;
  close(): void;
}
interface FundingEnvironment<Result> {
  BroadcastChannel?: new(name: string) => FundingChannel<Result>;
  navigator?: { locks?: { request(name: string, options: { signal: AbortSignal }, own: () => Promise<void>): Promise<unknown> } };
}

// One tab owns mint monitoring; other tabs receive committed results locally.
export function createFundingCoordinator<Result>(onLeadership: (leader: boolean) => unknown, onResult: (result: Result) => unknown, onWake: () => unknown, env: FundingEnvironment<Result> = globalThis) {
  let controller: AbortController | null = null;
  let channel: FundingChannel<Result> | null = null;
  let release: (() => void) | null = null;
  let leader = false;
  return {
    start() {
      if (controller) return;
      const current = new AbortController();
      controller = current;
      if (env.BroadcastChannel) {
        channel = new env.BroadcastChannel('getbased-cashu-funding');
        channel.onmessage = event => {
          if (event.data?.type === 'wake' && leader) onWake();
          if (event.data?.type === 'result' && !leader) onResult(event.data.result);
        };
      }
      const own = async () => {
        if (current.signal.aborted) return;
        leader = true;
        const held = new Promise<void>(resolve => { release = resolve; });
        onLeadership(true);
        try { await held; }
        finally { leader = false; release = null; onLeadership(false); }
      };
      if (env.navigator?.locks?.request) {
        void env.navigator.locks.request('getbased-cashu-funding-monitor', { signal: current.signal }, own).catch(() => {});
      } else { void own(); }
    },
    wake() { if (leader) onWake(); else channel?.postMessage({ type: 'wake' }); },
    publish(result: Result) { if (leader) channel?.postMessage({ type: 'result', result }); },
    stop() {
      controller?.abort();
      controller = null;
      release?.();
      channel?.close();
      channel = null;
    },
  };
}
