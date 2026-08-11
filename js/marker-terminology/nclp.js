// @ts-check
// Reviewed NČLP mappings from the official Czech DASTA catalog.

const NCLP_SOURCE_URL = 'https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml';

export const NCLP_TERMINOLOGY_MAPPINGS = [
  {
    markerId: 'gb:marker:glucose',
    terminology: 'nclp',
    code: '01896',
    display: 'Glukóza (P; látková konc. [mmol/l] *)',
    status: 'active',
    context: {
      system: 'P',
      component: 'Glukóza',
      property: 'látková konc.',
      timeAspect: null,
      scale: null,
      method: '*',
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: NCLP_SOURCE_URL,
      release: '02.99.01 / 202630',
      verifiedOn: '2026-08-11',
    },
  },
  {
    markerId: 'gb:marker:glucose',
    terminology: 'nclp',
    code: '01898',
    display: 'Glukóza (S; látková konc. [mmol/l] *)',
    status: 'active',
    context: {
      system: 'S',
      component: 'Glukóza',
      property: 'látková konc.',
      timeAspect: null,
      scale: null,
      method: '*',
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: NCLP_SOURCE_URL,
      release: '02.99.01 / 202630',
      verifiedOn: '2026-08-11',
    },
  },
  {
    markerId: 'gb:marker:sodium',
    terminology: 'nclp',
    code: '02500',
    display: 'Na (P; látková konc. [mmol/l] *)',
    status: 'active',
    context: {
      system: 'P',
      component: 'Na',
      property: 'látková konc.',
      timeAspect: null,
      scale: null,
      method: '*',
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: NCLP_SOURCE_URL,
      release: '02.99.01 / 202630',
      verifiedOn: '2026-08-11',
    },
  },
  {
    markerId: 'gb:marker:sodium',
    terminology: 'nclp',
    code: '02503',
    display: 'Na (S; látková konc. [mmol/l] *)',
    status: 'active',
    context: {
      system: 'S',
      component: 'Na',
      property: 'látková konc.',
      timeAspect: null,
      scale: null,
      method: '*',
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: NCLP_SOURCE_URL,
      release: '02.99.01 / 202630',
      verifiedOn: '2026-08-11',
    },
  },
];
