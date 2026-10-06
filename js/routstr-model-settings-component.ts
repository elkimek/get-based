import RoutstrModelSettings, { mount, unmount, flushSync } from './components/RoutstrModelSettings.svelte.native.js';
import type { RoutstrModelSettingsComponentView, RoutstrModelSettingsSnapshot, RoutstrModelSettingsView } from './routstr-model-settings-contract.js';

let component: RoutstrModelSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: RoutstrModelSettingsView | null = null;
export function disposeRoutstrModelSettings(): void {
  if (component) { void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountRoutstrModelSettings(host: HTMLElement, initial: RoutstrModelSettingsSnapshot): RoutstrModelSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeRoutstrModelSettings(); host.replaceChildren(); target = host;
  const owner = mount(RoutstrModelSettings, { target: host, props: { initial } });
  component = owner; flushSync();
  const root = host.querySelector('[data-routstr-model-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, getModels: () => owner.getModels(), refresh: next => apply(() => owner.refresh(next)),
    setModels: models => apply(() => owner.setModels(models)), setMode: mode => apply(() => owner.setMode(mode)) };
  return view;
}
export function getRoutstrModelSettingsView(): RoutstrModelSettingsView | null { return view?.isCurrent() ? view : null; }
