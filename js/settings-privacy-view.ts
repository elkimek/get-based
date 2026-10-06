// Cycle-free presentation boundary. Importing privacy/Sun services does not load Svelte.
import type { PrivacySettingsView, PrivacyConnectionView } from './settings-privacy-contract.js';
let current: PrivacySettingsView | null = null;
export function registerPrivacySettingsView(view: PrivacySettingsView): () => void {
  current = view;
  return () => { if (current === view) current = null; };
}
export function getPrivacySettingsView(): PrivacySettingsView | null { return current; }
export function getPrivacyConnectionView(): PrivacyConnectionView | null {
  const owner = current;
  if (!owner) return null;
  return {
    isCurrent: () => current === owner,
    update: next => { if (current === owner) owner.setConnection(next); },
  };
}
