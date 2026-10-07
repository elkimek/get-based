// One setup picker owns its profile, navigation surface and captured actions.
import Picker, { mount, unmount, flushSync } from './components/DataProtectionPicker.svelte.native.js';
import { state } from './state.js';
import { getDataProtectionStatus } from './data-protection-status.js';
import { protectionCards } from './data-protection-picker-model.js';
import type { ProtectionAction } from './data-protection-picker-model.js';
import { isContextEditorStylesheetLoaded, loadContextEditorStylesheet } from './context-card-editor-ui.js';
import { closeModalOverlay, openModalOverlay, trapModalFocus } from './modal-lifecycle.js';
import { showNotification } from './utils.js';
interface View {
  overlay: HTMLElement; root: HTMLElement; component: ReturnType<typeof Picker>;
  observer: MutationObserver; releaseFocus: (restore?: boolean) => void; current(): boolean;
}
let view: View | null = null, request = 0;
function current(owned: View): boolean {
  return view === owned && owned.current() && owned.root.isConnected && owned.overlay.contains(owned.root) && owned.overlay.classList.contains('show');
}
function close(owned: View): void {
  if (view !== owned) return;
  view = null; owned.observer.disconnect(); owned.overlay.removeEventListener('click', backdrop);
  closeModalOverlay(owned.overlay); owned.releaseFocus(false); void unmount(owned.component); flushSync();
}
function backdrop(event: MouseEvent): void { if (view && event.target === view.overlay) close(view); }
export function openDataProtectionView(actions: Record<ProtectionAction, () => unknown>): void | Promise<void | false> {
  const ticket = ++request, profile = state.currentProfile, origin = state.importedData, route = state.currentView;
  const surface = document.getElementById('main-content')?.firstElementChild;
  const modal = document.getElementById('detail-modal'), content = modal?.firstElementChild;
  const ownsContext = () => ticket === request && profile === state.currentProfile && origin === state.importedData && route === state.currentView
    && document.getElementById('detail-modal') === modal && modal?.firstElementChild === content;
  const isCurrent = () => ownsContext() && document.getElementById('main-content')?.firstElementChild === surface;
  const open = () => {
    if (!isCurrent()) return;
    if (view) close(view);
    let overlay = document.getElementById('data-protection-picker-overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'data-protection-picker-overlay'; overlay.className = 'confirm-overlay'; document.body.append(overlay); }
    overlay.setAttribute('data-modal-lifecycle-managed', ''); overlay.replaceChildren();
    const cards = protectionCards(getDataProtectionStatus());
    let owned: View;
    const component = mount(Picker, { target: overlay, props: { cards,
      close: () => { if (current(owned)) close(owned); },
      pick: (key: ProtectionAction) => {
        if (!current(owned)) return;
        const card = cards.find(candidate => candidate.key === key);
        if (!card) return;
        close(owned);
        if (!card.configured) actions[key]();
      },
    } }); flushSync();
    const root = overlay.querySelector<HTMLElement>('[data-data-protection-view]')!;
    const observer = new MutationObserver(() => { if (!current(owned)) close(owned); });
    owned = { overlay, root, component, observer, releaseFocus: () => {}, current: ownsContext }; view = owned;
    overlay.addEventListener('click', backdrop);
    openModalOverlay(overlay, { initialFocus: '.dashboard-picker-card:not([data-configured="true"]),.dashboard-picker-card,#data-protection-picker-cancel', focusDelay: 50, scrollLock: true });
    owned.releaseFocus = trapModalFocus(overlay, { autoFocus: false, onEscape: () => close(owned) });
    observer.observe(document.documentElement, { childList: true, subtree: true }); observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  };
  if (isContextEditorStylesheetLoaded()) return open();
  return loadContextEditorStylesheet().then(open).catch(error => {
    if (!isCurrent()) return false;
    console.error('Failed to load data protection picker', error);
    showNotification('Data protection tools could not be loaded. Try again.', 'error'); return false;
  });
}
if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('labcharts-profile-switched', () => { ++request; if (view) close(view); });
