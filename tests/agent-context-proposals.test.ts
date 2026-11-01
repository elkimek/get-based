// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), notify: vi.fn(), enabled: vi.fn() }));
vi.mock('../js/data.js', () => ({ saveImportedDataForProfile: mocks.save, notifyProfileDataContextChanged: mocks.notify,
  getActiveData: vi.fn(), navigateDataViewRuntime: vi.fn(), showDataMarkerDetailRuntime: vi.fn() }));
vi.mock('../js/profile.js', () => ({ getActiveProfileId: () => 'a' }));
vi.mock('../js/context-source-registry.js', async original => ({ ...await original<typeof import('../js/context-source-registry.js')>(), isContextSourceEnabled: mocks.enabled }));
vi.mock('../js/lab-context-wearables.js', async original => ({ ...await original<typeof import('../js/lab-context-wearables.js')>(), getSleepContextMismatch: () => null, buildWearableSeriesSection: vi.fn() }));
vi.mock('../js/lens.js', () => ({ queryLens: vi.fn() }));
vi.mock('../js/agent-profile-record-store.js', async () => { const { state } = await import('../js/state.js'); return { readAgentProfileRecords: async () => structuredClone(state.importedData) }; });
import { state } from '../js/state.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime, summarizeAgentToolReceipts } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { renderAgentDraftCards } from '../js/agent-draft-component.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { AGENT_CONTEXT_CARDS, normalizeAgentContextProposal, supersedePendingContextProposals } from '../shared/agent-tool-contract.js';
import type { AgentContextChange } from '../shared/agent-tool-contract.js';
import { buildAgentDraftReviewContext } from '../js/agent-chat-context.js';
import { calculateCycleStats, summarizeCyclePeriods, normalizeCyclePeriods, buildCycleHistorySummary } from '../js/cycle-summary.js';
import { getConfiguredArrayItemId } from '../js/data-merge.js';

const evidence = 'I now have moderate bloating after dinner.';
function tools() {
  return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies('a') });
}
function json(result: Awaited<ReturnType<ReturnType<typeof tools>['execute']>>) {
  expect(result.success).toBe(true);
  return JSON.parse(result.contentItems[0].text) as Record<string, unknown>;
}
async function propose(runtime = tools(), changes: AgentContextChange[] = [{ field: 'bloating', value: 'moderate' }]) {
  const card = json(await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'diet' } }));
  const args = { card: 'diet', snapshotId: card.snapshotId, changes, reason: 'Your current digestive symptoms changed.', evidence };
  return { runtime, args, result: await runtime.execute({ tool: 'getbased_draft_context', arguments: args }) };
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.removeItem('getbased-chat-controls');
  mocks.enabled.mockReturnValue(true);
  mocks.save.mockResolvedValue(true);
  state.currentProfile = 'a';
  (state as { importedData: unknown }).importedData = { entries: [], changeHistory: [], contextNotes: 'Keep general notes',
    diet: { type: 'omnivore', bloating: 'none', breakfastTime: '08:15', note: 'Existing history', legacyExtra: 'Keep this too' } };
});

