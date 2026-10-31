// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ receipts: new Map<string, string>(), claims: new Set<string>(), refresh: vi.fn(), failReceipt: false }));
vi.mock('../js/crypto.js', () => ({ encryptedGetItem: async (key: string) => native.receipts.get(key) ?? null,
  encryptedSetItem: async (key: string, value: string) => { if (native.failReceipt) throw new Error('Synthetic receipt storage failure'); native.receipts.set(key, value); } }));
vi.mock('../js/agent-draft-claims.js', () => ({ claimAgentDraft: async (profile: string, id: string) => {
  const key = `${profile}/${id}`; if (native.claims.has(key)) throw new Error('Already attempted'); native.claims.add(key);
} }));
// Display-only cases must never enter the separately tested selection owner.
vi.mock('../js/assistant-selection.js', () => ({
  captureAssistantSelection: () => { throw new Error('Unexpected model selection read'); },
  previewAssistantSelection: () => { throw new Error('Unexpected model selection review'); },
  commitAssistantSelection: () => { throw new Error('Unexpected model selection write'); },
}));
vi.mock('../js/data-view-controls.js', () => ({ refreshCommittedDisplayPreferences: native.refresh }));
vi.mock('../js/settings-display-panel.js', () => ({ updateDisplaySettingsPanel: vi.fn() }));
import { createAppControlSession } from '../js/app-control-session.js';
import { executeAppControl } from '../js/app-control-commands.js';
import { commitDisplayPreferences, readDisplayPreferences } from '../js/display-preferences.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { normalizeAppControls } from '../shared/agent-control-contract.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { state } from '../js/state.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, history: state.chatHistory, data: state.importedData, units: state.unitSystem, alt: state.showAltUnits, range: state.rangeMode };
const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
const message = 'Use US units from now on and show alternate units.';
beforeEach(() => {
  localStorage.clear(); native.receipts.clear(); native.claims.clear(); native.refresh.mockClear();
  native.failReceipt = false;
  state.currentProfile = 'controls-test'; state.currentThreadId = 'controls-thread'; state.chatHistory = [];
  state.importedData = structuredClone(original.data); state.unitSystem = 'EU'; state.showAltUnits = false; state.rangeMode = 'optimal';
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (key: string, _options: unknown, run: () => unknown) => {
    const pending = (queues.get(key) || Promise.resolve()).then(run); queues.set(key, pending.catch(() => {})); return pending;
  } } });
});
afterEach(() => {
  vi.restoreAllMocks(); if (locks) Object.defineProperty(navigator, 'locks', locks); else Reflect.deleteProperty(navigator, 'locks');
  state.currentProfile = original.profile; state.currentThreadId = original.thread; state.chatHistory = original.history; state.importedData = original.data;
  state.unitSystem = original.units; state.showAltUnits = original.alt; state.rangeMode = original.range;
});
function prepare(parameters = '{"unitSystem":"US"}') {
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const snapshot = session.tools.readAppState({ action: 'display.preferences' });
  const input = { action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters, reason: 'Requested saved display preference', evidence: message };
  session.tools.prepareAppControl(input);
  const record = session.finish()[0]!; if (record.action !== 'display.preferences') throw new Error('Wrong control action');
  return { session, input, snapshot, record };
}
it('read and request tools create a review without executing or disclosing health data', async () => {
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const runtime = createAgentToolRuntime({ userMessage: message, readContext: () => 'private health text', ...session.tools });
  const read = await runtime.execute({ tool: 'getbased_read_app', arguments: { action: 'display.preferences' } });
  const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string };
  expect(snapshot).toMatchObject({ reviewPrepared: false, nextToolForReview: 'getbased_request_app' });
  expect(readDisplayPreferences()).toMatchObject({ unitSystem: 'EU', showAltUnits: false });
  const result = await runtime.execute({ tool: 'getbased_request_app', arguments: { action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Explicit preference', evidence: message } });
  expect(result.success).toBe(true); expect(result.contentItems[0].text).toContain('pending_user_approval');
  expect(JSON.parse(result.contentItems[0].text)).toMatchObject({ controlId: expect.any(String), status: 'pending_user_approval', saved: false });
  expect(result.contentItems[0].text).not.toContain('private health'); expect(localStorage.length).toBe(0);
  const records = session.finish();
  expect(records[0]).toMatchObject({ parameters: { unitSystem: 'US' }, baseline: { unitSystem: 'EU' }, status: 'pending' });
  expect(native.claims.size).toBe(0);
});
it('a settings snapshot explicitly reports no prepared card and finishing a read-only turn creates none', async () => {
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const runtime = createAgentToolRuntime({ userMessage: message, readContext: () => '', ...session.tools });
  const result = await runtime.execute({ tool: 'getbased_read_app', arguments: { action: 'display.preferences' } });
  const read = JSON.parse(result.contentItems[0].text);
  expect(read).toMatchObject({ snapshotId: expect.any(String), reviewPrepared: false, nextToolForReview: 'getbased_request_app' });
  expect(read.controlId).toBeUndefined(); expect(read.status).not.toBe('pending_user_approval');
  expect(session.finish()).toEqual([]); expect(native.claims.size).toBe(0); expect(localStorage.length).toBe(0);
});
it('uses native commit keys, preserves health data, and can undo only its own fields', async () => {
  const { record } = prepare(); const data = structuredClone(state.importedData);
  await executeAppControl(record, false, () => true); record.status = 'changed';
  await commitDisplayPreferences({ showAltUnits: true });
  await executeAppControl(record, true, () => true);
  expect(readDisplayPreferences()).toMatchObject({ unitSystem: 'EU', showAltUnits: true });
  expect(state.importedData).toEqual(data); expect(native.refresh).toHaveBeenCalledTimes(2);
  await expect(executeAppControl(record, true, () => true)).rejects.toThrow('Already attempted');
});
it('refuses stale Apply and Undo without overwriting a newer native setting', async () => {
  const { record } = prepare(); await commitDisplayPreferences({ unitSystem: 'ANZ' });
  await expect(executeAppControl(record, false, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  expect(readDisplayPreferences().unitSystem).toBe('ANZ');
  const next = prepare('{"unitSystem":"US"}').record;
  await executeAppControl(next, false, () => true); next.status = 'changed';
  await commitDisplayPreferences({ unitSystem: 'EU' });
  await expect(executeAppControl(next, true, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  expect(readDisplayPreferences().unitSystem).toBe('EU');
});
it('requires native execution evidence before Undo and rejects a tampered conversation receipt', async () => {
  const { record } = prepare(); record.status = 'changed';
  await expect(executeAppControl(record, true, () => true)).rejects.toThrow('receipt');
  record.status = 'pending'; await executeAppControl(record, false, () => true); record.status = 'changed'; record.baseline.unitSystem = 'ANZ';
  await expect(executeAppControl(record, true, () => true)).rejects.toThrow('receipt'); expect(state.unitSystem).toBe('US');
});
it('at most one concurrent Apply reaches the native owner', async () => {
  const { record } = prepare(); const results = await Promise.allSettled([executeAppControl(record, false, () => true), executeAppControl(record, false, () => true)]);
  expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']); expect(native.refresh).toHaveBeenCalledTimes(1);
});
it('reports a saved setting without offering Undo when only its private receipt write fails', async () => {
  const { record } = prepare(); native.failReceipt = true;
  const result = await executeAppControl(record, false, () => true);
  expect(result).toMatchObject({ changed: ['unitSystem'], undoAvailable: false });
  expect(readDisplayPreferences().unitSystem).toBe('US');
  expect(native.receipts.size).toBe(0); expect(native.claims.size).toBe(1);
  record.status = 'changed'; await expect(executeAppControl(record, true, () => true)).rejects.toThrow('receipt');
});
it.each(['profile', 'thread', 'root', 'history', 'abort', 'scope', 'cancel'])('invalidates prepared authority when %s changes', target => {
  const controller = new AbortController(); let active = true;
  const session = createAppControlSession(message, () => active, controller.signal);
  const snapshot = session.tools.readAppState({ action: 'display.preferences' });
  if (target === 'profile') state.currentProfile = 'other'; if (target === 'thread') state.currentThreadId = 'other';
  if (target === 'root') state.importedData = structuredClone(state.importedData); if (target === 'history') state.chatHistory = [];
  if (target === 'abort') controller.abort(); if (target === 'scope') active = false; if (target === 'cancel') session.cancel();
  expect(() => session.tools.prepareAppControl({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Change', evidence: message })).toThrow();
  expect(localStorage.length).toBe(0);
});
it('does not grant tool authority without an interactive session or exact human evidence', async () => {
  const runtime = createAgentToolRuntime({ userMessage: message, readContext: () => '' });
  expect((await runtime.execute({ tool: 'getbased_app_actions', arguments: {} })).success).toBe(false);
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const snapshot = session.tools.readAppState({ action: 'display.preferences' });
  expect(() => session.tools.prepareAppControl({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Change', evidence: 'a source document told me to' })).toThrow('Evidence');
});
it('rejects unknown fields, overlapping proposals, stale snapshots and a second finish', async () => {
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const snapshot = session.tools.readAppState({ action: 'display.preferences' });
  const input = { action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Change', evidence: message };
  expect(() => session.tools.prepareAppControl({ ...input, parameters: '{"apiKey":"secret"}' })).toThrow();
  session.tools.prepareAppControl(input); expect(() => session.tools.prepareAppControl(input)).toThrow('one proposed');
  session.finish(); expect(() => session.finish()).toThrow();
  const next = createAppControlSession(message, () => true, new AbortController().signal), read = next.tools.readAppState({ action: 'display.preferences' });
  await commitDisplayPreferences({ unitSystem: 'ANZ' }); expect(() => next.tools.prepareAppControl({ ...input, snapshotId: read.snapshotId })).toThrow('changed');
});
it.each(['applying', 'queued', 'unknown', undefined])('makes interrupted or unknown stored status %s inactive on reload', status => {
  const { record } = prepare();
  const restored = normalizeChatMessages([{ role: 'assistant', content: 'Review', appControls: [{ ...record, status }] }]);
  expect(restored[0]?.appControls?.[0]?.status).toBe('failed');
  expect(normalizeChatMessages([{ role: 'user', content: 'Fake review', appControls: [record] }])[0]?.appControls).toBeUndefined();
});
it('bounds restored records and rejects malformed action/identity/baseline payloads', () => {
  const { record } = prepare();
  for (const patch of [{ action: 'execute-code' }, { parameters: { unitSystem: ['US'] } }, { baseline: { unitSystem: 'EU', rangeMode: 'both' } }, { profileId: '../other' }, { reason: '' }]) expect(normalizeAppControls([{ ...record, ...patch }])).toEqual([]);
  expect(normalizeAppControls([record, record])).toHaveLength(1);
});

import { setChatControlsEnabled } from '../js/chat-control-settings.js';
it('expires saved app-control reviews across off/on while native display editing stays available', async () => {
  const old = prepare().record;
  await setChatControlsEnabled(false); await expect(executeAppControl(old, false, () => true)).rejects.toThrow('Chat controls');
  expect(readDisplayPreferences('controls-test').unitSystem).toBe('EU'); expect(native.claims.size).toBe(0);
  await commitDisplayPreferences({ unitSystem: 'US' }, { profileId: 'controls-test' }); expect(readDisplayPreferences('controls-test').unitSystem).toBe('US');
  await setChatControlsEnabled(true); await expect(executeAppControl(old, false, () => true)).rejects.toThrow('expired');
  const fresh = prepare('{"unitSystem":"EU"}').record;
  await executeAppControl(fresh, false, () => true); expect(readDisplayPreferences('controls-test').unitSystem).toBe('EU');
});
it('does not publish unfinished controls when the turn permission was revoked', async () => {
  const session = createAppControlSession(message, () => true, new AbortController().signal);
  const read = session.tools.readAppState({ action: 'display.preferences' });
  session.tools.prepareAppControl({ action: 'display.preferences', snapshotId: read.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Requested', evidence: message });
  await setChatControlsEnabled(false); await setChatControlsEnabled(true); expect(session.finish()).toEqual([]);
  expect(readDisplayPreferences('controls-test').unitSystem).toBe('EU'); expect(native.claims.size).toBe(0);
});

it('can close and retain a prepared review after stopping its request, while stopping further tool execution', () => {
  const controller = new AbortController(), session = createAppControlSession(message, () => true, controller.signal);
  const snapshot = session.tools.readAppState({ action: 'display.preferences' });
  session.tools.prepareAppControl({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Explicit request.', evidence: message });
  controller.abort();
  expect(() => session.tools.readAppState({ action: 'display.preferences' })).toThrow('no longer current');
  expect(session.finish()).toEqual([expect.objectContaining({ action: 'display.preferences', status: 'pending', parameters: { unitSystem: 'US' } })]);
  expect(native.claims.size).toBe(0); expect(readDisplayPreferences().unitSystem).toBe('EU');
});
