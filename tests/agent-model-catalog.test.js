// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { cacheAgentModelCatalog, getCachedAgentModelCatalog } from '../js/agent-model-catalog.js';
import { filterCLIAgentModelOptions } from '../js/settings-cli-agent-panel.js';

describe('CLI agent model catalog cache', () => {
  beforeEach(() => localStorage.clear());

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

  it('filters a large rendered catalog without changing the selected model', () => {
    document.body.innerHTML = `<div id="cli-agent-model-options">
      <span id="cli-agent-model-result-count"></span>
      <button data-model-search="gpt 5.6 sol openrouter/openai/gpt-5.6-sol"></button>
      <button data-model-search="claude sonnet openrouter/anthropic/claude-sonnet"></button>
    </div>`;
    filterCLIAgentModelOptions('gpt 5.6');
    const options = [...document.querySelectorAll('[data-model-search]')];
    expect(options[0].hasAttribute('hidden')).toBe(false);
    expect(options[1].hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('cli-agent-model-result-count').textContent).toBe('1 model');
  });
});
