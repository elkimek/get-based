import PpqSettings, { mount, unmount, flushSync } from './components/PpqSettings.svelte.native.js';
import type { PpqSettingsComponentView, PpqSettingsSnapshot, PpqSettingsView } from './ppq-settings-contract.js';

let cleanup = () => {};
let submitCustom = () => {};
let cancelCustom = () => {};
export function configurePpqSettingsLifecycle(callbacks: { cleanup(): void; submitCustom(): void; cancelCustom(): void }): void {
  cleanup = callbacks.cleanup; submitCustom = callbacks.submitCustom; cancelCustom = callbacks.cancelCustom;
}
let component: PpqSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: PpqSettingsView | null = null;
export function disposePpqSettings(): void {
  cleanup();
  if (component) { component.clearKey(); component.hideAccount(); component.clearPayment(); void unmount(component); flushSync(); }
  component = null; target = null; view = null;
}
export function mountPpqSettings(host: HTMLElement, initial: PpqSettingsSnapshot): PpqSettingsView {
  if (target === host && view?.isCurrent()) { view.refresh(initial); return view; }
  disposePpqSettings(); host.replaceChildren(); target = host;
  const owner = mount(PpqSettings, { target: host, props: { initial, submitCustom: () => submitCustom(), cancelCustom: () => cancelCustom() } });
  component = owner; flushSync();
  const root = host.querySelector('[data-ppq-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (action: () => void) => { if (isCurrent()) flushSync(action); };
  view = {
    isCurrent, getModels: () => owner.getModels(), refresh: next => apply(() => owner.refresh(next)), setModels: next => apply(() => owner.setModels(next)),
    setSaveState: state => apply(() => owner.setSaveState(state)), setBalance: status => apply(() => owner.setBalance(status)),
    setMode: mode => apply(() => owner.setMode(mode)),
    readKey: () => isCurrent() ? owner.readKey() : '', setStoredKey: key => apply(() => owner.setStoredKey(key)),
    clearKey: () => apply(() => owner.clearKey()),
    showAccount: value => apply(() => owner.showAccount(value)), readAccount: () => isCurrent() ? owner.readAccount() : null,
    hideAccount: () => apply(() => owner.hideAccount()), setAccountCopied: () => apply(() => owner.setAccountCopied()),
    setTopup: state => apply(() => owner.setTopup(state)), getTopup: () => owner.getTopup(),
    readCustomAmount: () => isCurrent() ? owner.readCustomAmount() : '', focusCustomAmount: () => apply(() => owner.focusCustomAmount()),
    showPayment: value => apply(() => owner.showPayment(value)), readPayment: () => isCurrent() ? owner.readPayment() : '',
    clearPayment: () => apply(() => owner.clearPayment()), setPaymentCopied: () => apply(() => owner.setPaymentCopied()),
  };
  return view;
}
export function getPpqSettingsView(): PpqSettingsView | null { return view?.isCurrent() ? view : null; }
