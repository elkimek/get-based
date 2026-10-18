import {state} from './state.js';

interface DashboardPageOwner {
  readonly main: HTMLElement;
  readonly root: Element;
  readonly profile: string;
  release(): void;
}
let owner: DashboardPageOwner | null = null;
let observer: MutationObserver | null = null;

export function disposeDashboardPage(): void {
  observer?.disconnect();
  observer = null;
  globalThis.removeEventListener('labcharts-profile-switched', retireStalePage);
  const previous = owner;
  owner = null;
  try {previous?.release();}
  finally {previous?.root.remove();}
}
function stale(current: DashboardPageOwner): boolean {
  return !current.main.isConnected || current.profile !== state.currentProfile
    || !current.main.contains(current.root);
}
function retireStalePage(): void {
  if (owner && stale(owner)) disposeDashboardPage();
}

/** Hydrate the matching page root, preserving the SSR nodes and feature snapshots. */
export function ownDashboardPage(main: HTMLElement, root: Element, hydratePage: () => () => void): void {
  if (!main.contains(root)) throw new Error('Dashboard page root must belong to its main container');
  disposeDashboardPage();
  const release = hydratePage();
  const current: DashboardPageOwner = {
    main, root, release, profile: state.currentProfile,
  };
  owner = current;
  observer = new MutationObserver(records => {
    const removedRoot = records.some(record => [...record.removedNodes].some(removed =>
      removed === current.root || removed.contains(current.root)));
    if (owner === current && (removedRoot || stale(current))) disposeDashboardPage();
  });
  observer.observe(main.ownerDocument.documentElement, {childList: true, subtree: true});
  globalThis.addEventListener('labcharts-profile-switched', retireStalePage);
}
