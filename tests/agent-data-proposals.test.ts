// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), notify: vi.fn(), enabled: vi.fn(), refresh: vi.fn() }));
vi.mock('../js/data.js', () => ({ saveImportedDataForProfile: mocks.save, notifyProfileDataContextChanged: mocks.notify,
  getActiveData: vi.fn(), navigateDataViewRuntime: vi.fn(), refreshDataViewRuntime: mocks.refresh, showDataMarkerDetailRuntime: vi.fn() }));
vi.mock('../js/profile.js', () => ({ getActiveProfileId: () => 'a' }));
vi.mock('../js/agent-profile-record-store.js', async () => {
  const { state } = await import('../js/state.js');
  return { readAgentProfileRecords: async () => structuredClone(state.importedData) };
});
vi.mock('../js/context-source-registry.js', async original => ({ ...await original<typeof import('../js/context-source-registry.js')>(), isContextSourceEnabled: mocks.enabled }));
import { state } from '../js/state.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { normalizeAgentDataProposal, supersedePendingDataProposals } from '../shared/agent-data-contract.js';
import { projectAgentDataChange } from '../js/agent-data-model.js';
import { getConfiguredArrayItemId } from '../js/data-merge.js';
import type { AgentDataResource, AgentDataOperation, AgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';

const evidence = 'I stopped taking my example supplement today.';
const example = () => ({ id: 'therapy-a', name: 'Example', type: 'supplement', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null, dose: 'one capsule', extra: 'keep' }], schedule: { mode: 'daily', timesPerDay: 1 }, ingredients: [{ name: 'Example ingredient', amountValue: 100, amountUnit: 'mg' }], importProvenance: { label: 'retain' }, extension: 'retain' });
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies('a') });
function json(result: Awaited<ReturnType<ReturnType<typeof tools>['execute']>>) { expect(result.success, result.contentItems[0].text).toBe(true); return JSON.parse(result.contentItems[0].text) as { snapshotId: string; records?: { recordId: string }[]; total?: number; nextOffset?: number; current?: Record<string, unknown> }; }
async function proposal(resource: AgentDataResource, operation: AgentDataOperation, patch: object, recordId = '') {
  const runtime = tools();
  const read = json(await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, ...(recordId ? { recordId } : {}), ...(operation === 'add' ? { create: true } : {}) } }));
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: read.snapshotId, patch: JSON.stringify(patch), reason: 'A self-reported change.', evidence } });
  return { runtime, read, result, draft: { ...runtime.getDrafts()[0]!, profileId: 'a' } };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled.mockReturnValue(true); mocks.save.mockResolvedValue(true);
  document.body.innerHTML = '';
  state.currentProfile = 'a';
  state.importedData = { entries: [], notes: [{ date: '2026-01-01', text: 'Original', extension: 'keep' }], contextNotes: 'Original context', nutritionTargets: null, supplements: [example()], healthGoals: [] } as unknown as typeof state.importedData;
});
it('refreshes the current main view after an approved commit', async () => {
  document.body.innerHTML = '<main id="main-content"></main>';
  const { draft } = await proposal('supplements', 'stop', {}, 'therapy-a');
  await applyAgentDraft(draft); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('preserves an open editor while committing approved data', async () => {
  document.body.innerHTML = '<main id="main-content"></main><div class="modal-overlay show"><input value="Unsaved editor text"></div>';
  const { draft } = await proposal('supplements', 'stop', {}, 'therapy-a');
  await applyAgentDraft(draft); expect(mocks.refresh).not.toHaveBeenCalled();
  expect(document.querySelector('input')!.value).toBe('Unsaved editor text');
});
it('preserves an inline form while committing approved data', async () => {
  document.body.innerHTML = '<main id="main-content"><form><input value="Unsaved inline text"></form></main>';
  const { draft } = await proposal('supplements', 'stop', {}, 'therapy-a');
  await applyAgentDraft(draft); expect(mocks.refresh).not.toHaveBeenCalled();
  expect(document.querySelector('input')!.value).toBe('Unsaved inline text');
});
it('lists and pages collection identities without leaking hidden product provenance', async () => {
  state.importedData.supplements.push({ ...example(), id: 'therapy-b', name: 'Other' });
  const runtime = tools();
  const page = json(await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements', limit: 1 } }));
  expect(page.records).toEqual([expect.objectContaining({ recordId: 'therapy-a' })]); expect(page.nextOffset).toBe(1); expect(page.total).toBe(2);
  const read = json(await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements', recordId: 'therapy-a' } }));
  expect(read.current).not.toHaveProperty('importProvenance'); expect(read.current).not.toHaveProperty('extension');
});
it('prepares and applies a stop without changing historical dose, label facts or peers', async () => {
  const { result, draft } = await proposal('supplements', 'stop', { date: '2026-10-23', reason: 'No longer taking it' }, 'therapy-a');
  expect(result.success).toBe(true); expect(mocks.save).not.toHaveBeenCalled();
  const view = projectAgentDraftCards({ agentDrafts: [draft] });
  expect(JSON.stringify(view)).toContain('2026-10-23'); expect(JSON.stringify(view)).toContain('ended');
  await applyAgentDraft(draft);
  const data = mocks.save.mock.calls[0]![1] as ProfileData;
  expect(data.supplements[0]).toMatchObject({ id: 'therapy-a', endDate: '2026-10-23', periods: [{ start: '2026-01-01', end: '2026-10-23', dose: 'one capsule', extra: 'keep' }], extension: 'retain', importProvenance: { label: 'retain' }, lifecycle: { state: 'ended' } });
  expect(mocks.save.mock.calls[0]![2]).toMatchObject({ expectedProfileRecords: [{ key: 'supplements', id: 'therapy-a', value: example() }] });
  expect(state.importedData.supplements[0]!.endDate).toBeUndefined();
});
it('changes dose with a new dated period, preserving past dose and metadata', async () => {
  const { result, draft } = await proposal('supplements', 'changeDose', { date: '2026-10-23', dosage: 'two capsules' }, 'therapy-a');
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const row = (mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]!;
  expect(row.periods).toEqual([expect.objectContaining({ start: '2026-01-01', end: '2026-10-22', dose: 'one capsule', extra: 'keep' }), expect.objectContaining({ start: '2026-10-23', end: null, dose: 'two capsules', extra: 'keep' })]);
  expect(row.currentDose).toBe('two capsules');
});
it('preserves schedule history and validates weekdays and intervals', async () => {
  const { result, draft } = await proposal('supplements', 'update', { schedule: { mode: 'selected-days', daysOfWeek: [1, 3, 5] } }, 'therapy-a');
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const row = (mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]!;
  expect(row.schedule).toMatchObject({ mode: 'selected-days', daysOfWeek: [1, 3, 5] });
  expect(row.periods).toHaveLength(2);
  for (const schedule of [{ mode: 'interval', intervalDays: 0 }, { mode: 'selected-days', daysOfWeek: [8] }, { mode: 'random' }]) expect((await proposal('supplements', 'update', { schedule }, 'therapy-a')).result.success).toBe(false);
});
it('keeps an unspecified new therapy schedule unknown and creates only after approval', async () => {
  const { result, draft } = await proposal('supplements', 'add', { name: 'New item', type: 'medication', startDate: '2026-10-23' });
  expect(result.success).toBe(true); expect(state.importedData.supplements).toHaveLength(1);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('Schedule not reported');
  await applyAgentDraft(draft);
  expect((mocks.save.mock.calls[0]![1] as ProfileData).supplements.at(-1)).toMatchObject({ name: 'New item', type: 'medication', schedule: { mode: 'other', timesPerDay: null } });
});
it('updates a legacy therapy without changing its stable sync identity', async () => {
  const legacy = { name: 'Legacy', startDate: '2026-01-01', type: 'supplement', extension: 'keep' };
  state.importedData.supplements = [legacy]; const id = getConfiguredArrayItemId('supplements', legacy)!;
  const { draft, result } = await proposal('supplements', 'update', { name: 'Renamed' }, id);
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]).toMatchObject({ id, name: 'Renamed', extension: 'keep' });
});
it('updates nutrition targets with an effective per-kg basis and preserves unrelated metadata', async () => {
  state.importedData.nutritionTargets = { energyKcal: 2100, extension: 'keep' };
  const { result, draft } = await proposal('nutritionTargets', 'update', { proteinGPerKg: 1.6 });
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((mocks.save.mock.calls[0]![1] as ProfileData).nutritionTargets).toMatchObject({ energyKcal: 2100, proteinBasis: 'custom', proteinGPerKg: 1.6, configured: true, extension: 'keep' });
  for (const patch of [{ energyKcal: -1 }, { proteinGPerKg: 2, proteinBasis: 'general' }, { sodiumMg: '100' }, { unknown: 1 }]) expect((await proposal('nutritionTargets', 'update', patch)).result.success).toBe(false);
});
it('leaves target reset in native UI while supporting explicit profile-note removal', async () => {
  state.importedData.nutritionTargets = { energyKcal: 2200 };
  const before = structuredClone(state.importedData);
  const reset = await proposal('nutritionTargets', 'reset', {});
  expect(reset.result.success).toBe(false); expect(mocks.save).not.toHaveBeenCalled(); expect(state.importedData).toEqual(before);
  const { draft, result } = await proposal('profileNotes', 'remove', {}); expect(result.success).toBe(true);
  await applyAgentDraft(draft); expect((mocks.save.mock.calls.at(-1)![1] as ProfileData).contextNotes).toBe('');
});

it('edits and removes dated notes with tombstones and retained metadata', async () => {
  const id = getConfiguredArrayItemId('notes', state.importedData.notes[0])!;
  const { result, draft } = await proposal('datedNotes', 'update', { text: 'Corrected' }, id);
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const saved = mocks.save.mock.calls[0]![1] as ProfileData;
  expect(saved.notes[0]).toMatchObject({ text: 'Corrected', extension: 'keep' });
  expect(saved._deleted.notes).toContain(id);
  const remove = await proposal('datedNotes', 'remove', {}, id); expect(remove.result.success).toBe(true);
  await applyAgentDraft(remove.draft); expect((mocks.save.mock.calls[1]![1] as ProfileData).notes).toEqual([]);
});
it('requires the original snapshot, exact user evidence and supported fields', async () => {
  const runtime = tools();
  expect((await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'supplements', operation: 'stop', snapshotId: 'invented', patch: '{}', reason: 'Change', evidence } })).success).toBe(false);
  const { draft } = await proposal('supplements', 'stop', {}, 'therapy-a');
  const read = json(await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements', recordId: 'therapy-a' } }));
  expect((await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'supplements', operation: 'stop', snapshotId: read.snapshotId, patch: '{}', reason: 'Change', evidence: 'invented evidence' } })).success).toBe(false);
  expect((await proposal('supplements', 'update', { id: 'replace-id' }, 'therapy-a')).result.success).toBe(false);
  await expect(applyAgentDraft({ ...draft, payload: { ...draft.payload, patch: '{"__proto__":{"polluted":true}}' } })).rejects.toThrow('Invalid');
});
it('rejects changed records, disabled sources, profile changes and locked conflicts', async () => {
  const { draft } = await proposal('supplements', 'stop', {}, 'therapy-a');
  state.importedData.supplements[0]!.dosage = 'peer edit'; await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
  delete state.importedData.supplements[0]!.dosage; mocks.enabled.mockReturnValue(false);
  await expect(applyAgentDraft(draft)).rejects.toThrow('disabled'); expect(canDiscloseAgentDraftReview(draft)).toBe(false);
  const runtime = tools(); expect((await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements' } })).success).toBe(false);
  mocks.enabled.mockReturnValue(true); state.currentProfile = 'b';
  expect((await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements' } })).success).toBe(false);
  state.currentProfile = 'a'; mocks.save.mockImplementation(async (_profile, _data, options) => { options.onContextFieldConflict(); return false; });
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
});
it('retains proposals and decisions across chat normalization and retires only the same record', async () => {
  const { draft } = await proposal('supplements', 'stop', {}, 'therapy-a');
  const newer = { ...draft, id: 'newer' }, older = { ...draft, id: 'older' };
  const independent = { ...draft, id: 'independent', payload: { ...draft.payload, recordId: 'therapy-b' } };
  const messages = [{ role: 'assistant', content: 'Review', agentDrafts: [older, independent] }, { role: 'assistant', content: 'Correction', agentDrafts: [newer] }];
  supersedePendingDataProposals(messages);
  expect(older.status).toBe('superseded'); expect(independent.status).toBe('pending'); expect(newer.status).toBe('pending');
  const restored = normalizeChatMessages(messages); expect(restored.flatMap(message => (message.agentDrafts || []).map(item => item.kind))).toEqual(['data', 'data', 'data']);
  expect(normalizeAgentDataProposal(draft.payload)).not.toBeNull();
});
it.each([
  { periods: [{ start: '2026-02-30', end: null }] }, { periods: [{ start: '2026-01-01', end: null }, { start: '2026-01-02', end: null }] },
  { ingredients: [{ name: 'X', amountValue: -1 }] }, { qualityTests: [{ includeInAIContext: 'true' }] }, { sourceUrl: 'javascript:alert(1)' },
])('rejects unsafe or contradictory therapy fields: %j', async patch => {
  expect((await proposal('supplements', 'update', patch, 'therapy-a')).result.success).toBe(false);
});
it('restarts a stopped item without rewriting its previous period', () => {
  const before = { ...example(), periods: [{ start: '2026-01-01', end: '2026-05-01', dose: 'one', extra: 'keep' }], lifecycle: { state: 'ended' } };
  const proposal: AgentDataProposal = { resource: 'supplements', operation: 'restart', recordId: 'therapy-a', baseline: JSON.stringify(before), patch: '{"date":"2026-10-23"}', effectiveDate: '2026-10-23', recordedAt: 123, evidence, reason: 'Reported' };
  const { after } = projectAgentDataChange(proposal);
  expect(after).toMatchObject({ periods: [before.periods[0], expect.objectContaining({ start: '2026-10-23', end: null, dose: 'one' })] });
});

it('retains hidden per-row provenance when correcting period and label identities', async () => {
  state.importedData.supplements[0]!.ingredients = [{ name: 'Old label name', amountValue: 100, amountUnit: 'mg', privateSource: 'retain locally' }];
  const runtime = tools();
  const read = json(await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'supplements', recordId: 'therapy-a' } }));
  expect(JSON.stringify(read.current)).not.toContain('retain locally'); expect(JSON.stringify(read.current)).not.toContain('extra');
  const { draft, result } = await proposal('supplements', 'update', { ingredients: [{ index: 0, name: 'Correct label name', amountValue: 200 }], periods: [{ index: 0, start: '2026-01-02', end: null }] }, 'therapy-a');
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const saved = (mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]!;
  expect(saved.ingredients).toEqual([{ name: 'Correct label name', amountValue: 200, amountUnit: 'mg', privateSource: 'retain locally' }]);
  expect(saved.periods![0]).toMatchObject({ start: '2026-01-02', dose: 'one capsule', extra: 'keep' });
});

it('pauses and removes only the selected therapy while retaining its peers', async () => {
  state.importedData.supplements.push({ ...example(), id: 'therapy-b', name: 'Peer' });
  const paused = await proposal('supplements', 'pause', { date: '2026-10-23' }, 'therapy-a');
  expect(paused.result.success).toBe(true); await applyAgentDraft(paused.draft);
  expect((mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]).toMatchObject({ lifecycle: { state: 'paused' }, endDate: '2026-10-23' });
  const removed = await proposal('supplements', 'remove', {}, 'therapy-a');
  expect(removed.result.success).toBe(true); await applyAgentDraft(removed.draft);
  const saved = mocks.save.mock.calls[1]![1] as ProfileData;
  expect(saved.supplements).toEqual([state.importedData.supplements[1]]);
  expect(saved._deleted.supplements).toContain('therapy-a');
});

function privateQualityRows() {
  return [
    {category: 'contaminant', analyte: 'Private analyte', resultText: 'Excluded result secret', includeInAIContext: false, privateSource: 'retain'},
    {category: 'potency', analyte: 'Example ingredient', status: 'pass', resultText: 'Informational potency secret'},
    {category: 'contaminant', analyte: 'Lead', value: 1, unit: 'mcg', privateSource: 'visible row provenance'},
    {category: 'potency', analyte: 'Example ingredient', status: 'pass', value: 100, includeInAIContext: true},
  ];
}
it('discloses only included quality rows through reads, summaries, queries and draft previews with original indices', async () => {
  const original = privateQualityRows(); state.importedData.supplements[0]!.qualityTests = original;
  const runtime = tools();
  const read = json(await runtime.execute({tool: 'getbased_read_data', arguments: {resource: 'supplements', recordId: 'therapy-a'}}));
  expect(read.current!.qualityTests).toEqual([
    {index: 2, category: 'contaminant', analyte: 'Lead', value: 1, unit: 'mcg'},
    {index: 3, category: 'potency', analyte: 'Example ingredient', status: 'pass', value: 100, includeInAIContext: true},
  ]);
  const list = json(await runtime.execute({tool: 'getbased_read_data', arguments: {resource: 'supplements'}}));
  const query = json(await runtime.execute({tool: 'getbased_read_data', arguments: {resource: 'supplements', query: 'Excluded result secret'}}));
  expect(query.total).toBe(0); expect(query.records).toEqual([]);
  const draft = await runtime.execute({tool: 'getbased_draft_data', arguments: {resource: 'supplements', operation: 'update', snapshotId: read.snapshotId,
    patch: JSON.stringify({qualityTests: [{index: 2, category: 'contaminant', analyte: 'Lead', value: 2}, {index: 3, category: 'potency', analyte: 'Example ingredient'}]}), reason: 'Reported correction', evidence}});
  expect(draft.success).toBe(true);
  for (const reply of [read, list, query, draft]) {
    expect(JSON.stringify(reply)).not.toContain('Excluded result secret');
    expect(JSON.stringify(reply)).not.toContain('Informational potency secret');
    expect(JSON.stringify(reply)).not.toContain('Private analyte');
  }
  expect(state.importedData.supplements[0]!.qualityTests).toEqual(original); expect(mocks.save).not.toHaveBeenCalled();
  await applyAgentDraft({...runtime.getDrafts()[0]!, profileId: 'a'});
  expect((mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]!.qualityTests).toEqual([
    original[0], original[1], {...original[2], value: 2}, original[3],
  ]);
});
it('retains excluded quality rows when all visible rows are removed', async () => {
  const original = privateQualityRows(); state.importedData.supplements[0]!.qualityTests = original;
  const {draft, result} = await proposal('supplements', 'update', {qualityTests: []}, 'therapy-a');
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((mocks.save.mock.calls[0]![1] as ProfileData).supplements[0]!.qualityTests).toEqual(original.slice(0, 2));
});
it.each([{index: 0}, {category: 'contaminant', analyte: 'Private analyte'}])('rejects targeting an excluded quality row through chat: %j', async identity => {
  const original = privateQualityRows(); state.importedData.supplements[0]!.qualityTests = original;
  const {result} = await proposal('supplements', 'update', {qualityTests: [{...identity, value: 7, includeInAIContext: true}]}, 'therapy-a');
  expect(result.success).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  expect(state.importedData.supplements[0]!.qualityTests).toEqual(original);
});

it('adds a dated note using its canonical identity and rejects invalid calendar dates', async () => {
  const added = await proposal('datedNotes', 'add', { date: '2026-10-23', text: 'New observation' });
  expect(added.result.success).toBe(true); await applyAgentDraft(added.draft);
  const saved = mocks.save.mock.calls[0]![1] as ProfileData;
  expect(saved.notes).toHaveLength(2); expect(saved.notes[1]).toMatchObject({ date: '2026-10-23', text: 'New observation' });
  expect(mocks.save.mock.calls[0]![2].expectedProfileRecords).toEqual([{ key: 'notes', id: getConfiguredArrayItemId('notes', saved.notes[1]), value: null }]);
  expect((await proposal('datedNotes', 'add', { date: '2026-02-30', text: 'Invalid' })).result.success).toBe(false);
});

it('appends a profile note natively without rewriting the existing text or losing unrelated fields', async () => {
  state.importedData.contextNotes = '  Keep exact old wording.\nOriginal ending  ';
  const before = structuredClone(state.importedData), old = state.importedData.contextNotes;
  const { result, draft } = await proposal('profileNotes','update',{appendText:'New reported fact.'});
  expect(result.success).toBe(true); expect(mocks.save).not.toHaveBeenCalled(); expect(state.importedData).toEqual(before);
  await applyAgentDraft(draft); const after = mocks.save.mock.calls.at(-1)![1] as ProfileData;
  expect(after.contextNotes).toBe(old+'\n\nNew reported fact.');
  expect(after.diet).toEqual(before.diet); expect(after.healthGoals).toEqual(before.healthGoals);
});
it('rejects ambiguous or overlong note appends rather than truncating saved text', async () => {
  state.importedData.contextNotes = 'x'.repeat(3999); const before = structuredClone(state.importedData);
  for(const patch of [{appendText:'More'}, {appendText:'More',text:'Replacement'}]) expect((await proposal('profileNotes','update',patch)).result.success).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled(); expect(state.importedData).toEqual(before);
});
