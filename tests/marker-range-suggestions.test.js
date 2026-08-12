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
    expect(body).toContain('Primary guideline, laboratory method study, cohort, or systematic review');
    expect(body).toContain('Do not include your lab result');
  });

  it('does not create reports for custom or unknown marker keys', () => {
    expect(markerRangeSuggestionIssueUrl('custom.marker')).toBeNull();
    expect(markerRangeSuggestionIssueUrl('not-a-dot-key')).toBeNull();
  });
});
