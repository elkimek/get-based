import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

// A computation-only caller must never initialize requests, durable AI writes,
// or first-party view delegates as a consequence of importing score functions.
vi.mock('../js/biology-score-ai.js', () => { throw new Error('AI implementation became eager'); });
vi.mock('../js/biology-score-sections.js', () => { throw new Error('AI sections became eager'); });
vi.mock('../js/biology-scores.js', () => { throw new Error('Biology UI facade became eager'); });
vi.mock('../js/biology-score-context-ai.js', () => { throw new Error('Context AI implementation became eager'); });
import { computeBiologyScores, computeBiologyScoreView, getBiologyScoreMapping, getBiologyScoreWidgetDefinitions } from '../js/biology-score-compute.js';
import { state } from '../js/state.js';
import { CONTEXT_REVIEW_RANGES } from '../js/biology-score-context-contract.js';

it('calculates complete ordered score records without loading Biology UI or AI owners', () => {
  const scores = computeBiologyScores({}, { profileContext: { sex: 'male', ageYears: 38 } });
  const definitions = getBiologyScoreMapping();
  expect(scores.map(score => score.id)).toEqual(definitions.map(definition => definition.id));
  expect(scores).toHaveLength(19);
  expect(getBiologyScoreWidgetDefinitions().map(widget => widget.scoreId)).toEqual(scores.map(score => score.id));
  expect(scores[0]!.id).toBe('biologicalCoherence');
  expect(CONTEXT_REVIEW_RANGES).toEqual(['all', '1y', '6m', '3m']);
});

it('restores range state even if an input getter throws during scoring', () => {
  const original = { rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter };
  const fault = new Error('input getter failed');
  const data = { dates: ['2026-10-01'], get categories(): never { throw fault; } };
  expect(() => computeBiologyScoreView(data, { rangeMode: 'reference', dateRangeFilter: '3m' })).toThrow(fault);
  expect({ rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter }).toEqual(original);
});

// Follow authored static edges (including component script imports), never
// dynamic imports or erased type declarations. This protects every main ingress
// rather than merely checking one preferred import spelling.
function staticClosure(entry: string) {
  const result = new Set<string>();
  function visit(file: string) {
    if (result.has(file)) return;
    result.add(file);
    const text = readFileSync(file, 'utf8');
    const imports = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^;'"\n]*(?:\n[^;'"\n]*)*?\s+from\s*)?['"](\.[^'"]+)['"]/g)];
    for (const match of imports) {
      const runtime = path.resolve(path.dirname(file), match[1]!.split('?')[0]!);
      const authored = runtime.replace(/\.svelte\.(?:html|native)\.js$/, '.svelte').replace(/(?<!\.svelte)\.js$/, '.ts');
      if (existsSync(authored)) visit(authored);
    }
  }
  visit(path.resolve(entry));
  return [...result].map(file => path.relative(process.cwd(), file));
}
it('keeps every startup path outside the lazy Biology request and page owners', () => {
  const reachable = staticClosure('js/main.ts');
  for (const lazy of ['js/biology-scores.ts', 'js/biology-score-ai.ts', 'js/biology-score-sections.ts',
    'js/biology-score-context-ai.ts', 'js/biology-page-view.ts', 'js/biology-score-dashboard.ts']) expect(reachable).not.toContain(lazy);
  for (const needed of ['js/biology-score-compute.ts',
    'js/biology-score-navigation.ts', 'js/biology-score-context-contract.ts']) expect(reachable).toContain(needed);
});

it('loads dashboard Biology projections through the real lazy composition without making AI requests eager', () => {
  const startup = staticClosure('js/main.ts');
  expect(startup).toContain('js/dashboard-composition-loader.ts');
  const loader = readFileSync('js/dashboard-composition-loader.ts', 'utf8');
  expect(loader).toContain("import('./dashboard-view-composition.js')");
  const dashboard = staticClosure('js/dashboard-view-composition.ts');
  for (const needed of ['js/biology-score-dashboard.ts', 'js/biology-score-compute.ts']) expect(dashboard).toContain(needed);
  for (const lazy of ['js/biology-score-ai.ts', 'js/biology-score-sections.ts', 'js/biology-score-context-ai.ts', 'js/biology-page-view.ts']) expect(dashboard).not.toContain(lazy);
});
