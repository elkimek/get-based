import ImportBenchmarks, { mount, unmount, flushSync } from './components/ImportBenchmarks.svelte.native.js';
import ImportBenchmarkEntry, { mount as mountEntry, unmount as unmountEntry, flushSync as flushEntry } from './components/ImportBenchmarkEntry.svelte.native.js';
import type { BenchmarkActions, BenchmarkSnapshot, BenchmarkView } from './import-benchmark-contract.js';

const views = new WeakMap<HTMLElement, BenchmarkView>();
export function getImportBenchmarksView(host: HTMLElement): BenchmarkView | null {
  const view = views.get(host);
  return view?.isCurrent() ? view : null;
}
export function mountImportBenchmarks(host: HTMLElement, initial: BenchmarkSnapshot, actions: BenchmarkActions, mode: 'dialog'|'body'|'differences' = 'dialog', showDifferenceClose = false): BenchmarkView {
  views.get(host)?.dispose();
  host.replaceChildren();
  let disposed = false, view: BenchmarkView | null = null;
  const guarded: BenchmarkActions = {
    close: () => view?.isCurrent() ? actions.close() : undefined,
    run: () => view?.isCurrent() ? actions.run() : undefined,
    select: (id, checked) => view?.isCurrent() ? actions.select(id, checked) : undefined,
    latest: () => view?.isCurrent() ? actions.latest() : undefined,
    clear: () => view?.isCurrent() ? actions.clear() : undefined,
    remove: id => view?.isCurrent() ? actions.remove(id) : undefined,
    review: id => view?.isCurrent() ? actions.review(id) : undefined,
    closeReview: () => view?.isCurrent() ? actions.closeReview() : undefined,
  };
  const component = mount(ImportBenchmarks,{ target:host,props:{ initial,actions:guarded,mode,showDifferenceClose } });
  flushSync();
  const root = host.querySelector('[data-import-benchmarks-view]');
  const isCurrent = () => !disposed && host.isConnected && !!root && host.contains(root) && views.get(host) === view;
  view = {
    isCurrent, getSnapshot:() => component.getSnapshot(),
    refresh:next => { if (isCurrent()) flushSync(() => component.refresh(next)); },
    scrollReview:() => { if (isCurrent()) component.scrollReview(); },
    dispose:() => {
      if (disposed) return;
      disposed = true;
      void unmount(component); flushSync();
      if (views.get(host) === view) views.delete(host);
    },
  };
  views.set(host,view);
  return view;
}

let entry: ReturnType<typeof mountEntry> | null = null;
let entryHost: HTMLElement | null = null;
let entryEpoch = 0;
export function disposeImportBenchmarksEntry(): void {
  ++entryEpoch;
  if (entry) { void unmountEntry(entry); flushEntry(); }
  entry = null; entryHost = null;
}
export function isImportBenchmarksEntryCurrent(button: HTMLButtonElement): boolean {
  return !!entry && !!entryHost?.isConnected && entryHost.contains(button);
}
export function prepareImportBenchmarkEntryHost(label: string, onOpen: (button: HTMLButtonElement) => unknown): number {
  const epoch = ++entryEpoch;
  queueMicrotask(() => {
    if (typeof document === 'undefined' || epoch !== entryEpoch) return;
    const host = document.querySelector<HTMLElement>(`[data-import-benchmark-entry-host="${epoch}"]`);
    if (!host?.isConnected) return;
    if (entry) { void unmountEntry(entry); flushEntry(); }
    entryHost = host;
    entry = mountEntry(ImportBenchmarkEntry,{ target:host,props:{ label,onOpen:button => { if (isImportBenchmarksEntryCurrent(button)) onOpen(button); } } });
    flushEntry();
  });
  return epoch;
}
export function renderImportBenchmarkEntryHost(label: string, onOpen: (button: HTMLButtonElement) => unknown): string {
  return `<div data-import-benchmark-entry-host="${prepareImportBenchmarkEntryHost(label, onOpen)}"></div>`;
}
