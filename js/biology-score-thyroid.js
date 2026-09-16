// @ts-check
// Shared panel contract keeps core coverage, units, dates, and context consistent.
import { computeWeightedComposite } from './biology-score-engine.js';
export function computeThyroidCoherence(data, def, options = {}) {
  return computeWeightedComposite(data, def, options);
}
