import VeniceSettings, { mount, unmount, flushSync } from './components/VeniceSettings.svelte.native.js';
import type { VeniceSettingsComponentView, VeniceSettingsSnapshot, VeniceSettingsView } from './venice-settings-contract.js';

let component: VeniceSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: VeniceSettingsView | null = null;
export function disposeVeniceSettings(): void {
  if (component) { component.clearKey(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountVeniceSettings(host: HTMLElement, initial: VeniceSettingsSnapshot): VeniceSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeVeniceSettings(); host.replaceChildren(); target = host;
  const owner = mount(VeniceSettings, { target: host, props: { initial } });
  component = owner; flushSync();
  const root = host.querySelector('[data-venice-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = {
    isCurrent, getModels: () => owner.getModels(), refresh: next => apply(() => owner.refresh(next)), setModels: next => apply(() => owner.setModels(next)),
    setSaveState: state => apply(() => owner.setSaveState(state)), setBalance: status => apply(() => owner.setBalance(status)),
    setMode: mode => apply(() => owner.setMode(mode)),
    readKey: () => isCurrent() ? owner.readKey() : '', setStoredKey: key => apply(() => owner.setStoredKey(key)),
    clearKey: () => apply(() => owner.clearKey()),
  };
  return view;
}
export function getVeniceSettingsView(): VeniceSettingsView | null { return view?.isCurrent() ? view : null; }
