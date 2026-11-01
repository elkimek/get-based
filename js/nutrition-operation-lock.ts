// Meal cache and canonical commits share one order across renderers.
const tails = new Map<string, Promise<unknown>>();
export function queueNutritionOperation<T>(profileId: string, operation: () => Promise<T>): Promise<T> {
  const run = () => (globalThis as { navigator?: { locks?: { request?: LockManager['request'] } } }).navigator?.locks?.request
    ? navigator.locks.request(`getbased-nutrition:${profileId}`, operation) : operation();
  const result = (tails.get(profileId) || Promise.resolve()).then(run);
  const settled = result.catch(() => {}); tails.set(profileId, settled);
  void settled.then(() => { if (tails.get(profileId) === settled) tails.delete(profileId); });
  return result;
}
