import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callClaudeAPI: vi.fn(),
  callCodexFeature: vi.fn(),
  getAssistantExecutionRoute: vi.fn(),
}));

vi.mock('../js/api.js', () => ({
  callClaudeAPI: mocks.callClaudeAPI,
  getActiveModelDisplay: () => 'Direct model',
  getActiveModelId: () => 'direct-model',
  getAIProvider: () => 'direct-provider',
  hasAIProvider: () => true,
  isAIPaused: () => false,
  supportsVision: () => true,
}));
vi.mock('../js/agent-feature-inference.js', () => ({ callCodexFeature: mocks.callCodexFeature }));
vi.mock('../js/ai-execution-routing.js', () => ({ getAssistantExecutionRoute: mocks.getAssistantExecutionRoute }));
vi.mock('../js/agent-chat-settings.js', () => ({ getAgentHostEffort: () => 'high' }));

import {
  assistantFeatureSupports, callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider,
} from '../js/ai-feature-routing.js';

describe('assistant feature routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAssistantExecutionRoute.mockReturnValue({ adapter: 'direct' });
  });

  it('keeps existing direct-provider feature requests unchanged', async () => {
    const request = { messages: [{ role: 'user', content: 'Analyze' }], maxTokens: 100 };
    mocks.callClaudeAPI.mockResolvedValue({ text: 'done' });
    await expect(callAssistantFeatureAI(request, 'venice')).resolves.toEqual({ text: 'done' });
    expect(mocks.callClaudeAPI).toHaveBeenCalledWith(request, 'venice');
    expect(hasAssistantFeatureProvider()).toBe(true);
    expect(assistantFeatureSupports('image')).toBe(true);
  });

  it('routes text and data-url images through the selected CLI model', async () => {
    mocks.getAssistantExecutionRoute.mockReturnValue({
      adapter: 'codex', available: true, model: 'gpt-test', modelDisplay: 'GPT Test',
      providerDisplay: 'Codex CLI', inputModalities: ['text', 'image'],
    });
    mocks.callCodexFeature.mockResolvedValue({ text: '{"ok":true}' });
    const schema = { type: 'object' };
    await callAssistantFeatureAI({
      system: 'Return JSON',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
        { type: 'text', text: 'Read this report' },
      ] }],
      jsonSchema: schema,
      consentKind: 'automatic-insight',
    });

    expect(mocks.callCodexFeature).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'User request:\nRead this report',
      instructions: 'Return JSON',
      model: 'gpt-test',
      effort: 'high',
      outputSchema: schema,
      consentKind: 'automatic-insight',
      files: [expect.any(Blob)],
    }));
    expect(getAssistantFeatureIdentity()).toMatchObject({ provider: 'codex-agent', modelId: 'gpt-test', subscription: true });
    expect(assistantFeatureSupports('image')).toBe(true);
  });

  it('rejects image features when the selected CLI model is text-only', async () => {
    mocks.getAssistantExecutionRoute.mockReturnValue({
      adapter: 'codex', available: true, model: 'text-model', inputModalities: ['text'],
    });
    await expect(callAssistantFeatureAI({ messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
      { type: 'text', text: 'Read' },
    ] }] })).rejects.toThrow('does not report image support');
  });
});
