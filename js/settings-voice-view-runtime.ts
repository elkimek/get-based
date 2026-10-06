// UI access stays independent of the Svelte and service import graphs.
import type { VoiceSettingsView } from './settings-voice-contract.js';
const views = new WeakMap<HTMLElement, VoiceSettingsView>();
export function registerVoiceSettingsView(panel: HTMLElement, view: VoiceSettingsView): () => void {
  views.set(panel, view);
  return () => { if (views.get(panel) === view) views.delete(panel); };
}
export function getVoiceSettingsView(panel: HTMLElement): VoiceSettingsView | null {
  return panel.isConnected ? views.get(panel) || null : null;
}
export function currentVoiceSettingsView(): VoiceSettingsView | null {
  const panel = document.querySelector<HTMLElement>('[data-tab-panel="voice"]');
  return panel ? getVoiceSettingsView(panel) : null;
}
