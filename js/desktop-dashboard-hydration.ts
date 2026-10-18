import Page, {hydrate, unmount, flushSync} from './components/DesktopDashboardPage.svelte.native.js';
import {ownDashboardPage} from './dashboard-page-owner.js';
import type {DesktopDashboardPageView} from './desktop-dashboard-presentation.js';

export function hydrateDesktopDashboardPage(main: HTMLElement, view: DesktopDashboardPageView): void {
  const roots = main.querySelectorAll('.dashboard-widgets:not([data-lens-shell-view])');
  if (roots.length !== 1) throw new Error('Exactly one Dashboard page root required');
  const root = roots[0]!;
  ownDashboardPage(main, root, () => {
    const component = hydrate(Page, {target: main, props: {view}, recover: false});
    flushSync();
    return () => {void unmount(component); flushSync();};
  });
}