describe('context read, proposal, and review', () => {
  it('lists supported cards and returns their editor choices without disclosing other profile fields', async () => {
    const runtime = tools();
    const index = json(await runtime.execute({ tool: 'getbased_read_context_card', arguments: {} }));
    expect((index.cards as { card: string }[]).map(item => item.card)).toEqual([...AGENT_CONTEXT_CARDS]);
    for (const card of AGENT_CONTEXT_CARDS) {
      const read = json(await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card } }));
      expect(read).toMatchObject({ available: true, card, snapshotId: expect.any(String) });
      expect(JSON.stringify(read)).not.toMatch(/Keep general notes|legacyExtra/);
    }
    const read = json(await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'diet' } }));
    expect(read.fields).toContainEqual(expect.objectContaining({ key: 'bloating', value: 'none', kind: 'single',
      options: expect.arrayContaining([{ label: 'moderate', value: 'moderate' }]) }));
  });
  it('creates a reviewable before/after proposal without saving, and preserves its payload through reload', async () => {
    const before = structuredClone(state.importedData);
    const { runtime, result } = await propose();
    expect(json(result)).toMatchObject({ status: 'pending_user_approval' });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(state.importedData).toEqual(before);
    const draft = { ...runtime.getDrafts()[0]!, profileId: 'a' };
    const reloaded = normalizeChatMessages([{ role: 'assistant', content: 'Review this update', agentDrafts: [draft] }])[0]!.agentDrafts![0]!;
    expect(reloaded.payload).toEqual(draft.payload);
    const html = renderAgentDraftCards({ agentDrafts: [reloaded] }, 0);
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.body.textContent).toContain('Bloating · currentnone');
    expect(document.body.textContent).toContain('Bloating · proposedmoderate');
    expect(document.body.textContent).toContain(evidence);
    expect(html).toContain('apply-agent-draft');
    expect(html).toContain('discard-agent-draft');
  });
  it('applies reviewed fields through a locked field expectation, preserving unrelated and legacy data', async () => {
    const { runtime } = await propose(undefined, [{ field: 'bloating', value: 'moderate' }, { field: 'note', value: 'User reports bloating after dinner.' }]);
    const before = structuredClone(state.importedData);
    await expect(applyAgentDraft({ ...runtime.getDrafts()[0]!, profileId: 'a' })).resolves.toBe('Diet & Digestion updated.');
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith('a', expect.objectContaining({
      contextNotes: before.contextNotes,
      diet: { ...before.diet, bloating: 'moderate', note: 'User reports bloating after dinner.' },
      changeHistory: [expect.objectContaining({ field: 'diet', snapshot: expect.objectContaining({ bloating: 'moderate' }) })],
    }), expect.objectContaining({ forceProfileScope: true, baseData: before, expectedContextField: { key: 'diet', value: before.diet } }));
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('a');
  });
  it('shows a discarded proposal as inactive and sends its review decision to the next turn', async () => {
    const { runtime } = await propose();
    const draft = { ...runtime.getDrafts()[0]!, profileId: 'a', status: 'discarded' };
    const html = renderAgentDraftCards({ agentDrafts: [draft] }, 0);
    expect(html).toContain('Discarded');
    expect(html).not.toContain('apply-agent-draft');
    await expect(applyAgentDraft(draft)).rejects.toThrow('no longer pending');
    expect(mocks.save).not.toHaveBeenCalled();
    const review = buildAgentDraftReviewContext([{ agentDrafts: [draft] }]);
    expect(review).toContain('"status":"discarded","reviewActions":[]');
    expect(review).toContain('A discarded card cannot be applied or reopened.');
    expect(review).toContain('read fresh data and create a new proposal for a new review');
  });
});

