// One live Context overview owns its profile, autosave drafts and navigation.
import Hub, { mount, unmount, flushSync } from './components/ContextHub.svelte.native.js';
import { state } from './state.js';
import { readContextHubSnapshot } from './context-hub-data.js';
import { projectContextHub } from './context-hub-model.js';
import { createContextHubSession } from './context-hub-session.js';
import type { ContextSettingMutation } from './context-hub-session.js';
import { runWithContextEditorStylesheet } from './context-card-editor-ui.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { openInterpretiveLensEditorRuntime } from './context-cards-runtime.js';
import { openKnowledgeBaseModal } from './lens.js';
import { notifyDashboardAIContextStatusChanged } from './context-card-dashboard-ai-runtime.js';
interface View {
  overlay: HTMLElement; root: HTMLElement; component: ReturnType<typeof Hub>; observer: MutationObserver;
  session: ReturnType<typeof createContextHubSession>; busy: boolean; pending: ContextSettingMutation | null; error: string;
}
let view: View | null = null, request = 0;
function current(owned: View): boolean { return view === owned && owned.session.current() && owned.root.isConnected && owned.overlay.classList.contains('show'); }
function dispose(owned: View): void {
  owned.observer.disconnect(); owned.overlay.removeEventListener('click', backdrop); owned.session.retire();
  if (view === owned) view = null;
  void unmount(owned.component); flushSync();
}
function close(owned: View): void { if (view !== owned) return; if (owned.overlay.contains(owned.root)) closeModalOverlay(owned.overlay); dispose(owned); }
function backdrop(event: MouseEvent): void { if (view && event.target === view.overlay) close(view); }
function refresh(owned: View): void {
  if (!current(owned)) { close(owned); return; }
  owned.component.update(projectContextHub(readContextHubSnapshot()), owned.busy, owned.pending, owned.error); flushSync();
}
async function save(owned: View, mutation: ContextSettingMutation): Promise<void> {
  if (!current(owned) || owned.busy) return;
  const focus = document.activeElement instanceof HTMLElement && owned.root.contains(document.activeElement) ? document.activeElement.id : '';
  owned.busy = true; owned.pending = mutation; owned.error = ''; refresh(owned);
  const result = await owned.session.save(mutation);
  if (!current(owned)) return;
  owned.busy = false;
  if (result === 'saved' || result === 'unchanged') {
    owned.pending = null; owned.error = ''; refresh(owned);
    try { notifyDashboardAIContextStatusChanged(); } catch { /* The committed setting remains saved. */ }
  } else {
    owned.error = result === 'conflict' ? 'Settings changed in another tab. Review the saved settings, then retry or keep them.' : 'Changes could not be saved. Retry or keep the saved settings.';
    refresh(owned);
  }
  if (focus && (!document.activeElement || document.activeElement === document.body)) owned.root.querySelector<HTMLElement>(`#${CSS.escape(focus)}`)?.focus();
}
export function openContextHub(): void | Promise<unknown> {
  const ticket = ++request, profile = state.currentProfile, origin = state.importedData;
  const surface = document.getElementById('main-content')?.firstElementChild, content = document.getElementById('detail-modal')?.firstElementChild;
  return runWithContextEditorStylesheet(() => {
    if (ticket !== request || profile !== state.currentProfile || origin !== state.importedData
      || document.getElementById('main-content')?.firstElementChild !== surface || document.getElementById('detail-modal')?.firstElementChild !== content) return;
    let overlay = document.getElementById('context-hub-overlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'context-hub-overlay'; overlay.className = 'confirm-overlay'; document.body.append(overlay); }
    if (view) dispose(view); overlay.replaceChildren();
    let owned: View;
    const component = mount(Hub, { target: overlay, props: {
      initial: projectContextHub(readContextHubSnapshot()), current: () => !!owned && current(owned),
      change: (mutation: ContextSettingMutation) => { if (current(owned) && !owned.pending) void save(owned, mutation); },
      retry: () => { if (current(owned) && owned.pending) void save(owned, owned.pending); },
      discard: () => { if (!current(owned) || owned.busy) return; owned.pending = null; owned.error = ''; refresh(owned); },
      close: () => close(owned), pick: (key: 'lens' | 'kb') => { if (!current(owned)) return; close(owned); if (key === 'lens') openInterpretiveLensEditorRuntime(); else openKnowledgeBaseModal(); }
    } }); flushSync();
    const root = overlay.querySelector<HTMLElement>('[data-context-hub-view]')!;
    const observer = new MutationObserver(() => { if (!current(owned)) close(owned); });
    owned = { overlay, root, component, observer, session: createContextHubSession(), busy: false, pending: null, error: '' }; view = owned;
    overlay.addEventListener('click', backdrop);
    openModalOverlay(overlay, { initialFocus: '.ai-picker-card,[data-context-toggle],#context-hub-cancel', focusDelay: 50, scrollLock: true });
    observer.observe(document.documentElement, { childList: true, subtree: true }); observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    void save(owned, { kind: 'migrate' });
  });
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('keydown', event => { if (view && event instanceof KeyboardEvent && event.key === 'Escape') close(view); });
  globalThis.addEventListener('labcharts-profile-switched', () => { ++request; if (view) close(view); });
  globalThis.addEventListener('labcharts-sync-applied', () => { if (view) refresh(view); });
}
