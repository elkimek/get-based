// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import { encryptedGetItem, encryptedRemoveItem } from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { normalizeNutritionTargets } from '../js/nutrition-targets.js';
import { getConfiguredArrayItemId } from '../js/data-merge.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import type { AgentDataOperation, AgentDataResource } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';

const previous = { profile: state.currentProfile, data: state.importedData, active: localStorage.getItem('labcharts-active-profile') };
let profile: string, key: string;
const stored = async () => JSON.parse((await encryptedGetItem(key, { throwOnDecryptError: true }))!) as ProfileData;
beforeEach(async () => {
  profile = `generic-integrity-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; localStorage.setItem('labcharts-active-profile', profile); state.importedData = createDefaultProfileData();
  state.importedData.contextNotes = 'Keep original context';
  state.importedData.notes = [{ date: '2026-01-01', text: 'Existing note', extension: 'Retain note provenance' }, { date: '2026-01-02', text: 'Peer note' }];
  state.importedData.healthGoals = [{ text: 'Unrelated goal', severity: 'minor', extension: 'Retain goal metadata' }];
  state.importedData.supplements = [
    { id: 'therapy-a', name: 'Existing therapy', type: 'supplement', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null, dose: 'one capsule', extension: 'Retain period provenance' }], extension: 'Retain therapy provenance' },
    { id: 'therapy-peer', name: 'Peer therapy', type: 'medication', startDate: '2026-01-01' },
  ];
  state.importedData.nutritionTargets = normalizeNutritionTargets({ proteinBasis: 'custom', proteinGPerKg: 1.6, fiberG: 30, configured: true });
  expect(await saveImportedData({ skipSync: true })).toBe(true);
});
afterEach(async () => {
  clearSyncSaveTimers(); await encryptedRemoveItem(key); state.currentProfile = previous.profile; state.importedData = previous.data;
  if (previous.active === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previous.active);
});

const cases: { resource: AgentDataResource; operation: AgentDataOperation; patch: Record<string, unknown> }[] = [
  { resource: 'supplements', operation: 'add', patch: { name: 'New therapy', type: 'supplement', startDate: '2026-10-23' } },
  { resource: 'supplements', operation: 'update', patch: { name: 'Corrected therapy' } },
  { resource: 'supplements', operation: 'remove', patch: {} },
  { resource: 'supplements', operation: 'pause', patch: { date: '2026-10-23' } },
  { resource: 'supplements', operation: 'stop', patch: { date: '2026-10-23' } },
  { resource: 'supplements', operation: 'restart', patch: { date: '2026-10-23' } },
  { resource: 'supplements', operation: 'changeDose', patch: { date: '2026-10-23', dosage: 'two capsules' } },
  { resource: 'nutritionTargets', operation: 'update', patch: { fiberG: 35 } },
  { resource: 'nutritionTargets', operation: 'reset', patch: {} },
  { resource: 'datedNotes', operation: 'add', patch: { date: '2026-10-23', text: 'New note' } },
  { resource: 'datedNotes', operation: 'update', patch: { text: 'Corrected note' } },
  { resource: 'datedNotes', operation: 'remove', patch: {} },
  { resource: 'profileNotes', operation: 'update', patch: { text: 'Corrected context' } },
  { resource: 'profileNotes', operation: 'remove', patch: {} },
];
it.each(cases)('durably applies $resource $operation once without overwriting peers or source metadata', async ({ resource, operation, patch }) => {
  if (operation === 'restart') {
    state.importedData.supplements[0]!.periods = [{ start: '2026-01-01', end: '2026-05-01', dose: 'one capsule', extension: 'Retain period provenance' }];
    state.importedData.supplements[0]!.endDate = '2026-05-01'; state.importedData.supplements[0]!.lifecycle = { state: 'ended' };
    expect(await saveImportedData({ skipSync: true })).toBe(true);
  }
  const before = await stored(), evidence = `Please ${operation} this exact test record with ${JSON.stringify(patch)}.`;
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
  const recordId = resource === 'supplements' ? 'therapy-a' : resource === 'datedNotes' ? getConfiguredArrayItemId('notes', before.notes[0])! : '';
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, ...(operation === 'add' ? { create: true } : recordId ? { recordId } : {}) } });
  expect(read.success, read.contentItems[0].text).toBe(true);
  const prepared = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Apply only the explicitly supplied correction.' } });
  expect(prepared.success, prepared.contentItems[0].text).toBe(true); expect(await stored()).toEqual(before);
  const draft = { ...runtime.getDrafts()[0]!, profileId: profile };
  await applyAgentDraft(draft);
  const after = await stored(), root = resource === 'datedNotes' ? 'notes' : resource === 'profileNotes' ? 'contextNotes' : resource;
  const metadata = ['_deleted', '_deletedAt', '_deletedClearedAt'];
  const protect = (data: ProfileData) => ({
    ...Object.fromEntries(Object.entries(data).filter(([name]) => ![root, ...metadata].includes(name))),
    // Native tombstones/restore clocks change only for the reviewed collection.
    ...Object.fromEntries(metadata.map(name => [name, Object.fromEntries(Object.entries((data[name] || {}) as object).filter(([field]) => field !== root))])),
  });
  expect(protect(after)).toEqual(protect(before));
  expect(after[root]).not.toEqual(before[root]);
  if (resource === 'supplements') {
    expect(after.supplements.find(row => row.id === 'therapy-peer')).toEqual(before.supplements[1]);
    const target = after.supplements.find(row => row.id === 'therapy-a');
    if (operation === 'remove') { expect(target).toBeUndefined(); expect(after._deleted.supplements).toContain('therapy-a'); }
    else {
      expect(target!.extension).toBe('Retain therapy provenance');
      expect(target!.periods![0]!.extension).toBe('Retain period provenance');
      if (operation === 'pause' || operation === 'stop') expect(target).toMatchObject({ endDate: '2026-10-23', lifecycle: { state: operation === 'pause' ? 'paused' : 'ended' } });
      if (operation === 'restart') expect(target!.periods).toEqual([before.supplements[0]!.periods![0], expect.objectContaining({ start: '2026-10-23', end: null, dose: 'one capsule' })]);
      if (operation === 'changeDose') expect(target!.periods).toEqual([expect.objectContaining({ end: '2026-10-22', dose: 'one capsule' }), expect.objectContaining({ start: '2026-10-23', dose: 'two capsules' })]);
      if (operation === 'add') expect(after.supplements.find(row => row.name === 'New therapy')).toMatchObject({ schedule: { mode: 'other', timesPerDay: null } });
      if (operation === 'update') expect(target!.name).toBe('Corrected therapy');
    }
  } else if (resource === 'datedNotes') {
    expect(after.notes.find(row => row.date === '2026-01-02')).toEqual(before.notes[1]);
    if (operation === 'remove') expect(after.notes.find(row => row.date === '2026-01-01')).toBeUndefined();
    if (operation === 'update') expect(after.notes.find(row => row.date === '2026-01-01')).toMatchObject({ text: 'Corrected note', extension: 'Retain note provenance' });
    if (operation === 'add') expect(after.notes.find(row => row.date === '2026-10-23')!.text).toBe('New note');
  } else if (resource === 'nutritionTargets') {
    expect(after.nutritionTargets).toEqual(operation === 'reset' ? null : { ...before.nutritionTargets, fiberG: 35 });
  } else expect(after.contextNotes).toBe(operation === 'remove' ? '' : 'Corrected context');
  await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(after);
});
