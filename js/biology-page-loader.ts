import { createRetryingModuleLoader } from './retrying-module-loader.js';
// One first-use cache with fixed retry URLs; callers own profile/route publication.
type BiologyPageModule = typeof import('./biology-page-view.js');

export function createBiologyPageLoader(request: (retry: boolean) => Promise<BiologyPageModule> = retry => retry
  ? import('./biology-page-view.js?lazy-retry=1' as './biology-page-view.js')
  : import('./biology-page-view.js')) {
  const cache = createRetryingModuleLoader(request);
  return { getLoaded: () => cache.module, load: () => cache.load() };
}

const biologyPageLoader = createBiologyPageLoader();
export const getLoadedBiologyPage = biologyPageLoader.getLoaded;
export const loadBiologyPage = biologyPageLoader.load;
