import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  agent: 'codex', effort: '',
  connect: vi.fn(), stream: vi.fn(), approval: vi.fn(),
}));
vi.mock('../js/agent-chat-settings.js', () => ({
  connectDetectedAgent: mocks.connect,
  getAgentHostAgent: () => mocks.agent,
  getAgentHostEffort: () => mocks.effort,
  getAgentHostTarget: () => 'local',
  getAgentHostEndpoint: () => 'http://127.0.0.1:8324',
  getAgentHostToken: () => 'test-connection-token',
}));
vi.mock('../js/agent-chat-client.js', () => ({ streamAgentTurn: mocks.stream, uploadAgentImage: vi.fn() }));
vi.mock('../js/cloud-ai-consent.js', () => ({ requireAIProcessingApproval: mocks.approval }));
import { callCodexFeature } from '../js/agent-feature-inference.js';

describe('CLI feature request preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.agent = 'codex'; mocks.effort = ''; });
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
