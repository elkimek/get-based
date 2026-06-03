// marker-crosswalk.js — getbased marker ↔ external lab terminology mappings.
// Keep this separate from MARKER_SCHEMA. MARKER_SCHEMA is the app ontology;
// this file is the expandable international terminology crosswalk.

import { LAB_STANDARDS, MAPPING_RELATIONS } from './standards-types.js';

function nclp(code, opts = {}) {
  return {
    standard: LAB_STANDARDS.NCLP,
    code,
    relation: opts.relation || MAPPING_RELATIONS.EXACT,
    system: opts.system || null,
    unit: opts.unit || null,
    procedure: opts.procedure || null,
    evidence: opts.evidence || 'public_nclp_catalog',
    useFor: opts.useFor || ['semantic_resolution', 'provider_mapping_if_available'],
    notExpectedOnReports: opts.notExpectedOnReports ?? true,
    note: opts.note || '',
  };
}

export const LAB_MARKER_CROSSWALK = Object.freeze({
  'coagulation.homocysteine': {
    markerKey: 'coagulation.homocysteine',
    canonicalName: 'Homocysteine',
    aliases: ['homocysteine', 'homocystein', 'hcy'],
    countryDefaults: { CZ: { preferredStandard: LAB_STANDARDS.NCLP, preferredSpecimen: ['P', 'S'] } },
    externalIds: {
      nclp: [
        nclp('02073', { system: 'P', unit: 'µmol/l', procedure: '*' }),
        nclp('02079', { system: 'S', unit: 'µmol/l', procedure: '*' }),
        nclp('19615', { system: 'P', unit: 'µmol/l', procedure: 'IA' }),
        nclp('19616', { system: 'S', unit: 'µmol/l', procedure: 'IA' }),
      ],
      loinc: [],
    },
  },
  'vitamins.folate': {
    markerKey: 'vitamins.folate',
    canonicalName: 'Folate',
    aliases: ['folate', 'folát', 'folat', 'kyselina listová', 'kyselina listova'],
    countryDefaults: { CZ: { preferredStandard: LAB_STANDARDS.NCLP, preferredSpecimen: ['B', 'P', 'S'] } },
    externalIds: {
      nclp: [
        nclp('07322', { system: 'B', unit: 'nmol/l', procedure: '*' }),
        nclp('19584', { system: 'B', unit: 'nmol/l', procedure: 'IA' }),
        nclp('03710', { system: 'P', unit: 'µg/l', procedure: '*' }),
        nclp('06971', { system: 'ERC(ICF)', unit: 'µmol/l', procedure: '*', note: 'RBC/intracellular erythrocyte folate candidate, not interchangeable with serum/plasma folate.' }),
      ],
      loinc: [],
    },
  },
  'vitamins.vitaminB12': {
    markerKey: 'vitamins.vitaminB12',
    canonicalName: 'Vitamin B12',
    aliases: ['vitamin b12', 'b12', 'cobalamin', 'kobalamin'],
    countryDefaults: { CZ: { preferredStandard: LAB_STANDARDS.NCLP, preferredSpecimen: ['S', 'P'] } },
    externalIds: {
      // Public NČLP search surfaced active B12/holotranscobalamin reliably.
      // Total B12 needs a separate confirmed code before marking exact.
      nclp: [
        nclp('15188', { relation: MAPPING_RELATIONS.NARROWER, system: 'P', unit: 'pmol/l', procedure: '*', note: 'Holotranscobalamin / active B12, narrower than total B12.' }),
        nclp('15190', { relation: MAPPING_RELATIONS.NARROWER, system: 'S', unit: 'pmol/l', procedure: '*', note: 'Holotranscobalamin / active B12, narrower than total B12.' }),
      ],
      loinc: [],
    },
  },
  'vitamins.holotranscobalamin': {
    markerKey: 'vitamins.holotranscobalamin',
    canonicalName: 'Holotranscobalamin / active B12',
    aliases: ['holotranscobalamin', 'holotranskobalamin', 'active b12', 'holo tc', 'holotc'],
    countryDefaults: { CZ: { preferredStandard: LAB_STANDARDS.NCLP, preferredSpecimen: ['P', 'S'] } },
    externalIds: {
      nclp: [
        nclp('15188', { system: 'P', unit: 'pmol/l', procedure: '*' }),
        nclp('15190', { system: 'S', unit: 'pmol/l', procedure: '*' }),
        nclp('18767', { system: 'P', unit: 'pmol/l', procedure: 'CMIA' }),
        nclp('17344', { system: 'S', unit: 'pmol/l', procedure: 'CMIA' }),
      ],
      loinc: [],
    },
  },
});

function normalizeTerm(term) {
  return String(term || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function getMarkerCrosswalk(markerKey) {
  return LAB_MARKER_CROSSWALK[markerKey] || null;
}

export function getExternalIdsForMarker(markerKey, standard) {
  const row = getMarkerCrosswalk(markerKey);
  if (!row) return [];
  if (!standard) return Object.values(row.externalIds || {}).flat();
  return row.externalIds?.[String(standard).toLowerCase()] || [];
}

export function resolveMarkerAliases(query) {
  const normalized = normalizeTerm(query);
  if (!normalized) return [];
  const matches = [];
  for (const [markerKey, row] of Object.entries(LAB_MARKER_CROSSWALK)) {
    const terms = [row.markerKey, row.canonicalName, ...(row.aliases || [])].map(normalizeTerm);
    if (terms.some((term) => {
      if (!term) return false;
      if (term === normalized) return true;
      // Avoid a short token like "b12" pulling in "active b12". Full-text
      // containment is useful for phrases, not for tiny ambiguous tokens.
      if (normalized.length < 4) return false;
      return normalized.includes(term) || term.includes(normalized);
    })) {
      matches.push(markerKey);
    }
  }
  return matches;
}
