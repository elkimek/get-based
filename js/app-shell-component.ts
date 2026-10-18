import AppShell, {hydrate, unmount, flushSync} from './components/AppShell.svelte.native.js';

interface NativeShellOwner {
  readonly host: HTMLElement;
  readonly root: Element;
  readonly owner: ReturnType<typeof hydrate>;
}
let active: NativeShellOwner | null = null;

/** Kit owns its route; native development hydrates the same authored shell once. */
export function ensureAppShell(): boolean {
  if (typeof document === 'undefined') return false;
  const host = document.getElementById('app-shell-host');
  if (active && (active.host !== host || !active.host.isConnected || !active.host.contains(active.root))) {
    void unmount(active.owner);
    flushSync();
    active = null;
  }
  if (!host) return !!document.querySelector('#kit-root .header');
  if (active) return true;
  const owner = hydrate(AppShell, {target: host, recover: false});
  flushSync();
  const root = host.querySelector('.header');
  if (!root) throw new Error('App shell hydration did not retain its header');
  active = {host, root, owner};
  return true;
}
