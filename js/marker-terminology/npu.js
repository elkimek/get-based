// @ts-check
// Reviewed NPU mappings from the official IFCC English database.

const NPU_SOURCE_URL = 'https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv';

export const NPU_TERMINOLOGY_MAPPINGS = [
  {
    markerId: 'gb:marker:glucose',
    terminology: 'npu',
    code: 'NPU02192',
    display: 'Plasma—Glucose; substance concentration = ? millimole per litre',
    status: 'active',
    context: {
      system: 'Plasma',
      component: 'Glucose',
      property: 'substance concentration',
      timeAspect: null,
      scale: 'Ratio',
      method: null,
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: NPU_SOURCE_URL,
      release: '2026-06-30',
      verifiedOn: '2026-08-11',
    },
  },
  {
    markerId: 'gb:marker:sodium',
    terminology: 'npu',
    code: 'NPU03429',
    display: 'Plasma—Sodium ion; substance concentration = ? millimole per litre',
    status: 'active',
    context: {
      system: 'Plasma',
      component: 'Sodium ion',
      property: 'substance concentration',
      timeAspect: null,
      scale: 'Ratio',
      method: null,
    },
    ucumUnits: ['mmol/L'],
    source: {
      url: NPU_SOURCE_URL,
      release: '2026-06-30',
      verifiedOn: '2026-08-11',
    },
  },
];
