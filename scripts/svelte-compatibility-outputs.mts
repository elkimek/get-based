// Stable compatibility URLs shared by the compiler, native coverage, and CI transport.
export const MOBILE_DASHBOARD_PAGE = 'js/components/MobileDashboardPage.svelte';
export const MOBILE_DASHBOARD_STACK = 'js/components/MobileDashboardWidgetStack.svelte';
export const MOBILE_DASHBOARD_SHARED = MOBILE_DASHBOARD_STACK + '.shared.js';

export function isMobileDashboardShared(file: string): boolean {
  const portable = file.replaceAll('\\', '/');
  return portable === MOBILE_DASHBOARD_SHARED || portable.endsWith('/' + MOBILE_DASHBOARD_SHARED);
}

export function isMappedSvelteOutput(file: string): boolean {
  return /\.svelte\.(?:native|html)\.js$/.test(file) || isMobileDashboardShared(file);
}
