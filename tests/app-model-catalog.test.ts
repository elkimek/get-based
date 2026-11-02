// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { readChatModelCatalogMetadata } from '../js/chat-model-control-state.js';
import { setAIProvider, setCustomApiModel } from '../js/api.js';
import { saveAgentChatSettings, setChatBackend } from '../js/agent-chat-settings.js';
import { cacheAgentModelCatalog } from '../js/agent-model-catalog.js';
beforeEach(() => { localStorage.clear(); setChatBackend('direct'); setAIProvider('custom'); setCustomApiModel('model-0'); });
it('returns bounded model IDs and names without configuration, credentials or arbitrary catalog properties', () => {
  localStorage.setItem('labcharts-custom-models', JSON.stringify(Array.from({ length: 40 }, (_, index) => ({ id: `model-${index}`, name: `Model ${index}`, apiKey: 'DO_NOT_DISCLOSE', privateMetadata: { password: 'DO_NOT_DISCLOSE' } }))));
  localStorage.setItem('labcharts-custom-api-url', 'https://user:DO_NOT_DISCLOSE@example.invalid/private');
  localStorage.setItem('labcharts-custom-api-key', 'DO_NOT_DISCLOSE');
  localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'other-connection-model' }]));
  const read = readChatModelCatalogMetadata({ limit: 100 });
  expect(read.models).toHaveLength(25); expect(read.total).toBe(40); expect(read.nextOffset).toBe(25);
  expect(read.selectedModel).toBe('model-0'); expect(read.liveAvailabilityVerified).toBe(false);
  expect(read.models[0]).toEqual({ id: 'model-0', name: 'Model 0', availability: 'listed in saved catalog', inputModalities: ['text'], reasoningChoices: [], defaultEffort: '', toolSupport: null });
  expect(JSON.stringify(read)).not.toMatch(/DO_NOT_DISCLOSE|other-connection|example.invalid|apiKey|password/);
  expect(readChatModelCatalogMetadata({ query: 'model 3', offset: 1, limit: 2 })).toMatchObject({ total: 11, offset: 1, nextOffset: 3, models: [{ id: 'model-30', name: 'Model 30' }, { id: 'model-31', name: 'Model 31' }] });
});
it('reports an empty saved catalog without treating the selected model as verified availability', () => {
  expect(readChatModelCatalogMetadata()).toMatchObject({ catalogEmpty: true, selectedModel: 'model-0', total: 0, models: [], liveAvailabilityVerified: false });
});
it('uses only the selected CLI and target catalog', async () => {
  cacheAgentModelCatalog([{ id: 'local-a', displayName: 'Local model', inputModalities: ['text'] }], 'hermes', 'local');
  await saveAgentChatSettings({ agent: 'hermes', target: 'local', model: 'local-a', effort: 'high' }); setChatBackend('codex');
  expect(readChatModelCatalogMetadata()).toMatchObject({ backend: 'cli', provider: 'hermes', target: 'local', selectedModel: 'local-a', reasoningEffort: 'high', models: [{ id: 'local-a', name: 'Local model' }] });
  cacheAgentModelCatalog([{ id: 'gateway-b', displayName: 'Gateway model', inputModalities: ['text'] }], 'hermes', 'personal-gateway');
  expect(readChatModelCatalogMetadata().models).toEqual([]);
  await saveAgentChatSettings({ target: 'personal-gateway', model: 'gateway-b' });
  expect(readChatModelCatalogMetadata()).toMatchObject({ target: 'personal-gateway', selectedModel: 'gateway-b', models: [{ id: 'gateway-b', name: 'Gateway model' }] });
});
