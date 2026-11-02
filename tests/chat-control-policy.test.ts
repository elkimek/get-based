// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { executeAppControl } from '../js/app-control-commands.js';
import { openAppDestination } from '../js/app-native-navigation.js';
import { APP_CONTROL_ACTIONS, normalizeAppControls, type AppControlRecord } from '../shared/agent-control-contract.js';
import { getAgentToolCatalog, getCodexDynamicTools } from '../shared/agent-tool-contract.js';
import { CHAT_TOOL_INSTRUCTIONS } from '../shared/chat-tool-instructions.js';
import { CHAT_APP_READ_ACTIONS, CHAT_APP_REVIEW_ACTIONS } from '../shared/chat-control-policy.js';
const original = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory };
const retired = ['labs.ordering', 'context.preferences', 'assistant.preferences', 'dashboard.presentation', 'nutrition.route'];
const footprint = () => Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]);
beforeEach(() => { localStorage.clear(); state.currentProfile = 'curated-policy'; state.currentThreadId = 'origin'; state.importedData = structuredClone(original.root); state.importedData.contextNotes = 'PRIVATE_HEALTH'; state.chatHistory = []; });
afterEach(() => { Object.assign(state, { currentProfile: original.profile, currentThreadId: original.thread, importedData: original.root, chatHistory: original.history }); localStorage.clear(); vi.restoreAllMocks(); });
it('advertises the same health-only scope through API and CLI schemas', () => {
  expect(APP_CONTROL_ACTIONS).toEqual([]); expect(CHAT_APP_READ_ACTIONS).toEqual([]); expect(CHAT_APP_REVIEW_ACTIONS).toEqual([]);
  const current = getAgentToolCatalog(undefined, 'current');
  for (const tools of [current, getCodexDynamicTools(current)]) {
    for (const name of ['getbased_app_actions','getbased_read_app','getbased_request_app','getbased_draft_note']) expect(tools.some(tool => tool.name === name)).toBe(false);
    expect(tools.find(tool => tool.name === 'getbased_navigate')!.inputSchema.properties).not.toHaveProperty('layout');
    expect(JSON.stringify(tools)).not.toMatch(/labs\.ordering|context\.preferences|assistant\.preferences|dashboard\.presentation|nutrition\.route/);
  }
  expect(CHAT_TOOL_INSTRUCTIONS).not.toMatch(/labs\.ordering|context\.preferences|assistant\.preferences|dashboard\.presentation|nutrition\.route/);
});
it.each(retired)('rejects retired %s reads and reviews before any native dependency or state change', async action => {
  const readAppState = vi.fn(), prepareAppControl = vi.fn(), before = footprint(), health = JSON.stringify(state.importedData);
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: 'Change this.', readAppState, prepareAppControl });
  expect((await runtime.execute({ tool: 'getbased_read_app', arguments: { action } })).success).toBe(false);
  expect((await runtime.execute({ tool: 'getbased_request_app', arguments: { action, snapshotId: 'old', parameters: '{}', evidence: 'Change this.', reason: 'Requested' } })).success).toBe(false);
  expect(readAppState).not.toHaveBeenCalled(); expect(prepareAppControl).not.toHaveBeenCalled(); expect(footprint()).toEqual(before); expect(JSON.stringify(state.importedData)).toBe(health);
  const session = createAppControlSession('Change this.', () => true, new AbortController().signal);
  expect(() => session.tools.readAppState({ action })).toThrow('native settings');
  expect(() => session.tools.prepareAppControl({ action, snapshotId: 'old', parameters: '{}', evidence: 'Change this.', reason: 'Requested' })).toThrow('native settings'); expect(session.finish()).toEqual([]);
});
it.each([
  { view: 'dashboard', snapshotId: 'old', dashboard: '{"hide":["wearables"]}' },
  { view: 'aiSettings', snapshotId: 'old', mealRoute: 'old-choice' },
  { view: 'category', category: 'biochemistry', layout: 'table' },
])('rejects retired navigation %j without opening or saving', async args => {
  const navigate = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', navigate }), before = footprint();
  expect((await runtime.execute({ tool: 'getbased_navigate', arguments: args })).success).toBe(false); expect(navigate).not.toHaveBeenCalled();
  expect(await openAppDestination({ marker: '', ...args }, () => true)).toMatchObject({ changed: false, dataSaved: false }); expect(footprint()).toEqual(before);
});
it('keeps saved units and clock changes in native UI and rejects historical replay', async () => {
  const session = createAppControlSession('Use US units.', () => true, new AbortController().signal), read = { snapshotId: 'historical' };
  expect(() => session.tools.readAppState({ action: 'display.preferences' })).toThrow('native settings');
  expect(() => session.tools.prepareAppControl({ action: 'display.preferences', snapshotId: read.snapshotId, parameters: '{"timeFormat":"12h","unitSystem":"US"}', reason: 'Requested clock', evidence: 'Use US units.' })).toThrow('native settings');
  expect(session.finish()).toEqual([]);
  const prepareAppControl = vi.fn(), runtime = createAgentToolRuntime({ userMessage: 'Use US units.', readContext: () => '', prepareAppControl });
  expect((await runtime.execute({ tool: 'getbased_request_app', arguments: { action: 'display.preferences', snapshotId: read.snapshotId, parameters: '{"timeFormat":"12h","unitSystem":"US"}', reason: 'Requested clock', evidence: 'Use US units.' } })).success).toBe(false);
  expect(prepareAppControl).not.toHaveBeenCalled();

  const common = { version: 1 as const, id: 'historical', profileId: state.currentProfile, threadId: state.currentThreadId!, action: 'display.preferences' as const, reason: 'Requested clock', evidence: 'Use twelve hour time.' };
  for (const status of ['pending', 'changed'] as const) {
    const record: AppControlRecord = { ...common, status, parameters: { timeFormat: '12h', unitSystem: 'US' }, baseline: { timeFormat: '24h', unitSystem: 'EU' }, undoAvailable: true };
    expect(normalizeAppControls([record], true)[0]).toMatchObject({ status: status === 'pending' ? 'expired' : 'changed', undoAvailable: false });
    const before = footprint(); await expect(executeAppControl(record, status === 'changed', () => true)).rejects.toThrow('native settings'); expect(footprint()).toEqual(before);
  }
});
