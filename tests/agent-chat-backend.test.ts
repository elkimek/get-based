import { AGENT_TOOL_CONTRACT_VERSION } from '../shared/agent-tool-contract.js';
import type { AgentTurnOptions, uploadAgentImage } from '../js/agent-chat-client.js';
import type { connectDetectedAgent } from '../js/agent-chat-settings.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ stream: vi.fn<(options: AgentTurnOptions) => Promise<unknown>>(), connect: vi.fn<(...args: Parameters<typeof connectDetectedAgent>) => Promise<unknown>>(), upload: vi.fn<(options: Parameters<typeof uploadAgentImage>[0]) => Promise<string>>() }));
vi.mock('../js/agent-chat-client.js', () => ({ streamAgentTurn: mocks.stream, uploadAgentImage: mocks.upload }));
vi.mock('../js/agent-chat-settings.js', () => ({
  connectDetectedAgent: mocks.connect,
  getAgentHostAgent: () => 'codex', getAgentHostTarget: () => 'local',
  getAgentHostModel: () => 'synthetic-model', getAgentHostEffort: () => 'low',
  getAgentHostEndpoint: () => 'http://127.0.0.1:8324', getAgentHostToken: () => 'synthetic-token',
}));
vi.mock('../js/ai-execution-routing.js', () => ({ getAssistantExecutionRoute: () => ({ model: 'synthetic-model' }) }));
import { callCodexAgent } from '../js/agent-chat-backend.js';
import { state } from '../js/state.js';
import { getContextDisclosureFingerprint, isInsightContextCardsEnabled } from '../js/lab-context-settings.js';

const options = { prompt: 'Synthetic question', instructions: 'Synthetic instructions', labContext: 'Synthetic labs', profileId: 'profile-a', threadId: 'expired' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.stream.mockReset().mockResolvedValue({ text: 'Answer' });
  mocks.upload.mockReset().mockResolvedValue('upload-id');
  state.currentProfile = 'profile-a';
  state.chatHistory = [];
  state.currentThreadId = 'current-chat';
  state.importedData.contextSourceSettings = {};
});

