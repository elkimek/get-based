export const PERSONA_AGREEMENT_VERSION = 1;
export const PERSONA_AGREEMENT_TEXT = 'I understand this persona is an AI-generated interpretation—not the real person or endorsed by them—and agree not to use it to impersonate a real person or imply their participation or endorsement without permission.';
export interface PersonaEditorContent { isNew: boolean; name: string; prompt: string; agreementRequired: boolean; }
export interface PersonaEditorActions { cancel(): unknown; generate(): unknown; save(): unknown; changed(): unknown; }
