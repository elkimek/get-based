// nclp-resolver.js — normalize and rank Czech NČLP candidates.

import { getExternalIdsForMarker } from './marker-crosswalk.js';
import { LAB_STANDARDS } from './standards-types.js';

function nestedName(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.name || value.label || value.localName || '';
  return '';
}

function nestedCode(value) {
  if (value && typeof value === 'object') return value.code || value.symbol || null;
  return null;
}

export function normalizeNclpSearchItem(item) {
  const component = item?.component || null;
  const system = item?.system || null;
  const procedure = item?.procedure || null;
  const unit = item?.unit || null;
  return {
    country: 'CZ',
    standard: LAB_STANDARDS.NCLP,
    code: String(item?.code || ''),
    uuid: item?.id || '',
    name: item?.name || item?.label || '',
    component: {
      symbol: nestedCode(component) || item?.componentSymbol || null,
      name: nestedName(component) || item?.componentName || '',
    },
    system: {
      code: nestedCode(system) || item?.systemCode || null,
      name: nestedName(system) || item?.system || '',
    },
    unit: nestedName(unit) || item?.unit || '',
    procedure: {
      code: nestedCode(procedure) || item?.procedureCode || null,
      name: nestedName(procedure) || item?.procedure || '',
    },
    validity: item?.upToDateness || item?.validity || null,
    raw: item,
  };
}

export function pickPreferredNclpCandidates(markerKey, candidates) {
  const crosswalkIds = getExternalIdsForMarker(markerKey, LAB_STANDARDS.NCLP);
  const preferredCodes = new Map(crosswalkIds.map((id, index) => [String(id.code), { id, index }]));
  return [...(candidates || [])]
    .filter(Boolean)
    .map((candidate) => {
      const preferred = preferredCodes.get(String(candidate.code));
      const score = preferred
        ? 100 - preferred.index
        : candidate.validity === 'Valid'
          ? 25
          : 10;
      return {
        ...candidate,
        score,
        matchedBy: preferred ? 'crosswalk' : 'search',
        relation: preferred?.id?.relation || 'unknown',
      };
    })
    .sort((a, b) => b.score - a.score || String(a.code).localeCompare(String(b.code)));
}
