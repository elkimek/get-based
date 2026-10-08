// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProfileData } from '../types/app-state.js';
import type { AIVerdictAnalysis } from '../js/ai-verdict-engine.js';
const provider = vi.hoisted(() => ({ call: vi.fn(), push: vi.fn() }));
vi.mock('../js/ai-feature-routing.js', () => ({ hasAssistantFeatureProvider: () => true, callAssistantFeatureAI: provider.call }));
vi.mock('../js/ai-verdict-engine-runtime.js', () => ({ dispatchAIVerdictUpdatedRuntime: () => {}, getAIVerdictConcurrencyCapRuntime: () => 1, hasAIVerdictRuntime: () => false, isAIVerdictEngineDisabledRuntime: () => false, refreshSunSurfacesRuntime: () => {} }));
vi.mock('../js/sync.js', async importOriginal => ({ ...await importOriginal<typeof import('../js/sync.js')>(), isSyncEnabled: () => true, pushCurrentProfile: provider.push }));
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { createAIVerdict, getAIVerdictSlotsDebug } from '../js/ai-verdict-engine.js';
const profile = 'verdict-persistence';
const storageKey = profileStorageKey(profile, 'imported');
const singleton = { id: 'default' };
const cached: AIVerdictAnalysis = { status: 'ok', dot: 'yellow', tip: 'Earlier saved result', fingerprint: 'old' };
const read = async () => JSON.parse((await crypto.encryptedGetItem(storageKey))!) as ProfileData;
function engine() {
  return createAIVerdict({ getTarget: (_id, data: ProfileData = state.importedData) => data.sunDefaults ? singleton : null,
    getId: target => target.id,
    getAIAnalysis: (_target, data: ProfileData = state.importedData) => (data.sunDefaults?.aiAnalysis || null) as AIVerdictAnalysis | null,
    setAIAnalysis: (_target, value, data: ProfileData = state.importedData) => { if (!data.sunDefaults) return; if (value) data.sunDefaults.aiAnalysis = value; else delete data.sunDefaults.aiAnalysis; },
    getFingerprint: () => 'new', buildContext: () => 'Captured facts', systemPrompt: 'Return JSON',
    getAllTargets: (data: ProfileData = state.importedData) => data.sunDefaults ? [singleton] : [],
  });
}
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
beforeEach(async () => {
  vi.restoreAllMocks(); provider.call.mockReset().mockResolvedValue('{"dot":"green","tip":"New result","detail":"Saved facts"}'); provider.push.mockReset().mockResolvedValue(undefined);
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.importedData.sunDefaults = { completedAt: 1, aiAnalysis: structuredClone(cached) }; state.importedData.contextNotes = 'Stored unrelated context';
  await crypto.encryptedRemoveItem(storageKey); expect(await saveImportedData()).toBe(true);
});
afterEach(() => { vi.restoreAllMocks(); expect(getAIVerdictSlotsDebug()).toMatchObject({ active: 0, waiting: 0 }); });
it('does not publish or push a successful provider result when the actual storage write fails', async () => {
  const before = structuredClone(state.importedData), stored = await read();
  vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValue(new Error('QuotaExceededError'));
  const result = await engine().analyze(singleton, { force: true });
  expect(result).toBeNull(); expect(state.importedData).toEqual(before); expect(await read()).toEqual(stored); expect(provider.push).not.toHaveBeenCalled();
});
it('does not expose a new result before the storage promise commits', async () => {
  const original = crypto.encryptedSetItem, pendingWrite = gate(), started = gate();
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => { started.release(); await pendingWrite.promise; return original(...args); });
  const before = structuredClone(state.importedData), pending = engine().analyze(singleton, { force: true }); await started.promise;
  const observedDuringWrite = structuredClone(state.importedData); pendingWrite.release(); const result = await pending;
  expect(observedDuringWrite).toEqual(before); expect(result?.tip).toBe('New result'); expect(state.importedData.sunDefaults?.aiAnalysis).toEqual(result); expect((await read()).sunDefaults?.aiAnalysis).toEqual(result);
});
it('preserves a prior valid verdict without an unsaved error sidecar when persisting a provider failure fails', async () => {
  provider.call.mockRejectedValue(new Error('Failed to fetch')); const before = structuredClone(state.importedData), stored = await read();
  vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValue(new Error('QuotaExceededError'));
  expect(await engine().analyze(singleton, { force: true })).toBeNull(); expect(state.importedData).toEqual(before); expect(await read()).toEqual(stored); expect(provider.push).not.toHaveBeenCalled();
});
it('keeps orphaned analyzing metadata intact when its cleanup write fails', async () => {
  state.importedData.sunDefaults!.aiAnalysis = { status: 'analyzing', fingerprint: 'legacy' }; expect(await saveImportedData()).toBe(true);
  const before = structuredClone(state.importedData), stored = await read(); vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValue(new Error('QuotaExceededError'));
  await engine().purgeOrphaned(); expect(state.importedData).toEqual(before); expect(await read()).toEqual(stored);
});
it('persists only its verdict and preserves unrelated unsaved context without committing it', async () => {
  state.importedData.contextNotes = 'Unsaved local draft'; const result = await engine().analyze(singleton, { force: true });
  expect(result?.tip).toBe('New result'); expect(state.importedData.contextNotes).toBe('Unsaved local draft'); expect((await read()).contextNotes).toBe('Stored unrelated context'); expect((await read()).sunDefaults?.aiAnalysis).toEqual(result);
});
it('finishes an accepted write on its captured profile while keeping the replacement profile untouched', async () => {
  const original = crypto.encryptedSetItem, pendingWrite = gate(), started = gate(), source = state.importedData;
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => { started.release(); await pendingWrite.promise; return original(...args); });
  const pending = engine().analyze(singleton, { force: true }); await started.promise;
  state.currentProfile = 'replacement'; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Replacement context'; const replacement = structuredClone(state.importedData);
  pendingWrite.release(); await pending;
  expect(state.importedData).toEqual(replacement); expect((await read()).sunDefaults?.aiAnalysis).toMatchObject({ tip: 'New result' }); expect(source.sunDefaults?.aiAnalysis).toMatchObject({ tip: 'New result' }); expect(provider.push).not.toHaveBeenCalled();
});
