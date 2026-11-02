import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ provider: 'custom', model: 'synthetic', key: 'synthetic-key', encrypted: false, disclosure: 'initial',
  complete: vi.fn(), read: vi.fn(), prepare: vi.fn() }));
vi.mock('../js/lab-context-settings.js', () => ({ getContextDisclosureFingerprint: () => mocks.disclosure }));
vi.mock('../js/api.js', () => ({
  callClaudeAPI: mocks.complete, getAIProvider: () => mocks.provider, getActiveModelId: () => mocks.model,
  getVeniceE2EE: () => mocks.encrypted, isE2EEModel: () => false, getVeniceKey: () => mocks.key,
  getOpenRouterKey: () => mocks.key, getPpqKey: () => mocks.key, getRoutstrKey: () => mocks.key,
  getRoutstrNodeUrl: () => 'https://synthetic.test', getCustomApiUrl: () => 'https://synthetic.test',
  getCustomApiKey: () => mocks.key, getOllamaConfig: () => ({ url: 'http://localhost:9999', apiKey: mocks.key }),
}));
vi.mock('../js/agent-tool-bindings.js', () => ({ canDiscloseAgentDraftReview: () => true, createBrowserAgentToolDependencies: () => ({
  readContextCard: mocks.read, prepareContextChange: mocks.prepare,
}) }));
import { state } from '../js/state.js';
import { callDirectChatWithTools } from '../js/direct-chat-tools.js';
import type { OpenAICompatibleOptions } from '../js/api-openai-compatible.js';

