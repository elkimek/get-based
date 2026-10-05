import { describe, expect, it } from 'vitest';

import {
  getAIOutputAttribution,
} from '../js/cli-agent-brand-assets.js';

describe('AI output attribution', () => {
  it('excludes error records but retains stopped and truncated model output', () => {
    for (const provider of ['openrouter', 'grok']) {
      expect(getAIOutputAttribution({ provider, error: true })).toBe('');
      const label = provider === 'grok' ? 'Written with Grok' : 'AI-generated';
      expect(getAIOutputAttribution({ provider, stopped: true })).toBe(label);
      expect(getAIOutputAttribution({ provider, truncated: true })).toBe(label);
    }
  });

  it('recognizes Grok CLI and Grok models reached through another provider', () => {
    expect(getAIOutputAttribution({ agentId: 'grok', modelId: 'default' })).toBe('Written with Grok');
    expect(getAIOutputAttribution({ provider: 'openrouter', modelId: 'x-ai/grok-4.1-fast' })).toBe('Written with Grok');
    expect(getAIOutputAttribution({ provider: 'routstr', modelDisplay: 'Grok 4' })).toBe('Written with Grok');
    expect(getAIOutputAttribution({ agentId: 'grok' })).toBe('Written with Grok');
  });

  it('labels other AI output without inventing a provider identity', () => {
    expect(getAIOutputAttribution({ agentId: 'codex', modelId: 'gpt-5.6-sol' })).toBe('AI-generated');
    expect(getAIOutputAttribution({ provider: 'custom', modelDisplay: 'Grokking Health' })).toBe('AI-generated');
    expect(getAIOutputAttribution({ provider: 'venice', modelId: 'llama-3.3' })).toBe('AI-generated');
    expect(getAIOutputAttribution({ provider: 'phala', modelId: 'z-ai/glm-5.3-flash' })).toBe('AI-generated');
    expect(getAIOutputAttribution({ provider: 'near-ai' })).toBe('AI-generated');
    expect(getAIOutputAttribution({})).toBe('AI-generated');
    expect(getAIOutputAttribution({ modelDisplay: '<script>untrusted</script>' })).toBe('AI-generated');
  });
});
