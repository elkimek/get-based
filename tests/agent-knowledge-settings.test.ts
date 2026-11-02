// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import * as lens from '../js/lens.js';
import { commitReviewedKnowledgeSettings } from '../js/knowledge-settings.js';
import { projectKnowledgeSettings, displayKnowledgeSettings } from '../js/knowledge-settings-proposals.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { renderAgentDraftCards } from '../js/agent-draft-component.js';
import { readKnowledgeSettings } from '../js/knowledge-settings.js';
const origin = { profile: state.currentProfile, data: state.importedData };
const key = 'labcharts-lens-config', evidence = 'Use only three Knowledge Base excerpts and stop rewriting my search.';
const raw = () => localStorage.getItem(key);
// Exercise native settings ownership directly; chat no longer advertises settings administration.
async function proposal(patch: object = { topK: 3, multiQuery: false }) {
  const snapshot = await readKnowledgeSettings(), payload: AgentDataProposal = { resource: 'knowledgeSettings', operation: 'update', recordId: '', baseline: JSON.stringify(snapshot), patch: JSON.stringify(patch), evidence, reason: 'Native settings review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  projectKnowledgeSettings(payload);
  return { read: { current: displayKnowledgeSettings(snapshot), scope: snapshot.scope }, draft: { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), payload, profileId: state.currentProfile } };
}
async function applyNativeSettings(draft: { payload: AgentDataProposal; profileId: string }) { return commitReviewedKnowledgeSettings(draft.payload, () => state.currentProfile === draft.profileId); }
beforeEach(() => {
  state.currentProfile = `knowledge-${crypto.randomUUID()}`; localStorage.setItem('labcharts-active-profile', state.currentProfile); state.importedData = createDefaultProfileData();
  lens.saveLensConfig({ enabled: true, backend: 'external-server', name: 'Private corpus title', url: 'https://private.invalid/query?token=private-url-sentinel', topK: 5, multiQuery: true });
  localStorage.setItem(key, JSON.stringify({ ...JSON.parse(raw()!), opaqueExtension: { keep: 'private-config-sentinel' } }));
});
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(key); document.body.innerHTML = ''; state.currentProfile = origin.profile; state.importedData = origin.data; });
it('reads only nonsecret browser-wide preferences without disclosing connection details or changing storage', async () => {
  const before = raw(), { read } = await proposal(); expect(read.current).toEqual({ enabled: true, backend: 'external-server', topK: 5, multiQuery: true }); expect(read.scope).toBe('browser'); expect(JSON.stringify(read)).not.toMatch(/private-|Private corpus|token=/); expect(raw()).toBe(before);
});
it('requires approval, reviews shared scope and preserves all profile and connection data', async () => {
  const before = raw(), profile = structuredClone(state.importedData), { draft } = await proposal(); expect(raw()).toBe(before);
  const html = renderAgentDraftCards({ agentDrafts: [draft!] }, 0); expect(html).toContain('Managed in native UI'); expect(html).not.toContain('data-chat-message-action'); expect(html).not.toMatch(/private-|Private corpus|token=/);
  await applyNativeSettings(draft); expect(JSON.parse(raw()!)).toEqual({ ...JSON.parse(before!), topK: 3, multiQuery: false }); expect(state.importedData).toEqual(profile);
});
it.each([{ url: 'https://other.invalid' }, { key: 'secret' }, { backend: 'in-browser' }, { topK: 0 }, { topK: 11 }, { topK: 1.5 }, { enabled: 'true' }, { multiQuery: 1 }, { name: 'New title' }])('rejects unsupported connection or preference changes: %j', async patch => {
  const before = raw(); await expect(proposal(patch)).rejects.toThrow(); expect(raw()).toBe(before);
});
it('rejects stale private configuration even when visible retrieval preferences stayed the same', async () => {
  const { draft } = await proposal(); const peer = { ...JSON.parse(raw()!), name: 'A different private title' }; localStorage.setItem(key, JSON.stringify(peer)); await expect(applyNativeSettings(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(JSON.parse(raw()!)).toEqual(peer);
});
it('keeps configuration unchanged after failed storage and permits the same approval to retry', async () => {
  const { draft } = await proposal(), before = raw(), write = Storage.prototype.setItem;
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, keyName, value) { if (keyName === key) throw new Error('Synthetic storage failure'); return write.call(this, keyName, value); });
  await expect(applyNativeSettings(draft)).rejects.toThrow(/save/i); expect(raw()).toBe(before); failure.mockRestore(); await applyNativeSettings(draft); expect(JSON.parse(raw()!).topK).toBe(3);
});
it('refuses malformed saved settings without normalizing them during a read', async () => {
  localStorage.setItem(key, '{private-config-sentinel:broken');
  const error = await readKnowledgeSettings().catch(error => error); expect(error).toBeInstanceOf(Error); expect(String(error)).not.toContain('private-config-sentinel'); expect(raw()).toBe('{private-config-sentinel:broken');
});
it('refuses oversized private configuration without disclosing or rewriting it', async () => {
  const oversized = JSON.stringify({ ...JSON.parse(raw()!), opaqueExtension: 'private-config-sentinel'.repeat(7000) }); localStorage.setItem(key, oversized);
  const error = await readKnowledgeSettings().catch(error => error); expect(error).toBeInstanceOf(Error); expect(String(error)).not.toContain('private-config-sentinel'); expect(raw()).toBe(oversized);
});
it('refuses a snapshot that mixed settings from concurrent source revisions', async () => {
  const before = raw(), after = JSON.stringify({ ...JSON.parse(before!), topK: 8 }), read = Storage.prototype.getItem; let calls = 0;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, name) { return name === key ? (++calls <= 2 ? before : after) : read.call(this, name); });
  await expect(readKnowledgeSettings()).rejects.toMatchObject({ noChangeApplied: true });
});
it('blocks an open native settings draft and keeps it intact', async () => {
  const { draft } = await proposal(), before = raw(); document.body.innerHTML = '<div id="kb-modal"><input id="lens-topk-input" value="5"></div>'; document.querySelector<HTMLInputElement>('#lens-topk-input')!.value = '8';
  await expect(applyNativeSettings(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(raw()).toBe(before); expect(document.querySelector<HTMLInputElement>('#lens-topk-input')!.value).toBe('8');
});
it('lists preferences even when corpus disclosure is off, without opening its storage or worker', async () => {
  lens.saveLensConfig({ enabled: false }); const before = raw(), { read } = await proposal({ enabled: true }); expect(read.current.enabled).toBe(false); expect(raw()).toBe(before);
});

it.each(['source', 'profile', 'root'])('rechecks queued %s ownership immediately before preferences are written', async retirement => {
  const { draft } = await proposal(), before = raw(), { queueLensConfigWrite } = await import('../js/lens-config-store.js'); let release!: () => void;
  const held = queueLensConfigWrite(() => new Promise<void>(resolve => { release = resolve; })); await Promise.resolve(); const applying = applyNativeSettings(draft);
  if (retirement === 'source') lens.saveLensConfig({ topK: 8 }); else if (retirement === 'profile') state.currentProfile = 'replacement'; else state.importedData = createDefaultProfileData(); const expected = raw();
  release(); await held; await expect(applying).rejects.toMatchObject({ noChangeApplied: true }); expect(raw()).toBe(retirement === 'source' ? expected : before);
});
it('retains an accepted shared preference write after its origin profile retires at storage acknowledgement', async () => {
  const { draft } = await proposal(), write = Storage.prototype.setItem, replacement = createDefaultProfileData();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, keyName, value) { const result = write.call(this, keyName, value); if (keyName === key) { state.currentProfile = 'replacement'; state.importedData = replacement; throw new Error('Synthetic post-write listener failure'); } return result; });
  await expect(applyNativeSettings(draft)).resolves.toContain('all profiles'); expect(JSON.parse(raw()!).topK).toBe(3); expect(state.importedData).toBe(replacement);
});

it('does not let an explicitly closed native modal block a reviewed preference', async () => {
  const { draft } = await proposal(); document.body.innerHTML = '<div id="kb-modal-overlay"><input id="lens-topk-input" value="5"></div>'; document.querySelector<HTMLInputElement>('#lens-topk-input')!.value = '8';
  await expect(applyNativeSettings(draft)).resolves.toContain('all profiles'); expect(JSON.parse(raw()!).topK).toBe(3);
});
