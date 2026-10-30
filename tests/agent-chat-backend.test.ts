import { AGENT_TOOL_CONTRACT_VERSION } from '../shared/agent-tool-contract.js';
import type { AgentTurnOptions, uploadAgentImage } from '../js/agent-chat-client.js';
import type { connectDetectedAgent } from '../js/agent-chat-settings.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