describe('agent backend recovery boundaries', () => {
  it.each(['profile', 'root', 'thread', 'history', 'disclosure', 'parent'] as const)('does not send context or images after %s retirement while connecting', async retired => {
    let parentCurrent = true;
    mocks.connect.mockImplementationOnce(async () => {
      if (retired === 'profile') state.currentProfile = 'other';
      if (retired === 'root') state.importedData = { ...state.importedData };
      if (retired === 'thread') state.currentThreadId = 'other';
      if (retired === 'history') state.chatHistory = [...state.chatHistory];
      if (retired === 'parent') parentCurrent = false;
      if (retired === 'disclosure') { const before = getContextDisclosureFingerprint(); state.importedData.contextSourceSettings = { 'insight-cards': !isInsightContextCardsEnabled() }; expect(getContextDisclosureFingerprint()).not.toBe(before); }
    });
    await expect(callCodexAgent({ ...options, isCurrent: () => parentCurrent, images: [{ base64: 'AQI=', mediaType: 'image/png' }] })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.stream).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each([
    ['local', true, true], ['local', false, false], ['personal-gateway', true, false],
  ] as const)('forwards context proposal decisions only on the enabled local route: %s / %s', async (target, enabled, expected) => {
    state.importedData.contextSourceSettings = { 'insight-cards': enabled };
    state.chatHistory = [{ role: 'assistant', content: 'Review', agentDrafts: [{ id: 'declined', profileId: 'profile-a',
      kind: 'context', status: 'discarded', summary: 'Update Diet & Digestion', payload: { evidence: 'Private supporting statement' } }] }];
    await callCodexAgent({ ...options, target });
    expect(mocks.connect.mock.calls[0]![1]?.requiredToolContractVersion).toBe(target === 'local' ? AGENT_TOOL_CONTRACT_VERSION : undefined);
    const instructions = mocks.stream.mock.calls[0]![0].instructions;
    if (typeof instructions !== 'string') throw new Error('Missing agent instructions');
    const context = mocks.stream.mock.calls[0]![0].applicationContext;
    expect((context || '').includes('"status":"discarded"')).toBe(expected);
    expect((context || '').includes('Private supporting statement')).toBe(expected);
    if (target === 'local') {
      expect(JSON.parse(context!).enabledContext).toBe(options.labContext);
      expect(instructions).not.toContain(options.labContext);
      expect(mocks.connect.mock.calls[0]![1]?.requiredCapabilities).toContain('application-context');
    } else expect(context).toBeUndefined();
  });
  it.each(['invalid thread session', 'thread agent mismatch', 'thread target mismatch'])('retries %s once without the stale thread', async message => {
    mocks.stream.mockRejectedValueOnce(new Error(message));
    expect(await callCodexAgent(options)).toMatchObject({ text: 'Answer', drafts: [] });
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(mocks.stream.mock.calls[0]![0].threadId).toBe('expired');
    expect(mocks.stream.mock.calls[1]![0]).toMatchObject({ threadId: undefined, model: 'synthetic-model', prompt: options.prompt });
    expect(mocks.stream.mock.calls[1]![0].toolRuntime).toBe(mocks.stream.mock.calls[0]![0].toolRuntime);
  });
  it.each(['Unauthorized', 'Network error', 'Aborted'])('does not retry a potentially billable turn on %s', async message => {
    mocks.stream.mockRejectedValue(new Error(message));
    await expect(callCodexAgent(options)).rejects.toThrow(message);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });
  it('does not send a turn or upload when companion negotiation fails', async () => {
    mocks.connect.mockRejectedValue(new Error('Missing structured tools capability'));
    await expect(callCodexAgent({ ...options, images: [{ base64: 'AA==', mediaType: 'image/png' }] })).rejects.toThrow('Missing structured');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('passes cancellation through uploads and reuses the upload when a session expires', async () => {
    const signal = new AbortController().signal;
    mocks.stream.mockRejectedValueOnce(new Error('invalid thread session'));
    await callCodexAgent({ ...options, signal, images: [{ base64: 'AA==', mediaType: 'image/png' }] });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0]![0]).toMatchObject({ signal, token: 'synthetic-token' });
    for (const [turn] of mocks.stream.mock.calls) expect(turn).toMatchObject({ imageUploadIds: ['upload-id'], signal });
  });
  it('propagates a failed retry instead of looping', async () => {
    mocks.stream.mockRejectedValue(new Error('invalid thread session'));
    await expect(callCodexAgent(options)).rejects.toThrow('invalid thread session');
    expect(mocks.stream).toHaveBeenCalledTimes(2);
  });
});

import { CHAT_CONTROLS_KEY, setChatControlsEnabled } from '../js/chat-control-settings.js';
afterEach(() => localStorage.removeItem(CHAT_CONTROLS_KEY));
it('uses explicit plain chat with enabled baseline context and denies forged callbacks when controls are off', async () => {
  await setChatControlsEnabled(false);
  expect(await callCodexAgent(options)).toMatchObject({ text: 'Answer', drafts: [] });
  const preflight = mocks.connect.mock.calls[0]![1]!;
  expect(preflight.requiredCapabilities).toEqual(['chat-stream', 'plain-chat', 'application-context']);
  expect(preflight.requiredToolContractVersion).toBeUndefined();
  const turn = mocks.stream.mock.calls[0]![0];
  expect(turn.tools).toEqual([]); expect(turn.chatControlsEnabled).toBe(false);
  expect(turn.instructions).toContain('Chat controls are disabled'); expect(turn.instructions).not.toContain('proactively draft');
  expect(JSON.parse(turn.applicationContext!)).toEqual({ enabledContext: options.labContext, proposalReviewStatus: [] });
  expect(await turn.toolRuntime!.execute({ tool: 'getbased_lab_context', arguments: '{}' })).toMatchObject({ success: false });
});

it('bounds repeated phantom CLI claims to one corrective turn and reports no change', async () => {
  mocks.stream.mockResolvedValue({ text: "I've prepared a draft for your getbased card. Apply it.", threadId: 'signed-session', toolCalls: [], webSearches: [], usage: { inputTokens: 5, outputTokens: 2 } });
  const result = await callCodexAgent(options);
  expect(result.text).toContain('No proposal card was created'); expect(result.drafts).toEqual([]);
  expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4 }); expect(mocks.stream).toHaveBeenCalledTimes(2);
  const repair = mocks.stream.mock.calls[1]![0]; expect(repair.threadId).toBe('signed-session'); expect(repair.prompt).toContain('Application verification');
  expect(repair.toolRuntime).toBe(mocks.stream.mock.calls[0]![0].toolRuntime); expect(mocks.connect).toHaveBeenCalledOnce();
});
it('does not start a corrective CLI turn while chat controls are disabled', async () => {
  await setChatControlsEnabled(false); mocks.stream.mockResolvedValue({ text: "I've prepared a draft for your getbased card. Apply it." });
  const result = await callCodexAgent(options); expect(result.text).toContain('No proposal card was created'); expect(result.drafts).toEqual([]);
  expect(mocks.stream).toHaveBeenCalledOnce();
});
it('does not repeat a potentially billable corrective turn after a provider error', async () => {
  mocks.stream.mockResolvedValueOnce({ text: "I've prepared a draft for your getbased card. Apply it.", threadId: 'signed-session' }).mockRejectedValueOnce(new Error('Network error'));
  await expect(callCodexAgent(options)).rejects.toThrow('Network error'); expect(mocks.stream).toHaveBeenCalledTimes(2);
});

