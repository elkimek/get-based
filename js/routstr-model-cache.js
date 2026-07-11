// @ts-check
// routstr-model-cache.js - Clear node-scoped Routstr catalog and selection state.

const ROUTSTR_MODEL_CACHE_KEYS = [
  'labcharts-routstr-model',
  'labcharts-routstr-models',
  'labcharts-routstr-private-models',
  'labcharts-routstr-model-regular',
  'labcharts-routstr-model-private',
  'labcharts-routstr-pricing',
  'labcharts-routstr-vision-models',
];

export function clearRoutstrModelCaches() {
  for (const key of ROUTSTR_MODEL_CACHE_KEYS) localStorage.removeItem(key);
  import('./tinfoil-secure-fetch.js').then(module => module.clearTinfoilSecureFetchCache()).catch(() => {});
}
