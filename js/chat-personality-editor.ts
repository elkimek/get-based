// chat-personality-editor.js — custom persona dialog and hosted-use agreement policy.

import { mountPersonaEditor } from './chat-persona-editor-component.js';
import { PERSONA_AGREEMENT_VERSION, PERSONA_AGREEMENT_TEXT, type PersonaEditorActions } from './chat-persona-editor-contract.js';

import type { PersonaEditorPersonality, PersonaEditorLocation } from './chat-personality-policy.js';
import { isOfficialHostedPersonaApp } from './chat-personality-policy.js';
export { hasCurrentPersonaAgreement, isCustomPersonalityUsable, isOfficialHostedPersonaApp } from './chat-personality-policy.js';
export type { PersonaEditorPersonality, PersonaEditorLocation } from './chat-personality-policy.js';

export interface PersonaEditorDialogOptions {
  isNew: unknown;
  personality?: PersonaEditorPersonality | null;
  locationLike?: PersonaEditorLocation | null;
  actions: Omit<PersonaEditorActions, 'cancel'>;
  onCancel: () => unknown;
}


export function getPersonaAgreementCheckbox() {
  return (
    document.getElementById('chat-personality-agreement-checkbox') as HTMLInputElement | null
  );
}

export function buildPersonaAgreementRecord(overlay: HTMLElement | null | undefined, acceptedAt: Pick<Date, 'toISOString'> = new Date()) {
  if (!getPersonaAgreementCheckbox()?.checked) return null;
  return {
    accepted: true as const,
    version: PERSONA_AGREEMENT_VERSION,
    acceptedAt: acceptedAt.toISOString(),
    host: overlay?.dataset.personaAgreementHost || '',
    statement: PERSONA_AGREEMENT_TEXT,
  };
}

export function openPersonaEditorDialog({ isNew, personality, locationLike, actions, onCancel }: PersonaEditorDialogOptions) {
  const agreementRequired = isOfficialHostedPersonaApp(locationLike);
  const agreementHost = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  return mountPersonaEditor({
    isNew: !!isNew, name: personality?.name === 'Custom Personality' ? '' : String(personality?.name || ''),
    prompt: String(personality?.promptText || ''), agreementRequired,
  }, { ...actions, cancel: onCancel }, agreementHost);
}
