// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({ model: 'missing', target: 'local' }));
vi.mock('../js/agent-chat-settings.js', () => ({
  getChatBackend: () => 'codex', getAgentHostAgent: () => 'hermes',
  getAgentHostTarget: () => config.target, getAgentHostModel: () => config.model,
  getAgentHostToken: () => 'test-token',
}));
import { cacheAgentModelCatalog } from '../js/agent-model-catalog.js';
import { getAssistantExecutionRoute } from '../js/ai-execution-routing.js';
beforeEach(() => { localStorage.clear(); config.model = 'missing'; config.target = 'local'; });
it('does not route a configured model absent from the active target catalog', () => {
  cacheAgentModelCatalog([{ id: 'available', isDefault: true, inputModalities: ['text'] }], 'hermes', 'local');
  expect(getAssistantExecutionRoute().available).toBe(false);
  config.model = 'available';
  expect(getAssistantExecutionRoute().available).toBe(true);
  config.target = 'gateway-personal';
  expect(getAssistantExecutionRoute().available).toBe(false);
});
it('allows the current catalog default without an explicit model override', () => {
  config.model = '';
  cacheAgentModelCatalog([{ id: 'available', isDefault: true, inputModalities: ['text'] }], 'hermes', 'local');
  expect(getAssistantExecutionRoute()).toMatchObject({ available: true, model: 'available' });
});
