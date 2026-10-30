// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { readCurrentLabReport, prepareReviewedLabReport, commitReviewedLabReport } from '../js/lab-report-records.js';
import { projectLabReport } from '../js/lab-report-proposals.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
function applyNativeReport(draft: { payload: AgentDataProposal }) { return commitReviewedLabReport(profile, draft.payload, () => state.currentProfile === profile && isAgentDataEnabled('labReports')); }
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import type { ProfileData } from '../types/app-state.js';
import { mergeImportedData } from '../js/data-merge.js';

const day = '2026-10-20', glucose = 'biochemistry.glucose', insulin = 'diabetes.insulin', homa = 'diabetes.homaIR';
const groups = ['biochemistry', 'diabetes'].map(key => String(MARKER_SCHEMA[key]!.group || MARKER_SCHEMA[key]!.label));
const original = { profile: state.currentProfile, data: state.importedData, sex: state.profileSex };
const evidence = 'Remove my latest report for the evening sample collected on 20 October 2026. Keep the morning sample and show any restored older values.';
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
function tools() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
// Native source-removal safety remains covered while chat keeps report metadata read-only.
async function propose() {
  const baseline = await readCurrentLabReport(profile, 'evening-report');
  if (!baseline) throw new Error('Missing native report');
  const payload: AgentDataProposal = { resource: 'labReports', operation: 'remove', recordId: 'evening-report', baseline: JSON.stringify(baseline), patch: '{}', evidence, reason: 'Native source review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  await prepareReviewedLabReport(profile, payload);
  return { nativeReview: projectLabReport(payload), draft: { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), profileId: profile, payload } };
}
beforeEach(async () => {
  profile = `report-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.profileSex = 'male'; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true); groups.forEach(group => setGroupInAIContext(group, true));
  state.importedData.entries = [
    { panelId: 'morning', date: day, specimen: 'serum', markers: { [glucose]: 5 }, markerSources: { [glucose]: { snapshotId: 'morning-report', file: '/private/morning-patient.pdf', at: 100 } }, context: { sampleTime: '08:00', fasting: true }, updatedAt: 100 },
    { panelId: 'evening', date: day, specimen: 'plasma', markers: { [glucose]: 7, [insulin]: 10, [homa]: 3.11 },
      markerSources: { [glucose]: { snapshotId: 'evening-report', file: '/private/secret-patient.pdf', at: 200 }, [insulin]: { snapshotId: 'evening-report', file: '/private/secret-patient.pdf', at: 200 }, [homa]: { file: null, at: 200, derivedFrom: [glucose, insulin] } },
      context: { sampleTime: '16:00', fasting: false, cycleDay: 12, cyclePhase: 'follicular' }, collectionContextSources: { sampleTime: 'evening-report', fasting: 'evening-report' }, updatedAt: 200 },
  ];
  state.importedData.importSnapshots = [
    { id: 'morning-report', panelId: 'morning', date: day, fileName: '/private/morning-patient.pdf', type: 'pdf', importedAt: 100, adoptReferenceRanges: true, markers: [{ mappedKey: glucose, matched: true, value: 5, unit: 'mmol/l', refMin: 3.7, refMax: 5.7 }] },
    { id: 'older-evening', panelId: 'evening', date: day, fileName: '/private/older-patient.pdf', type: 'pdf', importedAt: 50, adoptReferenceRanges: true, sampleTime: '15:30', fasting: true, collectionContextApplied: ['sampleTime', 'fasting'], markers: [{ mappedKey: glucose, matched: true, value: 6, unit: 'mmol/l', refMin: 4, refMax: 6 }] },
    { id: 'evening-report', panelId: 'evening', date: day, fileName: '/private/secret-patient.pdf', type: 'pdf', importedAt: 200, adoptReferenceRanges: true, sampleTime: '16:00', fasting: false, collectionContextApplied: ['sampleTime', 'fasting'],
      rawText: 'private-extraction-sentinel', markers: [{ mappedKey: glucose, matched: true, value: 7, unit: 'mmol/l', refMin: 4.5, refMax: 6.5 }, { mappedKey: insulin, matched: true, value: 10, unit: 'mU/l' }] },
  ];
  state.importedData.refOverrides = { [glucose]: { refMin: 4.5, refMax: 6.5, refSource: 'import', labRefDate: day, labRefSnapshotId: 'evening-report' } };
  state.importedData.importBenchmarks = [{ id: 'private-diagnostic', status: 'confirmed', fileName: '/private/secret-patient.pdf' }];
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => { vi.restoreAllMocks(); clearSyncSaveTimers(); groups.forEach(group => setGroupInAIContext(group, true)); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true); await storage.encryptedRemoveItem(key); state.currentProfile = original.profile; state.importedData = original.data; state.profileSex = original.sex; });

it('lists exact report identities without publishing private source metadata or changing data', async () => {
  const before = await storage.encryptedGetItem(key), runtime = tools();
  const result = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'labReports' } }); expect(result.success).toBe(true);
  const list = JSON.parse(result.contentItems[0].text); expect(list.operations).toEqual([]); expect(list.records.map((row: { recordId: string }) => row.recordId)).toEqual(['evening-report', 'morning-report', 'older-evening']);
  expect(JSON.stringify(list)).not.toMatch(/\/private\/|patient\.pdf|rawText|extraction-sentinel/); expect(await storage.encryptedGetItem(key)).toBe(before);
});
it('freezes faithful result, calculation, collection and stored-range effects before approval', async () => {
  const before = await stored(), { draft, nativeReview } = await propose(), payload = draft.payload as { baseline: string };
  const snapshot = JSON.parse(payload.baseline); expect(snapshot.plan.results).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: glucose, before: 7, after: 6 }), expect.objectContaining({ key: insulin, before: 10, after: null }), expect.objectContaining({ key: homa, before: 3.11, after: null }),
  ]));
  expect(snapshot.plan.collection).toContainEqual({ field: 'sampleTime', before: '16:00', after: '15:30' });
  expect(snapshot.plan.ranges[0]).toMatchObject({ key: glucose, before: { referenceMin: 4.5 }, after: { referenceMin: 3.7 } });
  expect(nativeReview.plan).toEqual(snapshot.plan);
  expect(JSON.stringify(nativeReview)).not.toMatch(/\/private\/|secret-patient|rawText|extraction-sentinel/);
  expect(projectAgentDraftCards({ agentDrafts: [draft] })[0]).toMatchObject({ nativeOnly: true });
  expect(JSON.stringify(draft.payload)).not.toMatch(/private|patient|rawText|extraction-sentinel/); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});
it('applies the exact reviewed effects once and retains other samples and diagnostic history', async () => {
  const before = await stored(), { draft } = await propose(); await applyNativeReport(draft); const saved = await stored();
  expect(saved.entries[0]).toEqual(before.entries[0]); expect(saved.entries[1]!.markers).toEqual({ [glucose]: 6 });
  expect(saved.entries[1]!.context).toMatchObject({ sampleTime: '15:30', fasting: true, cycleDay: 12, cyclePhase: 'follicular' });
  expect(saved.importSnapshots.map(row => row.id)).toEqual(['morning-report', 'older-evening']); expect(saved.importBenchmarks).toEqual(before.importBenchmarks);
  expect(saved.refOverrides[glucose]).toMatchObject({ refMin: 3.7, refMax: 5.7 }); await expect(applyNativeReport(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(saved);
});
it.each(['group', 'source', 'insight'])('refuses %s revocation and removes the pending review from model feedback', async kind => {
  const before = await stored(), { draft } = await propose();
  if (kind === 'group') setGroupInAIContext(groups[1]!, false); else setContextSourceEnabled(kind === 'source' ? CONTEXT_SOURCE_IDS.LAB_MARKERS : CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false);
  expect(canDiscloseAgentDraftReview(draft)).toBe(false); await expect(applyNativeReport(draft)).rejects.toThrow(/authorized|disabled/); expect(await stored()).toEqual(before);
});
it.each(['source', 'group'])('checks late %s changes inside the locked save', async kind => {
  const before = await stored(), { draft } = await propose(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  const peer = structuredClone(before); peer.importSnapshots[2].fileName = '/private/peer-source.pdf';
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) { if (kind === 'source') await write(key, JSON.stringify(peer)); else setGroupInAIContext(groups[1]!, false); } return read(...args); });
  await expect(applyNativeReport(draft)).rejects.toThrow(/changed|authorized/); expect(await stored()).toEqual(kind === 'source' ? peer : before);
  const live = structuredClone(before); if (kind === 'group') live.contextSourceSettings[`lab-group-${groups[1]}`] = false;
  expect(state.importedData).toEqual(live);
});
it('keeps a storage failure retryable without publishing removed values', async () => {
  const before = await stored(), { draft } = await propose(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic write failure'); return write(...args); });
  await expect(applyNativeReport(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.restoreAllMocks(); await applyNativeReport(draft); expect((await stored()).importSnapshots.some(row => row.id === 'evening-report')).toBe(false);
});
it('rejects changed private source history and a tampered public effect plan', async () => {
  const before = await stored(), { draft } = await propose(), payload = draft.payload as { baseline: string }, snapshot = JSON.parse(payload.baseline);
  snapshot.plan.results.find((row: { key: string }) => row.key === glucose).after = 99; payload.baseline = JSON.stringify(snapshot);
  await expect(applyNativeReport(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(before);
});
it('does not publish an exact read after a group is revoked during its hash', async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { const value = await digest(...args); setGroupInAIContext(groups[1]!, false); return value; });
  const result = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'labReports', recordId: 'evening-report' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).not.toMatch(/15:30|16:00|secret-patient|cycleDay/);
});
it('does not create reports or accept arbitrary source-field patches', async () => {
  const before = await stored(), runtime = tools();
  expect((await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'labReports', create: true } })).success).toBe(false);
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'labReports', recordId: 'evening-report' } }), snapshot = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'labReports', operation: 'remove', snapshotId: snapshot.snapshotId, patch: '{"fileName":"fake.pdf"}', reason: 'Explicit request', evidence } });
  expect(result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('does not restore an older report retained behind an active removal clock', async () => {
  state.importedData._deleted = { importSnapshots: ['older-evening'] }; state.importedData._deletedAt = { importSnapshots: { 'older-evening': 300 } };
  expect(await saveImportedData()).toBe(true); const before = await stored(), { draft } = await propose();
  const snapshot = JSON.parse((draft.payload as { baseline: string }).baseline); expect(snapshot.plan.sampleRemoved).toBe(true);
  expect(snapshot.plan.results.find((row: { key: string }) => row.key === glucose).after).toBeNull();
  await applyNativeReport(draft); expect((await stored()).entries).toEqual([before.entries[0]]);
});
it('does not revive cleared report collection facts in either old-replica merge order', async () => {
  state.importedData.importSnapshots = state.importedData.importSnapshots.filter(row => row.id !== 'older-evening');
  const entry = state.importedData.entries[1]!; entry.markers['biochemistry.alt'] = 30;
  delete entry.context!.cycleDay; delete entry.context!.cyclePhase;
  expect(await saveImportedData()).toBe(true); const before = await stored(), { draft } = await propose(); await applyNativeReport(draft); const saved = await stored();
  for (const merged of [mergeImportedData(before, saved), mergeImportedData(saved, before)]) {
    const evening = merged.entries.find((row: { panelId?: string }) => row.panelId === 'evening');
    expect(evening).toMatchObject({ markers: { 'biochemistry.alt': 30 }, context: { sampleTime: null, fasting: null } });
    expect(evening?.markerSources?.[glucose]).toBeUndefined(); expect(merged.importSnapshots.some(row => row.id === 'evening-report')).toBe(false);
  }
});
it('refuses report removal before publishing a draft or disclosing any effect plan', async () => {
  const before = await stored(), published = vi.fn(() => { setGroupInAIContext(groups[1]!, false); });
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile), onDraftCreated: published });
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'labReports', recordId: 'evening-report' } }), snapshot = JSON.parse(read.contentItems[0].text);
  const prepared = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'labReports', operation: 'remove', snapshotId: snapshot.snapshotId, patch: '{}', reason: 'Explicit removal request', evidence } });
  expect(prepared.success).toBe(false); expect(prepared.contentItems[0].text).not.toMatch(/15:30|cycleDay|referenceMin|secret-patient/); expect(published).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]); expect(await stored()).toEqual(before);
});
it.each([false, true])('keeps a restored older value authoritative in both merge orders with a future source clock: %s', async future => {
  if (future) { state.importedData.entries[1]!.markerSources![glucose]!.at = Date.now() + 86400000; expect(await saveImportedData()).toBe(true); }
  const before = await stored(), { draft } = await propose(); await applyNativeReport(draft); const saved = await stored();
  expect(saved.entries[1]!.markerSources![glucose]!.at).toBeGreaterThan(before.entries[1]!.markerSources![glucose]!.at as number);
  expect(saved.importSnapshots.find(row => row.id === 'older-evening').importedAt).toBe(50);
  for (const merged of [mergeImportedData(before, saved), mergeImportedData(saved, before)]) {
    const evening = merged.entries.find((row: { panelId?: string }) => row.panelId === 'evening');
    expect(evening?.markers[glucose]).toBe(6); expect(evening?.markerSources?.[glucose]?.snapshotId).toBe('older-evening');
    expect(evening?.context).toMatchObject({ sampleTime: '15:30', fasting: true });
    expect(merged.importSnapshots.some(row => row.id === 'evening-report')).toBe(false);
  }
});
