const erasureHooks = new Set<() => void | Promise<void>>();

export function registerAppErasureHook(hook: () => void | Promise<void>) {
  erasureHooks.add(hook);
}

export async function releaseAppStorageForErasure() {
  const results = await Promise.allSettled([...erasureHooks].map(async hook => hook()));
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) throw new AggregateError(failed.map(result => result.reason), 'Could not close application storage.');
}
