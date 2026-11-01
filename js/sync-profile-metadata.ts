import {getPlannerItemRows} from './sync-delta-planner-context.js';
import {createDeltaWrite, decodeRowPayload} from './sync-delta-row-codec.js';
import type {DeltaItemRow, DeltaPlan} from './sync-delta-row-codec.js';
import {selectSyncedProfile, syncedProfileMetadataClock, SYNC_PROFILE_FIELDS} from './sync-profile-fields.js';
import {_djb2} from './sync-delta-id.js';
import {mutateProfiles} from './profile-list-store.js';
import {markSyncProfileDirty} from './sync-dirty-state.js';
export const PROFILE_METADATA_SURFACE = '_profileMetadata';
const hasMetadata = (profile: Record<string, unknown>) => SYNC_PROFILE_FIELDS.some(field => Object.hasOwn(profile, field));
async function metadataRows(profileId: string) {
  const values: {row: DeltaItemRow; profile: Record<string, unknown>; clock: number}[] = [];
  for (const row of getPlannerItemRows(profileId, PROFILE_METADATA_SURFACE)) {
    if (row.itemId !== PROFILE_METADATA_SURFACE || row.isDeleted) continue;
    try {
      const decoded = await decodeRowPayload(row) as {v?: unknown} | null;
      const profile = selectSyncedProfile(decoded?.v), clock = syncedProfileMetadataClock(profile);
      if (profile?.id === profileId && hasMetadata(profile) && clock > 0) values.push({row, profile, clock});
    } catch { /* Invalid metadata cannot hide the usable replica. */ }
  }
  return values.sort((a, b) => {
    const left = JSON.stringify(a.profile), right = JSON.stringify(b.profile);
    return b.clock - a.clock || (right > left ? 1 : right < left ? -1 : 0);
  });
}
/** Metadata has an independent row, so an unrelated profile-blob write cannot
 * erase a rename before another device observes it. */
export async function planProfileMetadata(profileId: string, source: unknown, complete: boolean) {
  const canonical = (await metadataRows(profileId))[0];
  let profile = selectSyncedProfile(source);
  const plan: DeltaPlan = {ops: [], next: {}, plannedAt: Date.now()};
  if (!profile || profile.id !== profileId) return {profile: null, plan};
  if (!hasMetadata(profile)) return {profile, plan};
  let clock = syncedProfileMetadataClock(profile);
  if (complete) clock = Math.max(Date.now(), clock + 1, (canonical?.clock || 0) + 1);
  else if (canonical && (canonical.clock > clock || (canonical.clock === clock && JSON.stringify(canonical.profile) > JSON.stringify(profile)))) {profile = canonical.profile; clock = canonical.clock;}
  else if (!clock) clock = Date.now();
  profile._syncMetadataAt = clock;
  if (!canonical || clock > canonical.clock || (clock === canonical.clock && JSON.stringify(profile) > JSON.stringify(canonical.profile))) {
    const payload = JSON.stringify({v: profile});
    plan.ops.push(createDeltaWrite(canonical?.row, {profileId, arrayName: PROFILE_METADATA_SURFACE,
      itemId: PROFILE_METADATA_SURFACE, payload, syncedAt: new Date(clock).toISOString()}, {}));
    plan.next[PROFILE_METADATA_SURFACE] = _djb2(payload);
  }
  return {profile, plan};
}
export async function resolveProfileMetadata(profileId: string, envelope: unknown, envelopeClock: number) {
  let profile = selectSyncedProfile(envelope), clock = profile && hasMetadata(profile) ? syncedProfileMetadataClock(profile, envelopeClock) : 0;
  for (const candidate of await metadataRows(profileId)) {
    if (candidate.clock > clock || (candidate.clock === clock && JSON.stringify(candidate.profile) > JSON.stringify(profile))) {
      profile = candidate.profile; clock = candidate.clock;
    }
  }
  return {profile, clock};
}

function metadataValues(profile: unknown) {
  const selected = selectSyncedProfile(profile);
  if (selected) delete selected._syncMetadataAt;
  return JSON.stringify(selected);
}
/** Commit the successful edit-clock floor without replacing a newer draft.
 * A draft made while recovery was pending must advance past that recovery. */
export async function commitProfileMetadataClock(profileId: string, source: unknown, outgoing: unknown): Promise<boolean> {
  const clock = syncedProfileMetadataClock(outgoing);
  if (!clock || metadataValues(source) !== metadataValues(outgoing)) return true;
  try {
    await mutateProfiles(profiles => {
      const current = profiles.find(profile => profile.id === profileId);
      if (!current) return {changed: false, value: undefined};
      const edited = metadataValues(current) !== metadataValues(source);
      const next = Math.max(syncedProfileMetadataClock(current), clock + (edited ? 1 : 0));
      if (next === syncedProfileMetadataClock(current)) return {changed: false, value: undefined};
      current._syncMetadataAt = next;
      if (edited) markSyncProfileDirty(profileId);
      return {changed: true, value: undefined};
    });
    return true;
  } catch {return false;}
}
