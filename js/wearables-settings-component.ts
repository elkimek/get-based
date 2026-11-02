import WearablesSettings, { mount, unmount, flushSync } from './components/WearablesSettings.svelte.native.js';
import type { WearablesSettingsComponentView, WearablesSettingsSnapshot, WearablesSettingsView } from './wearables-settings-contract.js';
let component: WearablesSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: WearablesSettingsView | null = null;
export function disposeWearablesSettings(): void {
  if (component) { void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountWearablesSettings(host: HTMLElement, initial: WearablesSettingsSnapshot): WearablesSettingsView {
  if (target === host && view?.isCurrent() && view.profileId === initial.profileId) { view.update(initial); return view; }
  disposeWearablesSettings(); host.replaceChildren(); target = host;
  const owner = mount(WearablesSettings, { target: host, props: { initial } }); component = owner; flushSync();
  const root = host.querySelector('[data-wearables-view]');
  const isCurrent = () => !!root && host.contains(root) && component === owner && target === host && host.isConnected;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = { isCurrent, profileId: initial.profileId,
    update: next => apply(() => owner.update(next)),
    setManualCounts: message => apply(() => owner.setManualCounts(message)),
    setPending: (adapterId,busy) => apply(() => owner.setPending(adapterId,busy)),
    setImportProgress: progress => apply(() => owner.setImportProgress(progress)),
  };
  return view;
}
export function getWearablesSettingsView(): WearablesSettingsView | null { return view?.isCurrent() ? view : null; }

/** Native acquisition handoff: reveal the exact current Update now control. */
export function focusWearableRefreshControl(adapterId: string): boolean {
  if (!view?.isCurrent() || !target) return false;
  const row = [...target.querySelectorAll<HTMLElement>('[data-adapter]')].find(item => item.dataset.adapter === adapterId);
  const button = row?.querySelector<HTMLButtonElement>('[data-wearable-settings-action="sync-now"]');
  if (!row || !button || button.disabled) return false;
  if (row instanceof HTMLDetailsElement) row.open = true;
  button.scrollIntoView({ block: 'center' }); button.focus();
  return document.activeElement === button;
}
