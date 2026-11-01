import type { StoredProfileRecord } from './profile-list-store.js';
/** Native profile ownership stays behind this cycle-safe port. */
export interface ProfileSelectionOwner {
  readProfiles(): Promise<StoredProfileRecord[]>;
  ownsData(profileId: string, data: unknown): boolean;
  validateSnapshot(saved: string | null): boolean;
  switchProfile(profileId: string, beforePublish: (saved: string | null) => Promise<boolean>): Promise<boolean | undefined>;
}
let owner: ProfileSelectionOwner | null = null;
export function configureProfileSelectionOwner(value: ProfileSelectionOwner | null) { const previous = owner; owner = value; return previous; }
export function getProfileSelectionOwner() { return owner; }
