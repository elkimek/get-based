import LocalAiSettings, { mount, unmount, flushSync } from './components/LocalAiSettings.svelte.native.js';
import type { LocalAiSettingsActions, LocalAiSettingsComponentView, LocalAiSettingsSnapshot, LocalAiSettingsView } from './local-ai-settings-contract.js';
let component: LocalAiSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: LocalAiSettingsView | null = null;
export function disposeLocalAiSettings(): void {
  if (component) { component.clearPrivateFields(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountLocalAiSettings(host: HTMLElement, initial: LocalAiSettingsSnapshot, actions: LocalAiSettingsActions): LocalAiSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposeLocalAiSettings(); host.replaceChildren(); target = host;
  let owned: LocalAiSettingsView | null = null;
  const run = (action: () => unknown) => owned?.isCurrent() ? action() : undefined;
  const owner = mount(LocalAiSettings, { target: host, props: { initial, actions: {
    test: () => run(actions.test), select: model => run(() => actions.select(model)), copy: command => run(() => actions.copy(command)),
    applyOverride: value => run(() => actions.applyOverride(value)), clearOverride: () => run(actions.clearOverride),
  } } });
  component = owner; flushSync();
  const root = host.querySelector('[data-local-ai-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && target === host && component === owner;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, refresh: next => apply(() => owner.refresh(next)), setStatus: (...args) => apply(() => owner.setStatus(...args)),
    setAdvisor: (...args) => apply(() => owner.setAdvisor(...args)), getSnapshot: () => owner.getSnapshot(), getStatus: () => owner.getStatus(),
    readConnection: () => isCurrent() ? owner.readConnection() : { url: '', apiKey: '' }, setConnection: next => apply(() => owner.setConnection(next)), clearPrivateFields: () => owner.clearPrivateFields() };
  owned = view; return view;
}
export function getLocalAiSettingsView(): LocalAiSettingsView | null { return view?.isCurrent() ? view : null; }
