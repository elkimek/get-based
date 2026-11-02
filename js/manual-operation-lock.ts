// Order normal manual commands and reviewed chat commands across renderers.
// Cache row locks remain inside this boundary; profile writes never nest them.
const tails = new Map<string, Promise<unknown>>();
export function queueManualOperation<T>(profileId: string, operation: () => Promise<T>): Promise<T> {
  const run = () => (globalThis as { navigator?: { locks?: { request?: LockManager['request'] } } }).navigator?.locks?.request
    ? navigator.locks.request(`getbased-manual-operation:${profileId}`, operation) : operation();
  const result = (tails.get(profileId) || Promise.resolve()).then(run);
  const settled = result.catch(() => {}); tails.set(profileId, settled);
  void settled.then(() => { if (tails.get(profileId) === settled) tails.delete(profileId); });
  return result;
}
