// Verdict callbacks edit a private profile snapshot; storage owns publication.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import type { captureAIVerdictOwner } from './ai-verdict-owner.js';
import type { ProfileData } from '../types/app-state.js';

export async function commitAIVerdictData(owner: ReturnType<typeof captureAIVerdictOwner>, edit: (draft: ProfileData) => boolean): Promise<boolean> {
  if (!owner.current() || !owner.root || !owner.profile || isProfileReadBlocked(owner.profile)) return false;
  let base: ProfileData, draft: ProfileData;
  try {
    base = structuredClone(profileDataBaseline(owner.root) || owner.root);
    draft = structuredClone(base);
    if (!edit(draft)) return false;
    const saved = await saveImportedDataForProfile(owner.profile, draft, { forceProfileScope: true, baseData: base });
    if (!saved) return false;
  } catch { return false; }
  // An accepted write can finish after switching profiles. Update its captured
  // root without publishing into the replacement or swapping global state.
  try {
    if (state.currentProfile !== owner.profile || state.importedData !== owner.root) {
      const result = rebaseLiveProfileData(base, owner.root, profileDataBaseline(draft) || draft);
      adoptProfileData(owner.root, result.data); rememberProfileData(owner.root, result.baseline);
    }
    if (owner.current()) notifyProfileDataContextChanged(owner.profile);
  } catch { /* A committed write cannot be undone by a view notification. */ }
  return true;
}
