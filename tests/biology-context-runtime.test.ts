import { expect, it, vi } from 'vitest';
vi.mock('../js/biology-score-context-ai.js', () => { throw new Error('Context review implementation loaded eagerly'); });
import { biologyScoreContextAIDeps, configureBiologyScoreContextAIDeps } from '../js/biology-score-context-runtime.js';

type Updates = Parameters<typeof configureBiologyScoreContextAIDeps>[0];
it('keeps pre-load configuration and returns the exact previous callback bindings', () => {
  const original = { ...biologyScoreContextAIDeps };
  const navigate = vi.fn(); const hasAIProvider = () => true; const isAIPaused = () => true;
  const callClaudeAPI = async () => { throw new Error('not called'); };
  const previous = configureBiologyScoreContextAIDeps({ navigate, hasAIProvider, isAIPaused, callClaudeAPI });
  try {
    expect(previous).toEqual(original);
    expect(biologyScoreContextAIDeps).toEqual({ navigate, hasAIProvider, isAIPaused, callClaudeAPI });
    biologyScoreContextAIDeps.navigate?.('biology-scores');
    expect(navigate).toHaveBeenCalledExactlyOnceWith('biology-scores');
  } finally { configureBiologyScoreContextAIDeps(previous); }
});

it('retains omitted or invalid callable overrides and clears only explicit null navigation', () => {
  const previous = configureBiologyScoreContextAIDeps({ navigate: () => {} });
  try {
    const before = { ...biologyScoreContextAIDeps };
    // Exercise JavaScript compatibility values beyond the typed caller contract.
    configureBiologyScoreContextAIDeps({ callClaudeAPI: null, hasAIProvider: false, isAIPaused: 'invalid', navigate: false } as unknown as Updates);
    expect(biologyScoreContextAIDeps).toEqual(before);
    configureBiologyScoreContextAIDeps({ navigate: null });
    expect(biologyScoreContextAIDeps.navigate).toBeNull();
    expect(biologyScoreContextAIDeps.callClaudeAPI).toBe(before.callClaudeAPI);
  } finally { configureBiologyScoreContextAIDeps(previous); }
});

it('preserves inherited callable configuration but ignores inherited navigation', () => {
  const previous = { ...biologyScoreContextAIDeps };
  const inherited = { hasAIProvider: () => true, isAIPaused: () => true, navigate: () => {} };
  try {
    configureBiologyScoreContextAIDeps(Object.create(inherited) as Updates);
    expect(biologyScoreContextAIDeps.hasAIProvider).toBe(inherited.hasAIProvider);
    expect(biologyScoreContextAIDeps.isAIPaused).toBe(inherited.isAIPaused);
    expect(biologyScoreContextAIDeps.navigate).toBe(previous.navigate);
  } finally { configureBiologyScoreContextAIDeps(previous); }
});
