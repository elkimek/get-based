// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { APP_CONTROL_ACTIONS, normalizeAppControls, type AppControlRecord } from '../shared/agent-control-contract.js';
import { APP_NAVIGATION_VIEWS, validateAppNavigation } from '../shared/app-navigation-contract.js';
import { getAgentToolCatalog, getCodexDynamicTools, AGENT_TOOL_CONTRACT_VERSION } from '../shared/agent-tool-contract.js';
import { CHAT_TOOL_INSTRUCTIONS } from '../shared/chat-tool-instructions.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { executeAppControl } from '../js/app-control-commands.js';
import { openAppDestination } from '../js/app-native-navigation.js';
import * as retired from '../js/persona-app-controls.js';

const original = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory, persona: state.currentChatPersonality };
const footprint = () => [...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).sort().map(key => [key, localStorage.getItem(key)]);
beforeEach(() => {
  localStorage.clear(); document.body.replaceChildren(); state.currentProfile = 'manual-persona'; state.currentThreadId = 'retired-origin'; state.chatHistory = [];
  state.importedData = structuredClone(original.root); state.currentChatPersonality = 'custom_private';
  localStorage.setItem('labcharts-manual-persona-chatPersonalityCustom', JSON.stringify([{ id: 'custom_private', name: 'PRIVATE_PERSONA_NAME', promptText: 'PRIVATE_PERSONA_INSTRUCTIONS' }]));
  localStorage.setItem('labcharts-manual-persona-chatPersonality', 'custom_private');
});
afterEach(() => { Object.assign(state, { currentProfile: original.profile, currentThreadId: original.thread, importedData: original.root, chatHistory: original.history, currentChatPersonality: original.persona }); localStorage.clear(); vi.restoreAllMocks(); });

it('omits persona controls from shared API and CLI tool discovery and explains the manual workflow', () => {
  expect(AGENT_TOOL_CONTRACT_VERSION).toBe(60);
  const advertised = JSON.stringify({ actions: APP_CONTROL_ACTIONS, views: APP_NAVIGATION_VIEWS, tools: getAgentToolCatalog(), codex: getCodexDynamicTools() });
  expect(advertised).not.toMatch(/assistant\.personas|personaEditor|personaDelete|chatPersona|personaDraft/);
  expect(CHAT_TOOL_INSTRUCTIONS).toContain('Persona management is manual-only');
  expect(CHAT_TOOL_INSTRUCTIONS).not.toMatch(/assistant\.personas|personaEditor|personaDelete|chatPersona|personaDraft/);
});
it('rejects a hallucinated persona read before invoking any native reader', async () => {
  const read = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', readAppState: read }), before = footprint();
  const result = await runtime.execute({ tool: 'getbased_read_app', arguments: { action: 'assistant.personas' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).toContain('manual persona'); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  expect(read).not.toHaveBeenCalled(); expect(footprint()).toEqual(before);
});
it.each(['personaEditor', 'personaDelete', 'chatPersona'])('rejects the retired %s tool view before native navigation', async view => {
  const navigate = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', navigate }), before = footprint();
  const request = { view, marker: '', recordId: 'custom_private', snapshotId: 'old-snapshot' };
  expect(() => validateAppNavigation(request)).toThrow('manual persona');
  const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view, recordId: request.recordId, snapshotId: request.snapshotId } });
  expect(result.success).toBe(false); expect(navigate).not.toHaveBeenCalled(); expect(footprint()).toEqual(before);
  expect(await openAppDestination(request, () => true)).toMatchObject({ changed: false, dataSaved: false });
  expect(document.querySelector('#chat-personality-editor-overlay,#confirm-dialog-overlay')).toBeNull();
});
it('rejects a retired draft parameter on otherwise supported navigation', async () => {
  const navigate = vi.fn(), runtime = createAgentToolRuntime({ readContext: () => '', navigate });
  const result = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'dashboard', personaDraft: '{"promptText":"Guide"}' } });
  expect(result.success).toBe(false); expect(navigate).not.toHaveBeenCalled();
});
it('cannot create an automatic persona control through a live interactive session', async () => {
  const session = createAppControlSession('Use my custom persona.', () => true, new AbortController().signal), before = footprint();
  expect(session.tools.listAppActions().actions.some(action => String(action.id) === 'assistant.personas')).toBe(false);
  expect(() => session.tools.readAppState({ action: 'assistant.personas' })).toThrow('native settings');
  await expect(session.deferPersonaSelection({ view: 'chatPersona', marker: '', snapshotId: 'old', recordId: 'custom_private' })).rejects.toThrow('manual persona');
  expect(session.finish()).toEqual([]); expect(footprint()).toEqual(before); expect(state.currentChatPersonality).toBe('custom_private');
});
it.each(['readPersonaDirectory', 'openPersonaEditor', 'openPersonaDeletion', 'preparePersonaSelectionRequest'] as const)('fails closed for the retired direct entry %s', async method => {
  const before = footprint(); await expect(retired[method]('manual-persona')).rejects.toThrow('manual persona'); expect(footprint()).toEqual(before);
});
it.each(['pending', 'applying', 'changed'] as const)('keeps historical %s persona controls non-executable', async status => {
  const record: AppControlRecord = { version: 1, id: 'retired-persona', profileId: state.currentProfile, threadId: state.currentThreadId!, action: 'assistant.persona', automatic: true, parameters: { personaId: 'custom_private' }, baseline: { id: 'default', name: 'Default', icon: 'D' }, proposed: { id: 'custom_private', name: 'Private', icon: 'P' }, leaseId: 'retired-lease', status, reason: 'Historical request', evidence: 'Use my persona', undoAvailable: true };
  const normalized = normalizeAppControls([record], true)[0]!;
  expect(normalized.status).toBe(status === 'changed' ? 'changed' : 'expired'); expect(normalized.undoAvailable).not.toBe(true);
  const before = footprint(); await expect(executeAppControl(record, status === 'changed', () => true)).rejects.toThrow(); expect(footprint()).toEqual(before); expect(state.currentChatPersonality).toBe('custom_private');
});
