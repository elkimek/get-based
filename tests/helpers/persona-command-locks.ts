import { vi } from 'vitest';
/** Unit fixture only. Browser acceptance uses actual cross-tab Web Locks. */
export function installPersonaCommandTestLocks() {
  const tails = new Map<string, Promise<void>>();
  vi.stubGlobal('navigator', { locks: { request(name: string, _options: unknown, callback: (lock: { name: string; mode: 'exclusive' }) => unknown) {
    const pending = (tails.get(name) || Promise.resolve()).then(() => callback({ name, mode: 'exclusive' }));
    tails.set(name, pending.then(() => undefined, () => undefined)); return pending;
  } } });
}
