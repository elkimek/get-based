// Controller-to-component lifecycle with synchronous focus/receipt rendering.
import VoiceSettings, { mount, unmount, flushSync } from './components/VoiceSettings.svelte.native.js';
import { getVoiceSettingsSnapshot } from './settings-voice-view.js';
import { registerVoiceSettingsView } from './settings-voice-view-runtime.js';
import type { VoiceSettingsSnapshot, VoiceSettingsView } from './settings-voice-contract.js';
let mounted: (Omit<VoiceSettingsView, 'refresh'> & { refresh(next: VoiceSettingsSnapshot): void }) | null = null;
let target: HTMLElement | null = null;
let unregister: (() => void) | null = null;
export function disposeVoiceSettingsPanel(): void {
  unregister?.();
  unregister = null;
  if (mounted) {
    void unmount(mounted);
    flushSync();
  }
  mounted = null;
  target = null;
}
export function mountVoiceSettingsPanel(panel: HTMLElement): void {
  if (panel === target) return;
  disposeVoiceSettingsPanel();
  target = panel;
  mounted = mount(VoiceSettings, { target: panel, props: { initial: getVoiceSettingsSnapshot() } });
  flushSync();
  const component = mounted;
  unregister = registerVoiceSettingsView(panel, {
    refresh: () => flushSync(() => component.refresh(getVoiceSettingsSnapshot())),
    setModel: (kind, next) => flushSync(() => component.setModel(kind, next)),
    setHardwareDescription: (kind, text) => flushSync(() => component.setHardwareDescription(kind, text)),
    setTestStatus: (provider, text, error) => flushSync(() => component.setTestStatus(provider, text, error)),
    setCatalogStatus: (provider, text) => flushSync(() => component.setCatalogStatus(provider, text)),
    setKey: (provider, key, status) => flushSync(() => component.setKey(provider, key, status)),
    setActionBusy: (id, busy, label) => flushSync(() => component.setActionBusy(id, busy, label)),
  });
}
