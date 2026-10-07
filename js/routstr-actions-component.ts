import RoutstrActions, { mount, hydrate, unmount, flushSync } from './components/RoutstrActions.svelte.native.js';
import type { RoutstrActions as Actions, RoutstrActionsState, RoutstrActionsComponentView, RoutstrActionsView } from './routstr-actions-contract.js';
import { ROUTSTR_NODE_ACTIONS, ROUTSTR_WALLET_ACTIONS, ROUTSTR_WALLET_MENU } from './routstr-settings-contract.js';
interface Entry { owner: RoutstrActionsComponentView; view: RoutstrActionsView }
const entries = new Map<HTMLElement, Entry>();
const retiredHosts = new WeakSet<HTMLElement>();
let observer: MutationObserver | null = null;
let actions: Actions = { wallet: () => {}, node: () => {} };
export function configureRoutstrActions(next: Actions): void { actions = next; }
export function routstrActionsState(kind: 'wallet' | 'node', node: unknown, connected: unknown, active: unknown): RoutstrActionsState {
  const options = kind === 'wallet' ? [...ROUTSTR_WALLET_ACTIONS, ...ROUTSTR_WALLET_MENU] : ROUTSTR_NODE_ACTIONS;
  return { kind, node: String(node || ''), connected: !!connected, active: options.find(option => option.id === active)?.id || null, compatibility: true };
}
function hostState(host: HTMLElement): RoutstrActionsState { return routstrActionsState(host.dataset.routstrActionsKind === 'wallet' ? 'wallet' : 'node', host.dataset.nodeUrl, host.dataset.connected === 'true', host.dataset.active); }
function retire(target: HTMLElement, entry: Entry): void {
  entries.delete(target); retiredHosts.add(target); void unmount(entry.owner); flushSync();
}
export function disposeRoutstrActions(host?: HTMLElement): void {
  for (const [target, entry] of entries) if (!host || target === host || host.contains(target)) retire(target, entry);
}
function own(host: HTMLElement, state: RoutstrActionsState, hydrated: boolean): RoutstrActionsView {
  const previous = entries.get(host); if (previous?.view.isCurrent()) { previous.view.setState(state); return previous.view; }
  if (previous) retire(host, previous);
  let view: RoutstrActionsView | null = null;
  const scoped: Actions = { wallet: action => view?.isCurrent() ? actions.wallet(action) : undefined, node: (action, node) => view?.isCurrent() ? actions.node(action, node) : undefined };
  retiredHosts.delete(host);
  const props = { state, actions: scoped };
  const owner = hydrated ? hydrate(RoutstrActions, { target: host, props, recover: false }) : mount(RoutstrActions, { target: host, props }); flushSync();
  const root = host.querySelector('[data-routstr-actions-view]');
  const isCurrent = () => entries.get(host)?.owner === owner && host.isConnected && !!root && host.contains(root);
  view = { isCurrent, getState: () => owner.getState(), setState: next => { if (isCurrent()) flushSync(() => owner.setState(next)); }, closeMenu: () => { if (isCurrent()) flushSync(() => owner.closeMenu()); }, invoke: action => { if (isCurrent()) flushSync(() => owner.invoke(action)); } };
  entries.set(host, { owner, view }); return view;
}
export function hydrateRoutstrActions(host: HTMLElement): RoutstrActionsView { return entries.get(host)?.view.isCurrent() ? entries.get(host)!.view : own(host, hostState(host), true); }
export function updateRoutstrActions(target: HTMLElement, state: RoutstrActionsState): RoutstrActionsView {
  const host = target.matches('[data-routstr-actions-host]') ? target : target.querySelector<HTMLElement>('[data-routstr-actions-host]') || target;
  const entry = entries.get(host);
  if (entry?.view.isCurrent()) { entry.view.setState(state); return entry.view; }
  if (host.matches('[data-routstr-actions-host]') && !retiredHosts.has(host)) { const view = hydrateRoutstrActions(host); view.setState(state); return view; }
  host.replaceChildren(); return own(host, state, false);
}
/** Returned HTML already contains controls; hydration preserves their identity. */
export function installRoutstrActionHydration(): void {
  if (observer || typeof document === 'undefined') return;
  function scan(): void {
    for (const [host, entry] of entries) if (!entry.view.isCurrent()) retire(host, entry);
    for (const host of document.querySelectorAll<HTMLElement>('[data-routstr-actions-host]')) if (!entries.has(host) && !retiredHosts.has(host)) hydrateRoutstrActions(host);
  }
  observer = new MutationObserver(scan); observer.observe(document.documentElement, { childList: true, subtree: true });
  // Immediate programmatic clicks can precede the mutation-observer turn. Dispatch
  // that first action through the newly hydrated owner once, using the same port.
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-routstr-wallet-action]') : null;
    const host = button?.closest<HTMLElement>('[data-routstr-actions-host]');
    if (!button || !host || retiredHosts.has(host) || entries.get(host)?.view.isCurrent()) return;
    const action = button.dataset.routstrWalletAction === 'toggle-wallet-menu' ? 'menu' : button.dataset.walletAction || button.dataset.nodeAction || '';
    const view = hydrateRoutstrActions(host); event.preventDefault(); event.stopImmediatePropagation(); view.invoke(action);
  }, true);
  scan();
}
