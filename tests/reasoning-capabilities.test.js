import { describe, expect, it } from 'vitest';
import {
  extractModelReasoningMetadata,
  getModelReasoningCapabilities,
} from '../js/reasoning-capabilities.js';

describe('direct and local model reasoning capabilities', () => {
  it('uses exact OpenRouter effort metadata and respects mandatory reasoning', () => {
    expect(getModelReasoningCapabilities('openrouter', {
      id: 'google/gemini-thinking',
      reasoning: {
        supported_efforts: ['high', 'medium', 'low', 'minimal', 'none'],
        default_effort: 'medium',
        mandatory: true,
      },
    })).toEqual({ efforts: ['high', 'medium', 'low', 'minimal'], defaultEffort: 'medium' });
  });

  it('expands OpenRouter null effort metadata to the documented gateway scale', () => {
    expect(getModelReasoningCapabilities('openrouter', {
      id: 'openai/gpt-reasoner',
      reasoning: { supported_efforts: null, default_effort: 'high' },
    })).toEqual({
      efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'high',
    });
    expect(getModelReasoningCapabilities('openrouter', {
      id: 'openai/reasoner', supported_parameters: ['reasoning'],
    }).efforts).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('recognizes Venice capability flags and generic supported parameters', () => {
    expect(getModelReasoningCapabilities('venice', {
      id: 'qwen-thinking',
      model_spec: { capabilities: { supportsReasoning: true, supportsReasoningEffort: true } },
    }).efforts).toEqual(['low', 'medium', 'high']);
    expect(getModelReasoningCapabilities('venice', {
      id: 'glm-fixed',
      model_spec: { capabilities: { supportsReasoning: true, supportsReasoningEffort: false } },
    }).efforts).toEqual([]);
    expect(getModelReasoningCapabilities('custom', {
      id: 'compatible-reasoner', supported_parameters: ['tools', 'reasoning_effort'],
    }).efforts).toEqual(['low', 'medium', 'high']);
  });

  it('normalizes native off/on metadata and known GPT-OSS catalogs', () => {
    expect(extractModelReasoningMetadata({
      id: 'local-thinking', capabilities: { reasoning: { allowed_options: ['off', 'on'], default: 'on' } },
    })).toEqual({ allowedOptions: ['none', 'on'], default: 'on', mandatory: false });
    expect(extractModelReasoningMetadata({ id: 'openai/gpt-oss-20b' })).toEqual({
      allowedOptions: ['low', 'medium', 'high'], default: null, mandatory: false,
    });
    expect(getModelReasoningCapabilities('custom', { id: 'ordinary-model' }).efforts).toEqual([]);
  });
});
