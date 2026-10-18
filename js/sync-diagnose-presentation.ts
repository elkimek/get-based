import { renderHTML as diagnoseHTML } from './components/SyncDiagnoseModal.svelte.html.js';
import { projectSyncDiagnose, type SyncDiagnoseInput } from './sync-diagnose-projector.js';

/** Serialize the already projected literal fields through the genuine owner. */
export function renderSyncDiagnosePresentation(input: SyncDiagnoseInput): string {
  return diagnoseHTML({view: projectSyncDiagnose(input)});
}
export { renderSyncIdentityRotation } from './sync-diagnose-identity-presentation.js';
export type { GeneratedIdentityQR, SyncRotationView } from './sync-diagnose-identity-presentation.js';
