// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizeACPModelCatalog } from '../lib/acp-agent-client.js';

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
});
