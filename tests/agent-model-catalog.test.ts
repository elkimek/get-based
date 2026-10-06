// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_MODEL_CATALOG_AGENT_KEY, AGENT_MODEL_CATALOG_TARGET_KEY, cacheAgentModelCatalog, getCachedAgentModelCatalog,
} from '../js/agent-model-catalog.js';
import { mountCliAgentModels, disposeCliAgentModels } from '../js/cli-agent-models-component.js';
import { filterCLIAgentModelOptions } from '../js/settings-cli-agent-panel.js';

describe('CLI agent model catalog cache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { disposeCliAgentModels(); document.body.replaceChildren(); });

  it('keeps complete multi-provider catalogs up to the companion limit', () => {
    const models = Array.from({ length: 366 }, (_, index) => ({
      id: `openrouter/provider/model-${index}`,
      displayName: `OpenRouter/Model ${index}`,
      inputModalities: ['text'],
      supportedReasoningEfforts: [],
    }));
    expect(cacheAgentModelCatalog(models)).toHaveLength(366);
    expect(getCachedAgentModelCatalog()).toHaveLength(366);
  });

  it('does not reuse one CLI agent catalog for another agent', () => {
    cacheAgentModelCatalog([{ id: 'openrouter/model-a', inputModalities: ['text', 'image'] }], 'opencode');
    expect(localStorage.getItem(AGENT_MODEL_CATALOG_AGENT_KEY)).toBe('opencode');
    expect(getCachedAgentModelCatalog('opencode')).toHaveLength(1);
    expect(getCachedAgentModelCatalog('codex')).toEqual([]);
  });

  it('does not reuse a local CLI catalog for the same agent personal gateway', () => {
    cacheAgentModelCatalog([{ id: 'local-model' }], 'hermes', 'local');
    expect(localStorage.getItem(AGENT_MODEL_CATALOG_TARGET_KEY)).toBe('local');
    expect(getCachedAgentModelCatalog('hermes', 'gateway-home')).toEqual([]);
    cacheAgentModelCatalog([{ id: 'personal-model' }], 'hermes', 'gateway-home');
    expect(getCachedAgentModelCatalog('hermes', 'local')).toEqual([]);
    expect(getCachedAgentModelCatalog('hermes', 'gateway-home')[0]!.id).toBe('personal-model');
  });

  it('does not assume image support when an adapter omits modalities', () => {
    cacheAgentModelCatalog([{ id: 'third-party/text-model' }], 'opencode');
    expect(getCachedAgentModelCatalog('opencode')[0]!.inputModalities).toEqual(['text']);
  });

  it('does not cache models explicitly marked unavailable by an adapter', () => {
    const models = cacheAgentModelCatalog([
      { id: 'ready-model' },
      { id: 'disabled-model', disabled: true },
      { id: 'offline-model', status: 'offline' },
    ], 'opencode');
    expect(models.map(model => model.id)).toEqual(['ready-model']);
  });

  it('orders reversed Grok reasoning metadata from lowest to highest effort', () => {
    const [model] = cacheAgentModelCatalog([{
      id: 'grok-4.6',
      inputModalities: ['text'],
      supportedReasoningEfforts: [
        { reasoningEffort: 'ultra' },
        { reasoningEffort: 'high' },
        { reasoningEffort: 'medium' },
        { reasoningEffort: 'low' },
      ],
    }], 'grok');
    expect(model!.supportedReasoningEfforts.map(item => item.reasoningEffort))
      .toEqual(['low', 'medium', 'high', 'ultra']);
    expect(getCachedAgentModelCatalog('grok')[0]!.supportedReasoningEfforts.map(item => item.reasoningEffort))
      .toEqual(['low', 'medium', 'high', 'ultra']);
  });

  it('filters a large rendered catalog without changing the selected model', () => {
    const host = document.createElement('div'); document.body.append(host);
    localStorage.setItem('labcharts-agent-host-model','openrouter/openai/gpt-5.6-sol');
    mountCliAgentModels(host,{ context:'opencode:local',providerFilter:'openrouter',note:'',loading:'',error:'',pickers:[{
      id:'cli-agent-model',label:'Model',value:'openrouter/openai/gpt-5.6-sol',action:'set-cli-agent-model',searchable:true,
      options:[{ value:'openrouter/openai/gpt-5.6-sol',label:'gpt 5.6 sol' },{ value:'openrouter/anthropic/claude-sonnet',label:'claude sonnet' }],
    }] },() => { throw new Error('Filtering must not select a model'); });
    filterCLIAgentModelOptions('gpt 5.6');
    expect(host.querySelector('[data-value="openrouter/openai/gpt-5.6-sol"]')).not.toBeNull();
    expect(host.querySelector('[data-value="openrouter/anthropic/claude-sonnet"]')).toBeNull();
    expect(localStorage.getItem('labcharts-agent-host-model')).toBe('openrouter/openai/gpt-5.6-sol');
    expect(host.querySelector('#cli-agent-model-summary')!.textContent).toContain('gpt 5.6 sol');
    expect(document.getElementById('cli-agent-model-result-count')!.textContent).toBe('1 model');
  });
});
