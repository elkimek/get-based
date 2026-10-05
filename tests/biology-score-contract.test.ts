import { describe, expect, it } from 'vitest';
import { getScoreInputs } from '../js/biology-score-contract.js';
import { TIER2_BIOLOGY_SCORE_DEFINITIONS } from '../js/biology-score-tier2-definitions.js';

describe('built-in score panel routes', () => {
  it.each([
    ['cellularEnergyCoherence', ['lactate', 'pyruvate', 'bloodLactate', 'bloodPyruvate']],
    ['gutImmuneSignal', ['calprotectin', 'arabinose', 'hphpa']],
  ] as const)('%s supplies every route input exactly once', (id, routeKeys) => {
    const definition = TIER2_BIOLOGY_SCORE_DEFINITIONS.find(score => score.id === id);
    if (!definition) throw new Error(`Missing score definition: ${id}`);
    const inputs = getScoreInputs(definition);
    for (const key of routeKeys) expect(inputs.filter(input => input.key === key)).toHaveLength(1);
  });
});
