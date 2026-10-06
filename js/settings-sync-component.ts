// One panel owner; stale service replies cannot update a replacement view.
import SyncSettings, { mount, unmount, flushSync } from './components/SyncSettings.svelte.native.js';
import type { SyncSettingsComponentView, SyncSettingsSnapshot, SyncSettingsView } from './settings-sync-contract.js';
let component: SyncSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: SyncSettingsView | null = null;
export function disposeSyncSettings(): void {
  if (component) { flushSync(() => component?.clearSecrets()); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountSyncSettings(host: HTMLElement, initial: SyncSettingsSnapshot, refresh = false): SyncSettingsView {
  if (host === target && view) { if (refresh) view.refresh(initial); return view; }
  disposeSyncSettings();
  target = host;
  const owner = mount(SyncSettings, { target: host, props: { initial } });
  component = owner; flushSync();
  const isCurrent = () => target === host && component === owner && host.isConnected;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = {
    isCurrent,
    refresh: next => apply(() => owner.refresh(next)),
    setRelay: connected => apply(() => owner.setRelay(connected)),
    setIdentity: (code, unavailable) => apply(() => owner.setIdentity(code, unavailable)),
    setMnemonicStatus: (ready, message, warning) => apply(() => owner.setMnemonicStatus(ready, message, warning)),
    toggleMnemonic: value => apply(() => owner.toggleMnemonic(value)),
    clearSecrets: () => apply(() => owner.clearSecrets()),
  };
  return view;
}
export function getSyncSettingsView(): SyncSettingsView | null { return view?.isCurrent() ? view : null; }
