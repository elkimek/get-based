import { describe, expect, it } from 'vitest';

import { markerRangeSuggestionIssueUrl } from '../js/marker-range-suggestions.js';

describe('marker range GitHub suggestions', () => {
  it('prefills an evidence-oriented issue from public catalog data', () => {
    const issueUrl = new URL(markerRangeSuggestionIssueUrl('hormones.igf1'));
    const body = issueUrl.searchParams.get('body');

    expect(issueUrl.origin).toBe('https://github.com');
    expect(issueUrl.pathname).toBe('/elkimek/get-based/issues/new');
    expect(issueUrl.searchParams.get('title')).toBe('[Marker range] IGF-1: evidence-based update');
    expect(body).toContain('`hormones.igf1`');
    expect(body).toContain('**Default optimal/wellness:** 120 to 160 µg/l');
    expect(body).toContain('age/sex reference rules');
    expect(body).toContain('primary guideline, laboratory method study, cohort, or systematic review');
    expect(body).toContain('Do not include your lab result');
  });

  it.each([
    ['biochemistry.glucose', 'EU', '4.11 to 5.6 mmol/l'],
    ['biochemistry.glucose', 'US', '74.05 to 100.9 mg/dl'],
    ['biochemistry.ast', 'ANZ', '10.2 to 51 U/L'],
    ['diabetes.hba1c', 'US', '4 to 6 %'],
    ['calculatedRatios.atherogenicIndexPlasma', 'US', '– to 0.21'],
    ['calculatedRatios.biologicalAge', 'US', 'Not set'],
  ])('uses the selected units for %s in %s', (key, profile, reference) => {
    const body = new URL(markerRangeSuggestionIssueUrl(key, profile)).searchParams.get('body');
    expect(body).toContain(`**Default reference:** ${reference}\n`);
    expect(body).not.toContain('**Canonical unit:**');
    expect(body).not.toMatch(/NaN|undefined/);
  });

  it('converts female and optimal ranges and labels the proposal unit without changing the catalog', () => {
    const body = new URL(markerRangeSuggestionIssueUrl('biochemistry.creatinine', 'US')).searchParams.get('body');
    expect(body).toContain('**Female reference override:** 0.4976 to 0.9048 mg/dl');
    expect(body).toContain('**Female optimal override:** 0.6447 to 0.9048 mg/dl');
    expect(body).toContain('**Proposed range (mg/dl; specify if using a different unit):**');
    const canonical = new URL(markerRangeSuggestionIssueUrl('biochemistry.creatinine', 'EU')).searchParams.get('body');
    expect(canonical).toContain('**Default reference:** 62 to 106 µmol/l');
  });

  it('does not create reports for custom or unknown marker keys', () => {
    expect(markerRangeSuggestionIssueUrl('custom.marker')).toBeNull();
    expect(markerRangeSuggestionIssueUrl('not-a-dot-key')).toBeNull();
  });

  it.each(['EU', 'US', 'ANZ'])('preserves deliberately unset female wellness ranges in %s', profile => {
    for (const key of ['hormones.shbg', 'hormones.estradiol']) {
      const body = new URL(markerRangeSuggestionIssueUrl(key, profile)).searchParams.get('body');
      expect(body).toContain('**Female optimal override:** Not set\n');
      expect(body).not.toContain('**Default optimal/wellness:** Not set');
    }
    const body = new URL(markerRangeSuggestionIssueUrl('calculatedRatios.apoBapoAIRatio', profile)).searchParams.get('body');
    expect(body).toContain('**Female optimal override:** 0 to 0.5\n');
  });
});
