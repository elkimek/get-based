// chat-discussion-picker.js - persona picker controls for multi-persona discussions

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { escapeHTML } from './utils.js';
import { getCustomPersonalities } from './chat-personalities.js';

export function removeDiscussPersonaPicker() {
  const picker = document.querySelector('.discuss-persona-picker');
  if (picker) picker.remove();
}

export function readDiscussPersonaPickerSelection() {
  const picker = document.querySelector('.discuss-persona-picker');
  if (!picker) return null;

  const lockedInputs = picker.querySelectorAll('input[data-locked="1"]');
  const checkedInputs = picker.querySelectorAll('input:checked:not([data-locked="1"])');
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
  return { allPersonas, newPersonas };
}

export function showDiscussPersonaPicker() {
  const allPersonas = [
    ...CHAT_PERSONALITIES.map(p => ({ id: p.id, name: p.name, icon: p.icon })),
    ...getCustomPersonalities().map(p => ({ id: p.id, name: p.name, icon: p.icon || '\u270f\ufe0f' }))
  ];
  if (allPersonas.length < 2) return;

  const existing = document.querySelector('.discuss-persona-picker');
  if (existing) { existing.remove(); return; }

  const container = document.querySelector('.chat-input-area');
  if (!container) return;

  const activePersonaIds = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName) {
      const bp = CHAT_PERSONALITIES.find(p => p.name === m.personalityName);
      if (bp) activePersonaIds.add(bp.id);
      else {
        const cp = getCustomPersonalities().find(p => p.name === m.personalityName);
        if (cp) activePersonaIds.add(cp.id);
      }
    }
  }
  const addingToExisting = activePersonaIds.size > 0;

  const picker = document.createElement('div');
  picker.className = 'discuss-persona-picker';
  picker.innerHTML = `
    <div class="discuss-picker-header">${addingToExisting ? 'Add another persona to the debate' : 'Pick two personas to debate'}</div>
    <div class="discuss-picker-list">
      ${allPersonas.map(p => {
        const isActive = activePersonaIds.has(p.id);
        const checked = isActive ? ' checked' : '';
        const locked = isActive && addingToExisting;
        return `<label class="discuss-picker-item${locked ? ' locked' : ''}">
        <input type="checkbox" value="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}" data-icon="${escapeHTML(p.icon)}"${checked}${locked ? ' disabled' : ''} data-locked="${locked ? '1' : ''}">
        <span>${p.icon} ${escapeHTML(p.name)}</span>
      </label>`;
      }).join('')}
    </div>
    <button class="discuss-picker-start" disabled onclick="startDiscussionFromPicker()">${addingToExisting ? 'Add to Discussion' : 'Start Debate'}</button>`;

  function updatePickerState() {
    const checkedCount = picker.querySelectorAll('input:checked:not([data-locked="1"])').length;
    const maxNewSelections = addingToExisting ? 1 : 2;
    const startBtn = picker.querySelector('.discuss-picker-start');
    startBtn.disabled = checkedCount !== maxNewSelections;
    if (checkedCount >= maxNewSelections) {
      picker.querySelectorAll('input:not(:checked):not([data-locked="1"])').forEach(cb => cb.disabled = true);
    } else {
      picker.querySelectorAll('input:not([data-locked="1"])').forEach(cb => cb.disabled = false);
    }
  }
  picker.addEventListener('change', updatePickerState);
  updatePickerState();

  container.insertBefore(picker, container.firstChild);
}
