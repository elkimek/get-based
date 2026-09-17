// @ts-check
// Public, privacy-safe GitHub range suggestion links for built-in markers.

import {
  CONTEXT_OPTIMAL_RANGES,
  CONTEXT_REFERENCE_RANGES,
  MARKER_SCHEMA,
  OPTIMAL_RANGES,
} from './schema.js';
import { convertCanonicalToDisplay, getUnitProfileLabel, resolveMarkerUnitProfile } from './unit-profiles.js';

function formatRange(min, max, unit) {
  if (min == null && max == null) return 'Not set';
  return `${min ?? '–'} to ${max ?? '–'}${unit ? ` ${unit}` : ''}`;
}

/**
 * Build a public issue from catalog data only. The current user's result,
 * profile, age, sex, lab, dates, and imported ranges are never included.
 * @param {string} dotKey
 * @param {string} [unitProfile]
 * @returns {string | null}
 */
export function markerRangeSuggestionIssueUrl(dotKey, unitProfile = 'EU') {
  if (typeof dotKey !== 'string') return null;
  const separator = dotKey.indexOf('.');
  if (separator <= 0) return null;
  const categoryKey = dotKey.slice(0, separator);
  const markerKey = dotKey.slice(separator + 1);
  const marker = MARKER_SCHEMA[categoryKey]?.markers?.[markerKey];
  if (!marker) return null;

  const { unit } = resolveMarkerUnitProfile(dotKey, unitProfile, marker.unit);
  const displayRange = (min, max) => {
    const convert = value => {
      const converted = convertCanonicalToDisplay(dotKey, value, unitProfile, marker.unit);
      return converted == null ? converted : Number(converted.toPrecision(4));
    };
    return formatRange(convert(min), convert(max), unit);
  };
  const optimal = OPTIMAL_RANGES[dotKey] || {};
  const femaleReference = marker.refMin_f !== undefined || marker.refMax_f !== undefined
    ? displayRange(marker.refMin_f !== undefined ? marker.refMin_f : marker.refMin, marker.refMax_f !== undefined ? marker.refMax_f : marker.refMax)
    : 'Same as default / not separately set';
  const femaleOptimal = optimal.optimalMin_f !== undefined || optimal.optimalMax_f !== undefined
    ? displayRange(optimal.optimalMin_f !== undefined ? optimal.optimalMin_f : optimal.optimalMin, optimal.optimalMax_f !== undefined ? optimal.optimalMax_f : optimal.optimalMax)
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
    'Current catalog ranges for reference. Describe your change in the proposal below; leave this section unchanged.',
    '',
    `**Marker:** ${marker.name}`,
    `**Catalog key:** \`${dotKey}\``,
    `**Unit system:** ${getUnitProfileLabel(unitProfile)}`,
    `**Display unit:** ${unit || 'Unitless'}`,
    `**Range policy:** ${marker.rangePolicy || 'reference'}`,
    `**Default reference:** ${displayRange(marker.refMin, marker.refMax)}`,
    `**Female reference override:** ${femaleReference}`,
    `**Default optimal/wellness:** ${displayRange(optimal.optimalMin, optimal.optimalMax)}`,
    `**Female optimal override:** ${femaleOptimal}`,
    `**Context-aware support:** ${contextSupport}`,
    '',
    '## Proposed change',
    '',
    'Fill this section before submitting so we can understand and evaluate the change.',
    '',
    `**Proposed range (${unit || 'unitless'}; specify if using a different unit):**`,
    '',
    '**Reference, optimal/wellness, or contextual guidance:**',
    '',
    '**Population:** (age, sex, pregnancy/menopause/cycle status if relevant)',
    '',
    '**Specimen, assay, fasting status, and collection time:**',
    '',
    '## Evidence',
    '',
    '**Source or link (for example, a primary guideline, laboratory method study, cohort, or systematic review):**',
    '',
    '**Why this evidence matches the proposed population and use:**',
    '',
    '**Important limitations or contexts where the range should not apply:**',
    '',
    'This is a public GitHub issue. Do not include your lab result, age/date of birth, sex, diagnoses, laboratory name, report, account details, or any other personal health information.',
  ].join('\n');
  const issueUrl = new URL('https://github.com/elkimek/get-based/issues/new');
  issueUrl.searchParams.set('title', `[Marker range] ${marker.name}: evidence-based update`);
  issueUrl.searchParams.set('body', body);
  issueUrl.searchParams.set('labels', 'enhancement');
  return issueUrl.toString();
}
