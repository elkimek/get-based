import Tooltip, { mount, unmount, flushSync } from './components/ChatAttestationTooltip.svelte.native.js';
const owners = new WeakMap<object, { host: HTMLElement; dispose(): void; }>();
/** One owned tooltip per document serves the header and transcript HTML. */
export function installAttestationTooltips(doc: Pick<Document, 'addEventListener'> | null = typeof document !== 'undefined' ? document : null): boolean {
  if (!doc || typeof Element === 'undefined' || !('body' in doc) || !(doc as Document).body) return false;
  const previous = owners.get(doc); if (previous?.host.isConnected) return false; previous?.dispose();
  const document = doc as Document, host = document.createElement('div');
  host.dataset.chatAttestationHost = ''; document.body.appendChild(host);
  const component = mount(Tooltip, { target: host }); flushSync();
  const observer = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  function dispose() { observer.disconnect(); void unmount(component); flushSync(); if (owners.get(document)?.host === host) owners.delete(document); }
  observer.observe(document.documentElement, { childList: true, subtree: true });
  owners.set(doc, { host, dispose }); return true;
}
