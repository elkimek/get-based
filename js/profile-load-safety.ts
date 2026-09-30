const failedReads = new Set<string>();

export function isProfileReadBlocked(profileId: string): boolean {
  return failedReads.has(profileId);
}

export async function readProfileForLoad<T>(profileId: string, read: () => T | Promise<T>,
  notify: (message: string, severity: string, duration: number) => unknown): Promise<T> {
  try {
    const value = await read();
    failedReads.delete(profileId);
    return value;
  } catch (error) {
    failedReads.add(profileId);
    notify('Could not read this profile. Your saved data has not been replaced. Reload to retry.', 'error', 12000);
    throw error;
  }
}
