import type { LabOverlayControlIdentity, LabOverlayKey } from '../shared/lab-overlay-contract.js';
import { state } from './state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
export function permittedLabOverlays() {
  const labs = isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS), insight = isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
  return { notes: labs && insight, supplements: labs && isContextSourceEnabled(CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS), cycle: labs && insight && state.profileSex === 'female' };
}
export function canDiscloseLabOverlays(record: Pick<LabOverlayControlIdentity, 'profileId' | 'parameters'>) {
  const policy = permittedLabOverlays(); return record.profileId === state.currentProfile && Object.keys(record.parameters).every(key => policy[key as LabOverlayKey]);
}
