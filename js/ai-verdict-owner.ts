// Requests and retry sequences belong to one profile/root and profile-switch epoch.
import { state } from './state.js';
let sequence = 0;
let identity: { profile: string; root: typeof state.importedData; key: string } | null = null;
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => { identity = null; });
}
export function captureAIVerdictOwner() {
  if (!identity || identity.profile !== state.currentProfile || identity.root !== state.importedData) {
    identity = { profile: state.currentProfile, root: state.importedData, key: `verdict-${++sequence}` };
  }
  const captured = identity;
  return {
    profile: captured.profile,
    root: captured.root,
    key: (id: string) => `${captured.key}:${id}`,
    current: () => identity === captured && captured.profile === state.currentProfile && captured.root === state.importedData,
  };
}
