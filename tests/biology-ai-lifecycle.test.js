import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as data from '../js/data.js';
import { computeBiologyScoreAssessments, loadBiologyScoreInsights } from '../js/biology-scores.js';
import { configureBiologyScoreAIDeps, generateBiologyScoreAIAnswers, canAutomaticallyExplainBiologyScores } from '../js/biology-score-ai.js';
import { writeScoreAIAnswer, readScoreAIAnswer, getScoreAIMaterialKey, hasCurrentScoreAIAssessment, hasUnsavedScoreAIAnswers, retryUnsavedScoreAIAnswers } from '../js/biology-score-sections.js';
import { generateBiologyScoreContextReview, saveBiologyScoreContextReview, configureBiologyScoreContextAIDeps } from '../js/biology-score-context-ai.js';
import { encryptedGetItem, encryptedSetItem } from '../js/crypto.js';
import { configureCryptoUi } from '../js/crypto-ui.js';
import { getBlob, setBlob } from '../js/blob-storage.js';
import { buildFullBackupSnapshot, parseBackupSnapshot, serializeBackupSnapshot } from '../js/backup.js';
import { saveProfiles } from '../js/profile.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { _planKeyedMapDelta } from '../js/sync-delta-map-planner.js';
import { _planScalarDelta } from '../js/sync-delta-scalar-planner.js';
import { mergeMapRowsIntoImported } from '../js/sync-delta-map-merge.js';
import { mergeScalarRowsIntoImported } from '../js/sync-delta-scalar-merge.js';
import { DELTA_MAPS, DELTA_SCALARS } from '../js/sync-delta-surfaces.js';

const answer = { summary: 'The supplied markers need context.', explanation: '## Context\nInterpret the supplied markers together.' };
const cryptoRuntime = configureCryptoUi({});
let restoreAI, restoreContext;
beforeEach(async () => {
  localStorage.clear(); cryptoRuntime.clearEncryptionSession();
  state.currentProfile = crypto.randomUUID();
  state.profileSex = 'male'; state.profileDob = '1987-11-22'; state.rangeMode = 'optimal'; state.dateRangeFilter = 'all';
  await saveProfiles([{ id: state.currentProfile, name: 'Lifecycle test' }]);
  state.importedData = { entries: [{ date: new Date().toISOString().slice(0, 10), markers: { 'thyroid.tsh': 1.5, 'thyroid.ft4': 16 } }] };
  data.invalidateActiveDataCache();
});
afterEach(() => {
  if (restoreAI) configureBiologyScoreAIDeps(restoreAI);
  if (restoreContext) configureBiologyScoreContextAIDeps(restoreContext);
  restoreAI = restoreContext = null; cryptoRuntime.clearEncryptionSession(); localStorage.clear(); vi.restoreAllMocks();
});
function assessments() { return computeBiologyScoreAssessments(data.getActiveData()); }
function provider(call) { restoreAI = configureBiologyScoreAIDeps({ hasAIProvider: () => true, isAIPaused: () => false, callClaudeAPI: call }); }
function contextProvider(call) { restoreContext = configureBiologyScoreContextAIDeps({ hasAIProvider: () => true, isAIPaused: () => false, callClaudeAPI: call }); }

it('never starts paid generation on a normal page load, including after an algorithm update', async () => {
  const call = vi.fn(); provider(call);
  state.importedData.biologyScoreAI = { thyroidCoherence: { summary: 'Previously paid.', text: 'Keep this answer.', materialFingerprint: 'old-version' } };
  expect(canAutomaticallyExplainBiologyScores()).toBe(false);
  await loadBiologyScoreInsights();
  expect(call).not.toHaveBeenCalled();
  expect(readScoreAIAnswer(assessments().find(s => s.id === 'thyroidCoherence')).text).toBe('Keep this answer.');
});

it('salvages complete answers from a truncated batch without another paid call', async () => {
  const scores = assessments().slice(0, 2);
  const call = vi.fn(async () => ({ text: `{"${scores[0].id}":${JSON.stringify(answer)},"${scores[1].id}":{"summary":"interrupted`, usage: { inputTokens: 123, outputTokens: 456 }, truncated: true }));
  provider(call);
  const result = await generateBiologyScoreAIAnswers(scores);
  expect(result.failedIds).toEqual([scores[1].id]); expect(call).toHaveBeenCalledTimes(1);
  expect(result.answers[scores[0].id]).toMatchObject({ text: answer.explanation, generation: { scoreCount: 2, usage: { inputTokens: 123, outputTokens: 456 } } });
});

it('saves a paid result to its original profile after the user switches profiles', async () => {
  const id = state.currentProfile, base = structuredClone(state.importedData), score = assessments()[0];
  await data.saveImportedData();
  state.currentProfile = 'different-profile'; state.importedData = { entries: [], contextNotes: 'Do not overwrite' };
  await writeScoreAIAnswer(score, { summary: answer.summary, text: answer.explanation }, id, base);
  const persisted = JSON.parse(await encryptedGetItem(profileStorageKey(id, 'imported')));
  expect(persisted.biologyScoreAI[score.id].text).toBe(answer.explanation);
  expect(state.importedData).toEqual({ entries: [], contextNotes: 'Do not overwrite' });
});

