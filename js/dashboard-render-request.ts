import {state} from './state.js';
import {routeRevision} from './route-lifecycle.js';
import {disposeDashboardPage} from './dashboard-page-owner.js';

let ticket = 0;
/** Empty renders also retire pending data-page publications. */
export function retireDashboardRenderRequests(): void { ++ticket; }

export function beginDashboardRenderRequest(main: HTMLElement, isMobile: () => boolean) {
  const request = ++ticket, profile = state.currentProfile, data = state.importedData;
  const revision = routeRevision(), focus = document.activeElement, mobile = isMobile(), route = state.currentView;
  const dialogs = [...document.querySelectorAll('dialog[open], .modal-overlay.show, [role="dialog"][aria-modal="true"]')];
  // createNavigate records the revision before calling the handler, then sets
  // currentView afterwards. Preserve direct render calls on the captured route.
  const isCurrent = () => request === ticket && profile === state.currentProfile && data === state.importedData
    && revision === routeRevision() && (state.currentView === route || state.currentView === 'dashboard')
    && document.getElementById('main-content') === main && main.isConnected && isMobile() === mobile;
  // A dialog or newly focused outside control may coexist with the new page.
  // Publish the page without letting its optional tour/scroll steal that focus.
  const mayRunFocusEffects = () => isCurrent()
    && !document.querySelector('dialog[open], .modal-overlay.show')
    && (document.activeElement === focus || document.activeElement === document.body)
    && [...document.querySelectorAll('dialog[open], .modal-overlay.show, [role="dialog"][aria-modal="true"]')]
      .every(dialog => dialogs.includes(dialog));
  return {isCurrent, mayRunFocusEffects};
}
export type DashboardRenderRequest = ReturnType<typeof beginDashboardRenderRequest>;

export function showDashboardRendererLoading(main: HTMLElement): void {
  const status = document.createElement('p');
  status.className = 'empty-state'; status.textContent = 'Loading Dashboard…';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-busy', 'true');
  disposeDashboardPage(); main.replaceChildren(status);
}
export function showDashboardRendererFailure(main: HTMLElement, retry: () => unknown): void {
  const status = document.createElement('div'); status.className = 'empty-state'; status.setAttribute('role', 'alert');
  const message = document.createElement('p'); message.textContent = 'Dashboard could not be loaded. Try again.';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'import-btn';
  button.dataset.dashboardRenderRetry = ''; button.textContent = 'Retry Dashboard';
  button.addEventListener('click', () => { void retry(); }, {once: true});
  status.append(message, button); disposeDashboardPage(); main.replaceChildren(status);
}
