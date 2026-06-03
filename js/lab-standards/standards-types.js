// standards-types.js — shared constants for external lab terminology layers.

export const LAB_STANDARDS = Object.freeze({
  NCLP: 'NCLP',
  LOINC: 'LOINC',
});

export const MAPPING_RELATIONS = Object.freeze({
  EXACT: 'exact',
  BROADER: 'broader',
  NARROWER: 'narrower',
  PANEL_CONTAINS: 'panel_contains',
  APPROXIMATE: 'approximate',
  NOT_EQUIVALENT: 'not_equivalent',
});

export const COVERAGE = Object.freeze({
  EXACT: 'exact',
  PANEL_CONTAINS: 'panel_contains',
  APPROXIMATE: 'approximate',
  REQUIRES_MANUAL_REVIEW: 'requires_manual_review',
  REQUEST_REQUIRED: 'request_required',
  UNAVAILABLE: 'unavailable',
});