it('retries a failed durable save from memory without purchasing another answer', async () => {
  const score = assessments()[0];
  const save = vi.spyOn(data, 'saveImportedDataForProfile').mockResolvedValueOnce(false);
  await expect(writeScoreAIAnswer(score, { summary: answer.summary, text: answer.explanation })).rejects.toThrow('Retry saving');
  expect(hasUnsavedScoreAIAnswers()).toBe(true); expect(state.importedData.biologyScoreAI).toBeUndefined();
  save.mockRestore();
  expect(await retryUnsavedScoreAIAnswers()).toEqual([score.id]);
  expect(hasUnsavedScoreAIAnswers()).toBe(false);
  expect(JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported'))).biologyScoreAI[score.id].text).toBe(answer.explanation);
});

it('deduplicates concurrent context requests and retries failed saves with the same paid response', async () => {
  const call = vi.fn(async () => ({ text: '{"summary":"Reviewed context","suggestions":[]}' })); contextProvider(call);
  const active = data.getActiveData();
  const [first, second] = await Promise.all([generateBiologyScoreContextReview(active), generateBiologyScoreContextReview(active)]);
  expect(first).toBe(second); expect(call).toHaveBeenCalledTimes(1);
  const save = vi.spyOn(data, 'saveImportedDataForProfile').mockResolvedValueOnce(false);
  await expect(saveBiologyScoreContextReview(first)).rejects.toThrow('Retry'); save.mockRestore();
  const retry = await generateBiologyScoreContextReview(active); expect(retry).toBe(first);
  await saveBiologyScoreContextReview(retry); expect(call).toHaveBeenCalledTimes(1);
  expect(state.importedData.biologyScoreContextAI.summary).toBe('Reviewed context');
});

it('keeps answers, provenance and context encrypted through a full backup and restored storage', async () => {
  const profileId = state.currentProfile, key = profileStorageKey(profileId, 'imported');
  await cryptoRuntime.prepareEncryption('biology-test-passphrase-only');
  await encryptedSetItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Encrypted test' }]));
  await data.saveImportedData();
  const score = assessments().find(s => s.id === 'thyroidCoherence');
  await writeScoreAIAnswer(score, { summary: answer.summary, text: answer.explanation, generation: { provider: 'test', modelId: 'test-model', batchId: 'one', scoreCount: 1, usage: { inputTokens: 20, outputTokens: 40 } } });
  await saveBiologyScoreContextReview({ summary: 'Private context review', suggestions: [] });
  const raw = await getBlob(key);
  expect(raw).not.toContain(answer.summary); expect(raw).not.toContain('Private context review');
  const backup = parseBackupSnapshot(serializeBackupSnapshot(await buildFullBackupSnapshot()));
  expect(backup.encrypted).toBe(true);
  const envelope = backup.profiles.find(p => p.profileId === profileId).keys.imported;
  expect(envelope).toBe(raw); expect(serializeBackupSnapshot(backup)).not.toContain(answer.summary);
  await setBlob(key, envelope);
  state.importedData = JSON.parse(await encryptedGetItem(key)); data.invalidateActiveDataCache();
  expect(state.importedData.biologyScoreContextAI.summary).toBe('Private context review');
  expect(state.importedData.biologyScoreAI[score.id].generation.modelId).toBe('test-model');
  const after = assessments().find(s => s.id === score.id);
  expect(JSON.parse(after.aiViews[0].material)).toEqual(JSON.parse(state.importedData.biologyScoreAI[score.id].coveredMaterials[0]));
  expect(hasCurrentScoreAIAssessment(after)).toBe(true);
  const pendingWrite = encryptedSetItem(key, '{"secret":"locked during preparation"}');
  cryptoRuntime.clearEncryptionSession();
  await expect(pendingWrite).rejects.toThrow('locked');
  await expect(encryptedSetItem(key, '{"secret":"must not become plaintext"}')).rejects.toThrow('locked');
  expect(await getBlob(key)).toBe(raw);
});

it('includes complete AI records in Evolu row planning and restores them without inference', async () => {
  const score = assessments()[0];
  const record = { summary: answer.summary, text: answer.explanation, materialFingerprint: getScoreAIMaterialKey(score), coveredMaterials: score.aiViews.map(v => v.material), generation: { modelId: 'test', usage: { inputTokens: 42, outputTokens: 30 } }, updatedAt: 123 };
  expect(DELTA_MAPS).toContain('biologyScoreAI'); expect(DELTA_SCALARS).toContain('biologyScoreContextAI');
  const map = await _planKeyedMapDelta(state.currentProfile, 'biologyScoreAI', { [score.id]: record });
  const review = { summary: 'Synced review', suggestions: [], updatedAt: 123 };
  const scalar = await _planScalarDelta(state.currentProfile, 'biologyScoreContextAI', review);
  const restored = {};
  await mergeMapRowsIntoImported(restored, 'biologyScoreAI', map.ops.map(op => op.args));
  await mergeScalarRowsIntoImported(restored, 'biologyScoreContextAI', scalar.ops.map(op => op.args));
  expect(restored).toEqual({ biologyScoreAI: { [score.id]: record }, biologyScoreContextAI: review });
});

it('preserves the original profile and captured evidence when context review finishes after switching', async () => {
  const profileId = state.currentProfile;
  await data.saveImportedData();
  contextProvider(async () => {
    state.currentProfile = 'next-profile'; state.importedData = { entries: [], contextNotes: 'Next profile' };
    return { text: '{"summary":"Origin-only review","suggestions":[]}' };
  });
  const review = await generateBiologyScoreContextReview(data.getActiveData());
  await saveBiologyScoreContextReview(review);
  expect(JSON.parse(await encryptedGetItem(profileStorageKey(profileId, 'imported'))).biologyScoreContextAI.summary).toBe('Origin-only review');
  expect(state.importedData).toEqual({ entries: [], contextNotes: 'Next profile' });
});
