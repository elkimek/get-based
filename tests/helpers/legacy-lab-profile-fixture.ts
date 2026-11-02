import assert from 'node:assert/strict';
import { migrateLabPanelIdentities } from '../../js/lab-panel-identity.js';

/** Keep original profile files intact while seeding their canonical specimen migration. */
export function migrateLegacyLabFixture<T extends Record<string, unknown>>(profile: T): T {
  const original = structuredClone(profile);
  const ids: Record<number, string> = {
    2: 'legacy_c1e978a9d04c5b0c45888a793f26088af19d728067885744064fdac3d758d813',
    3: 'legacy_7ab5c6bc3b88b3e6641f1186ee846f6ccda46d019d3b858e52358ed3afd4c957',
    5: 'legacy_f7875c9a08cb1c4a03401d3303570a927672033009b896ed155683b947a3f7bb',
    6: 'legacy_14aa6d3a4e7d4b3f15998e853bc86d331d71bc42d033aa8c032f25513a7dc4b4',
  };
  assert(Array.isArray(original.entries));
  assert(Array.isArray(profile.entries));
  const migrated = { entries: profile.entries };
  migrateLabPanelIdentities(migrated); Object.assign(profile, migrated);
  assert.deepEqual(profile, { ...original, entries: original.entries.map((row, index) => ids[index] ? { ...row, panelId: ids[index] } : row) });
  return profile;
}
