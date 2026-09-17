// @ts-check
// feedback.js — Bug report / feedback modal (opens GitHub issue)

import { showNotification } from './utils.js';
import { getTheme } from './theme.js';
import { getAIProvider } from './api.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { getAppVersionRuntime, openUtilsRuntimeWindow } from './utils-runtime.js';
import { state } from './state.js';
import { getUnitProfileLabel } from './unit-profiles.js';

const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Bug Report', prefix: '[Bug]', ghLabel: 'bug', placeholder: 'Brief description of the bug' },
  { value: 'feature', label: 'Feature Request', prefix: '[Feature]', ghLabel: 'enhancement', placeholder: 'What feature would you like?' },
  { value: 'idea', label: 'Idea / Suggestion', prefix: '[Idea]', ghLabel: 'enhancement', placeholder: 'Describe your idea' },
  { value: 'other', label: 'Other', prefix: '', ghLabel: '', placeholder: 'What\'s on your mind?' },
];

const appWindow = /** @type {Window & typeof globalThis & { __feedbackActionDelegatesBound?: boolean }} */ (typeof window !== 'undefined' ? window : {});
const bugPrompt = 'What happened? What did you expect? Include steps to reproduce it.';
const feedbackInput = id => /** @type {HTMLInputElement | null} */ (document.getElementById(`feedback-${id}`));
const feedbackType = () => FEEDBACK_TYPES.find(t => t.value === feedbackInput('type')?.value) || FEEDBACK_TYPES[3];

async function copyFeedbackDraft() {
  const draft = feedbackInput('draft');
  if (!draft) return;
  try {
    await navigator.clipboard.writeText(draft.value);
    if (!draft.isConnected) return;
    showNotification('Report copied. Paste it into GitHub.', 'success');
  } catch {
    if (!draft.isConnected) return;
    draft.focus(); draft.select();
    showNotification('Copy the selected report, then paste it into GitHub.', 'info');
  }
}

function handleFeedbackEvent(event) {
  const target = /** @type {HTMLElement | null} */ (event.target);
  const action = target?.closest?.('[data-feedback-action]')?.getAttribute('data-feedback-action');
  if (event.type === 'click' && action === 'close') closeFeedbackModal();
  else if (event.type === 'click' && action === 'copy') void copyFeedbackDraft();
  else if (event.type === 'submit' && action === 'submit') submitFeedback();
  else if (['input', 'change'].includes(event.type) && target?.closest('.feedback-form') && target.id !== 'feedback-draft') {
    if (target.id === 'feedback-type') updatePlaceholders();
    const result = feedbackInput('result');
    if (result) result.hidden = true;
    return;
  } else return;
  event.preventDefault();
}

export function installFeedbackActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || appWindow.__feedbackActionDelegatesBound) return;
  appWindow.__feedbackActionDelegatesBound = true;
  for (const event of ['click', 'submit', 'change', 'input']) root.addEventListener(event, handleFeedbackEvent);
  appWindow.addEventListener('labcharts-profile-switched', () => {
    closeFeedbackModal();
    document.getElementById('feedback-modal')?.replaceChildren();
  });
}

if (typeof window !== 'undefined') installFeedbackActionDelegates();

export function openFeedbackModal() {
  const modal = document.getElementById('feedback-modal');
  const overlay = document.getElementById('feedback-modal-overlay');
  if (!modal || !overlay) return;
  // Keep a draft when dismissed or when a new tab is blocked. It lives only in
  // this page until a profile switch, never in profile storage, backups, or sync.
  if (!modal.querySelector('.feedback-form')) {
    const template = /** @type {HTMLTemplateElement | null} */ (document.getElementById('feedback-form-template'));
    if (!template) return;
    modal.className = 'modal gb-form-modal feedback-redesign-modal';
    modal.replaceChildren(template.content.cloneNode(true));
    updatePlaceholders();
  }
  openModalOverlay(overlay, { initialFocus: '#feedback-title', focusDelay: 50 });
}

export function closeFeedbackModal() {
  closeModalOverlay('feedback-modal-overlay');
}

export function submitFeedback() {
  const titleInput = feedbackInput('title'), descInput = feedbackInput('desc');
  const title = (titleInput?.value || '').trim(), desc = (descInput?.value || '').trim();
  if (!title || !desc) {
    showNotification(!title ? 'Please enter a title' : 'Describe the problem or suggestion before opening GitHub.', 'error');
    (!title ? titleInput : descInput)?.focus();
    return;
  }
  const typeDef = feedbackType();
  const issueTitle = `${typeDef.prefix} ${title}`.trim();

  // Collect system info
  const ua = navigator.userAgent;
  const browserSnippet = ua.length > 120 ? ua.slice(0, 120) + '...' : ua;
  const screenSize = `${appWindow.innerWidth}x${appWindow.innerHeight}`;
  const theme = getTheme();
  const providerKey = getAIProvider() || 'none';
  /** @type {Record<string, string>} */
  const providerLabels = { openrouter: 'OpenRouter', routstr: 'Routstr', ppq: 'PPQ', venice: 'Venice', ollama: 'Local AI', custom: 'Custom API' };
  const provider = providerLabels[providerKey] || providerKey;

  // Build issue body
  let body = `## Description\n${desc}\n`;
  body += `\n## System Info\n- App version: ${getAppVersionRuntime('unknown')}\n- Units: ${getUnitProfileLabel(state.unitSystem)}\n- Ranges: ${state.rangeMode}\n- Browser: ${browserSnippet}\n- Viewport: ${screenSize}\n- Theme: ${theme}\n- AI Provider: ${provider}\n`;

  const issue = new URL('https://github.com/elkimek/get-based/issues/new');
  issue.searchParams.set('title', issueTitle);
  issue.searchParams.set('body', body);
  if (typeDef.ghLabel) issue.searchParams.set('labels', typeDef.ghLabel);
  // Keep complete long reports through a copy/paste handoff, never truncate.
  const needsCopy = issue.href.length > 7500;
  if (needsCopy) issue.searchParams.delete('body');
  const url = issue.href;
  const result = document.getElementById('feedback-result');
  const status = feedbackInput('status'), draft = feedbackInput('draft');
  const link = result?.querySelector('a'), details = result?.querySelector('details');
  if (result && status && draft && link && details) {
    result.hidden = false;
    status.textContent = needsCopy
      ? 'This report is too long for a prefilled link. Copy it below, then paste it into GitHub.'
      : 'Draft ready. Tab did not open?';
    link.href = url;
    details.open = needsCopy;
    draft.value = body;
  }
  if (!needsCopy) {
    try { openUtilsRuntimeWindow(url, '_blank', 'noopener,noreferrer'); }
    catch { /* The visible link and complete draft remain available. */ }
  }
}

function updatePlaceholders() {
  const type = feedbackType();
  const title = feedbackInput('title'), description = feedbackInput('desc');
  if (title) title.placeholder = type.placeholder;
  if (description) description.placeholder = type.value === 'bug' ? bugPrompt : 'What would you like to change, and how would it help?';
}