const prompt = 'I want to improve my sleep.';
const payload = { card: 'healthGoals', baseline: '[]', changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep' } }], reason: 'User stated a goal.', evidence: prompt };
const options = () => ({ provider: mocks.provider, prompt, labContext: 'Enabled baseline.', profileId: 'synthetic-profile', messages: [{ role: 'user', content: prompt }] });
beforeEach(() => {
  vi.resetAllMocks(); mocks.provider = 'custom'; mocks.model = 'synthetic'; mocks.key = 'synthetic-key'; mocks.encrypted = false; mocks.disclosure = 'initial';
  state.currentProfile = 'synthetic-profile'; state.currentThreadId = 'synthetic-thread'; state.chatHistory = [];
  mocks.read.mockResolvedValue({ available: true, snapshotId: 'snapshot', fields: [] });
  mocks.prepare.mockResolvedValue({ available: true, payload, summary: 'Update Health Goals' });
});
it.each(['openrouter', 'venice', 'ppq', 'routstr', 'ollama', 'custom'])('returns a structured goal proposal with %s without any Companion', async provider => {
  mocks.provider = provider;
  mocks.complete.mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'read', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } }] })
    .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'draft', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ ...payload, baseline: undefined, snapshotId: 'snapshot' }) } }] })
    .mockResolvedValueOnce({ text: 'Please review the proposed goal.' });
  const result = await callDirectChatWithTools(options());
  expect(result.drafts).toEqual([expect.objectContaining({ profileId: 'synthetic-profile', kind: 'context', status: 'pending', payload })]);
  expect(result.toolCalls).toHaveLength(2);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ card: 'healthGoals' });
  expect(mocks.prepare).toHaveBeenCalledOnce();
  for (const [round, recipient] of mocks.complete.mock.calls) {
    expect(recipient).toBe(provider);
    expect(round).toMatchObject({ modelOverride: 'synthetic', system: expect.stringContaining('proactively offer a reviewable update') });
    expect(round.tools?.map((tool: { function: { name: string } }) => tool.function.name)).toEqual([
      'getbased_lab_context', 'getbased_section', 'getbased_read_context_card', 'getbased_draft_context',
    ]);
    expect(round.requestCurrent()).toBe(true);
    expect(JSON.stringify(round)).not.toContain('synthetic-key');
  }
});
it('carries the structured protocol inside Venice encrypted content', async () => {
  mocks.provider = 'venice'; mocks.encrypted = true;
  mocks.complete.mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'read', name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Tell me your desired priority.', calls: [] }) });
  const stream = vi.fn();
  const result = await callDirectChatWithTools({ ...options(), onStream: stream });
  expect(result.text).toBe('Tell me your desired priority.');
  for (const [round] of mocks.complete.mock.calls) { expect(round.tools).toBeUndefined(); expect(round.jsonMode).toBe(true); }
  expect(stream).toHaveBeenCalledExactlyOnceWith('Tell me your desired priority.');
});
it.each(['profile', 'thread', 'provider', 'model', 'credential', 'disclosure'])('stops after a %s change without reading or preparing a draft', async changed => {
  mocks.complete.mockImplementation(async () => {
    if (changed === 'profile') state.currentProfile = 'other';
    if (changed === 'thread') state.currentThreadId = 'other';
    if (changed === 'provider') mocks.provider = 'venice';
    if (changed === 'model') mocks.model = 'other';
    if (changed === 'credential') mocks.key = 'other';
    if (changed === 'disclosure') mocks.disclosure = 'revoked';
    return { text: '', toolCalls: [{ id: 'read', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{}' } }] };
  });
  await expect(callDirectChatWithTools(options())).rejects.toThrow('changed');
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});
it('sends all-kind review outcomes into the next turn', async () => {
  state.chatHistory = [{ role: 'assistant', content: '', agentDrafts: [{ id: 'synthetic-note', profileId: 'synthetic-profile', kind: 'note', status: 'discarded', summary: 'Profile note', payload: { scope: 'profile', text: 'Example', mode: 'append' } }] }];
  mocks.complete.mockImplementation(async (request: OpenAICompatibleOptions) => {
    expect(request.system).toContain('"kind":"note"'); expect(request.system).toContain('"status":"discarded"');
    return { text: 'Understood.' };
  });
  await callDirectChatWithTools(options());
});

import { CHAT_CONTROLS_KEY, setChatControlsEnabled } from '../js/chat-control-settings.js';
afterEach(() => localStorage.removeItem(CHAT_CONTROLS_KEY));
it.each(['openrouter', 'venice', 'ppq', 'routstr', 'ollama', 'custom'])('keeps %s conversation working with no app tools when controls are off', async provider => {
  await setChatControlsEnabled(false); mocks.provider = provider; mocks.encrypted = provider === 'venice';
  mocks.complete.mockResolvedValue({ text: 'Ordinary answer.' });
  const result = await callDirectChatWithTools(options());
  expect(result).toMatchObject({ text: 'Ordinary answer.', drafts: [], toolCalls: [] });
  const request = mocks.complete.mock.calls[0]![0];
  expect(request.tools).toBeUndefined(); expect(request.jsonMode).toBeUndefined(); expect(request.jsonSchema).toBeUndefined();
  expect(request.system).toContain('Health tools are disabled'); expect(request.system).not.toContain('proactively offer');
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});
it('refuses unexpected provider tool calls with controls off', async () => {
  await setChatControlsEnabled(false);
  mocks.complete.mockResolvedValue({ text: '', toolCalls: [{ id: 'forged', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } }] });
  await expect(callDirectChatWithTools(options())).rejects.toThrow('disabled');
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});

it.each(['openrouter', 'venice', 'ppq', 'routstr', 'ollama', 'custom'])('repairs a phantom relocation proposal with actual read/draft tools on %s', async provider => {
  mocks.provider = provider;
  const prompt = 'I just moved from Sweden to El Salvador.';
  const move = { card: 'environment', baseline: '{"note":"Keep existing note","climate":"cold"}', changes: [{ field: 'note', value: 'Keep existing note\nReported move from Sweden to El Salvador.' }], evidence: prompt, reason: 'User reported relocation.' };
  mocks.prepare.mockResolvedValue({ available: true, payload: move, summary: 'Environment & Exposures' });
  mocks.complete.mockResolvedValueOnce({ text: "What a change. I've prepared a draft update to your Environment & Exposures card; check the proposal in getbased and Apply." })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'read', name: 'getbased_read_context_card', arguments: '{"card":"environment"}' }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'draft', name: 'getbased_draft_context', arguments: JSON.stringify({ ...move, baseline: undefined, snapshotId: 'snapshot' }) }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Please review the relocation proposal card.', calls: [] }) });
  const result = await callDirectChatWithTools({ ...options(), prompt, messages: [{ role: 'user', content: prompt }] });
  expect(result.text).toBe('Please review the relocation proposal card.');
  expect(result.drafts).toEqual([expect.objectContaining({ kind: 'context', payload: move })]);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ card: 'environment' }); expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(result.toolCalls).toEqual([expect.objectContaining({ tool: 'getbased_read_context_card', success: true }), expect.objectContaining({ tool: 'getbased_draft_context', success: true })]);
  for (const [, recipient] of mocks.complete.mock.calls) expect(recipient).toBe(provider);
});
it('corrects an unbacked draft claim when controls are off without another inference or a read', async () => {
  await setChatControlsEnabled(false); mocks.complete.mockResolvedValue({ text: "I've prepared a draft for your getbased card. Apply it." });
  const result = await callDirectChatWithTools(options()); expect(result.drafts).toEqual([]); expect(result.text).toContain('No proposal card was created');
  expect(mocks.complete).toHaveBeenCalledOnce(); expect(mocks.read).not.toHaveBeenCalled();
});

