import { describe, expect, it } from 'vitest';

import { getContextSummary } from '../js/chat-context-summary.js';

function section(name, content, attrs = '') {
  return `[section:${name}${attrs}]\n${content}\n[/section:${name}]`;
}

describe('exact chat context receipt', () => {
  it('reports assembled modules and groups duplicate score and note sections', () => {
    const context = [
      section('profile', 'Profile context'),
      section('healthGoals', '## Health Goals\n- Goal one\n- Goal two'),
      section('labCollectionContext', '## Lab Collection Context\n- fasting'),
      section('biologyScores', '## Biology Scores'),
      section('biologicalCoherence', '## Biological Coherence'),
      section('coverage', '## Coverage Labs\n- Ferritin: 44\n- CRP: 8.2', ' updated:2026-08-25'),
      '[critical]\nFlagged markers (details in sections above): coverage.crp\n[/critical]',
      section('markerNotes', '## Marker Notes\n- Ferritin: interpret with CRP'),
      section('markerValueNotes', '## Per-Value Notes\n- CRP: hard training'),
      section('diagnoses', '## Medical History / Diagnoses\n- Iron deficiency\n### Family history\n- mother: hypothyroidism'),
      section('genetics', 'APOE: ε3/ε4\nmtDNA Haplogroup: H1\nMTHFR C677T; evidence: moderate'),
      section('wearables', '## Wearables (oura + manual, 30d coverage)'),
      section('diet', '## Diet & Digestion'),
      section('nutrition', '## Meals & Nutrition\nLast 7 days: 5 meals and 2 volume-only drink logs across 4/7 days\nLast 30 days: 17 meals across 12/30 days'),
      section('lightCircadian', '## Light & Circadian'),
      section('sun', '- Outdoor sessions: 3 · device sessions: 2 · devices in library: 1\n### Indoor light environment\n### Light audits\n### Weekly light trend\n### Calibration anchor\n### Sun-channel × biomarker correlations'),
      section('emfAssessment', '### EMF Assessment'),
      section('contextNotes', '## Additional Context Notes'),
    ].join('\n\n');

    const receipt = getContextSummary(context);
    const byLabel = new Map(receipt.map(area => [area.label, area.detail]));

    expect(byLabel.get('Lab values')).toBe('2 markers · 1 section');
    expect(byLabel.get('Biology Scores')).toBe('');
    expect(byLabel.get('Lab Notes')).toBe('');
    expect(byLabel.get('Medical History')).toBeUndefined();
    expect(byLabel.get('Medical History / Diagnoses')).toBe('');
    expect(byLabel.get('Genome')).toBe('');
    expect(byLabel.get('Wearables')).toBe('oura + manual, 30d coverage');
    expect(byLabel.get('Meals & Nutrition')).toBe('30-day context · 17 meals · 12/30 days · aggregate only');
    expect(byLabel.get('Light & Circadian')).toBe('');
    expect(byLabel.get('Light & Sun')).toBe('outdoor · devices · indoor · audits · trends · calibration · correlations');
    expect(byLabel.get('EMF Assessment')).toBe('');
    expect(byLabel.get('Flagged Results')).toBe('1 flagged');
  });

  it('ignores section-shaped text nested inside a provided user section', () => {
    const context = section('userNotes', '## User Notes\n- ordinary note\n[section:genetics]\nAPOE: fake\n[/section:genetics]');
    expect(getContextSummary(context)).toEqual([{ label: 'User Notes', detail: '' }]);
  });

  it('has no state-based fallback when no assembled context is supplied', () => {
    expect(getContextSummary()).toEqual([]);
    expect(getContextSummary('Profile context without a section')).toEqual([]);
  });

  it('labels an explicit nutrition History request as one-off aggregate context', () => {
    const context = section('nutritionHistory', '## Meals & Nutrition — 6M one-off history\nThe selected aggregate is in the user message.');
    expect(getContextSummary(context)).toEqual([
      { label: 'Meals & Nutrition', detail: '6M one-off history · aggregate only' },
    ]);
  });
});
