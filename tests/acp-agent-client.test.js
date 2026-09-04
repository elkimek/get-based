// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { ACPAgentClient, normalizeACPModelCatalog } from '../lib/acp-agent-client.js';

describe('ACP agent model catalogs', () => {
  it('normalizes standard session config options', () => {
    expect(normalizeACPModelCatalog({ configOptions: [
      { id: 'model', category: 'model', currentValue: 'model-a', options: [
        { value: 'model-a', name: 'Model A' }, { value: 'model-b', name: 'Model B' },
      ] },
      { id: 'thought_level', category: 'thought_level', currentValue: 'medium', options: [
        { value: 'low', name: 'Low' }, { value: 'medium', name: 'Medium' },
      ] },
    ] })).toEqual([
      expect.objectContaining({ id: 'model-a', displayName: 'Model A', isDefault: true, defaultReasoningEffort: 'medium' }),
      expect.objectContaining({ id: 'model-b', displayName: 'Model B', isDefault: false }),
    ]);
  });

  it('normalizes Grok model metadata and model-specific reasoning', () => {
    const models = normalizeACPModelCatalog({ _meta: { modelState: {
      currentModelId: 'grok-4.6', availableModels: [{
        id: 'grok-4.6', name: 'Grok 4.6', _meta: {
          reasoningEfforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High', selected: true }],
        },
      }],
    } } });
    expect(models[0]).toMatchObject({
      id: 'grok-4.6', isDefault: true, defaultReasoningEffort: 'high',
      supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }],
    });
  });

  it('recognizes OpenCode effort options and applies them per session', async () => {
    const models = normalizeACPModelCatalog({ configOptions: [
      { id: 'model', category: 'model', currentValue: 'opencode/free', options: [
        { value: 'opencode/free', name: 'OpenCode/Free' },
      ] },
      { id: 'effort', category: 'thought_level', currentValue: 'medium', options: [
        { value: 'low', name: 'Low' }, { value: 'high', name: 'High' },
      ] },
    ] });
    expect(models[0]).toMatchObject({
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }],
    });

    const client = new ACPAgentClient({ id: 'opencode', command: 'opencode', args: ['acp'], cwd: '/tmp' });
    client.request = vi.fn(async () => ({ configOptions: [] }));
    await client.configureSession('session-1', [{
      id: 'effort', category: 'thought_level', currentValue: 'medium', options: [],
    }], '', 'high');
    expect(client.request).toHaveBeenCalledWith('session/set_config_option', {
      sessionId: 'session-1', configId: 'effort', value: 'high',
    });
  });

  it('uses the ACP model extension for Hermes session-local model choices', async () => {
    const client = new ACPAgentClient({ id: 'hermes', command: 'hermes', args: ['acp'], cwd: '/tmp' });
    client.request = vi.fn(async () => ({}));
    await client.configureSession('session-2', [], 'openai-codex:gpt-5.6-terra', '', {
      currentModelId: 'openai-codex:gpt-5.6-sol',
      availableModels: [
        { modelId: 'openai-codex:gpt-5.6-sol' }, { modelId: 'openai-codex:gpt-5.6-terra' },
      ],
    });
    expect(client.request).toHaveBeenCalledWith('session/set_model', {
      sessionId: 'session-2', modelId: 'openai-codex:gpt-5.6-terra',
    });
  });

  it('starts a fresh session when an ACP session can no longer be loaded', async () => {
    const client = new ACPAgentClient({ id: 'opencode', command: 'opencode', args: ['acp'], cwd: '/tmp/current' });
    client.initialize = vi.fn(async () => ({ agentCapabilities: { loadSession: true } }));
    client.request = vi.fn(async method => {
      if (method === 'session/load') throw new Error('Previous workspace no longer exists.');
      if (method === 'session/new') return { sessionId: 'fresh-session', configOptions: [] };
      throw new Error(`Unexpected request: ${method}`);
    });

    await expect(client.ensureSession({ requestedSessionId: 'stale-session', mcpServers: [] }))
      .resolves.toMatchObject({ sessionId: 'fresh-session' });
    expect(client.request).toHaveBeenNthCalledWith(1, 'session/load', {
      sessionId: 'stale-session', cwd: '/tmp/current', mcpServers: [],
    });
    expect(client.request).toHaveBeenNthCalledWith(2, 'session/new', {
      cwd: '/tmp/current', mcpServers: [],
    });
  });

  it('reuses one private catalog session across per-model option refreshes', async () => {
    const client = new ACPAgentClient({ id: 'opencode', command: 'opencode', args: ['acp'], cwd: '/tmp/current' });
    client.initialize = vi.fn(async () => ({ agentCapabilities: { promptCapabilities: { image: true } } }));
    client.request = vi.fn(async (method, params) => {
      if (method === 'session/new') return {
        sessionId: 'catalog-session',
        configOptions: [{ id: 'model', category: 'model', currentValue: 'model-a', options: [
          { value: 'model-a', name: 'Model A' }, { value: 'model-b', name: 'Model B' },
        ] }],
      };
      if (method === 'session/set_config_option') return {
        configOptions: [{ id: 'model', category: 'model', currentValue: params.value, options: [
          { value: 'model-a', name: 'Model A' }, { value: 'model-b', name: 'Model B' },
        ] }],
      };
      throw new Error(`Unexpected request: ${method}`);
    });

    await client.loadModelCatalog({ model: 'model-a' });
    await client.loadModelCatalog({ model: 'model-b' });

    expect(client.request.mock.calls.filter(([method]) => method === 'session/new')).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith('session/set_config_option', {
      sessionId: 'catalog-session', configId: 'model', value: 'model-b',
    });
  });
});
