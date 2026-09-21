import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), connect: vi.fn(), upload: vi.fn() }));
vi.mock('../js/agent-chat-client.js', () => ({ streamAgentTurn: mocks.stream, uploadAgentImage: mocks.upload }));
vi.mock('../js/agent-chat-settings.js', () => ({
  connectDetectedAgent: mocks.connect,
  getAgentHostAgent: () => 'codex', getAgentHostTarget: () => 'local',
  getAgentHostModel: () => 'synthetic-model', getAgentHostEffort: () => 'low',
  getAgentHostEndpoint: () => 'http://127.0.0.1:8324', getAgentHostToken: () => 'synthetic-token',
}));
vi.mock('../js/ai-execution-routing.js', () => ({ getAssistantExecutionRoute: () => ({ model: 'synthetic-model' }) }));
import { callCodexAgent } from '../js/agent-chat-backend.js';

const options = { prompt: 'Synthetic question', instructions: 'Synthetic instructions', labContext: 'Synthetic labs', profileId: 'profile-a', threadId: 'expired' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.stream.mockReset().mockResolvedValue({ text: 'Answer' });
  mocks.upload.mockReset().mockResolvedValue('upload-id');
});

describe('agent backend recovery boundaries', () => {
  it.each(['invalid thread session', 'thread agent mismatch', 'thread target mismatch'])('retries %s once without the stale thread', async message => {
    mocks.stream.mockRejectedValueOnce(new Error(message));
    expect(await callCodexAgent(options)).toMatchObject({ text: 'Answer', drafts: [] });
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(mocks.stream.mock.calls[0][0].threadId).toBe('expired');
    expect(mocks.stream.mock.calls[1][0]).toMatchObject({ threadId: undefined, model: 'synthetic-model', prompt: options.prompt });
    expect(mocks.stream.mock.calls[1][0].toolRuntime).toBe(mocks.stream.mock.calls[0][0].toolRuntime);
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
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({ signal, token: 'synthetic-token' });
    for (const [turn] of mocks.stream.mock.calls) expect(turn).toMatchObject({ imageUploadIds: ['upload-id'], signal });
  });
  it('propagates a failed retry instead of looping', async () => {
    mocks.stream.mockRejectedValue(new Error('invalid thread session'));
    await expect(callCodexAgent(options)).rejects.toThrow('invalid thread session');
    expect(mocks.stream).toHaveBeenCalledTimes(2);
  });
});
