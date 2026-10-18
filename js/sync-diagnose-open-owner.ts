import {state} from './state.js';
import {routeRevision} from './route-lifecycle.js';

export interface SyncDiagnoseOpenOwner { current(): boolean; release(): void; }
let retirePending: (() => void) | null = null;
const MODAL = '.modal-overlay,.confirm-overlay,[data-modal-focus-trap]';
const VISIBLE_MODAL = '.modal-overlay.show,.confirm-overlay.show,[data-modal-focus-trap]';
/** Protect only the pending open. The committed modal keeps its existing lifecycle. */
export function beginSyncDiagnoseOpen(): SyncDiagnoseOpenOwner {
  retirePending?.();
  const origin = typeof document === 'undefined' ? null : document;
  const profile = state.currentProfile, data = state.importedData, route = routeRevision(), view = state.currentView;
  const main = origin?.getElementById('main-content') ?? null, first = main?.firstElementChild;
  const visible = () => origin ? [...origin.querySelectorAll(VISIBLE_MODAL)].map(overlay => {
    const modal = overlay.querySelector(':scope > .modal') ?? overlay;
    return {overlay, modal, first: modal.firstElementChild};
  }) : [];
  const initial = visible();
  let active = true, observer: MutationObserver | null = null;
  const release = () => {
    observer?.disconnect(); observer = null;
    globalThis.removeEventListener('labcharts-profile-switched', retire);
    if (retirePending === retire) retirePending = null;
  };
  const retire = () => { active = false; release(); };
  const current = () => {
    if (!active || state.currentProfile !== profile || state.importedData !== data || routeRevision() !== route || state.currentView !== view
      || (typeof document === 'undefined' ? null : document) !== origin
      || (origin?.getElementById('main-content') ?? null) !== main
      || (main && (!main.isConnected || main.firstElementChild !== first))) return false;
    const next = visible();
    return next.length === initial.length && next.every((row, index) => {
      const before = initial[index]!;
      return row.overlay === before.overlay && row.modal === before.modal && row.first === before.first;
    });
  };
  if (origin?.body && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(records => {
      const newModal = (node: Node) => node instanceof Element && (node.matches(MODAL) || !!node.querySelector(MODAL));
      if (!current() || records.some(record => record.type === 'attributes'
        ? record.target instanceof Element && (record.target.matches(MODAL) || record.attributeName === 'data-modal-focus-trap')
        : record.target instanceof Element && record.target.matches('.modal')
          || [...record.addedNodes, ...record.removedNodes].some(newModal))) retire();
    });
    observer.observe(origin.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-modal-focus-trap']});
  }
  retirePending = retire;
  globalThis.addEventListener('labcharts-profile-switched', retire);
  return {current, release};
}
