import { contextChildIsOwned } from './context-child-ownership.js';
// Native string-render consumers hydrate the same authored notes component.
import Notes, { hydrate, unmount, flushSync } from './components/ContextNotes.svelte.native.js';
import { acceptContextNotes, contextNotesPresentation, useSavedContextNotes } from './context-notes-session.js';
const mounted = new Map<HTMLElement, ReturnType<typeof hydrate>>();
const retired = new WeakSet<HTMLElement>();
let observer: MutationObserver | null = null;
function current(root: HTMLElement): boolean {
  return root.isConnected && root.dataset.contextNotesTicket === contextNotesPresentation().ticket;
}
function sweep(): void {
  for (const [root, component] of mounted) {
    if (current(root)) continue;
    mounted.delete(root);
    retired.add(root);
    void unmount(component);
    flushSync();
  }
  if (!mounted.size) { observer?.disconnect(); observer = null; }
}
export function ensureContextNotes(): void {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  sweep();
  for (const root of document.querySelectorAll<HTMLElement>('[data-context-notes-host]')) {
    if (mounted.has(root) || retired.has(root) || contextChildIsOwned(root) || !current(root)) continue;
    const input = root.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea');
    if (!input) continue;
    const value = contextNotesPresentation();
    const initial = { ...value, notes: input.value, status: root.querySelector('.ctx-notes-status')?.textContent || value.status };
    const component = hydrate(Notes, { target: root, props: { initial, renderId: root.dataset.contextNotesRender || '' }, recover: false });
    mounted.set(root, component);
    flushSync();
  }
  if (mounted.size && !observer) {
    observer = new MutationObserver(sweep);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
/** Preserve the public no-argument helper without relying on a global fixed ID. */
export function debounceContextNotes(input: HTMLTextAreaElement | null = [...document.querySelectorAll<HTMLTextAreaElement>('[data-context-notes-host] .ctx-notes-textarea')].find(field => {
  const host = field.closest<HTMLElement>('[data-context-notes-host]');
  return host && !retired.has(host) && current(host);
}) || null, reviewedSaved: string | null = null): void {
  const root = input?.closest<HTMLElement>('[data-context-notes-host]');
  if (!input || !root || retired.has(root) || !current(root)) return;
  const text = input.value;
  ensureContextNotes();
  acceptContextNotes(root.dataset.contextNotesTicket || '', text, reviewedSaved);
}
// A synchronous compatibility sender may dispatch before its render microtask.
// Hydrate once, then pass the captured action to the same profile-owned service.
if (typeof document !== 'undefined') {
  document.addEventListener('input', event => {
    const input = event.target;
    if (input instanceof HTMLTextAreaElement && input.matches('[data-context-notes-host] .ctx-notes-textarea')) debounceContextNotes(input);
  });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('.ctx-notes-retry, .ctx-notes-use-saved');
    const root = button?.closest<HTMLElement>('[data-context-notes-host]');
    if (!button || !root || mounted.has(root) || retired.has(root) || contextChildIsOwned(root) || !current(root)) return;
    // Capture the rendered conflict before hydration can refresh its presentation.
    const reviewedSaved = button.getAttribute('data-context-notes-reviewed-saved');
    if (button.matches('.ctx-notes-use-saved')) {
      ensureContextNotes();
      useSavedContextNotes(root.dataset.contextNotesTicket || '');
    } else debounceContextNotes(root.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea'), reviewedSaved);
  });
  globalThis.addEventListener?.('labcharts-profile-switched', sweep);
}
