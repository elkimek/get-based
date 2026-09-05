import { describe, expect, it } from 'vitest';

import {
  getAIOutputAttribution,
} from '../js/cli-agent-brand-assets.js';

describe('AI output attribution', () => {
  it('recognizes Grok CLI and Grok models reached through another provider', () => {
    expect(getAIOutputAttribution({ agentId: 'grok', modelId: 'default' })).toBe('Written with Grok');
    expect(getAIOutputAttribution({ provider: 'openrouter', modelId: 'x-ai/grok-4.1-fast' })).toBe('Written with Grok');
    expect(getAIOutputAttribution({ provider: 'routstr', modelDisplay: 'Grok 4' })).toBe('Written with Grok');
    expect(getAIOutputAttribution({ agentId: 'grok' })).toBe('Written with Grok');
  });

  it('does not attribute unrelated providers or similarly spelled words', () => {
    expect(getAIOutputAttribution({ agentId: 'codex', modelId: 'gpt-5.6-sol' })).toBe('');
    expect(getAIOutputAttribution({ provider: 'custom', modelDisplay: 'Grokking Health' })).toBe('');
    expect(getAIOutputAttribution({ provider: 'venice', modelId: 'llama-3.3' })).toBe('');
  });
});
