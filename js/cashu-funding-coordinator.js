// @ts-check
// One tab owns mint monitoring; other tabs receive committed results locally.
export function createFundingCoordinator(onLeadership, onResult, onWake, env = globalThis) {
  let controller = null;
  let channel = null;
  let release = null;
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
        const held = new Promise(resolve => { release = resolve; });
        onLeadership(true);
        try { await held; }
        finally { leader = false; release = null; onLeadership(false); }
      };
      if (env.navigator?.locks?.request) {
        void env.navigator.locks.request('getbased-cashu-funding-monitor', { signal: current.signal }, own).catch(() => {});
      } else { void own(); }
    },
    wake() { if (leader) onWake(); else channel?.postMessage({ type: 'wake' }); },
    publish(result) { if (leader) channel?.postMessage({ type: 'result', result }); },
    stop() {
      controller?.abort();
      controller = null;
      release?.();
      channel?.close();
      channel = null;
    },
  };
}