describe('structured history, goals, light, and cycle context', () => {
  async function proposal(card: string, changes: AgentContextChange[]) {
    const runtime = tools();
    const read = json(await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card } }));
    const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card, snapshotId: read.snapshotId, changes, reason: 'A reported personal update.', evidence } });
    return { runtime, read, result, draft: { ...runtime.getDrafts()[0], profileId: 'a' } };
  }
  it('adds a real goal, retains existing goals/metadata, and displays a reviewable record', async () => {
    state.importedData.healthGoals = [{ text: 'Improve energy', severity: 'major', extra: 'preserve' }];
    const { result, draft } = await proposal('healthGoals', [{ field: 'goals', operation: 'add', record: { text: 'Sleep better' } }]);
    expect(result.success).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(renderAgentDraftCards({ agentDrafts: [draft] }, 0)).toContain('Sleep better');
    await applyAgentDraft(draft);
    const saved = mocks.save.mock.calls[0]![1];
    expect(saved.healthGoals).toEqual([{ text: 'Improve energy', severity: 'major', extra: 'preserve' }, { text: 'Sleep better', severity: 'mild', updatedAt: expect.any(Number) }]);
    expect(saved.sleepRest).toBeUndefined();
    expect(mocks.save.mock.calls[0]![2].expectedContextField).toEqual({ key: 'healthGoals', value: state.importedData.healthGoals });
  });
  it('updates and removes indexed goals through normal tombstone identities', async () => {
    state.importedData.healthGoals = [{ text: 'Old goal', severity: 'minor', extension: 'keep' }];
    const previouslyDeletedId = getConfiguredArrayItemId('healthGoals', { text: 'New goal' });
    state.importedData._deleted = { healthGoals: [previouslyDeletedId] };
    const update = await proposal('healthGoals', [{ field: 'goals', operation: 'update', index: 0, record: { text: 'New goal' } }]);
    await applyAgentDraft(update.draft);
    let saved = mocks.save.mock.calls.at(-1)![1];
    expect(saved.healthGoals[0]).toMatchObject({ text: 'New goal', extension: 'keep', severity: 'minor' });
    expect(saved._deleted.healthGoals).toHaveLength(1);
    expect(saved._deleted.healthGoals).not.toContain(previouslyDeletedId);
    state.importedData.healthGoals = saved.healthGoals;
    const remove = await proposal('healthGoals', [{ field: 'goals', operation: 'remove', index: 0 }]);
    await applyAgentDraft(remove.draft);
    saved = mocks.save.mock.calls.at(-1)![1];
    expect(saved.healthGoals).toEqual([]);
    expect(saved._deleted.healthGoals).toHaveLength(1);
  });
  it('records a relative independently of personal diagnoses, without converting death age to onset', async () => {
    state.importedData.diagnoses = { conditions: [{ name: 'Existing condition', extension: 'keep' }], flags: { legacyFlag: true }, extension: 'preserve' };
    const { draft, result } = await proposal('diagnoses', [{ field: 'familyHistory', operation: 'add', record: {
      relative: 'maternal_grandfather', condition: "Alzheimer's disease", note: 'Died at age 80; age at onset not reported.'
    } }]);
    expect(result.success).toBe(true);
    await applyAgentDraft(draft);
    expect(mocks.save.mock.calls[0]![1].diagnoses).toEqual({ ...state.importedData.diagnoses, familyHistory: [{
      relative: 'maternal_grandfather', condition: "Alzheimer's disease", note: 'Died at age 80; age at onset not reported.', updatedAt: expect.any(Number)
    }] });
    expect(mocks.save.mock.calls[0]![1].diagnoses.familyHistory[0]).not.toHaveProperty('onsetAge');
  });
  it('patches existing medical records and flags while preserving unknown metadata', async () => {
    state.importedData.diagnoses = { conditions: [{ name: 'Asthma', status: 'active', extension: 'keep' }], flags: { legacyFlag: true } };
    const { draft } = await proposal('diagnoses', [{ field: 'conditions', operation: 'update', index: 0, record: { status: 'controlled' } }, { field: 'lowMuscleMass', value: 'true' }]);
    await applyAgentDraft(draft);
    expect(mocks.save.mock.calls[0]![1].diagnoses).toMatchObject({ conditions: [{ name: 'Asthma', status: 'controlled', extension: 'keep' }], flags: { legacyFlag: true, lowMuscleMass: true } });
  });
  it('clears an incorrect optional onset age without losing the family record', async () => {
    state.importedData.diagnoses = { familyHistory: [{ relative: 'maternal_grandfather', condition: 'Alzheimer', onsetAge: 80, extra: 'preserve' }] };
    const { draft, result } = await proposal('diagnoses', [{ field: 'familyHistory', operation: 'update', index: 0,
      record: { clearFields: ['onsetAge'], note: '80 was age at death; onset unknown.' } }]);
    expect(result.success).toBe(true);
    expect(renderAgentDraftCards({ agentDrafts: [draft] }, 0)).toContain('Age at onset');
    await applyAgentDraft(draft);
    expect(mocks.save.mock.calls[0]![1].diagnoses.familyHistory[0]).toEqual(expect.objectContaining({ relative: 'maternal_grandfather', condition: 'Alzheimer', extra: 'preserve', note: '80 was age at death; onset unknown.' }));
    expect(mocks.save.mock.calls[0]![1].diagnoses.familyHistory[0]).not.toHaveProperty('onsetAge');
    expect((await proposal('diagnoses', [{ field: 'familyHistory', operation: 'update', index: 0, record: { clearFields: ['relative'] } }])).result.success).toBe(false);
  });
  it.each([
    ['diagnoses', { field: 'familyHistory', operation: 'add', record: { relative: 'grandfather', condition: 'Alzheimer' } }],
    ['diagnoses', { field: 'familyHistory', operation: 'add', record: { relative: 'father', condition: 'Alzheimer', onsetAge: 121 } }],
    ['diagnoses', { field: 'conditions', operation: 'add', record: { name: 'Asthma', status: 'invented' } }],
    ['healthGoals', { field: 'goals', operation: 'update', index: 99, record: { text: 'Changed' } }],
    ['healthGoals', { field: 'goals', operation: 'add', record: { text: 'Goal', unknown: 'value' } }],
    ['menstrualCycle', { field: 'periods', operation: 'add', record: { startDate: '2026-02-30' } }],
    ['menstrualCycle', { field: 'periods', operation: 'add', record: { startDate: '2026-10-23', endDate: '2026-10-22' } }],
  ] as [string, AgentContextChange][])('rejects unsupported structured data %s %j', async (card, change) => {
    expect((await proposal(card, [change])).result.success).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('stores a period start with unknown end/flow; closing it updates the same observation', async () => {
    const { draft, read, result } = await proposal('menstrualCycle', [{ field: 'periods', operation: 'add', record: { startDate: '2026-10-23' } }]);
    expect(read.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.success).toBe(true);
    await applyAgentDraft(draft);
    let saved = mocks.save.mock.calls.at(-1)![1];
    expect(saved.menstrualCycle.periods).toEqual([expect.objectContaining({ startDate: '2026-10-23', endDate: '', flow: '', endDateKnown: false, flowKnown: false, confidence: 'observed' })]);
    expect(saved.menstrualCycle.historySummary.periodLength).not.toBe(1);
    const id = saved.menstrualCycle.periods[0].id;
    state.importedData.menstrualCycle = saved.menstrualCycle;
    const close = await proposal('menstrualCycle', [{ field: 'periods', operation: 'update', index: 0, record: { endDate: '2026-10-27', flow: 'light' } }]);
    await applyAgentDraft(close.draft);
    saved = mocks.save.mock.calls.at(-1)![1];
    expect(saved.menstrualCycle.periods).toEqual([expect.objectContaining({ id, endDate: '2026-10-27', flow: 'light', endDateKnown: true, flowKnown: true })]);
  });
  it('blocks duplicate and overlapping period entries and rejects stale approvals', async () => {
    state.importedData.menstrualCycle = { periods: [{ startDate: '2026-10-20', endDate: '2026-10-24' }] };
    const overlap = await proposal('menstrualCycle', [{ field: 'periods', operation: 'add', record: { startDate: '2026-10-23' } }]);
    expect(overlap.result.success).toBe(false);
    const valid = await proposal('menstrualCycle', [{ field: 'periods', operation: 'add', record: { startDate: '2026-11-20' } }]);
    state.importedData.menstrualCycle.periods.push({ startDate: '2026-11-21' });
    await expect(applyAgentDraft(valid.draft)).rejects.toMatchObject({ noChangeApplied: true });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('keeps start-only observations unknown through normalization and excludes them from duration/flow statistics', () => {
    const periods = [{ startDate: '2026-10-23', endDate: '', flow: '', endDateKnown: false, flowKnown: false }];
    const normalized = normalizeCyclePeriods(periods);
    expect(normalized[0]).toMatchObject({ startDate: '2026-10-23', endDate: '', flow: '' });
    expect(calculateCycleStats(normalized)).toMatchObject({ periodLength: null, flow: null });
    expect(summarizeCyclePeriods(normalized)).toMatchObject({ periodLength: null, flow: null });
    expect(buildCycleHistorySummary(normalized).recent12.heavyRate).toBeNull();
  });
  it('supports multiple record changes using indices from the original read snapshot', async () => {
    state.importedData.healthGoals = [{ text: 'Remove first' }, { text: 'Remove second' }, { text: 'Keep third', extra: 'preserve' }];
    const { draft, result } = await proposal('healthGoals', [
      { field: 'goals', operation: 'remove', index: 0 }, { field: 'goals', operation: 'remove', index: 1 },
      { field: 'goals', operation: 'update', index: 2, record: { severity: 'major' } },
      { field: 'goals', operation: 'add', record: { text: 'New goal one' } },
      { field: 'goals', operation: 'add', record: { text: 'New goal two' } },
    ]);
    expect(result.success).toBe(true);
    await applyAgentDraft(draft);
    expect(mocks.save.mock.calls[0]![1].healthGoals).toEqual([
      expect.objectContaining({ text: 'Keep third', extra: 'preserve', severity: 'major' }),
      expect.objectContaining({ text: 'New goal one' }), expect.objectContaining({ text: 'New goal two' }),
    ]);
    expect((await proposal('healthGoals', [{ field: 'goals', operation: 'add', record: { text: 'Duplicate' } },
      { field: 'goals', operation: 'add', record: { text: 'Duplicate' } }])).result.success).toBe(false);
  });
  it('updates Light, Interpretive Lens, and meal times through supported fields', async () => {
    for (const [card, changes] of [
      ['lightCircadian', [{ field: 'note', value: 'Morning walks in daylight' }]],
      ['interpretiveLens', [{ field: 'text', value: 'Longevity medicine' }]],
      ['diet', [{ field: 'breakfastTime', value: '09:30' }]],
    ] as [string, AgentContextChange[]][]) {
      const { draft, result } = await proposal(card, changes);
      expect(result.success).toBe(true);
      await applyAgentDraft(draft);
    }
    expect(mocks.save.mock.calls[0]![1].lightCircadian.note).toBe('Morning walks in daylight');
    expect(mocks.save.mock.calls[1]![1].interpretiveLens).toBe('Longevity medicine');
    expect(mocks.save.mock.calls[2]![1].diet.breakfastTime).toBe('09:30');
    expect((await proposal('diet', [{ field: 'breakfastTime', value: '25:70' }])).result.success).toBe(false);
  });
});

describe('context proposal boundaries', () => {
  it('requires a real read snapshot and rejects stale or cross-card snapshots', async () => {
    const { runtime, args } = await propose();
    for (const override of [{ snapshotId: 'invented' }, { card: 'stress' }]) {
      const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { ...args, ...override } });
      expect(result.success).toBe(false);
    }
    state.importedData.diet!.bloating = 'severe';
    const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: args });
    expect(result.success).toBe(false);
    expect(result.contentItems[0].text).toContain('changed');
    expect(runtime.getDrafts()).toHaveLength(1);
  });
  it.each([
    [{ field: 'bloating', value: 'an invented choice' }],
    [{ field: 'unknown', value: 'anything' }],
    [{ field: '__proto__', value: 'unsafe' }],
    [{ field: 'bloating', values: ['moderate'] }],
    [{ field: 'foodSensitivities', values: ['none', 'gluten'] }],
    [{ field: 'bloating', value: 'moderate' }, { field: 'bloating', value: 'severe' }],
  ].map(changes => ({ changes })))('rejects invalid choices or arbitrary patches: %j', async ({ changes }) => {
    const { result, runtime } = await propose(undefined, changes);
    expect(result.success).toBe(false);
    expect(runtime.getDrafts()).toHaveLength(0);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('accepts multiple-choice values and explicit clearing, but rejects unchanged answers', async () => {
    const { result } = await propose(undefined, [{ field: 'foodSensitivities', values: ['gluten'] }, { field: 'bloating', value: '' }]);
    expect(result.success).toBe(true);
    expect((await propose(undefined, [{ field: 'bloating', value: 'none' }])).result.success).toBe(false);
  });
  it('requires evidence from the current user message', async () => {
    const { runtime, args } = await propose();
    const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { ...args, evidence: 'A retrieved document says I am sick.' } });
    expect(result.success).toBe(false);
    expect(result.contentItems[0].text).toContain('quote the current user message');
  });
  it('blocks disabled sources and profile switches at read, draft, and apply boundaries', async () => {
    const { runtime, args } = await propose();
    mocks.enabled.mockReturnValue(false);
    const disabled = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'diet' } });
    expect(disabled.success).toBe(false);
    expect(disabled.contentItems[0].text).toContain('disabled');
    expect(summarizeAgentToolReceipts([{ tool: 'getbased_read_context_card', arguments: { card: 'diet' }, success: disabled.success }])).toEqual([]);
    expect((await runtime.execute({ tool: 'getbased_draft_context', arguments: args })).success).toBe(false);
    await expect(applyAgentDraft({ ...runtime.getDrafts()[0]!, profileId: 'a' })).rejects.toThrow('disabled');
    mocks.enabled.mockReturnValue(true);
    state.currentProfile = 'b';
    expect((await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'diet' } })).success).toBe(false);
    expect((await runtime.execute({ tool: 'getbased_draft_context', arguments: args })).success).toBe(false);
    await expect(applyAgentDraft({ ...runtime.getDrafts()[0]!, profileId: 'b' })).rejects.toThrow('Switch back');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rejects a changed card before writing and identifies conflicts arriving inside the transaction', async () => {
    const { runtime } = await propose();
    const draft = { ...runtime.getDrafts()[0]!, profileId: 'a' };
    state.importedData.diet!.bloating = 'severe';
    await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
    expect(mocks.save).not.toHaveBeenCalled();
    state.importedData.diet!.bloating = 'none';
    mocks.save.mockImplementation(async (_profile, _next, options: { onContextFieldConflict: () => void }) => {
      options.onContextFieldConflict(); return false;
    });
    await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
    expect(mocks.notify).not.toHaveBeenCalled();
    const html = renderAgentDraftCards({ agentDrafts: [{ ...draft, status: 'conflict' }] }, 0);
    expect(html).toContain('Nothing was applied');
    expect(html).not.toContain('apply-agent-draft');
  });
  it('leaves live data unchanged on a failed write and revalidates imported field patches', async () => {
    const { runtime } = await propose();
    const draft = { ...runtime.getDrafts()[0]!, profileId: 'a' };
    const before = structuredClone(state.importedData);
    mocks.save.mockResolvedValue(false);
    await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save');
    expect(state.importedData).toEqual(before);
    mocks.save.mockClear();
    await expect(applyAgentDraft({ ...draft, payload: { ...draft.payload, changes: [{ field: 'bloating', value: 'invalid' }] } })).rejects.toThrow('allowed value');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rejects malformed persisted baselines and reports card reads in disclosure receipts', () => {
    expect(normalizeAgentContextProposal({ card: 'diet', baseline: '[]', changes: [{ field: 'bloating', value: 'moderate' }], reason: 'Changed', evidence })).toBeNull();
    expect(summarizeAgentToolReceipts([{ tool: 'getbased_read_context_card', arguments: { card: 'diet' }, success: true }]))
      .toEqual([{ label: 'Insight Context Cards', detail: 'Card: diet' }]);
  });
});

