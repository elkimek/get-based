// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as cryptoStorage from '../js/crypto.js';
import * as meals from '../js/nutrition-store.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { createMealRecordSnapshot, projectMealCommand } from '../js/nutrition-record-commands.js';
import { setContextSourceEnabled, CONTEXT_SOURCE_IDS } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import type { AgentDraft } from '../js/agent-tool-runtime.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { NutritionMeal } from '../types/nutrition-data.js';

const evidence = 'Correct the meal and drink details I reported.';
const originalState = { profile: state.currentProfile, data: state.importedData, summary: state.nutritionSummary };
const thumbnail = 'data:image/webp;base64,' + 'AAAA'.repeat(22000);
let profile: string, key: string;
const sample = () => ({ id: 'meal-a', name: 'Example lunch', mealType: 'lunch', eatenAt: '2026-10-20T12:00:00.000Z', note: 'Original note',
  nutrients: { energyKcal: 600, proteinG: 30, sodiumMg: 500, fiberG: 8 },
  components: [
    { name: 'First ingredient', quantityG: 100, nutrients: { energyKcal: 300, proteinG: 10 }, nutrientsPer100g: { energyKcal: 300, proteinG: 10 }, privateOrigin: 'keep first origin' },
    { name: 'Second ingredient', quantityG: 200, nutrients: { energyKcal: 300, proteinG: 20 }, nutrientsPer100g: { energyKcal: 150, proteinG: 10 }, privateOrigin: 'keep second origin' },
  ], images: [{ thumbnailUrl: thumbnail, fileName: 'first.webp' }, { thumbnailUrl: 'data:image/png;base64,AAAA', fileName: 'second.png' }],
  source: { kind: 'ai-photo-estimate', model: 'original-model', privateSource: 'retain source', review: { editedNutrients: ['fiberG'], privateReview: 'keep' } }, extension: { preserved: true },
});
async function stored() { return JSON.parse((await cryptoStorage.encryptedGetItem(key))!) as Omit<typeof state.importedData, 'nutritionMeals'> & { nutritionMeals: NutritionMeal[] }; }
function runtime() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(patch: object, operation: 'add' | 'update' | 'remove' = 'update', recordId = 'meal-a') {
  const tools = runtime();
  const read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', ...(operation === 'add' ? { create: true } : { recordId }) } });
  expect(read.success, read.contentItems[0].text).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string; current: Record<string, unknown>; recordId: string };
  const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'meals', operation, snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'An explicit user correction.' } });
  return { tools, snapshot, result, draft: { ...tools.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `meal-proposal-${globalThis.crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION, true);
  expect(await saveImportedData()).toBe(true);
  await meals.saveActiveProfileMeal(sample());
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); await meals.deleteNutritionDB(profile); await cryptoStorage.encryptedRemoveItem(key);
  state.currentProfile = originalState.profile; state.importedData = originalState.data; state.nutritionSummary = originalState.summary;
  localStorage.removeItem('labcharts-ai-context-meals-nutrition');
});
it('reads an exact photo meal using a small snapshot without leaking bytes or hidden provenance', async () => {
  const { result, snapshot, draft } = await propose({ note: 'Corrected note' });
  expect(result.success, result.contentItems[0].text).toBe(true);
  expect(JSON.stringify(snapshot)).not.toContain('AAAA'); expect(JSON.stringify(snapshot)).not.toContain('private');
  expect(String(draft.payload.baseline).length).toBeLessThan(5000);
  expect((await stored()).nutritionMeals![0]!.note).toBe('Original note');
  await applyAgentDraft(draft);
  const row = (await stored()).nutritionMeals![0]!;
  expect(row).toMatchObject({ note: 'Corrected note', extension: { preserved: true }, source: { model: 'original-model', privateSource: 'retain source', review: { privateReview: 'keep' } } });
  expect(row.images![0]!.thumbnailUrl).toBe(thumbnail);
  expect(await meals.getNutritionMeal(profile, 'meal-a')).toMatchObject({ note: 'Corrected note', extension: { preserved: true } });
  expect(state.nutritionSummary?.totalMeals).toBe(1);
});
it('scales a linked portion, clears unsupported estimates and preserves explicit whole-meal facts', async () => {
  const { result, draft } = await propose({ componentChanges: [{ operation: 'update', index: 0, record: { quantityG: 200 } }] });
  expect(result.success).toBe(true);
  const review = JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] })); expect(review).toContain('900');
  await applyAgentDraft(draft);
  const row = (await stored()).nutritionMeals![0]!;
  expect(row.nutrients).toEqual({ energyKcal: 900, proteinG: 40, fiberG: 8 });
  expect(row.source).toMatchObject({ review: { editedPortions: 1 } });
  expect(row.components![0]).toMatchObject({ quantityG: 200, privateOrigin: 'keep first origin', nutrients: { energyKcal: 600, proteinG: 20 } });
});
it('updates ingredient identities without borrowing the old food nutrient profile', async () => {
  const { draft, result } = await propose({ componentChanges: [{ operation: 'update', index: 0, record: { name: 'Different food' } }] });
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const row = (await stored()).nutritionMeals![0]!;
  expect(row.components![0]).toMatchObject({ name: 'Different food', nutrients: {}, nutrientsPer100g: {}, privateOrigin: 'keep first origin' });
  expect(row.nutrients).toEqual({ fiberG: 8 });
});
it('applies component CRUD by original indices and calculates explicitly supplied portion nutrients', async () => {
  const { draft, result } = await propose({ componentChanges: [
    { operation: 'remove', index: 0 }, { operation: 'update', index: 1, record: { quantityG: 100 } },
    { operation: 'add', record: { name: 'New food', quantityG: 50, nutrients: { energyKcal: 100, proteinG: 5 } } },
  ] });
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const row = (await stored()).nutritionMeals![0]!;
  expect(row.components).toHaveLength(2); expect(row.components![0]).toMatchObject({ name: 'Second ingredient', quantityG: 100, privateOrigin: 'keep second origin' });
  expect(row.components![1]).toMatchObject({ name: 'New food', nutrients: { energyKcal: 100, proteinG: 5 } });
  expect(row.nutrients).toEqual({ energyKcal: 250, proteinG: 15, fiberG: 8 });
});
it('corrects individual nutrients without clearing unspecified values', async () => {
  const { draft, result } = await propose({ nutrients: { sodiumMg: null, vitaminCMg: 25 } });
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).nutritionMeals![0]!.nutrients).toEqual({ energyKcal: 600, proteinG: 30, fiberG: 8, vitaminCMg: 25 });
});
it('adds water with correct hydration accounting and a frozen time without invented calories', async () => {
  const { draft, result } = await propose({ drink: { kind: 'water', amountMl: 350 } }, 'add');
  expect(result.success).toBe(true); const when = new Date(Number(draft.payload.recordedAt)).toISOString();
  await applyAgentDraft(draft);
  const row = (await stored()).nutritionMeals!.find(row => row.id === draft.payload.recordId)!;
  expect(row).toMatchObject({ name: 'Water', mealType: 'drink', eatenAt: when, nutrients: { fluidMl: 350, plainWaterMl: 350 } });
  expect(row.nutrients).not.toHaveProperty('energyKcal'); expect(state.nutritionSummary?.totalMeals).toBe(2);
});
it('updates a drink without retaining plain-water credit for another beverage', async () => {
  const { draft, result } = await propose({ drink: { kind: 'tea-coffee', amountMl: 250 }, nutrients: { caffeineMg: 80 } });
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  const row = (await stored()).nutritionMeals![0]!;
  expect(row.nutrients).toMatchObject({ fluidMl: 250, caffeineMg: 80 }); expect(row.nutrients).not.toHaveProperty('plainWaterMl');
});
it('changes and clears after-meal check-in levels without guessing other levels', async () => {
  const first = await propose({ responseCheckIn: { satiety2h: 2 } }); expect(first.result.success).toBe(true); await applyAgentDraft(first.draft);
  expect((await stored()).nutritionMeals![0]!.responseCheckIn).toMatchObject({ satiety2h: 2 });
  expect((await stored()).nutritionMeals![0]!.responseCheckIn).not.toHaveProperty('energy2h');
  const second = await propose({ responseCheckIn: { energy2h: 3 } }); await applyAgentDraft(second.draft);
  expect((await stored()).nutritionMeals![0]!.responseCheckIn).toMatchObject({ satiety2h: 2, energy2h: 3 });
  await applyAgentDraft((await propose({ responseCheckIn: null })).draft);
  expect((await stored()).nutritionMeals![0]!).not.toHaveProperty('responseCheckIn');
});
it('retains, reorders and removes existing photos without replacing them with model content', async () => {
  const change = await propose({ keepImageIndices: [1, 0] }); expect(change.result.success).toBe(true); await applyAgentDraft(change.draft);
  expect((await stored()).nutritionMeals![0]!.images!.map(image => image.fileName)).toEqual(['second.png', 'first.webp']);
  await applyAgentDraft((await propose({ keepImageIndices: [] })).draft); expect((await stored()).nutritionMeals![0]!.images).toEqual([]);
});
it('rejects a peer photo or hidden metadata change even when the public meal fields match', async () => {
  const { draft } = await propose({ note: 'Accepted correction' });
  const peer = await stored(); peer.nutritionMeals![0]!.images![0]!.thumbnailUrl = 'data:image/webp;base64,BBBB';
  await cryptoStorage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
  expect((await stored()).nutritionMeals![0]!.note).toBe('Original note');
  const retry = await propose({ note: 'New proposal' }); peer.nutritionMeals![0]!.extension = 'peer extension'; await cryptoStorage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(retry.draft)).rejects.toMatchObject({ noChangeApplied: true });
});
it('rereads durable records and preserves unrelated peer additions', async () => {
  const { draft } = await propose({ note: 'Reviewed correction' });
  const peer = await stored(); peer.nutritionMeals!.push({ id: 'peer-meal', name: 'Peer dinner', eatenAt: '2026-10-20T18:00:00.000Z' });
  peer.contextNotes = 'Peer note'; await cryptoStorage.encryptedSetItem(key, JSON.stringify(peer));
  await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.contextNotes).toBe('Peer note'); expect(saved.nutritionMeals).toHaveLength(2);
  const stale = await stored(); stale.nutritionMeals!.find(row => row.id === 'meal-a')!.note = 'Latest peer text'; await cryptoStorage.encryptedSetItem(key, JSON.stringify(stale));
  expect((await propose({ note: 'Next text' })).snapshot.current.note).toBe('Latest peer text');
});
it('restores compact proposals from chat storage before Apply and removes only the selected record', async () => {
  const { draft, result } = await propose({}, 'remove'); expect(result.success).toBe(true);
  const restored = normalizeChatMessages([{ role: 'assistant', content: 'Review', agentDrafts: [draft] }])[0]!.agentDrafts![0]!;
  await applyAgentDraft(restored as AgentDraft);
  const saved = await stored(); expect(saved.nutritionMeals).toEqual([]); expect(saved._deleted.nutritionMeals).toContain('meal-a');
  expect(await meals.getNutritionMeal(profile, 'meal-a')).toBeNull(); expect(state.nutritionSummary?.totalMeals).toBe(0);
});
it('rejects a changed public review even when its full-record fingerprint was left intact', async () => {
  const { draft } = await propose({ note: 'Corrected' }); const snapshot = JSON.parse(String(draft.payload.baseline)); snapshot.record.name = 'False review';
  await expect(applyAgentDraft({ ...draft, payload: { ...draft.payload, baseline: JSON.stringify(snapshot) } })).rejects.toMatchObject({ noChangeApplied: true });
});
it('does not alter the encrypted cache if the canonical write fails', async () => {
  const { draft } = await propose({ note: 'Should fail' }), write = cryptoStorage.encryptedSetItem;
  vi.spyOn(cryptoStorage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Write failed'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('could not be saved');
  expect((await stored()).nutritionMeals![0]!.note).toBe('Original note'); expect(await meals.getNutritionMeal(profile, 'meal-a')).toMatchObject({ note: 'Original note' });
});
it('reports a committed edit even when its optional local view refresh fails', async () => {
  const { draft } = await propose({ note: 'Durably corrected' });
  vi.spyOn(meals, 'refreshNutritionMealsFromSnapshot').mockRejectedValue(new Error('Cache temporarily unavailable'));
  await expect(applyAgentDraft(draft)).resolves.toContain('Saved; reload Nutrition');
  expect((await stored()).nutritionMeals![0]!.note).toBe('Durably corrected');
});
it('enforces source revocation, profile ownership and exact evidence', async () => {
  const { draft, tools, snapshot } = await propose({ note: 'Proposed' });
  expect((await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'meals', operation: 'update', snapshotId: snapshot.snapshotId, patch: '{"note":"Other"}', reason: 'Other', evidence: 'Not stated' } })).success).toBe(false);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION, false); await expect(applyAgentDraft(draft)).rejects.toThrow('disabled');
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION, true); state.currentProfile = 'other'; localStorage.setItem('labcharts-active-profile', 'other'); await expect(applyAgentDraft(draft)).rejects.toThrow('profile');
});
it.each([
  { nutrients: { energyKcal: -1 } }, { nutrients: { proteinG: '30' } }, { nutrients: { invented: 10 } }, { name: '' }, { mealType: 'invented' },
  { localDateTime: '2026-02-30T12:00' }, { eatenAt: '2026-10-20T25:00:00Z' }, { eatenAt: '2026-10-20T12:00' }, { localDateTime: '2026-10-20T12:00', eatenAt: '2026-10-20T12:00Z' },
  { responseCheckIn: { energy2h: 4 } }, { responseCheckIn: { satiety2h: '2' } }, { keepImageIndices: [2] }, { keepImageIndices: [0, 0] }, { images: [] },
  { componentChanges: [{ operation: 'update', index: 99, record: { name: 'Missing' } }] },
  { componentChanges: [{ operation: 'update', index: 0, record: { quantityG: -1 } }] },
  { componentChanges: [{ operation: 'remove', index: 0 }, { operation: 'update', index: 0, record: { name: 'Ambiguous' } }] },
  { drink: { kind: 'water', amountMl: 0 } }, { drink: { kind: 'water', amountMl: 350 }, nutrients: { fluidMl: 350 } }, { source: { kind: 'fabricated-source' } },
])('rejects invalid or provenance-replacing meal patches %j', async patch => {
  expect((await propose(patch)).result.success).toBe(false);
});
it('does not preserve obsolete totals for a newly created meal with calculated component nutrients', async () => {
  const added = await propose({ name: 'New meal', componentChanges: [{ operation: 'add', record: { name: 'Known food', quantityG: 100, nutrientsPer100g: { energyKcal: 100 } } }] }, 'add');
  expect(added.result.success).toBe(true); await applyAgentDraft(added.draft);
  const corrected = await propose({ componentChanges: [{ operation: 'update', index: 0, record: { quantityG: 200 } }] }, 'update', String(added.draft.payload.recordId));
  expect(corrected.result.success).toBe(true); await applyAgentDraft(corrected.draft);
  expect((await stored()).nutritionMeals!.find(row => row.id === added.draft.payload.recordId)!.nutrients).toEqual({ energyKcal: 200 });
});
it('uses deterministic full-record fingerprints independent of object property order', async () => {
  const first = await createMealRecordSnapshot({ id: 'a', name: 'Example', eatenAt: '2026-10-23T12:00Z' });
  const second = await createMealRecordSnapshot({ eatenAt: '2026-10-23T12:00Z', name: 'Example', id: 'a' });
  expect(first.revision).toBe(second.revision);
});
it('keeps legacy photos removed rather than resurrecting their alternate image field', () => {
  const proposal = { operation: 'update', recordId: 'a', recordedAt: Date.now(), reason: 'Remove photo', evidence } as AgentDataProposal;
  expect(projectMealCommand({ id: 'a', name: 'Legacy meal', eatenAt: '2026-10-23T12:00Z', image: { thumbnailUrl: thumbnail } }, proposal, { keepImageIndices: [] })).not.toHaveProperty('image');
});
it.each([false, true])('guards the meal inside the locked profile commit (peer changes target: %s)', async changesTarget => {
  const { draft } = await propose({ note: 'Accepted correction' });
  const peer = await stored(); peer.contextNotes = 'Concurrent peer note';
  peer.nutritionMeals.push({ id: 'peer-late-meal', name: 'Peer snack', eatenAt: '2026-10-20T16:00:00Z' });
  if (changesTarget) peer.nutritionMeals.find(row => row.id === 'meal-a')!.note = 'Peer correction';
  const read = cryptoStorage.encryptedGetItem, write = cryptoStorage.encryptedSetItem; let reads = 0;
  vi.spyOn(cryptoStorage, 'encryptedGetItem').mockImplementation(async (...args) => {
    if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer));
    return read(...args);
  });
  if (changesTarget) await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
  else await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.contextNotes).toBe('Concurrent peer note');
  expect(saved.nutritionMeals).toHaveLength(2);
  expect(saved.nutritionMeals.find(row => row.id === 'meal-a')!.note).toBe(changesTarget ? 'Peer correction' : 'Accepted correction');
});
it('honors source revocation during the locked storage read before any write', async () => {
  const { draft } = await propose({ note: 'Do not apply' });
  const read = cryptoStorage.encryptedGetItem; let reads = 0;
  vi.spyOn(cryptoStorage, 'encryptedGetItem').mockImplementation(async (...args) => {
    const result = await read(...args);
    if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION, false);
    return result;
  });
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true });
  expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')!.note).toBe('Original note');
});
it('reviews legacy device-local meals without migrating before approval', async () => {
  const data = await stored(); delete (data as Partial<typeof data>).nutritionMeals;
  await cryptoStorage.encryptedSetItem(key, JSON.stringify(data));
  const write = vi.spyOn(cryptoStorage, 'encryptedSetItem');
  const { draft, result } = await propose({ note: 'Reviewed legacy correction' });
  expect(result.success).toBe(true); expect(write).not.toHaveBeenCalled();
  expect(await stored()).not.toHaveProperty('nutritionMeals');
  await applyAgentDraft(draft);
  expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')).toMatchObject({ note: 'Reviewed legacy correction', extension: { preserved: true } });
});
it('does not disclose an awaited meal read after its source is disabled', async () => {
  const read = cryptoStorage.encryptedGetItem;
  vi.spyOn(cryptoStorage, 'encryptedGetItem').mockImplementation(async (...args) => {
    const result = await read(...args); if (args[0] === key) setContextSourceEnabled(CONTEXT_SOURCE_IDS.NUTRITION, false); return result;
  });
  const result = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', recordId: 'meal-a' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).not.toContain('Example lunch');
});
it('resolves an explicit offset and timezone before the proposal is saved', async () => {
  const { result, draft } = await propose({ eatenAt: '2026-10-20T12:00:00-04:00', timeZone: 'America/New_York' });
  expect(result.success).toBe(true); expect(JSON.parse(String(draft.payload.patch))).toMatchObject({ eatenAt: '2026-10-20T16:00:00.000Z', timeZone: 'America/New_York' });
  await applyAgentDraft(draft);
  expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')).toMatchObject({ eatenAt: '2026-10-20T16:00:00.000Z', localTimeMinutes: 720, timezoneOffsetMinutes: 240, timeZone: 'America/New_York' });
});
it('reads the full identifier length accepted by meal archives', async () => {
  const id = 'a'.repeat(160); await meals.saveActiveProfileMeal({ ...sample(), id });
  const change = await propose({ note: 'Long identity correction' }, 'update', id); expect(change.result.success).toBe(true);
  await applyAgentDraft(change.draft); expect((await stored()).nutritionMeals.find(row => row.id === id)!.note).toBe('Long identity correction');
});
it('reviews a fresher uninitialized local meal without migrating or overwriting its provenance', async () => {
  await meals.deleteNutritionDB(profile);
  await meals.putNutritionMeal(profile, { ...sample(), note: 'Fresher local meal', updatedAt: '2099-01-01T00:00:00Z', extension: 'local provenance' }, { preserveUpdatedAt: true });
  const write = vi.spyOn(cryptoStorage, 'encryptedSetItem');
  const { result, snapshot, draft } = await propose({ note: 'Confirmed correction' });
  expect(result.success).toBe(true); expect(snapshot.current.note).toBe('Fresher local meal'); expect(write).not.toHaveBeenCalled();
  await applyAgentDraft(draft); expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')).toMatchObject({ note: 'Confirmed correction', extension: 'local provenance' });
});
it('mirrors the committed meal instead of replacing it from an uninitialized cache during refresh', async () => {
  await meals.deleteNutritionDB(profile);
  const { draft } = await propose({ note: 'Accepted canonical correction' }), refresh = meals.refreshNutritionMealsFromSnapshot;
  vi.spyOn(meals, 'refreshNutritionMealsFromSnapshot').mockImplementation(async (...args) => {
    await meals.putNutritionMeal(profile, { ...sample(), note: 'Unreviewed cache value', updatedAt: '2099-01-01T00:00:00Z' }, { preserveUpdatedAt: true });
    return refresh(...args);
  });
  await applyAgentDraft(draft);
  expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')!.note).toBe('Accepted canonical correction');
  expect(await meals.getNutritionMeal(profile, 'meal-a')).toMatchObject({ note: 'Accepted canonical correction' });
});
it('does not propose metadata-only changes when the reported facts already match', async () => {
  expect((await propose({ note: 'Original note' })).result.success).toBe(false);
});
it('invalidates an obsolete AI analysis when meal identity or analysis details change', async () => {
  const { result, draft } = await propose({ name: 'Corrected food identity', analysisContext: 'Different meal details' });
  expect(result.success).toBe(true); expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('previous estimate was cleared');
  await applyAgentDraft(draft);
  const saved = (await stored()).nutritionMeals.find(row => row.id === 'meal-a')!;
  expect(saved.nutrients).toEqual({ fiberG: 8 }); expect(saved.components).toEqual([]);
  expect(saved.source).toMatchObject({ review: { analysisInvalidated: true, originalAnalysis: { nutrients: sample().nutrients, components: [expect.objectContaining({ privateOrigin: 'keep first origin' }), expect.objectContaining({ privateOrigin: 'keep second origin' })] } } });
  expect(saved.images![0]!.thumbnailUrl).toBe(thumbnail);
});
it('changes a meal timezone without changing the reported instant', async () => {
  const original = (await stored()).nutritionMeals.find(row => row.id === 'meal-a')!;
  const { result, draft } = await propose({ timeZone: 'Asia/Tokyo' }); expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')).toMatchObject({ eatenAt: original.eatenAt, localTimeMinutes: 1260, timeZone: 'Asia/Tokyo', timezoneOffsetMinutes: -540 });
});
it('rejects duplicate canonical identities before any legacy merge can hide them', async () => {
  const data = await stored(); data.nutritionMeals.push(data.nutritionMeals[0]!); await cryptoStorage.encryptedSetItem(key, JSON.stringify(data));
  await meals.deleteNutritionDB(profile);
  const result = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', recordId: 'meal-a' } }); expect(result.success).toBe(false);
  expect((await stored()).nutritionMeals).toHaveLength(2);
});
it('accepts the same finite nonnegative numeric range as the ordinary meal editor', async () => {
  const { result, draft } = await propose({ nutrients: { vitaminAMcgRae: 1500000 }, componentChanges: [{ operation: 'update', index: 0, record: { quantityG: 120000 } }] });
  expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).nutritionMeals.find(row => row.id === 'meal-a')!.nutrients).toMatchObject({ energyKcal: 360300, vitaminAMcgRae: 1500000 });
});
