import Page, {hydrate, unmount, flushSync} from './components/MobileDashboardPage.svelte.native.js';
import {ownDashboardPage} from './dashboard-page-owner.js';
import type {MobileDashboardPageView} from './mobile-dashboard-presentation.js';

export function hydrateMobileDashboardPage(main: HTMLElement, view: MobileDashboardPageView): void {
  const roots = main.querySelectorAll('.m-shell');
  if (roots.length !== 1) throw new Error('Exactly one Dashboard page root required');
  const root = roots[0]!;
  ownDashboardPage(main, root, () => {
    const component = hydrate(Page, {target: main, props: {view}, recover: false});
    flushSync();
    return () => {void unmount(component); flushSync();};
  });
}
