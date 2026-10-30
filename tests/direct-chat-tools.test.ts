import { beforeEach, expect, it, vi } from 'vitest';
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
      'getbased_lab_context', 'getbased_section', 'getbased_search_markers', 'getbased_marker_history',
      'getbased_nutrition_summary', 'getbased_wearable_series', 'getbased_search_knowledge',
      'getbased_read_context_card', 'getbased_read_data', 'getbased_draft_data', 'getbased_navigate',
      'getbased_draft_note', 'getbased_draft_context', 'getbased_draft_meal', 'getbased_draft_biometric',
      'getbased_draft_supplement', 'getbased_app_actions', 'getbased_read_app', 'getbased_request_app',
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
