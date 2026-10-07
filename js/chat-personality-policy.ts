import type { StoredCustomPersonality } from './chat-storage-safety.js';
import { PERSONA_AGREEMENT_VERSION } from './chat-persona-editor-contract.js';

export type PersonaEditorPersonality = { [Field in keyof Pick<StoredCustomPersonality, 'name' | 'promptText' | 'personaAgreement'>]?: unknown };
type PersonaAgreementReader = { [Field in keyof Pick<NonNullable<StoredCustomPersonality['personaAgreement']>, 'accepted' | 'version'>]?: unknown };
export interface PersonaEditorLocation { hostname?: unknown; }
export function isOfficialHostedPersonaApp(locationLike: PersonaEditorLocation | null | undefined = globalThis.location) {
  const hostname = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  return hostname === 'getbased.health' || hostname.endsWith('.getbased.health');
}

export function hasCurrentPersonaAgreement(personality: unknown) {
  return ((personality as PersonaEditorPersonality | null | undefined)?.personaAgreement as PersonaAgreementReader | null | undefined)?.accepted === true
    && ((personality as PersonaEditorPersonality).personaAgreement as PersonaAgreementReader).version === PERSONA_AGREEMENT_VERSION;
}

export function isCustomPersonalityUsable(personality: unknown, locationLike: PersonaEditorLocation | null | undefined = globalThis.location) {
  return !isOfficialHostedPersonaApp(locationLike) || hasCurrentPersonaAgreement(personality);
}
