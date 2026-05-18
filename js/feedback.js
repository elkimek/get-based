// feedback.js — Bug report / feedback modal (opens GitHub issue)

import { escapeHTML, showNotification } from './utils.js';
import { getTheme } from './theme.js';
import { getAIProvider } from './api.js';

const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Bug Report', prefix: '[Bug]', ghLabel: 'bug', placeholder: 'Brief description of the bug' },
  { value: 'feature', label: 'Feature Request', prefix: '[Feature]', ghLabel: 'enhancement', placeholder: 'What feature would you like?' },
  { value: 'idea', label: 'Idea / Suggestion', prefix: '[Idea]', ghLabel: 'idea', placeholder: 'Describe your idea' },
  { value: 'other', label: 'Other', prefix: '', ghLabel: '', placeholder: 'What\'s on your mind?' },
];

export function openFeedbackModal() {
  const modal = document.getElementById('feedback-modal');
  const overlay = document.getElementById('feedback-modal-overlay');
  const typeOptions = FEEDBACK_TYPES.map(t => `<option value="${t.value}">${escapeHTML(t.label)}</option>`).join('');
  modal.className = 'modal gb-form-modal feedback-redesign-modal';
  modal.innerHTML = `
    <div class="gb-modal-head feedback-modal-head">
      <div>
        <div class="gb-modal-kicker">GitHub issue</div>
        <div class="gb-modal-title">Send Feedback</div>
      </div>
      <button type="button" class="modal-close" aria-label="Close" onclick="closeFeedbackModal()">&times;</button>
    </div>
    <div class="gb-form-body feedback-form-body">
    <form class="feedback-form" onsubmit="event.preventDefault();submitFeedback()">
      <div class="feedback-field">
        <label class="feedback-label" for="feedback-type">Type</label>
        <select class="feedback-select" id="feedback-type" onchange="window._updateFeedbackPlaceholder()">
          ${typeOptions}
        </select>
      </div>
      <div class="feedback-field">
        <label class="feedback-label" for="feedback-title">Title</label>
        <input class="feedback-input" id="feedback-title" placeholder="${escapeHTML(FEEDBACK_TYPES[0].placeholder)}" required>
      </div>
      <div class="feedback-field">
        <label class="feedback-label" for="feedback-desc">Description</label>
        <textarea class="feedback-textarea" id="feedback-desc" placeholder="Provide details, steps to reproduce, or any context that helps..."></textarea>
      </div>
      <p class="feedback-notice">Opens a GitHub issue in a new tab. Requires a GitHub account.</p>
      <div class="feedback-actions">
        <button type="button" class="feedback-action-btn feedback-action-secondary" onclick="closeFeedbackModal()">Cancel</button>
        <button type="submit" class="feedback-action-btn feedback-action-primary">Submit</button>
      </div>
    </form>
    </div>`;
  overlay.classList.add('show');
  // Focus the title input
  setTimeout(() => document.getElementById('feedback-title')?.focus(), 50);
}

export function closeFeedbackModal() {
  document.getElementById('feedback-modal-overlay').classList.remove('show');
}

export function submitFeedback() {
  const typeVal = document.getElementById('feedback-type')?.value || 'other';
  const title = (document.getElementById('feedback-title')?.value || '').trim();
  const desc = (document.getElementById('feedback-desc')?.value || '').trim();

  if (!title) {
    showNotification('Please enter a title', 'error');
    document.getElementById('feedback-title')?.focus();
    return;
  }

  const typeDef = FEEDBACK_TYPES.find(t => t.value === typeVal) || FEEDBACK_TYPES[3];

  // Build issue title
  const issueTitle = typeDef.prefix ? `${typeDef.prefix} ${title}` : title;

  // Collect system info
  const ua = navigator.userAgent;
  const browserSnippet = ua.length > 120 ? ua.slice(0, 120) + '...' : ua;
  const screenSize = `${screen.width}x${screen.height}`;
  const theme = getTheme();
  const providerKey = getAIProvider() || 'none';
  const providerLabels = { openrouter: 'OpenRouter', routstr: 'Routstr', ppq: 'PPQ', venice: 'Venice', ollama: 'Local AI', custom: 'Custom API' };
  const provider = providerLabels[providerKey] || providerKey;

  // Build issue body
  let body = `## Description\n${desc || 'No description provided.'}\n`;
  if (typeVal === 'bug') {
    body += `\n## Steps to Reproduce\n1. \n2. \n3. \n`;
  }
  body += `\n## System Info\n- Browser: ${browserSnippet}\n- Screen: ${screenSize}\n- Theme: ${theme}\n- AI Provider: ${provider}\n`;

  // Build URL (encodeURIComponent for proper %20 encoding)
  let url = `https://github.com/elkimek/get-based/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(body)}`;
  if (typeDef.ghLabel) url += `&labels=${encodeURIComponent(typeDef.ghLabel)}`;
  window.open(url, '_blank');
  showNotification('Opening GitHub issue...', 'success');
  closeFeedbackModal();
}

function _updateFeedbackPlaceholder() {
  const typeVal = document.getElementById('feedback-type')?.value || 'bug';
  const typeDef = FEEDBACK_TYPES.find(t => t.value === typeVal) || FEEDBACK_TYPES[0];
  const titleInput = document.getElementById('feedback-title');
  if (titleInput) titleInput.placeholder = typeDef.placeholder;
}

Object.assign(window, { openFeedbackModal, closeFeedbackModal, submitFeedback, _updateFeedbackPlaceholder });
