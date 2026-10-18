import { contextChildIsOwned } from './context-child-ownership.js';
import Status, { hydrate, unmount, flushSync } from './components/ContextCardStatus.svelte.native.js';
import { contextCardStatusTicket } from './context-card-status.js';
import type { ContextCardStatusSlot } from './context-card-status.js';
const mounted = new Map<HTMLElement, ReturnType<typeof hydrate>>();
const retired = new WeakSet<HTMLElement>();
let observer: MutationObserver | null = null;
function current(root: HTMLElement): boolean { return root.isConnected && root.dataset.contextStatusTicket === contextCardStatusTicket(); }
function sweep(): void {
  for (const [root, component] of mounted) {
    if (current(root)) continue;
    mounted.delete(root); retired.add(root); void unmount(component); flushSync();
  }
  if (!mounted.size) { observer?.disconnect(); observer = null; }
}
export function ensureContextCardStatus(): void {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  sweep();
  for (const root of document.querySelectorAll<HTMLElement>('[data-context-status-host]')) {
    if (mounted.has(root) || retired.has(root) || contextChildIsOwned(root) || !current(root)) continue;
    const slot = root.dataset.contextStatusSlot as ContextCardStatusSlot;
    if (!['indicator', 'summary', 'insight', 'tips'].includes(slot)) continue;
    const component = hydrate(Status, { target: root, recover: false, props: { slot, cardKey: root.dataset.contextStatusKey || '',
      renderId: root.dataset.contextStatusRender || '', ticket: root.dataset.contextStatusTicket || '', localSummary: root.dataset.contextLocalSummary || '', cardLabel: root.dataset.contextStatusLabel || '' } });
    mounted.set(root, component); flushSync();
  }
  if (mounted.size && !observer) { observer = new MutationObserver(sweep); observer.observe(document.documentElement, { childList: true, subtree: true }); }
}
if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('labcharts-profile-switched', sweep);