describe('corrected pending proposals', () => {
  const draft = (id: string, field = 'bloating', card = 'diet', profileId = 'a', status = 'pending') => ({
    id, profileId, kind: 'context', status,
    payload: { card, baseline: 'null', changes: [{ field, value: id === 'older' ? 'mild' : 'severe' }], reason: 'User correction', evidence },
  });
  it('retires overlapping earlier cards on reload without mutating imported input or health data', () => {
    const input = [{ role: 'assistant', content: 'Earlier', agentDrafts: [draft('older')] },
      { role: 'assistant', content: 'Correction', agentDrafts: [draft('newer')] }];
    const before = structuredClone(state.importedData);
    const normalized = normalizeChatMessages(input);
    expect(normalized.map(message => message.agentDrafts![0]!.status)).toEqual(['superseded', 'pending']);
    expect(input[0]!.agentDrafts[0]!.status).toBe('pending');
    expect(state.importedData).toEqual(before);
    const html = renderAgentDraftCards(normalized[0], 0);
    expect(html).toContain('Replaced by a newer proposal');
    expect(html).not.toContain('apply-agent-draft');
  });
  it('preserves independent fields, cards, and profiles and never retires an applied or in-flight change', () => {
    const cases = [draft('other-field', 'gas'), draft('other-card', 'level', 'stress'), draft('other-profile', 'bloating', 'diet', 'b'),
      draft('applied', 'bloating', 'diet', 'a', 'applied'), draft('applying', 'bloating', 'diet', 'a', 'applying')];
    const messages = cases.map(item => ({ agentDrafts: [item] }));
    messages.push({ agentDrafts: [draft('newer')] });
    supersedePendingContextProposals(messages);
    expect(cases.map(item => item.status)).toEqual(['pending', 'pending', 'pending', 'applied', 'applying']);
  });
  it('keeps an older proposal retired after the replacement is discarded', () => {
    const normalized = normalizeChatMessages([{ content: 'Earlier', agentDrafts: [draft('older')] },
      { content: 'Correction declined', agentDrafts: [draft('newer', 'bloating', 'diet', 'a', 'discarded')] }]);
    expect(normalized.map(message => message.agentDrafts![0]!.status)).toEqual(['superseded', 'discarded']);
  });
});

