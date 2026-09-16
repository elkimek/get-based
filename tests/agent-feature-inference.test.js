import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agent: 'codex', effort: '', target: 'local',
  connect: vi.fn(), stream: vi.fn(), approval: vi.fn(), targets: vi.fn(),
}));
vi.mock('../js/agent-chat-settings.js', () => ({
  connectDetectedAgent: mocks.connect,
  getAgentHostAgent: () => mocks.agent,
  getAgentHostEffort: () => mocks.effort,
  getAgentHostTarget: () => mocks.target,
  getAgentHostEndpoint: () => 'http://127.0.0.1:8324',
  getAgentHostToken: () => 'test-connection-token',
}));
vi.mock('../js/agent-chat-client.js', () => ({ streamAgentTurn: mocks.stream, uploadAgentImage: vi.fn(), listAgentExecutionTargets: mocks.targets }));
vi.mock('../js/cloud-ai-consent.js', () => ({ requireAIProcessingApproval: mocks.approval }));
import { callCodexFeature } from '../js/agent-feature-inference.js';

describe('CLI feature request preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.agent = 'codex'; mocks.effort = ''; mocks.target = 'local'; });
  it('rejects oversized feature requests locally before connecting or sending profile text', async () => {
    await expect(callCodexFeature({ prompt: 'x'.repeat(100_001), model: 'test-model' })).rejects.toThrow('size limit');
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('routes a text explanation to a capable Hermes gateway as a fresh feature request', async () => {
    mocks.agent = 'hermes'; mocks.target = 'gateway-home';
    mocks.targets.mockResolvedValue([{ id: 'gateway-home', supportsTextFeatureJobs: true }]);
    await callCodexFeature({ prompt: 'Synthetic score explanation', model: 'remote-model' });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ agent: 'hermes', target: 'gateway-home', purpose: 'feature', tools: [], prompt: 'Synthetic score explanation' }));
    expect(mocks.stream.mock.calls[0][0].threadId).toBeUndefined();
    expect(mocks.approval).toHaveBeenCalledWith('personal-agent-gateway', expect.objectContaining({ kind: 'text' }));
  });
  it('reports an outdated gateway capability before sending any profile text', async () => {
    mocks.target = 'gateway-home'; mocks.targets.mockResolvedValue([{ id: 'gateway-home' }]);
    await expect(callCodexFeature({ prompt: 'Synthetic score', model: 'remote-model' })).rejects.toThrow('Update the Companion');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('keeps unsupported remote images blocked', async () => {
    mocks.target = 'gateway-home';
    await expect(callCodexFeature({ prompt: 'Image', files: [new Blob(['image'])], model: 'remote-model' })).rejects.toThrow('Local CLI for image imports');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('keeps default reasoning unset instead of forcing low', async () => {
    await callCodexFeature({ prompt: 'Synthetic analysis', model: 'test-model' });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ effort: '', agent: 'codex' }));
  });
  it('captures the agent and its reasoning before discovery and approval', async () => {
    mocks.effort = 'high';
    mocks.connect.mockImplementationOnce(async () => { mocks.agent = 'hermes'; mocks.effort = 'low'; });
    await callCodexFeature({ prompt: 'Synthetic analysis', model: 'test-model' });
    expect(mocks.connect).toHaveBeenCalledWith('codex', expect.anything());
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ agent: 'codex', effort: 'high' }));
  });
  it('preserves an explicit default even if the main model has a saved effort', async () => {
    mocks.effort = 'high';
    await callCodexFeature({ prompt: 'Synthetic analysis', model: 'test-model', effort: '' });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ effort: '' }));
  });
});
