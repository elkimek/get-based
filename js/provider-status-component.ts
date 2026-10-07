import ProviderStatus, { mount, unmount, flushSync } from './components/ProviderStatus.svelte.native.js';
import type { ProviderStatusState, ProviderStatusOptions, ProviderStatusComponentView, ProviderStatusView } from './provider-status-contract.js';
interface Entry { owner: ProviderStatusComponentView; view: ProviderStatusView }
// Status-only roots own no document listeners, timers or credentials. Weak keys
// allow externally removed compatibility containers to be collected normally.
const entries = new WeakMap<HTMLElement, Entry>();
export function presentProviderStatus(host: HTMLElement, status: ProviderStatusState, options: ProviderStatusOptions = {}): ProviderStatusView {
  const previous = entries.get(host);
  if (previous?.view.isCurrent()) { previous.view.setStatus(status); return previous.view; }
  if (previous) { void unmount(previous.owner); flushSync(); }
  host.replaceChildren();
  const owner = mount(ProviderStatus, { target: host, props: { status, ...options } }); flushSync();
  const root = host.querySelector('[data-provider-status-view]');
  const isCurrent = () => entries.get(host)?.owner === owner && host.isConnected && !!root && host.contains(root);
  const view: ProviderStatusView = { isCurrent, setStatus: next => { if (isCurrent()) flushSync(() => owner.setStatus(next)); } };
  entries.set(host, { owner, view }); return view;
}
