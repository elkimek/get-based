import type { ImportBodyOperations, ImportProfileOperations, ImportedDataOperations, RawCreateProfile, RawSaveProfile } from '../types/export-import.js';
import { createProfile, discardEmptyImportedProfile, loadProfile } from './profile.js';
import { saveImportedDataForProfile } from './data.js';
import { reconcileCustomMarkerLifecycle } from './custom-marker-lifecycle.js';
import { hasPortableProfileContent, projectPortableProfileData } from './portable-profile-data.js';

export async function saveNewPortableProfile(bp: ImportProfileOperations, importData: ImportedDataOperations, restoredId?: string) {
  reconcileCustomMarkerLifecycle(importData);
  const id = await (createProfile as RawCreateProfile)(bp.name || 'Imported', {
    sex: bp.sex || null, dob: bp.dob || null, location: bp.location || { country: '', zip: '' },
    tags: bp.tags || [], notes: bp.notes || '', status: bp.status || 'active', avatar: bp.avatar || null,
    height: bp.height || null, heightUnit: bp.heightUnit || 'cm', pinned: bp.pinned === true, skipInitialSync: true, restoredId,
  });
  if (!id) throw new Error('Could not create the profile.');
  try {
    if (!await (saveImportedDataForProfile as RawSaveProfile)(id, importData, { forceProfileScope: true, expectedData: null })) {
      throw new Error('Could not save the imported profile.');
    }
  } catch (error) {
    await discardEmptyImportedProfile(id);
    throw error;
  }
  return id;
}

/** Sharing authorizes exactly one newly allocated profile and no other restore formats. */
export async function importNewSharedProfile(value: unknown): Promise<{ profileId: string }> {
  const document = value as ImportBodyOperations | null;
  if (document?.version !== 2 || !document.profile || typeof document.profile.name !== 'string'
      || !document.profile.name.trim() || !Array.isArray(document.entries)
      || ['format', 'type', 'profiles', 'settings', 'wallet'].some(key => Object.hasOwn(document, key))) {
    throw new Error('This link does not contain a single portable profile.');
  }
  const data = projectPortableProfileData(document) as ImportedDataOperations;
  if (!hasPortableProfileContent(data)) throw new Error('Shared profile contains no portable records.');
  const profileId = await saveNewPortableProfile(document.profile, data);
  await loadProfile(profileId);
  return { profileId };
}
