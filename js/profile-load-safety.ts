const failedReads = new Set<string>();
const pendingReads = new Map<string, object>();

export function isProfileReadBlocked(profileId: string): boolean {
  return failedReads.has(profileId);
}

export async function readProfileForLoad<T>(profileId: string, read: () => T | Promise<T>,
  notify: (message: string, severity: string, duration: number) => unknown): Promise<T> {
  const attempt = {};
  pendingReads.set(profileId, attempt);
  try {
    const value = await read();
    if (pendingReads.get(profileId) === attempt) failedReads.delete(profileId);
    return value;
  } catch (error) {
    if (pendingReads.get(profileId) === attempt) {
      failedReads.add(profileId);
      notify('Could not read this profile. Your saved data has not been replaced. Reload to retry.', 'error', 12000);
    }
    throw error;
  } finally {
    if (pendingReads.get(profileId) === attempt) pendingReads.delete(profileId);
  }
}
