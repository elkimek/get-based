import OpenRouterSettings, { mount, unmount, flushSync } from './components/OpenRouterSettings.svelte.native.js';
import type { OpenRouterSettingsComponentView, OpenRouterSettingsSnapshot, OpenRouterSettingsView } from './openrouter-settings-contract.js';

let component: OpenRouterSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: OpenRouterSettingsView | null = null;
export function disposeOpenRouterSettings(): void {
  if (component) { component.clearKey(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountOpenRouterSettings(host: HTMLElement, initial: OpenRouterSettingsSnapshot): OpenRouterSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeOpenRouterSettings(); host.replaceChildren(); target = host;
  const owner = mount(OpenRouterSettings, { target: host, props: { initial } });
  component = owner; flushSync();
  const root = host.querySelector('[data-openrouter-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = {
    isCurrent, getModels: () => owner.getModels(), refresh: next => apply(() => owner.refresh(next)), setModels: next => apply(() => owner.setModels(next)),
    setSaveState: state => apply(() => owner.setSaveState(state)), setBalance: status => apply(() => owner.setBalance(status)),
    setModelCheck: (state, message) => apply(() => owner.setModelCheck(state, message)),
    readKey: () => isCurrent() ? owner.readKey() : '', setStoredKey: key => apply(() => owner.setStoredKey(key)),
    clearKey: () => apply(() => owner.clearKey()),
  };
  return view;
}
export function getOpenRouterSettingsView(): OpenRouterSettingsView | null { return view?.isCurrent() ? view : null; }
