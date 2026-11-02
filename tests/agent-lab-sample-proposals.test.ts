// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { labPanelId } from '../js/lab-panel-identity.js';
import { mergeImportedData } from '../js/data-merge.js';
import { activeLabSampleData } from '../js/lab-sample-mutations.js';
import { readCurrentLabSample, prepareReviewedLabSample, commitReviewedLabSample } from '../js/lab-sample-records.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';
import type { LabEntry } from '../types/lab-data.js';
import { editManualMarkerValue, deleteManualMarkerValue } from '../js/marker-detail-store.js';
import { recalculateLabEntryHOMAIR, isSnapshotDerivedHOMAIR } from '../js/lab-entry.js';

const sodiumCategory = Object.keys(MARKER_SCHEMA).find(key => MARKER_SCHEMA[key]!.markers.sodium)!;
const day = '2026-10-20', destination = '2026-10-21', glucose = 'biochemistry.glucose', sodium = `${sodiumCategory}.sodium`, insulin = 'diabetes.insulin';
const groups = ['biochemistry', 'diabetes', sodiumCategory].map(key => String(MARKER_SCHEMA[key]!.group || MARKER_SCHEMA[key]!.label));
const original = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
async function stored() { return JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData; }
function runtime(message = '') { return createAgentToolRuntime({ readContext: () => '', userMessage: message, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(operation = 'update', patch: object = { sampleTime: '09:30', fasting: false, specimen: 'plasma' }, id = 'morning') {
  const evidence = `Please ${operation} my selected lab sample using these explicitly reported facts: ${JSON.stringify(patch)}.`;
  const tools = runtime(evidence), read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labSamples', ...(operation === 'add' ? { create: true } : { recordId: id }) } });
  expect(read.success, read.contentItems[0].text).toBe(true); const snapshot = JSON.parse(read.contentItems[0].text);
  const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'labSamples', operation, snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Explicitly reported sample details.' } });
  return { result, snapshot, tools, draft: { ...tools.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `sample-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true); groups.forEach(group => setGroupInAIContext(group, true));
  state.importedData.entries = [
    { panelId: 'morning', date: day, specimen: 'serum', context: { sampleTime: '08:00', fasting: true, cyclePhase: 'follicular' }, collectionContextSources: { sampleTime: 'private-source', fasting: 'private-source' },
      markers: { [glucose]: 5, [insulin]: 10, 'diabetes.homaIR': 2.22 }, markerSources: { [glucose]: { file: '/private/report.pdf', snapshotId: 'private-source', at: 100 } }, sourceFile: '/private/report.pdf', updatedAt: 100, extension: { keep: 'Opaque' } },
    { panelId: 'evening', date: day, specimen: 'saliva', context: { sampleTime: '16:00' }, markers: { [glucose]: 7 }, updatedAt: 200 },
  ];
  state.importedData.markerValueNotes = { [`${glucose}:${day}`]: 'Shared glucose note', [`${insulin}:${day}`]: 'Unshared insulin note' };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => { vi.restoreAllMocks(); clearSyncSaveTimers(); groups.forEach(group => setGroupInAIContext(group, true)); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true); await storage.encryptedRemoveItem(key); state.currentProfile = original.profile; state.importedData = original.data; });

it('prepares faithful collection changes without disclosing source evidence or writing before approval', async () => {
  const raw = await storage.encryptedGetItem(key), { result, snapshot, draft } = await propose(); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(snapshot.current).toMatchObject({ id: 'morning', specimen: 'serum', sampleTime: '08:00', fasting: true }); expect(snapshot.current.results).toHaveLength(3);
  expect(JSON.stringify({ snapshot, draft })).not.toMatch(/\/private|report\.pdf|private-source/); expect(await storage.encryptedGetItem(key)).toBe(raw);
  const review = JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] })); expect(review).toContain('every result'); expect(review).toContain('09:30'); expect(review).toContain('plasma');
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries[0]!.context).toEqual({ sampleTime: '09:30', fasting: false, cyclePhase: 'follicular' }); expect(saved.entries[0]!.specimen).toBe('plasma');
  expect(saved.entries[0]!.markers).toEqual(JSON.parse(raw!).entries[0].markers); expect(saved.entries[0]!.markerSources).toEqual(JSON.parse(raw!).entries[0].markerSources); expect(saved.entries[0]!.extension).toEqual({ keep: 'Opaque' }); expect(saved.entries[1]).toEqual(JSON.parse(raw!).entries[1]);
  expect(saved.entries[0]!.collectionOriginals).toMatchObject({ sampleTime: { value: '08:00', sourceSnapshotId: 'private-source' }, fasting: { value: true } }); expect(saved.entries[0]!.collectionContextSources).toBeUndefined();
});
it('creates a deliberately separate sample with frozen converted amounts and unknown collection facts', async () => {
  const before = await stored(), { result, draft } = await propose('add', { newSample: true, date: day, results: [{ markerKey: glucose, value: 108, unit: 'mg/dL' }, { markerKey: insulin, value: 10, unit: 'mU/l' }] });
  expect(result.success, result.contentItems[0].text).toBe(true); const proposal = normalizeAgentDataProposal(draft.payload)!; expect(proposal).not.toBeNull();
  expect(JSON.parse(proposal.patch).results[0]).toEqual({ markerKey: glucose, value: 5.99401, unit: 'mmol/l' }); expect(await stored()).toEqual(before);
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries).toHaveLength(3); const added = saved.entries.find(row => row.panelId === proposal.recordId)!;
  expect(added.markers).toMatchObject({ [glucose]: 5.99401, [insulin]: 10, 'diabetes.homaIR': 2.66 }); expect(added.specimen).toBeUndefined(); expect(added.context?.fasting).toBeUndefined(); expect(added.context?.sampleTime).toBeUndefined(); expect(added.markerSources![glucose]).toMatchObject({ file: null }); expect(added.markerSources!['diabetes.homaIR']!.derivedFrom).toEqual([glucose, insulin]); expect(saved.entries.slice(0, 2)).toEqual(before.entries);
});
it('adds a missing result to an existing sample while retaining its imports and refusing overwrites', async () => {
  const { draft, result } = await propose('update', { results: [{ markerKey: sodium, value: 140, unit: 'mmol/l' }] }); expect(result.success, result.contentItems[0].text).toBe(true); await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.entries).toHaveLength(2); expect(saved.entries[0]!.markers[sodium]).toBe(140); expect(saved.entries[0]!.markerSources![sodium]).toMatchObject({ file: null }); expect(saved.entries[0]!.sourceFile).toBe('/private/report.pdf'); expect(saved.entries[1]!.markers[sodium]).toBeUndefined();
  expect((await propose('update', { results: [{ markerKey: sodium, value: 141, unit: 'mmol/l' }] })).result.success).toBe(false);
});
it('treats collection facts supplied at creation as original facts and supports explicit unknown clears', async () => {
  const { result, draft } = await propose('add', { newSample: true, date: destination, specimen: 'plasma', sampleTime: '09:30', fasting: false, results: [{ markerKey: glucose, value: 5, unit: 'mmol/l' }] }); expect(result.success, result.contentItems[0].text).toBe(true); await applyAgentDraft(draft);
  const id = normalizeAgentDataProposal(draft.payload)!.recordId, created = (await stored()).entries.find(row => row.panelId === id)!; expect(created.collectionOriginals).toBeUndefined(); expect(created.context).toMatchObject({ sampleTime: '09:30', fasting: false });
  const correction = await propose('update', { specimen: null, sampleTime: null, fasting: null }, id); expect(correction.result.success).toBe(true); await applyAgentDraft(correction.draft); const cleared = (await stored()).entries.find(row => row.panelId === id)!;
  expect(cleared.specimen).toBeUndefined(); expect(cleared.context?.sampleTime).toBeUndefined(); expect(cleared.context?.fasting).toBeUndefined(); expect(cleared.collectionOriginals).toMatchObject({ specimen: { value: 'plasma' }, sampleTime: { value: '09:30' }, fasting: { value: false } });
});
it('normalizes a stale removed copy without changing the active sample identity', async () => {
  const before = await stored(), move = await propose('update', { date: destination }); expect(move.result.success).toBe(true); await applyAgentDraft(move.draft);
  const stale = await stored(); stale.entries.push(before.entries[0]!); await storage.encryptedSetItem(key, JSON.stringify(stale));
  const correction = await propose('update', { sampleTime: '10:00' }); expect(correction.result.success, correction.result.contentItems[0].text).toBe(true); await applyAgentDraft(correction.draft);
  const saved = await stored(); expect(saved.entries.filter(row => row.panelId === 'morning')).toHaveLength(1); expect(saved.entries.find(row => row.panelId === 'morning')).toMatchObject({ date: destination, context: { sampleTime: '10:00' } });
});
it('preserves an explicitly reported HOMA result independent of the supplied result ordering', async () => {
  const { result, draft } = await propose('add', { newSample: true, date: destination, results: [{ markerKey: 'diabetes.homaIR', value: 3, unit: '' }, { markerKey: glucose, value: 5, unit: 'mmol/l' }, { markerKey: insulin, value: 10, unit: 'mU/l' }] }); expect(result.success, result.contentItems[0].text).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).entries.find(row => row.date === destination)!.markers['diabetes.homaIR']).toBe(3);
});
it('moves every selected result and unshared notes, preserving shared notes and sample originals', async () => {
  const peer = await stored(); peer.entries[0]!.manualOriginals = { [glucose]: { value: 4.5, source: { file: '/private/original.pdf', at: 50 } } }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { draft, result } = await propose('update', { date: destination }); expect(result.success, result.contentItems[0].text).toBe(true);
  const review = JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] })); expect(review).toContain('Unshared insulin note'); expect(review).toContain('Shared glucose note'); expect(review).toContain('Notes applying to this sample');
  await applyAgentDraft(draft); const saved = await stored(), sample = saved.entries.find(row => row.panelId === 'morning')!;
  expect(sample.date).toBe(destination); expect(sample.markers).toEqual(peer.entries[0]!.markers); expect(sample.markerSources).toEqual(peer.entries[0]!.markerSources); expect(sample.manualOriginals![glucose]).toEqual(peer.entries[0]!.manualOriginals![glucose]);
  expect(saved.entries.find(row => row.panelId === 'evening')).toEqual(peer.entries[1]); expect(saved.markerValueNotes[`${glucose}:${day}`]).toBe('Shared glucose note'); expect(saved.markerValueNotes[`${glucose}:${destination}`]).toBeUndefined(); expect(saved.markerValueNotes[`${insulin}:${destination}`]).toBe('Unshared insulin note'); expect(saved.markerValueNotes[`${insulin}:${day}`]).toBeNull();
  expect(saved.labPanelTombstones![`morning.${day}`]!.deletedAt).toBeGreaterThan(0); expect(saved.labPanelTombstones![`morning.${destination}`]!.restoredAt).toBeGreaterThan(0);
  const merged = mergeImportedData(peer, saved) as ProfileData; expect(activeLabSampleData(merged).entries.map(row => [row.panelId, row.date]).sort()).toEqual([['evening', day], ['morning', destination]]);
});
it('retains a unique legacy original on its moved sample and blocks unrelated destination fallback', async () => {
  const peer = await stored(); peer.entries.splice(1, 1); delete peer.entries[0]!.panelId; peer.manualValues = { [`${glucose}:${day}`]: 4.5, [`${insulin}:${destination}`]: 999 }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const id = labPanelId(peer.entries[0]!), { result, draft } = await propose('update', { date: destination }, id); expect(result.success, result.contentItems[0].text).toBe(true); await applyAgentDraft(draft); const saved = await stored();
  expect(saved.entries[0]!.panelId).toBe(id); expect(saved.entries[0]!.manualOriginals![glucose]!.value).toBe(4.5); expect(saved.entries[0]!.manualOriginals![insulin]).toBeNull(); expect(saved.manualValues![`${glucose}:${day}`]).toBeNull();
});
it('rejects conflicting destination notes without changing durable or live data', async () => {
  const peer = await stored(); peer.markerValueNotes[`${insulin}:${destination}`] = 'Different destination note'; await storage.encryptedSetItem(key, JSON.stringify(peer)); const raw = await storage.encryptedGetItem(key), live = structuredClone(state.importedData);
  const { result } = await propose('update', { date: destination }); expect(result.success).toBe(false); expect(result.contentItems[0].text).toContain('different note'); expect(await storage.encryptedGetItem(key)).toBe(raw); expect(state.importedData).toEqual(live);
});
it('native removal scopes deletion to one sample and preserves its same-day sibling', async () => {
  const before = await stored(), baseline = await readCurrentLabSample(profile, 'morning');
  const payload: AgentDataProposal = { resource: 'labSamples', operation: 'remove', recordId: 'morning', baseline: JSON.stringify(baseline), patch: '{}', reason: 'Native removal', evidence: 'Remove this sample.', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  await prepareReviewedLabSample(profile, payload);
  await commitReviewedLabSample(profile, payload, () => state.currentProfile === profile && isAgentDataEnabled('labSamples'));
  const saved = await stored(); expect(saved.entries).toEqual([before.entries[1]]); expect(saved.markerValueNotes[`${glucose}:${day}`]).toBe('Shared glucose note'); expect(saved.markerValueNotes[`${insulin}:${day}`]).toBeNull(); expect(saved._deleted?.entries || []).not.toContain(day);
  expect(canDiscloseAgentDraftReview({ kind: 'data', profileId: profile, payload })).toBe(false);
});
it.each([{ sampleTime: 'morning' }, { sampleTime: '25:00' }, { fasting: 'yes' }, { date: '2026-02-30' }, { specimen: '' }, { sourceFile: 'forged.pdf' }, { results: [{ markerKey: sodium, value: 140 }] }, { results: [{ markerKey: sodium, value: 140, unit: 'bananas' }] }, { results: [{ markerKey: sodium, value: 140, unit: 'mmol/l' }, { markerKey: sodium, value: 141, unit: 'mmol/l' }] }])('rejects invalid sample fields %j', async patch => { expect((await propose('update', patch)).result.success).toBe(false); });
it('requires separate new-sample intent and refuses a no-op collection correction', async () => {
  expect((await propose('add', { date: day, results: [{ markerKey: glucose, value: 5, unit: 'mmol/l' }] })).result.success).toBe(false);
  expect((await propose('update', { sampleTime: '08:00', fasting: true })).result.success).toBe(false);
});
it('discovers unrecorded marker definitions without disclosing personal result values or writing data', async () => {
  const raw = await storage.encryptedGetItem(key), tools = runtime();
  const recorded = await tools.execute({ tool: 'getbased_search_markers', arguments: { query: 'Sodium' } }); expect(recorded.success).toBe(true); expect(JSON.parse(recorded.contentItems[0].text).matches).toEqual([]);
  const definitions = await tools.execute({ tool: 'getbased_search_markers', arguments: { query: 'Sodium', includeUnrecorded: true } }); expect(definitions.success, definitions.contentItems[0].text).toBe(true); const result = JSON.parse(definitions.contentItems[0].text); expect(result.catalogOnly).toBe(true); expect(result.matches.find((row: { key: string }) => row.key === sodium)).toMatchObject({ unit: 'mmol/l', inputUnits: ['mmol/l', 'mEq/L'] }); expect(JSON.stringify(result)).not.toMatch(/latestValue|latestDate|recordedValues|private|report.pdf/); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it('applies marker-definition disclosure groups and rejects invalid discovery arguments', async () => {
  const tools = runtime(); setGroupInAIContext(groups[2]!, false); const hidden = await tools.execute({ tool: 'getbased_search_markers', arguments: { query: 'Sodium', includeUnrecorded: true } }); expect(hidden.success).toBe(true); expect(JSON.parse(hidden.contentItems[0].text).matches.some((row: { key: string }) => row.key === sodium)).toBe(false);
  expect((await tools.execute({ tool: 'getbased_search_markers', arguments: { query: 'Sodium', includeUnrecorded: 'yes' } })).success).toBe(false);
});
it.each(['target', 'destination', 'globalIdentity', 'note', 'definition', 'label', 'removal', 'group', 'source', 'otherDate'] as const)('checks %s again inside the locked save', async kind => {
  const { result, draft } = await propose('update', { date: destination }); expect(result.success, result.contentItems[0].text).toBe(true); const peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  if (kind === 'target') peer.entries[0]!.markers[glucose] = 9;
  if (kind === 'destination') peer.entries.push({ panelId: 'peer', date: destination, markers: { [glucose]: 4 } });
  if (kind === 'globalIdentity') peer.entries.push({ panelId: 'morning', date: '2026-10-18', markers: { [glucose]: 3 } });
  if (kind === 'note') peer.markerValueNotes[`${insulin}:${destination}`] = 'Peer note';
  if (kind === 'definition') peer.customMarkers[sodium] = { name: 'Peer', unit: 'widgets' };
  if (kind === 'label') peer.markerLabels = { [glucose]: 'Peer label' };
  if (kind === 'removal') peer.labPanelTombstones = { [`morning.${day}`]: { deletedAt: 5000, restoredAt: 0, updatedAt: 5000 } };
  if (kind === 'otherDate') peer.entries.push({ panelId: 'other', date: '2026-10-18', markers: { [glucose]: 3 } });
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) { await write(key, JSON.stringify(peer)); if (kind === 'group') setGroupInAIContext(groups[1]!, false); if (kind === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false); } return read(...args); });
  if (kind === 'otherDate') { await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries.find(row => row.panelId === 'morning')!.date).toBe(destination); expect(saved.entries.find(row => row.panelId === 'other')).toEqual(peer.entries.at(-1)); }
  else { await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(peer); }
});
it('withholds a mixed sample and pending receipts when any affected group is disabled', async () => {
  const { draft } = await propose(); setGroupInAIContext(groups[1]!, false); expect(canDiscloseAgentDraftReview(draft)).toBe(false); const tools = runtime();
  const list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labSamples' } }); expect(JSON.parse(list.contentItems[0].text).records.map((row: { recordId: string }) => row.recordId)).toEqual(['evening']);
  expect((await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labSamples', recordId: 'morning' } })).success).toBe(false);
});
it('preserves stable sample IDs across chat storage and retries a failed write', async () => {
  const { draft } = await propose(), before = await stored(); expect(normalizeChatMessages([{ role: 'assistant', content: 'Review', agentDrafts: [draft] }])[0]!.agentDrafts![0]!.payload).toEqual(draft.payload);
  const write = storage.encryptedSetItem; vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic write failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); vi.restoreAllMocks(); await applyAgentDraft(draft); expect((await stored()).entries[0]!.context!.sampleTime).toBe('09:30');
});
it('refuses silent resurrection of an actively removed destination date', async () => {
  const peer = await stored(); peer._deleted = { entries: [destination] }; peer._deletedAt = { entries: { [destination]: 100 } }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  expect((await propose('update', { date: destination })).result.success).toBe(false); expect((await propose('add', { newSample: true, date: destination, results: [{ markerKey: sodium, value: 140, unit: 'mmol/l' }] })).result.success).toBe(false);
});
it('retains an explicitly entered HOMA through save, later input corrections and merge', async () => {
  expect(await editManualMarkerValue({ dotKey: 'diabetes.homaIR', date: day, panelId: 'morning', storedValue: 3 })).toBeTruthy();
  const reported = await stored(); expect(reported.entries[0]!.markers['diabetes.homaIR']).toBe(3); expect(reported.entries[0]!.markerSources!['diabetes.homaIR']!.reported).toBe(true);
  expect(await editManualMarkerValue({ dotKey: glucose, date: day, panelId: 'morning', storedValue: 6 })).toBeTruthy();
  const changed = await stored(); expect(changed.entries[0]!.markers['diabetes.homaIR']).toBe(3); expect((mergeImportedData(reported, changed) as ProfileData).entries[0]!.markers['diabetes.homaIR']).toBe(3);
});
it('keeps an explicitly removed HOMA absent when its inputs are saved again', async () => {
  expect(await deleteManualMarkerValue('diabetes.homaIR', day, { panelId: 'morning' })).toBeTruthy(); expect((await stored()).entries[0]!.markers).not.toHaveProperty('diabetes.homaIR');
  expect(await editManualMarkerValue({ dotKey: glucose, date: day, panelId: 'morning', storedValue: 6 })).toBeTruthy(); const saved = await stored(); expect(saved.entries[0]!.markers).not.toHaveProperty('diabetes.homaIR'); expect(saved.entries[0]!.deletedMarkers!['diabetes.homaIR']).toBeGreaterThan(0);
});
it('does not create a zero calculation from an unknown input or misclassify an explicit report as derived', () => {
  const unknown: LabEntry = { date: day, markers: { [glucose]: null, [insulin]: 10 } }; recalculateLabEntryHOMAIR(unknown); expect(unknown.markers).not.toHaveProperty('diabetes.homaIR');
  const direct: LabEntry = { date: day, markers: { [glucose]: 5, [insulin]: 10, 'diabetes.homaIR': 3 }, markerSources: { [glucose]: { snapshotId: 'same' }, [insulin]: { snapshotId: 'same' }, 'diabetes.homaIR': { snapshotId: 'same', reported: true } } }; recalculateLabEntryHOMAIR(direct); expect(direct.markers['diabetes.homaIR']).toBe(3); expect(isSnapshotDerivedHOMAIR(direct, 'diabetes.homaIR')).toBe(false);
});

it('reviews and saves reported cycle context on only the chosen sample with private originals', async () => {
  const peer = await stored(); peer.entries[0]!.context = { ...peer.entries[0]!.context, cycleDay: 14, cyclePhaseSource: 'predicted' };
  peer.entries[0]!.collectionContextSources!.cyclePhase = 'private-cycle-source';
  peer.menstrualCycle = { periods: [{ startDate: '2026-10-01', endDate: '2026-10-05' }] }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { result, draft, snapshot } = await propose('update', { cycleDay: 21, cyclePhase: 'luteal', cyclePhaseDetail: 'mid_luteal' });
  expect(result.success, result.contentItems[0].text).toBe(true); expect(snapshot.current.cycle).toMatchObject({ cycleDay: 14, cyclePhase: 'follicular', cyclePhaseSource: 'predicted' });
  expect(await stored()).toEqual(peer); expect(JSON.stringify(draft)).not.toContain('private-cycle-source');
  const cards = projectAgentDraftCards({ agentDrafts: [draft] }), review = JSON.stringify(cards); expect(review).toContain('Cycle context'); expect(review).toContain('21'); expect(review).toContain('Mid-luteal'); expect(review).toContain('Observed periods stay unchanged');
  expect(cards[0]!.rows.find(row => row.label === 'Proposed')!.value).not.toContain('mid_luteal'); expect(cards[0]!.rows.find(row => row.label === 'You said')!.value).toContain('mid_luteal');
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries[0]!.context).toEqual({ ...peer.entries[0]!.context, cycleDay: 21, cyclePhase: 'luteal', cyclePhaseDetail: 'mid_luteal', cyclePhaseSource: 'recorded' });
  expect(saved.entries[1]).toEqual(peer.entries[1]); expect(saved.entries[0]!.markers).toEqual(peer.entries[0]!.markers); expect(saved.entries[0]!.markerSources).toEqual(peer.entries[0]!.markerSources); expect(saved.menstrualCycle).toEqual(peer.menstrualCycle);
  expect(saved.entries[0]!.collectionOriginals).toMatchObject({ cycleDay: { value: 14 }, cyclePhase: { value: 'follicular', sourceSnapshotId: 'private-cycle-source' }, cyclePhaseSource: { value: 'predicted' } });
  expect(saved.entries[0]!.collectionContextSources).not.toHaveProperty('cyclePhase');
});
it('does not infer a phase from a reported cycle day or alter an existing prediction', async () => {
  const peer = await stored(); peer.entries[0]!.context = { ...peer.entries[0]!.context, cyclePhaseSource: 'predicted' }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { draft, result } = await propose('update', { cycleDay: 20 }); expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).entries[0]!.context).toEqual({ ...peer.entries[0]!.context, cycleDay: 20 });
  const added = await propose('add', { newSample: true, date: destination, cycleDay: 7, results: [{ markerKey: glucose, value: 5, unit: 'mmol/l' }] }); expect(added.result.success).toBe(true); await applyAgentDraft(added.draft);
  const sample = (await stored()).entries.find(row => row.date === destination)!; expect(sample.context).toEqual({ cycleDay: 7 }); expect(sample.collectionOriginals).toBeUndefined();
});
it('clears a phase and detail with explicit merge-stable nulls while retaining its reported day', async () => {
  const peer = await stored(); peer.entries[0]!.context = { cycleDay: 21, cyclePhase: 'luteal', cyclePhaseDetail: 'mid_luteal', cyclePhaseSource: 'recorded' }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { draft, result } = await propose('update', { cyclePhase: null }); expect(result.success).toBe(true); await applyAgentDraft(draft); const saved = await stored();
  expect(saved.entries[0]!.context).toEqual({ cycleDay: 21, cyclePhase: null, cyclePhaseDetail: null, cyclePhaseSource: null });
  for (const [left, right] of [[peer, saved], [saved, peer]]) expect((mergeImportedData(left, right) as ProfileData).entries[0]!.context).toEqual(saved.entries[0]!.context);
});
it('clears an incompatible old detail after a phase change and preserves the first original', async () => {
  const peer = await stored(); peer.entries[0]!.context = { ...peer.entries[0]!.context, cyclePhase: 'luteal', cyclePhaseDetail: 'mid_luteal' }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const first = await propose('update', { cyclePhase: 'follicular' }); expect(first.result.success).toBe(true); await applyAgentDraft(first.draft);
  expect((await stored()).entries[0]!.context).toMatchObject({ cyclePhase: 'follicular', cyclePhaseDetail: null, cyclePhaseSource: 'recorded' });
  const second = await propose('update', { cyclePhaseDetail: 'early_follicular' }); expect(second.result.success).toBe(true); await applyAgentDraft(second.draft);
  expect((await stored()).entries[0]!.collectionOriginals).toMatchObject({ cyclePhase: { value: 'luteal' }, cyclePhaseDetail: { value: 'mid_luteal' } });
});
it.each([{ cycleDay: 0 }, { cycleDay: -1 }, { cycleDay: 1.5 }, { cycleDay: '21' }, { cyclePhase: 'predicted' }, { cyclePhase: ['follicular'] }, { cyclePhaseSource: 'predicted' }, { cyclePhaseDetail: 'mid_luteal' }, { cyclePhase: 'menstrual', cyclePhaseDetail: 'mid_luteal' }])('rejects unsupported or inconsistent cycle patches %j', async patch => {
  const before = await stored(); expect((await propose('update', patch)).result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('redacts disabled Insight facts and still permits a non-cycle sample correction', async () => {
  const peer = await stored(); peer.entries[0]!.context!.cycleDay = 21; setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { result, snapshot, draft } = await propose('update', { sampleTime: '10:00' }); expect(result.success).toBe(true);
  expect(snapshot.current).not.toHaveProperty('cycle'); expect(snapshot.fields).not.toHaveProperty('cycleDay'); expect(JSON.stringify(draft)).not.toContain('follicular'); await applyAgentDraft(draft);
  expect((await stored()).entries[0]!.context).toMatchObject({ cycleDay: 21, cyclePhase: 'follicular', sampleTime: '10:00' });
  expect((await propose('update', { cycleDay: 22 })).result.success).toBe(false);
});
it.each(['before', 'locked'] as const)('rejects cycle consent revocation %s saving and hides old receipts', async when => {
  const { draft, result } = await propose('update', { cycleDay: 21 }); expect(result.success).toBe(true); const before = await stored();
  if (when === 'before') setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false);
  else { const read = storage.encryptedGetItem; let reads = 0; vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const raw = await read(...args); if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); return raw; }); }
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(before); expect(canDiscloseAgentDraftReview(draft)).toBe(false);
});
it('requires a fresh review for an old sample snapshot without the new cycle projection', async () => {
  const { draft } = await propose('update', { sampleTime: '10:00' }), proposal = normalizeAgentDataProposal(draft.payload)!, baseline = JSON.parse(proposal.baseline);
  baseline.version = 1; delete baseline.record.cycle; delete baseline.plan.after.cycle; proposal.baseline = JSON.stringify(baseline); draft.payload = { ...proposal };
  const before = await stored(); await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(before);
});
it('does not publish a sample read when Insight is revoked during its private digest', async () => {
  const before = await stored(), digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { const hash = await digest(...args); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); return hash; });
  const read = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'labSamples', recordId: 'morning' } });
  expect(read.success).toBe(false); expect(read.contentItems[0].text).toContain('changed while reading'); expect(read.contentItems[0].text).not.toMatch(/follicular|snapshotId/); expect(await stored()).toEqual(before);
});
it.each(['sampleCycle', 'periodObservations'] as const)('guards the sample independently of late %s changes', async kind => {
  const { result, draft } = await propose('update', { cycleDay: 21, cyclePhase: 'luteal' }); expect(result.success).toBe(true);
  const peer = await stored(); if (kind === 'sampleCycle') peer.entries[0]!.context!.cycleDay = 25; else peer.menstrualCycle = { periods: [{ startDate: '2026-10-10', endDate: '2026-10-14' }] };
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  if (kind === 'sampleCycle') { await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(peer); }
  else { await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries[0]!.context).toMatchObject({ cycleDay: 21, cyclePhase: 'luteal', cyclePhaseSource: 'recorded' }); expect(saved.menstrualCycle).toEqual(peer.menstrualCycle); }
});
it('preserves untouched legacy cycle values during an unrelated collection correction', async () => {
  const peer = await stored(); peer.entries[0]!.context = { ...peer.entries[0]!.context, cycleDay: 'Legacy day unknown', cyclePhase: 'Late luteal', cyclePhaseDetail: 'Legacy detail' }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { result, draft } = await propose('update', { sampleTime: '10:00' }); expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).entries[0]!.context).toEqual({ ...peer.entries[0]!.context, sampleTime: '10:00' });
});
