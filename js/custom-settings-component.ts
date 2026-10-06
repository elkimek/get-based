import CustomSettings, { mount, unmount, flushSync } from './components/CustomSettings.svelte.native.js';
import type { CustomSettingsSnapshot, CustomSettingsActions, CustomSettingsComponentView, CustomSettingsView } from './custom-settings-contract.js';
let component: CustomSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: CustomSettingsView | null = null;
export function disposeCustomSettings(): void {
  if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountCustomSettings(host: HTMLElement, initial: CustomSettingsSnapshot, actions: CustomSettingsActions): CustomSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeCustomSettings(); host.replaceChildren(); target = host;
  let owned: CustomSettingsView | null = null;
  const run = (action: () => unknown) => owned?.isCurrent() ? action() : undefined;
  const owner = mount(CustomSettings, { target: host, props: { initial, actions: { save: () => run(actions.save), remove: () => run(actions.remove), select: model => run(() => actions.select(model)), apply: () => run(actions.apply) } } });
  component = owner; flushSync();
  const root = host.querySelector('[data-custom-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, refresh: next => apply(() => owner.refresh(next)), setModels: next => apply(() => owner.setModels(next)), getModels: () => owner.getModels(),
    setSaveState: next => apply(() => owner.setSaveState(next)), readConnection: () => isCurrent() ? owner.readConnection() : { url: '', key: '' },
    setConnection: next => apply(() => owner.setConnection(next)), readManualModel: () => isCurrent() ? owner.readManualModel() : '', clearPrivateFields: () => owner.clearPrivateFields() };
  owned = view; return view;
}
export function getCustomSettingsView(): CustomSettingsView | null { return view?.isCurrent() ? view : null; }
