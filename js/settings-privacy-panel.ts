// Component lifecycle stays out of the Sun/privacy service import graph.
import PrivacySettings, { mount, unmount, flushSync } from './components/PrivacySettings.svelte.native.js';
import { getPrivacyPreferencesSnapshot, updatePrivacyStatusCard } from './settings-privacy.js';
import { registerPrivacySettingsView } from './settings-privacy-view.js';
import type { PrivacySettingsView } from './settings-privacy-contract.js';
let mounted: PrivacySettingsView | null = null;
let target: HTMLElement | null = null;
let unregister: (() => void) | null = null;
export function disposePrivacySettingsPanel(): void {
  unregister?.(); unregister = null;
  if (mounted) { void unmount(mounted); flushSync(); }
  mounted = null; target = null;
}
export function mountPrivacySettingsPanel(): void {
  const host = document.getElementById('privacy-settings-content');
  if (!host || host === target) return;
  disposePrivacySettingsPanel(); target = host;
  mounted = mount(PrivacySettings, { target: host, props: { initial: getPrivacyPreferencesSnapshot() } });
  flushSync();
  const instance = mounted;
  unregister = registerPrivacySettingsView({
    setConsent: next => flushSync(() => instance.setConsent(next)),
    setProtection: (enhanced, model) => flushSync(() => instance.setProtection(enhanced, model)),
    configure: open => flushSync(() => instance.configure(open)),
    setConnection: next => flushSync(() => instance.setConnection(next)),
  });
  void updatePrivacyStatusCard();
}