it.each(['openrouter','venice','ppq','routstr','ollama','custom'])('uses the explicit structured review contract on %s without exposing workflow flags', async provider => {
  mocks.provider = provider; const request = 'Please create actual proposal cards for my current profile.\n\n' + prompt;
  mocks.complete.mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'r', name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'd', name: 'getbased_draft_context', arguments: JSON.stringify({ ...payload, baseline: undefined, snapshotId: 'snapshot' }) }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Please review the actual proposal.', calls: [] }) });
  const result = await callDirectChatWithTools({ ...options(), prompt: request, messages: [{ role: 'user', content: request }] });
  expect(result.drafts).toHaveLength(1); expect(result.toolCalls).toHaveLength(2);
  expect(mocks.complete.mock.calls[0]![0]).toMatchObject({ jsonMode: true, jsonSchema: { properties: { calls: { minItems: 1 } } } });
  for (const [round, recipient] of mocks.complete.mock.calls) { expect(recipient).toBe(provider); expect(round.tools).toBeUndefined(); expect(round).not.toHaveProperty('reviewRequested'); expect(JSON.stringify(round)).not.toContain('synthetic-key'); }
});

it('returns an actionable local notice for an explicit review when controls are off without calling the provider', async () => {
  localStorage.setItem('getbased-chat-controls', '0:11111111-1111-4111-8111-111111111111');
  try { const request = 'Please create actual proposal cards for my current profile.'; const result = await callDirectChatWithTools({ ...options(), prompt: request, messages: [{ role: 'user', content: request }] });
    expect(result.text).toContain('Health updates through chat are off'); expect(result.drafts).toEqual([]); expect(mocks.complete).not.toHaveBeenCalled();
  } finally { localStorage.removeItem('getbased-chat-controls'); }
});

it.each(['failure', 'stop', 'retired'] as const)('retains a real context proposal after %s only for the accepted owner', async mode => {
  const controller = new AbortController();
  mocks.complete.mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'read', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } }] })
    .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'draft', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ ...payload, baseline: undefined, snapshotId: 'snapshot' }) } }] })
    .mockImplementationOnce(async () => {
      if (mode === 'stop') { controller.abort(); controller.signal.throwIfAborted(); }
      if (mode === 'retired') state.currentThreadId = 'new-thread';
      throw new Error('Network after proposal');
    });
  const before = structuredClone(state.importedData);
  const error: unknown = await callDirectChatWithTools({ ...options(), signal: controller.signal }).catch(error => error);
  const { getChatTurnRecovery } = await import('../js/chat-turn-recovery.js');
  const recovery = getChatTurnRecovery(error);
  if (mode === 'retired') expect(recovery).toBeUndefined();
  else {
    expect(recovery?.agentDrafts).toEqual([expect.objectContaining({ profileId: 'synthetic-profile', payload, status: 'pending' })]);
    expect(recovery?.content).toContain('1 proposal remains available');
    expect(recovery?.stopped === true).toBe(mode === 'stop');
  }
  expect(state.importedData).toEqual(before);
});
