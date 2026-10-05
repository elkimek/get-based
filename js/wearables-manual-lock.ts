// Manual rows share one read/modify/write boundary per profile. Web Locks
// coordinate tabs; the local queue covers runtimes without that API. Profile
// metadata commits stay outside this lock to avoid nesting storage locks.
const manualRowWrites = new Map<string, Promise<unknown>>();
export function queueManualRowWrite<T>(profileId: string, write: () => Promise<T>): Promise<T> {
  profileId = profileId || 'default';
  const previous = manualRowWrites.get(profileId) || Promise.resolve();
  const pending = previous.catch(() => {}).then(() => {
    const locks = globalThis.navigator?.locks;
    return locks?.request
      ? locks.request(`getbased-manual-rows:${profileId}`, { mode: 'exclusive' }, write)
      : write();
  });
  manualRowWrites.set(profileId, pending);
  const cleanup = () => { if (manualRowWrites.get(profileId) === pending) manualRowWrites.delete(profileId); };
  pending.then(cleanup, cleanup);
  return pending;
}

