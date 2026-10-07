import ChatShell, { hydrate, unmount, flushSync } from './components/ChatShell.svelte.native.js';

let active: { host: HTMLElement; root: Element; owner: ReturnType<typeof hydrate> } | null = null;

/** Kit owns its route component; only the native prerendered host hydrates here. */
export function ensureChatShell(): boolean {
  if (typeof document === 'undefined') return false;
  const host = document.getElementById('chat-shell-host');
  if (!host) return !!document.getElementById('chat-shell');
  if (active?.host === host && host.isConnected && host.contains(active.root)) return true;
  if (active) { void unmount(active.owner); flushSync(); active = null; }
  const owner = hydrate(ChatShell, { target: host, recover: false });
  flushSync();
  const root = host.querySelector('#chat-shell');
  if (!root) throw new Error('Chat shell hydration did not retain its root');
  active = { host, root, owner };
  return true;
}
