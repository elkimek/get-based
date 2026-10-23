import {renderHTML} from './components/MobileBottomNavigation.svelte.html.js';

export type MobileNavigationRoute = 'dashboard' | 'labs' | 'body' | 'nutrition' | 'supplements' | 'light' | 'insight';

export interface MobileNavigationView {
  readonly activeTab: MobileNavigationRoute | null;
  readonly id: string | null;
}

export function renderMobileNavigation(view: MobileNavigationView): string {
  return renderHTML({view});
}
