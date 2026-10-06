import AiSettings, { mount, unmount, flushSync } from './components/AiSettings.svelte.native.js';
import type { AiSettingsSnapshot, AiSettingsActions, AiSettingsComponentView, AiSettingsView } from './ai-settings-contract.js';

let component: AiSettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: AiSettingsView | null = null;

export function disposeAiSettings(): void {
  if (component) {
    void unmount(component);
    flushSync();
  }
  component = null;
  target = null;
  view = null;
}

export function getAiSettingsView(): AiSettingsView | null {
  return view?.isCurrent() ? view : null;
}

export function setAiSettingsSelection(provider: unknown): void {
  getAiSettingsView()?.setSelected(String(provider));
}

export function mountAiSettings(host: HTMLElement, initial: AiSettingsSnapshot, actions: AiSettingsActions): AiSettingsView {
  disposeAiSettings();
  host.replaceChildren();
  target = host;
  let owned: AiSettingsView | null = null;
  const owner = mount(AiSettings, {
    target: host,
    props: {
      initial,
      actions: {
        pause: enabled => owned?.isCurrent() ? actions.pause(enabled) : undefined,
        select: (provider, button) => owned?.isCurrent() ? actions.select(provider, button) : undefined,
      },
    },
  });
  component = owner;
  flushSync();
  const root = host.querySelector('[data-ai-settings-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  const apply = (callback: () => void) => {
    if (isCurrent()) flushSync(callback);
  };
  view = {
    isCurrent,
    getSnapshot: () => owner.getSnapshot(),
    getProviderHost: () => isCurrent() ? owner.getProviderHost() : null,
    setEnabled: enabled => apply(() => owner.setEnabled(enabled)),
    setSelected: provider => apply(() => owner.setSelected(provider)),
    setProviderStatus: phase => apply(() => owner.setProviderStatus(phase)),
    setPauseError: message => apply(() => owner.setPauseError(message)),
  };
  owned = view;
  return view;
}
