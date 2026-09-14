// @ts-check
const failedReads = new Set();

export function isProfileReadBlocked(profileId) {
  return failedReads.has(profileId);
}

export async function readProfileForLoad(profileId, read, notify) {
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
