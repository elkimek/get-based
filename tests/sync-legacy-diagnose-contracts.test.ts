// @vitest-environment node
import {expect, it} from 'vitest';
import {renderSyncDiagnoseModal} from '../js/sync-diagnose-render.js';
import {syncLegacyDiagnoseContracts} from './helpers/sync-legacy-diagnose-contracts.js';

it('the genuine current Diagnose owner satisfies every retained legacy presentation obligation', () => {
  expect(syncLegacyDiagnoseContracts()).toEqual({panels:true,hostile:true,tombstones:true,compact:true,refresh:true,
    summary:true,storageCopy:true,cutoverBreakdown:true,cutoverGating:true,cutoverEnabled:true});
});
for (const [name, before, after, obligation] of [
  ['health label', '>Verified<', '>Unverified<', 'panels'],
  ['deleted column', '<th>deleted</th>', '<th>removed</th>', 'tombstones'],
  ['compact action', 'data-sync-diagnose-action="compact-relay"', 'data-sync-diagnose-action="copy"', 'compact'],
  ['refresh action', 'data-sync-diagnose-action="refresh-relay-storage"', 'data-sync-diagnose-action="copy"', 'refresh'],
  ['summary heading', 'Sync looks healthy', 'Sync looks unverified', 'summary'],
  ['storage guidance', 'Choose Reduce storage soon', 'Choose another action soon', 'storageCopy'],
  ['cutover blocker', 'local=2 rows=0', 'local=2 rows=2', 'cutoverBreakdown'],
  ['disabled gate', ' disabled="" title="Push the pending items below first."', ' title="Push the pending items below first."', 'cutoverGating'],
  ['enabled badge', '>ON</span>', '>OFF</span>', 'cutoverEnabled'],
  ['escaped owner', '&lt;img data-probe="owner">', '<img data-probe="owner">', 'hostile'],
] as const) it(`rejects current-owner corruption of ${name}`, () => {
  let hits = 0;
  const receipt = syncLegacyDiagnoseContracts(input => {
    const actual = renderSyncDiagnoseModal(input);
    if (!actual.includes(before)) return actual;
    hits += 1;
    return actual.replace(before, after);
  });
  expect(hits, 'Mutation must reach a genuine rendered witness').toBeGreaterThan(0);
  expect(receipt[obligation]).toBe(false);
});
