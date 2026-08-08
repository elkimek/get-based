// @ts-check
// chat-discussion-picker.js - persona picker controls for multi-persona discussions

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { escapeHTML } from './utils.js';
import { getCustomPersonalities, isCustomPersonalityUsable } from './chat-personalities.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';

export function removeDiscussPersonaPicker() {
  const picker = document.querySelector('.discuss-persona-picker');
  if (picker) picker.remove();
}

export function readDiscussPersonaPickerSelection() {
  const picker = document.querySelector('.discuss-persona-picker');
  if (!picker) return null;

  const lockedInputs = /** @type {NodeListOf<HTMLInputElement>} */ (picker.querySelectorAll('input[data-locked="1"]'));
  const checkedInputs = /** @type {NodeListOf<HTMLInputElement>} */ (picker.querySelectorAll('input:checked:not([data-locked="1"])'));
  const allSelected = [...lockedInputs, ...checkedInputs];
  if (lockedInputs.length > 0) {
    if (checkedInputs.length !== 1) return null;
  } else if (allSelected.length !== 2) {
    return null;
  }

  const lockedIds = new Set(Array.from(lockedInputs).map(cb => cb.value));
  const allPersonas = allSelected.map(cb => ({
    id: cb.value,
    name: cb.dataset.name,
    icon: cb.dataset.icon
  }));
  const newPersonas = allPersonas.filter(p => !lockedIds.has(p.id));
  return {
    allPersonas,
    newPersonas,
    addingToExisting: /** @type {HTMLElement} */ (picker).dataset.existingDiscussion === 'true',
  };
}

export function showDiscussPersonaPicker() {
  const allPersonas = [
    ...CHAT_PERSONALITIES.map(p => ({ id: p.id, name: p.name, icon: p.icon })),
    ...getCustomPersonalities()
      .filter(personality => isCustomPersonalityUsable(personality))
      .map(p => ({ id: p.id, name: p.name, icon: p.icon || '\u270f\ufe0f' }))
  ];
  if (allPersonas.length < 2) return;

  const existing = document.querySelector('.discuss-persona-picker');
  if (existing) { existing.remove(); return; }

  const container = document.querySelector('.chat-input-area');
  if (!container) return;

  document.querySelector('.chat-personality-bar')?.classList.remove('open');
  document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
  document.getElementById('chat-thread-rail')?.classList.remove('open');
  document.querySelector('.chat-rail-toggle')?.setAttribute('aria-expanded', 'false');

  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  const existingDiscussion = Array.isArray(thread?.discussionPersonas)
    && thread.discussionPersonas.length >= 2
    && !thread.discussionEnded;
  const activePersonaIds = new Set(
    existingDiscussion
      ? thread.discussionPersonas.map(persona => persona.id)
      : [state.currentChatPersonality || 'default'],
  );
  const addingToExisting = existingDiscussion;

  const picker = document.createElement('div');
  picker.className = 'discuss-persona-picker';
  picker.dataset.existingDiscussion = String(addingToExisting);
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-modal', 'false');
  picker.setAttribute('aria-labelledby', 'discuss-picker-title');
  picker.innerHTML = `
    <div class="discuss-picker-heading">
      <div>
        <div class="discuss-picker-header" id="discuss-picker-title">${addingToExisting ? 'Add a participant' : 'Start a discussion'}</div>
        <div class="discuss-picker-help">${addingToExisting ? 'The new participant responds once, then joins future rounds.' : 'Choose one additional perspective. They respond now; both perspectives join your next message.'}</div>
      </div>
      <button type="button" class="discuss-picker-close" data-chat-action="start-discussion" aria-label="Close participant picker">&times;</button>
    </div>
    <fieldset class="discuss-picker-fieldset">
      <legend class="sr-only">Discussion participants</legend>
      <div class="discuss-picker-list">
      ${allPersonas.map(p => {
        const isActive = activePersonaIds.has(p.id);
        const checked = isActive ? ' checked' : '';
        const locked = isActive;
        return `<label class="discuss-picker-item${locked ? ' locked' : ''}">
        <input type="checkbox" value="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}" data-icon="${escapeHTML(p.icon)}"${checked}${locked ? ' disabled' : ''} data-locked="${locked ? '1' : ''}">
        <span>${escapeHTML(p.icon)} ${escapeHTML(p.name)}</span>
      </label>`;
      }).join('')}
      </div>
    </fieldset>
    <div class="discuss-picker-usage" role="note"></div>
    <button class="discuss-picker-start" type="button" disabled ${chatMessageActionAttrs('start-discussion-from-picker')}>${addingToExisting ? 'Add participant' : 'Start discussion'}</button>`;

  function updatePickerState() {
    const checkedCount = picker.querySelectorAll('input:checked:not([data-locked="1"])').length;
    const lockedCount = lockedInputsCount(picker);
    const maxNewSelections = addingToExisting || lockedCount > 0 ? 1 : 2;
    const startBtn = /** @type {HTMLButtonElement | null} */ (picker.querySelector('.discuss-picker-start'));
    if (!startBtn) return;
    startBtn.disabled = checkedCount !== maxNewSelections;
    const immediateResponses = checkedCount;
    const futureResponses = lockedCount + checkedCount;
    const usage = picker.querySelector('.discuss-picker-usage');
    if (usage) usage.textContent = checkedCount
      ? `Starts ${immediateResponses} AI response${immediateResponses === 1 ? '' : 's'} now. Future messages use ${futureResponses} sequential responses; provider usage is charged for each.`
      : 'Each participant adds a separate AI request and provider charge to future messages.';
    if (checkedCount !== maxNewSelections) {
      const remaining = maxNewSelections - checkedCount;
      startBtn.textContent = `Choose ${remaining} more`;
    } else {
      startBtn.textContent = addingToExisting
        ? `Add participant · ${immediateResponses} response`
        : `Start discussion · ${immediateResponses} response${immediateResponses === 1 ? '' : 's'}`;
    }
    if (checkedCount >= maxNewSelections) {
      picker.querySelectorAll('input:not(:checked):not([data-locked="1"])').forEach(cb => {
        /** @type {HTMLInputElement} */ (cb).disabled = true;
      });
    } else {
      picker.querySelectorAll('input:not([data-locked="1"])').forEach(cb => {
        /** @type {HTMLInputElement} */ (cb).disabled = false;
      });
    }
  }
  picker.addEventListener('change', updatePickerState);
  picker.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    picker.remove();
    /** @type {HTMLElement | null} */ (document.getElementById('chat-discuss-btn'))?.focus();
  });
  updatePickerState();

  container.insertBefore(picker, container.firstChild);
  /** @type {HTMLElement | null} */ (picker.querySelector('input:not(:disabled)'))?.focus();
}

function lockedInputsCount(picker) {
  return picker.querySelectorAll('input[data-locked="1"]').length;
}
