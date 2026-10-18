import {createRetryingModuleLoader} from './retrying-module-loader.js';

type DesktopRenderer = typeof import('./desktop-dashboard-renderer.js');
type MobileRenderer = typeof import('./mobile-dashboard-renderer.js');

export function createDesktopDashboardRendererLoader(request: (retry: boolean) => Promise<DesktopRenderer> = retry => retry
  ? import('./desktop-dashboard-renderer.js?lazy-retry=1' as './desktop-dashboard-renderer.js')
  : import('./desktop-dashboard-renderer.js')) {
  const cache = createRetryingModuleLoader(request);
  return {getLoaded: () => cache.module, load: () => cache.load()};
}
export function createMobileDashboardRendererLoader(request: (retry: boolean) => Promise<MobileRenderer> = retry => retry
  ? import('./mobile-dashboard-renderer.js?lazy-retry=1' as './mobile-dashboard-renderer.js')
  : import('./mobile-dashboard-renderer.js')) {
  const cache = createRetryingModuleLoader(request);
  return {getLoaded: () => cache.module, load: () => cache.load()};
}
const desktop = createDesktopDashboardRendererLoader();
const mobile = createMobileDashboardRendererLoader();
export const getLoadedDesktopDashboardRenderer = desktop.getLoaded;
export const loadDesktopDashboardRenderer = desktop.load;
export const getLoadedMobileDashboardRenderer = mobile.getLoaded;
export const loadMobileDashboardRenderer = mobile.load;
