// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';
const previous = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'I now use warm LED light at home. My skin type is IV. I use sunglasses outdoors. My daytime workspace is dim.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
async function propose(patch = '{"homeLight":"led-warm"}') {
  const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'sunSetup' } });
  expect(read.success, read.contentItems[0].text).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'sunSetup', operation: 'update', snapshotId: current.snapshotId, patch, evidence, reason: 'The user reported changed Light setup facts.' } });
  return { runtime, current, result, draft: runtime.getDrafts()[0] ? { ...runtime.getDrafts()[0]!, profileId: profile } : null };
}
beforeEach(async () => {
  profile = `sun-setup-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  state.importedData.contextNotes = 'Keep unrelated context';
  state.importedData.sunDefaults = { fitzpatrick: 'II', homeLight: 'incandescent', eyewear: 'none', coords: { lat: 12.345678, lon: 45.123456, secret: '/private/location' }, aiAnalysis: { text: '/private/analysis' } };
  state.importedData.lightCircadian = { skinType: 'II — fair', note: '/private/insight-note' };
  state.importedData.sunSessions = [{ id: 'old-session', startedAt: 100, endedAt: 200, doses: { original: true } }];
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  state.currentProfile = previous.profile; state.importedData = previous.data;
});
it('reviews a partial setup change and saves only after Apply, retaining private prior evidence', async () => {
  const before = await stored(), { current, result, draft } = await propose();
  expect(result.success, result.contentItems[0].text).toBe(true); expect(draft).not.toBeNull();
  expect(JSON.stringify({ current, result })).not.toMatch(/private|12\.345678|45\.123456/); expect(await stored()).toEqual(before);
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.sunDefaults?.homeLight).toBe('led-warm'); expect(saved.sunDefaults?.completedAt).toBeUndefined();
  expect(saved.sunDefaults?.fitzpatrick).toBe('II'); expect(saved.sunDefaults?.coords).toEqual(before.sunDefaults?.coords);
  expect(saved.sunDefaults?.aiAnalysis).toBeUndefined(); expect(saved.sunDefaults?.setupHistory[0].defaults.aiAnalysis).toEqual(before.sunDefaults?.aiAnalysis);
  expect(saved.lightCircadian).toEqual(before.lightCircadian); expect(saved.sunSessions).toEqual(before.sunSessions); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('reviews and atomically mirrors an explicitly reported skin type', async () => {
  const before = await stored(), { result, draft } = await propose('{"fitzpatrick":"IV"}');
  expect(result.success).toBe(true); expect(JSON.parse(result.contentItems[0].text).review.effects.mirroredSkinType).toBe('IV — olive');
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.sunDefaults?.fitzpatrick).toBe('IV'); expect(saved.lightCircadian?.skinType).toBe('IV — olive');
  expect(saved.lightCircadian?.note).toBe(before.lightCircadian?.note); expect(saved.sunSessions).toEqual(before.sunSessions);
});
it('keeps unreported survey answers unknown and does not invent a complete score', async () => {
  const { result, draft } = await propose('{"habits":{"dimWorkspace":true}}'); expect(result.success).toBe(true);
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.sunDefaults?.ott).toEqual({ 'dim-workspace': true }); expect(saved.sunDefaults?.ottScore).toBeNull(); expect(saved.sunDefaults?.completedAt).toBeUndefined();
});
it.each([{ completedAt: 123 }, { coords: { lat: 1, lon: 2 } }, { aiAnalysis: {} }, { ottScore: 10 }, { fitzpatrick: 'VII' }, { photosensitiveMeds: true }, { homeLight: 'invented' }, { habits: { unknownQuestion: true } }, { habits: { dimWorkspace: 'yes' } }])('rejects unreported/derived/unsupported fields %j', async patch => {
  const before = await stored(), { result } = await propose(JSON.stringify(patch)); expect(result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('keeps setup available under its own source without disclosing disabled Insight context', async () => {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false);
  const { current, result, draft } = await propose(); expect(result.success).toBe(true); expect(JSON.stringify(current)).not.toContain('II — fair');
  await applyAgentDraft(draft); expect((await stored()).sunDefaults?.homeLight).toBe('led-warm');
  const skin = await propose('{"fitzpatrick":"IV"}'); expect(skin.result.success).toBe(false);
});
it('rejects a revoked source and preserves storage', async () => {
  const before = await stored(), { draft, result } = await propose(); expect(result.success).toBe(true);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(before);
});
it('rejects changed private source evidence instead of silently overwriting it', async () => {
  const { draft, result } = await propose(); expect(result.success).toBe(true);
  const peer = await stored(); peer.sunDefaults!.coords.lat = 11; await storage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(draft)).rejects.toThrow(/changed|review/i); expect(await stored()).toEqual(peer);
});
it('leaves failed Apply retryable with no live publication', async () => {
  const before = await stored(), { draft, result } = await propose(); expect(result.success).toBe(true);
  const original = storage.encryptedSetItem, spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return original(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  spy.mockRestore(); await applyAgentDraft(draft); expect((await stored()).sunDefaults?.homeLight).toBe('led-warm');
});
it('requires stopping an active Sun session before changing its safety defaults', async () => {
  state.importedData.sunSessions!.push({ id: 'active-sun', startedAt: Date.now(), endedAt: null }); expect(await saveImportedData()).toBe(true);
  const before = await stored(), { result } = await propose('{"fitzpatrick":"IV"}'); expect(result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('clears only a reported answer while preserving other recorded answers', async () => {
  state.importedData.sunDefaults!.ott = { 'dim-workspace': true, 'low-outdoor-time': false }; expect(await saveImportedData()).toBe(true);
  const { result, draft } = await propose('{"habits":{"dimWorkspace":null}}'); expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).sunDefaults?.ott).toEqual({ 'low-outdoor-time': false });
});
it('clears the mirrored skin type together without inventing a fallback', async () => {
  const { result, draft } = await propose('{"fitzpatrick":null}'); expect(result.success).toBe(true); await applyAgentDraft(draft);
  expect((await stored()).sunDefaults?.fitzpatrick).toBeNull(); expect((await stored()).lightCircadian?.skinType).toBeNull();
});
it('preserves unrelated unsaved editor values without writing them through chat', async () => {
  const before = await stored(), { result, draft } = await propose(); expect(result.success).toBe(true);
  state.importedData.contextNotes = 'Unfinished editor draft'; await applyAgentDraft(draft);
  expect((await stored()).contextNotes).toBe(before.contextNotes); expect(state.importedData.contextNotes).toBe('Unfinished editor draft'); expect(state.importedData.sunDefaults?.homeLight).toBe('led-warm');
});
it('rejects an unsaved conflicting setup edit instead of flushing it', async () => {
  const before = await stored(), { result, draft } = await propose(); expect(result.success).toBe(true);
  state.importedData.sunDefaults!.eyewear = 'sunglasses'; await expect(applyAgentDraft(draft)).rejects.toThrow(/changed/i); expect(await stored()).toEqual(before);
});
it('checks disclosure again after the locked canonical read', async () => {
  const before = await stored(), { result, draft } = await propose(); expect(result.success).toBe(true);
  const original = storage.encryptedGetItem; let reads = 0, entered!: () => void, release!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const value = await original(...args); if (args[0] === key && ++reads === 2) { entered(); await gate; } return value; });
  const saving = expect(applyAgentDraft(draft)).rejects.toThrow(); await reading; setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); release(); await saving;
  expect(JSON.parse((await original(key))!)).toEqual(before);
  expect(state.importedData).toEqual({ ...before, contextSourceSettings: { ...before.contextSourceSettings, [CONTEXT_SOURCE_IDS.LIGHT_SUN]: false } });
});
it('rejects no-op setup proposals', async () => {
  const { result } = await propose('{"homeLight":"incandescent"}'); expect(result.success).toBe(false);
});
it('renders readable setup labels and summarizes unknown habits in the actual review', async () => {
  const { draft, result, current } = await propose('{"habits":{"dimWorkspace":true}}'); expect(result.success).toBe(true);
  expect(current.choices.photosensitiveMeds).toContainEqual({ key: 'moderate', label: 'Known warning' });
  const rows = projectAgentDraftCards({ agentDrafts: [draft] })[0]!.rows, text = rows.map(row => row.value).join('\n');
  expect(text).toContain('Dim daytime workspace: Yes'); expect(text).toContain('Unanswered habit questions: 9'); expect(text).not.toContain('"dimWorkspace"');
});