import { createAppControlSession } from '../js/app-control-session.js';
it('accepts a real app-review receipt created during corrective CLI tool calls without saving settings', async () => {
  const prompt = 'Use US units from now on.';
  const session = createAppControlSession(prompt, () => true, new AbortController().signal);
  mocks.stream.mockResolvedValueOnce({ text: "I've prepared a draft for your getbased card. Apply it.", threadId: 'signed-session', toolCalls: [], webSearches: [] });
  mocks.stream.mockImplementationOnce(async turn => {
    const read = await turn.toolRuntime!.execute({ tool: 'getbased_read_app', arguments: '{"action":"display.preferences"}' }) as { success: boolean; contentItems: { text: string }[] };
    expect(read.success).toBe(true); const snapshot = JSON.parse(read.contentItems[0]!.text);
    const draft = await turn.toolRuntime!.execute({ tool: 'getbased_request_app', arguments: JSON.stringify({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Explicit request.', evidence: prompt }) }) as { success: boolean };
    expect(draft.success).toBe(true);
    return { text: "I've prepared a proposal for getbased. Apply it when ready.", threadId: 'signed-session', toolCalls: [], webSearches: [] };
  });
  const before = localStorage.getItem('labcharts-profile-a-unitSystem'), activity: unknown[] = [];
  const result = await callCodexAgent({ ...options, prompt, appControlSession: session, onToolActivity: event => activity.push(event) });
  expect(activity).toEqual([expect.objectContaining({ tool: 'getbased_read_app', status: 'running' }), expect.objectContaining({ tool: 'getbased_read_app', status: 'completed' }), expect.objectContaining({ tool: 'getbased_request_app', status: 'running' }), expect.objectContaining({ tool: 'getbased_request_app', status: 'completed' })]);
  expect(result.text).toContain("I've prepared"); expect(mocks.stream).toHaveBeenCalledTimes(2);
  expect(session.finish()).toEqual([expect.objectContaining({ action: 'display.preferences', status: 'pending' })]);
  expect(localStorage.getItem('labcharts-profile-a-unitSystem')).toBe(before);
});

it('does not spend another CLI turn when the existing tool budget is already exhausted', async () => {
  mocks.stream.mockImplementationOnce(async turn => {
    for (let count = 0; count < 32; count++) expect(await turn.toolRuntime!.execute({ tool: 'getbased_lab_context', arguments: '{}' })).toMatchObject({ success: true });
    return { text: "I've prepared a draft for your getbased card.", toolCalls: [], webSearches: [] };
  });
  const result = await callCodexAgent(options); expect(result.text).toContain('No proposal card was created'); expect(mocks.stream).toHaveBeenCalledOnce();
});
it('does not repair a CLI claim after the user disables controls during the response', async () => {
  mocks.stream.mockImplementationOnce(async () => { await setChatControlsEnabled(false); return { text: "I've prepared a draft for your getbased card." }; });
  const result = await callCodexAgent(options); expect(result.text).toContain('No proposal card was created'); expect(mocks.stream).toHaveBeenCalledOnce();
});

it('repairs an explicit local review request even when the first answer makes no draft claim', async () => {
  const prompt = 'Please create actual proposal cards for my current profile.';
  mocks.stream.mockResolvedValue({ text: 'Understood.', threadId: 'signed-session', toolCalls: [], webSearches: [] });
  const result = await callCodexAgent({ ...options, prompt });
  expect(mocks.stream).toHaveBeenCalledTimes(2); expect(result.text).toContain('No proposal card was created'); expect(result.drafts).toEqual([]);
  expect(mocks.stream.mock.calls[1]![0].threadId).toBe('signed-session');
});

it.each(['failure', 'stop', 'retired'] as const)('retains real CLI app reviews after %s only for the accepted conversation', async mode => {
  const { getChatTurnRecovery } = await import('../js/chat-turn-recovery.js');
  const prompt = 'Use US units from now on.', controller = new AbortController();
  const session = createAppControlSession(prompt, () => true, controller.signal);
  mocks.stream.mockImplementationOnce(async turn => {
    const read = await turn.toolRuntime!.execute({ tool: 'getbased_read_app', arguments: '{"action":"display.preferences"}' }) as { success: boolean; contentItems: { text: string }[] };
    expect(read.success).toBe(true); const snapshot = JSON.parse(read.contentItems[0]!.text);
    expect(await turn.toolRuntime!.execute({ tool: 'getbased_request_app', arguments: JSON.stringify({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: '{"unitSystem":"US"}', reason: 'Explicit request.', evidence: prompt }) })).toMatchObject({ success: true });
    if (mode === 'stop') { controller.abort('Owned stop'); controller.signal.throwIfAborted(); }
    if (mode === 'retired') state.currentThreadId = 'other';
    throw new Error('Provider failed after app review');
  });
  const before = localStorage.getItem('labcharts-profile-a-unitSystem');
  const error: unknown = await callCodexAgent({ ...options, prompt, signal: controller.signal, appControlSession: session }).catch(error => error);
  const recovery = getChatTurnRecovery(error);
  if (mode === 'retired') expect(recovery).toBeUndefined();
  else {
    expect(recovery?.content).toContain('1 proposal remains available'); expect(recovery?.agentDrafts).toEqual([]);
    expect(recovery?.stopped === true).toBe(mode === 'stop');
    expect(session.finish()).toEqual([expect.objectContaining({ action: 'display.preferences', status: 'pending' })]);
  }
  expect(localStorage.getItem('labcharts-profile-a-unitSystem')).toBe(before);
});
