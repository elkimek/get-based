// Exact browser tools read durable profile data without adopting it into an
// open editor or performing a migration before the user approves a change.
import type { ProfileData } from '../types/app-state.js';
import { encryptedGetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import { isProfileReadBlocked } from './profile-load-safety.js';

export async function readAgentProfileRecords(profileId: string): Promise<ProfileData> {
  if (!profileId || isProfileReadBlocked(profileId)) throw new Error('Reload this profile before editing its records.');
  const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true });
  const parsed: unknown = raw === null ? {} : JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved profile records could not be read safely.');
  return parsed as ProfileData;
}
