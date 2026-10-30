// Trusted-edition ownership stays inside native closures, never in tool records.
import { getAppExtensionAIConnectionState } from './app-extension-runtime.js';
export class ManagedConnectionConflict extends Error { readonly noChangeApplied = true; }
const unavailable = () => new ManagedConnectionConflict('This edition cannot safely review the connection here. Open native AI settings for its connection controls.');
export function captureManagedConnection(provider: string, required = true) {
  const initial = getAppExtensionAIConnectionState(provider);
  if (!initial.managed) return null;
  if (!initial.configured || typeof initial.owner.ai?.captureConnectionControls !== 'function') {
    if (required) throw unavailable(); return null;
  }
  let capability;
  try { capability = initial.owner.ai.captureConnectionControls(provider); } catch { throw unavailable(); }
  if (!capability || typeof capability.isCurrent !== 'function' || typeof capability.check !== 'function') throw unavailable();
  const controls = capability;
  const current = () => {
    try {
      const latest = getAppExtensionAIConnectionState(provider);
      return latest.owner === initial.owner && latest.managed && latest.configured && controls.isCurrent() === true;
    } catch { return false; }
  };
  if (!current()) throw unavailable();
  return {
    current,
    async check(model: string, options: { signal?: AbortSignal; isCurrent?: () => boolean; timeoutMs?: number } = {}) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), Math.min(8000, Math.max(1, options.timeoutMs ?? 8000)));
      const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      const owned = () => { try { return current() && options.isCurrent?.() !== false; } catch { return false; } };
      const ownerTimer = setInterval(() => { if (!owned()) controller.abort(); }, 50);
      let abort!: () => void;
      const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(unavailable()); signal.addEventListener('abort', abort, { once: true }); });
      try {
        if (signal.aborted || !owned()) throw unavailable();
        if (await Promise.race([Promise.resolve().then(() => controls.check({ model, signal })), cancelled]) !== true || !owned()) throw unavailable();
        return { checkedAt: Date.now(), modelListed: true as const, inferenceTested: false as const };
      } catch { throw unavailable(); }
      finally { clearTimeout(timeout); clearInterval(ownerTimer); signal.removeEventListener('abort', abort); }
    },
  };
}
export type ManagedConnectionBinding = ReturnType<typeof captureManagedConnection>;
