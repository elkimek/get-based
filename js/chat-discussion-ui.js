// chat-discussion-ui.js - button and continuation controls for multi-persona discussions

import { state } from './state.js';
import { getThreadPersonaCount } from './chat-discussion-state.js';

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
  btn.style.opacity = count >= 2 ? '1' : '0.5';
  btn.title = count >= 2
    ? 'Add another persona to the debate'
    : 'Add another persona for a second opinion';
}

export function showDiscussContinuePrompt(personas, originalPersonality, { onPersist } = {}) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const existing = container.querySelector('.chat-discuss-continue');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.className = 'chat-discuss-continue';
  prompt.innerHTML = '<input type="text" class="chat-discuss-steer" id="chat-discuss-steer" autocomplete="off" placeholder="Steer the debate (optional)..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();continueDiscussion()}">' +
    '<div class="chat-discuss-continue-actions">' +
    '<button class="chat-discuss-continue-btn" onclick="continueDiscussion()">Continue</button>' +
    '<button class="chat-discuss-done-btn" onclick="endDiscussion()">Done</button>' +
    '</div>';
  container.appendChild(prompt);
  container.scrollTop = container.scrollHeight;

  const steerInput = prompt.querySelector('.chat-discuss-steer');
  if (steerInput) steerInput.focus();

  state._discussionPersonas = personas;
  state._discussionOriginalPersonality = originalPersonality;
  onPersist?.();
}

export function removeDiscussContinuePrompt() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const el = container.querySelector('.chat-discuss-continue');
  if (el) el.remove();
}
