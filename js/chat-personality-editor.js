// @ts-check
// chat-personality-editor.js — custom persona dialog and hosted-use agreement policy.

import { escapeHTML } from './utils.js';
import { openAppendedModalOverlay } from './modal-lifecycle.js';

const PERSONA_AGREEMENT_VERSION = 1;
const PERSONA_AGREEMENT_TEXT = 'I understand this persona is an AI-generated interpretation—not the real person or endorsed by them—and agree not to use it to impersonate a real person or imply their participation or endorsement without permission.';
const EDITOR_OVERLAY_ID = 'chat-personality-editor-overlay';

export function isOfficialHostedPersonaApp(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  return hostname === 'getbased.health' || hostname.endsWith('.getbased.health');
}

export function hasCurrentPersonaAgreement(personality) {
  return personality?.personaAgreement?.accepted === true
    && personality.personaAgreement.version === PERSONA_AGREEMENT_VERSION;
}

export function isCustomPersonalityUsable(personality, locationLike = globalThis.location) {
  return !isOfficialHostedPersonaApp(locationLike) || hasCurrentPersonaAgreement(personality);
}

export function getPersonaAgreementCheckbox() {
  return /** @type {HTMLInputElement | null} */ (
    document.getElementById('chat-personality-agreement-checkbox')
  );
}

export function buildPersonaAgreementRecord(overlay, acceptedAt = new Date()) {
  if (!getPersonaAgreementCheckbox()?.checked) return null;
  return {
    accepted: true,
    version: PERSONA_AGREEMENT_VERSION,
    acceptedAt: acceptedAt.toISOString(),
    host: overlay?.dataset.personaAgreementHost || '',
    statement: PERSONA_AGREEMENT_TEXT,
  };
}

function agreementMarkup(required, inputAttrs) {
  if (!required) {
    return '<span class="chat-personality-disclaimer">Custom personas are AI-generated interpretations—not the real person or endorsed by them. Use them responsibly and do not imply a real person participated without permission.</span>';
  }
  return `<label class="chat-personality-agreement" for="chat-personality-agreement-checkbox">
    <input id="chat-personality-agreement-checkbox" type="checkbox" required ${inputAttrs('mark-dirty')}>
    <span>${escapeHTML(PERSONA_AGREEMENT_TEXT)}</span>
  </label>`;
}

export function openPersonaEditorDialog({
  isNew,
  personality,
  locationLike,
  actionAttrs,
  inputAttrs,
  onCancel,
}) {
  const agreementRequired = isOfficialHostedPersonaApp(locationLike);
  const agreementHost = String(locationLike?.hostname || '').toLowerCase().replace(/\.$/, '');
  const overlay = document.createElement('div');
  overlay.id = EDITOR_OVERLAY_ID;
  overlay.className = 'modal-overlay chat-personality-editor-overlay';
  overlay.dataset.personaAgreementRequired = String(agreementRequired);
  if (agreementRequired) overlay.dataset.personaAgreementHost = agreementHost;
  overlay.innerHTML = `<div class="modal chat-personality-editor" role="dialog" aria-modal="true" aria-labelledby="chat-personality-editor-title" aria-describedby="chat-personality-editor-description">
    <div class="chat-personality-editor-head">
      <div>
        <div class="chat-personality-editor-kicker">Custom persona</div>
        <h2 id="chat-personality-editor-title">${isNew ? 'Create a personality' : 'Edit personality'}</h2>
        <p id="chat-personality-editor-description">Generate a starting point or write your own. Everything stays editable before you save.</p>
      </div>
      <button type="button" class="chat-personality-editor-close" ${actionAttrs('cancel-custom')} aria-label="Close personality editor">&times;</button>
    </div>
    <div class="chat-personality-editor-body">
      <label class="chat-personality-editor-label" for="chat-personality-custom-name">Person, archetype, or communication style</label>
      <div class="chat-personality-custom-header">
        <input type="text" id="chat-personality-custom-name" class="chat-personality-custom-name-input" placeholder="e.g. A longevity researcher" maxlength="60" ${inputAttrs('mark-dirty')}>
        <button id="chat-personality-generate-btn" class="chat-personality-generate-btn" type="button" ${actionAttrs('generate-custom')}>Generate draft</button>
      </div>
      <div class="chat-personality-editor-prompt-head">
        <label class="chat-personality-editor-label" for="chat-personality-custom-prompt">Persona instructions</label>
        <span>Review and edit the generated draft</span>
      </div>
      <textarea id="chat-personality-custom-prompt" class="chat-personality-custom-textarea" placeholder="Describe how you want the AI to communicate, or enter a name above and generate a draft..." spellcheck="true" ${inputAttrs('resize-and-mark-dirty')}></textarea>
    </div>
    <div class="chat-personality-custom-footer">
      ${agreementMarkup(agreementRequired, inputAttrs)}
      <div class="chat-personality-editor-actions">
        <button class="chat-personality-custom-cancel" type="button" ${actionAttrs('cancel-custom')}>Cancel</button>
        <button class="chat-personality-custom-save" type="button" ${actionAttrs('save-custom')} disabled>${isNew ? 'Save persona' : 'Save changes'}</button>
      </div>
    </div>
  </div>`;
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    void onCancel();
  });
  openAppendedModalOverlay(overlay, () => { void onCancel(); }, {
    initialFocus: '#chat-personality-custom-name',
    focusDelay: 50,
    scrollLock: true,
    focusTrapOptions: { closeOnEscape: false },
  });
  const nameInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('chat-personality-custom-name')
  );
  const textarea = /** @type {HTMLTextAreaElement | null} */ (
    document.querySelector('.chat-personality-custom-textarea')
  );
  if (nameInput && personality) {
    nameInput.value = personality.name !== 'Custom Personality' ? personality.name : '';
  }
  if (textarea && personality) textarea.value = personality.promptText;
  return overlay;
}