import { setChatControlsEnabled } from '../js/chat-control-settings.js';
it('expires context review across off/on, excludes it from prompts and permits a fresh review', async () => {
  const { runtime } = await propose(); const draft = { ...runtime.getDrafts()[0]!, profileId: 'a' };
  await setChatControlsEnabled(false); await expect(applyAgentDraft(draft)).rejects.toThrow('Health updates through chat');
  expect(buildAgentDraftReviewContext([{ agentDrafts: [draft] }])).toBe('');
  await setChatControlsEnabled(true); await expect(applyAgentDraft(draft)).rejects.toThrow('expired');
  expect(buildAgentDraftReviewContext([{ agentDrafts: [draft] }])).toBe(''); expect(mocks.save).not.toHaveBeenCalled();
  const fresh = (await propose()).runtime.getDrafts()[0]!; expect(fresh.id).not.toBe(draft.id);
  await expect(applyAgentDraft({ ...fresh, profileId: 'a' })).resolves.toBe('Diet & Digestion updated.');
});
it('revokes the final context commit callback after authorization changes while saving', async () => {
  const { runtime } = await propose();
  mocks.save.mockImplementationOnce(async (_profile, _next, options) => {
    await setChatControlsEnabled(false); await setChatControlsEnabled(true);
    expect(options.canCommit()).toBe(false); return false;
  });
  await expect(applyAgentDraft({ ...runtime.getDrafts()[0]!, profileId: 'a' })).rejects.toMatchObject({ noChangeApplied: true });
  expect(mocks.notify).not.toHaveBeenCalled();
});
