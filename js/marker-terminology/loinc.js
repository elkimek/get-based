// @ts-check
// Reviewed LOINC mappings. Keep the native six-part term context explicit.

export const LOINC_TERMINOLOGY_MAPPINGS = [
  {
    markerId: 'gb:marker:glucose',
    terminology: 'loinc',
    code: '14749-6',
    display: 'Glucose [Moles/volume] in Serum or Plasma',
    status: 'active',
    context: {
      system: 'Ser/Plas',
      component: 'Glucose',
      property: 'SCnc',
      timeAspect: 'Pt',
      scale: 'Qn',
      method: null,
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: 'https://loinc.org/14749-6',
      release: '2.82',
      verifiedOn: '2026-08-11',
    },
  },
  {
    markerId: 'gb:marker:sodium',
    terminology: 'loinc',
    code: '2951-2',
    display: 'Sodium [Moles/volume] in Serum or Plasma',
    status: 'active',
    context: {
      system: 'Ser/Plas',
      component: 'Sodium',
      property: 'SCnc',
      timeAspect: 'Pt',
      scale: 'Qn',
      method: null,
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: 'https://loinc.org/2951-2',
      release: '2.82',
      verifiedOn: '2026-08-11',
    },
  },
];
