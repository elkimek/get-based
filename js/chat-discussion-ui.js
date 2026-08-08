// @ts-check
// chat-discussion-ui.js - button and continuation controls for multi-persona discussions

import { state } from './state.js';
import { getThreadPersonaCount } from './chat-discussion-state.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { escapeHTML } from './utils.js';
import { refreshChatComposer } from './chat-composer.js';
import { updateAttachButtonVisibility } from './chat-images.js';

export {
  readDiscussPersonaPickerSelection,
  removeDiscussPersonaPicker,
  showDiscussPersonaPicker,
} from './chat-discussion-picker.js';

export function updateDiscussButton() {
  const btn = document.getElementById('chat-discuss-btn');
  if (!btn) return;
  const hasAssistant = state.chatHistory && state.chatHistory.some(m => m.role === 'assistant');
  if (!hasAssistant) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  const count = getThreadPersonaCount();
  const active = !!state.chatThreads.find(t => t.id === state.currentThreadId)?.discussionPersonas?.length;
  btn.style.opacity = count >= 2 ? '1' : '0.5';
  btn.title = active ? 'Add a discussion participant' : 'Start a discussion';
  btn.setAttribute?.('aria-label', btn.title);
}

/**
 * @param {any[]} personas
 * @param {string | null | undefined} originalPersonality
 * @param {{ onPersist?: () => void, pendingPersonas?: any[] }} [options]
 */
export function showDiscussContinuePrompt(personas, originalPersonality, { onPersist, pendingPersonas = [] } = {}) {
  const inputArea = document.querySelector('.chat-input-area');
  if (!inputArea) return;
  const existing = inputArea.querySelector('.chat-discussion-mode');
  if (existing) existing.remove();

  const prompt = document.createElement('section');
  prompt.className = 'chat-discussion-mode';
  prompt.setAttribute('aria-label', 'Active discussion');
  const participantNames = personas.map(persona => `${persona.icon || ''} ${persona.name || ''}`.trim());
  const pendingCount = Array.isArray(pendingPersonas) ? pendingPersonas.length : 0;
  prompt.innerHTML = `<div class="chat-discussion-mode-main">
      <div class="chat-discussion-mode-copy">
        <strong>Discussion</strong>
        <span class="chat-discussion-participants">${participantNames.map(name => `<span>${escapeHTML(name)}</span>`).join('')}</span>
      </div>
      <div class="chat-discussion-mode-actions">
        ${pendingCount ? `<button type="button" class="chat-discussion-resume" ${chatMessageActionAttrs('resume-discussion')}>Resume ${pendingCount}</button>` : ''}
        <button type="button" class="chat-discussion-pause" ${chatMessageActionAttrs('pause-discussion')} hidden>Pause round</button>
        <button type="button" class="chat-discussion-add" data-chat-action="start-discussion">Add participant</button>
        <button type="button" class="chat-discussion-end" ${chatMessageActionAttrs('end-discussion')}>End</button>
      </div>
    </div>
    <div class="chat-discussion-expectation">${pendingCount ? `Round paused · ${pendingCount} response${pendingCount === 1 ? '' : 's'} remaining.` : `Each message sends ${personas.length} sequential AI requests, one per participant. Provider usage is charged for every response.`}</div>
    <div class="chat-discussion-progress" role="status" aria-live="polite" hidden></div>`;
  inputArea.insertBefore(prompt, inputArea.firstChild);

  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  if (input) {
    input.placeholder = 'Reply to the discussion…';
    input.setAttribute('aria-describedby', 'chat-discussion-composer-help chat-composer-hint');
  }
  const expectation = prompt.querySelector('.chat-discussion-expectation');
  if (expectation) expectation.id = 'chat-discussion-composer-help';
  refreshChatComposer();
  const attachButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-attach-btn'));
  const hdButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-hd-btn'));
  if (attachButton) {
    attachButton.disabled = true;
    attachButton.title = 'End the discussion to attach images';
  }
  if (hdButton) hdButton.disabled = true;

  state._discussionPersonas = personas;
  state._discussionOriginalPersonality = originalPersonality;
  onPersist?.();
}

export function removeDiscussContinuePrompt() {
  const el = document.querySelector('.chat-discussion-mode');
  if (el) el.remove();
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  if (input) {
    input.placeholder = 'Ask about your lab results...';
    input.setAttribute('aria-describedby', 'chat-composer-hint');
  }
  refreshChatComposer();
  updateAttachButtonVisibility();
  const attachButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-attach-btn'));
  const hdButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-hd-btn'));
  if (attachButton) attachButton.disabled = false;
  if (hdButton) hdButton.disabled = false;
}

export function updateDiscussionProgress(persona, index, total, status = 'responding') {
  const progress = /** @type {HTMLElement | null} */ (document.querySelector('.chat-discussion-progress'));
  if (!progress) return;
  if (!persona || !total) {
    progress.hidden = true;
    progress.textContent = '';
    const pause = /** @type {HTMLButtonElement | null} */ (document.querySelector('.chat-discussion-pause'));
    if (pause) pause.hidden = true;
    return;
  }
  const pause = /** @type {HTMLButtonElement | null} */ (document.querySelector('.chat-discussion-pause'));
  if (pause) pause.hidden = false;
  progress.hidden = false;
  const name = `${persona.icon || ''} ${persona.name || 'Participant'}`.trim();
  progress.textContent = status === 'responding'
    ? `${name} is responding · ${index + 1} of ${total}`
    : `${name} ${status} · ${index + 1} of ${total}`;
}
