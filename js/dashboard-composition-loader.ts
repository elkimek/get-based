import {createRetryingModuleLoader} from './retrying-module-loader.js';

type CompositionModule = typeof import('./dashboard-view-composition.js');
type LensModule = typeof import('./lens-pages.js');
type RecommendationModule = typeof import('./recommendation-actions.js');

export function createDashboardCompositionLoader(request: (retry: boolean) => Promise<CompositionModule> = retry => retry
  ? import('./dashboard-view-composition.js?lazy-retry=1' as './dashboard-view-composition.js')
  : import('./dashboard-view-composition.js')) {
  const cache = createRetryingModuleLoader(request);
  return {getLoaded: () => cache.module, load: () => cache.load()};
}
export function createDashboardLensLoader(request: (retry: boolean) => Promise<LensModule> = retry => retry
  ? import('./lens-pages.js?lazy-retry=1' as './lens-pages.js')
  : import('./lens-pages.js')) {
  const cache = createRetryingModuleLoader(request);
  return {getLoaded: () => cache.module, load: () => cache.load()};
}
export function createDashboardRecommendationLoader(request: (retry: boolean) => Promise<RecommendationModule> = retry => retry
  ? import('./recommendation-actions.js?lazy-retry=1' as './recommendation-actions.js')
  : import('./recommendation-actions.js')) {
  const cache = createRetryingModuleLoader(request);
  return {getLoaded: () => cache.module, load: () => cache.load()};
}
const composition = createDashboardCompositionLoader();
const lens = createDashboardLensLoader();
const recommendations = createDashboardRecommendationLoader();
export const loadDashboardComposition = composition.load;
export const loadDashboardLens = lens.load;
export const loadDashboardRecommendations = recommendations.load;

/** Module loading is shared; each caller retains its own publication authority. */
export function createOwnedCompositionGate<Module, Instance>(
  load: () => Promise<Module>, create: (module: Module) => Instance,
  publish: (instance: Instance) => void = () => {},
) {
  let instance: Instance | undefined;
  let published = false;
  const commit = (isCurrent: () => boolean) => {
    if (!isCurrent() || instance === undefined) return undefined;
    if (!published) {
      publish(instance);
      published = true;
    }
    return instance;
  };
  return {
    getResident: () => instance,
    async prepare(isCurrent: () => boolean): Promise<Instance | undefined> {
      if (!isCurrent()) return undefined;
      if (instance !== undefined) return commit(isCurrent);
      const module = await load();
      if (!isCurrent()) return undefined;
      // Retain the one constructed controls/registry instance even if an owner
      // retires synchronously during construction. Only a current caller can
      // publish it, and retry cannot install a second delegate closure set.
      if (instance === undefined) instance = create(module);
      return commit(isCurrent);
    },
  };
}
