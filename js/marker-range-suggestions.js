// @ts-check
// Public, privacy-safe GitHub range suggestion links for built-in markers.

import {
  CONTEXT_OPTIMAL_RANGES,
  CONTEXT_REFERENCE_RANGES,
  MARKER_SCHEMA,
  OPTIMAL_RANGES,
} from './schema.js';

function formatRange(min, max, unit) {
  if (min == null && max == null) return 'Not set';
  return `${min ?? '–'} to ${max ?? '–'}${unit ? ` ${unit}` : ''}`;
}

/**
 * Build a public issue from catalog data only. The current user's result,
 * profile, age, sex, lab, dates, and imported ranges are never included.
 * @param {string} dotKey
 * @returns {string | null}
 */
export function markerRangeSuggestionIssueUrl(dotKey) {
  if (typeof dotKey !== 'string') return null;
  const separator = dotKey.indexOf('.');
  if (separator <= 0) return null;
  const categoryKey = dotKey.slice(0, separator);
  const markerKey = dotKey.slice(separator + 1);
  const marker = MARKER_SCHEMA[categoryKey]?.markers?.[markerKey];
  if (!marker) return null;

  const unit = marker.unit || '';
  const optimal = OPTIMAL_RANGES[dotKey] || {};
  const femaleReference = marker.refMin_f !== undefined || marker.refMax_f !== undefined
    ? formatRange(marker.refMin_f ?? marker.refMin, marker.refMax_f ?? marker.refMax, unit)
    : 'Same as default / not separately set';
  const femaleOptimal = optimal.optimalMin_f !== undefined || optimal.optimalMax_f !== undefined
    ? formatRange(optimal.optimalMin_f, optimal.optimalMax_f, unit)
    : 'Same as default / not separately set';
  const contextSupport = [
    CONTEXT_REFERENCE_RANGES[dotKey] ? 'age/sex reference rules' : null,
    CONTEXT_OPTIMAL_RANGES[dotKey] ? 'age/sex optimal guidance' : null,
    dotKey === 'hormones.cortisol' ? 'collection-time reference rules' : null,
    dotKey === 'electrolytes.zinc' ? 'collection-time/fasting adequacy guidance' : null,
    dotKey === 'calculatedRatios.tygIndex' ? 'fasting validity gate' : null,
  ].filter(Boolean).join(', ') || 'None';

  const body = [
    '## Built-in marker',
    '',
    `**Marker:** ${marker.name}`,
    `**Catalog key:** \`${dotKey}\``,
    `**Canonical unit:** ${unit || 'Unitless'}`,
    `**Range policy:** ${marker.rangePolicy || 'reference'}`,
    `**Default reference:** ${formatRange(marker.refMin, marker.refMax, unit)}`,
    `**Female reference override:** ${femaleReference}`,
    `**Default optimal/wellness:** ${formatRange(optimal.optimalMin, optimal.optimalMax, unit)}`,
    `**Female optimal override:** ${femaleOptimal}`,
    `**Context-aware support:** ${contextSupport}`,
    '',
    '## Proposed change',
    '',
    '**Proposed range and unit:**',
    '',
    '**Reference, optimal/wellness, or contextual guidance:**',
    '',
    '**Population:** (age, sex, pregnancy/menopause/cycle status if relevant)',
    '',
    '**Specimen, assay, fasting status, and collection time:**',
    '',
    '## Evidence',
    '',
    '**Primary guideline, laboratory method study, cohort, or systematic review:**',
    '',
    '**Why this evidence matches the proposed population and use:**',
    '',
    '**Important limitations or contexts where the range should not apply:**',
    '',
    '<!-- This is a public GitHub issue. Do not include your lab result, age/date of birth, sex, diagnoses, laboratory name, report, account details, or any other personal health information. -->',
  ].join('\n');
  const issueUrl = new URL('https://github.com/elkimek/get-based/issues/new');
  issueUrl.searchParams.set('title', `[Marker range] ${marker.name}: evidence-based update`);
  issueUrl.searchParams.set('body', body);
  return issueUrl.toString();
}
