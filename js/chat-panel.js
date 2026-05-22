// chat-panel.js — Chat panel chrome, web-search toggle, and input state

import { hasAIProvider, isAIPaused, supportsWebSearch } from './api.js';
import {
  loadChatThreads, ensureActiveThread, renderThreadList, restoreRailState,
} from './chat-threads.js';
import { loadChatHistory } from './chat-history.js';
import {
  loadChatPersonality, updateChatHeaderTitle, updatePersonalityBar,
} from './chat-personalities.js';
import { renderSavedSummaries } from './chat-summaries.js';
import { updateLensIndicator } from './lens.js';
import { dismissCurrentChatNudge } from './chat-nudge.js';

export { setChatNudge, updateChatNudge } from './chat-nudge.js';

const panelCallbacks = {
  restoreDiscussionContinuePrompt: null,
};

export function configureChatPanel(callbacks = {}) {
  Object.assign(panelCallbacks, callbacks);
}

// ═══════════════════════════════════════════════
// WEB SEARCH
// ═══════════════════════════════════════════════
export function getChatWebSearchEnabled() {
  return localStorage.getItem('labcharts-chat-websearch') === 'on';
}

export function setChatWebSearchEnabled(val) {
  localStorage.setItem('labcharts-chat-websearch', val ? 'on' : 'off');
  updateWebSearchToggleVisibility();
}

function updateWebSearchToggleVisibility() {
  const label = document.querySelector('#chat-panel .chat-websearch-toggle-label');
  if (label) label.style.display = supportsWebSearch() ? '' : 'none';
}

export function refreshWebSearchToggle() {
  updateWebSearchToggleVisibility();
}

// ═══════════════════════════════════════════════
// PANEL OPEN/CLOSE
// ═══════════════════════════════════════════════
export function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) {
    closeChatPanel();
  } else {
    openChatPanel();
  }
}

// Toggle the chat panel between its default side-rail width (560-1060px
// depending on viewport) and full-viewport width. Mirrors the class on
// <body> so the dashboard-auto-shift CSS can suppress the side-rail
// padding when fullscreen takes over. Persists across sessions.
export function toggleChatFullscreen() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  const next = !panel.classList.contains('chat-panel-fullscreen');
  panel.classList.toggle('chat-panel-fullscreen', next);
  document.body.classList.toggle('chat-fullscreen', next);
  localStorage.setItem('labcharts-chat-fullscreen', next ? 'true' : 'false');
}

export async function openChatPanel(prefillMessage) {
  const panel = document.getElementById('chat-panel');
  const backdrop = document.getElementById('chat-backdrop');
  if (!panel || !backdrop) return;
  panel.classList.add('open');
  // Restore the user's last fullscreen preference. Persisted in
  // localStorage so reopening chat keeps the mode they chose last.
  // Use toggle(force) so previous-session state is fully overwritten —
  // not just additive — when localStorage flips to false.
  const fullscreen = localStorage.getItem('labcharts-chat-fullscreen') === 'true';
  panel.classList.toggle('chat-panel-fullscreen', fullscreen);
  // Body classes drive the dashboard auto-shift — `.chat-open` adds
  // padding-right matching the chat panel's responsive width so the
  // dashboard reflows instead of hiding behind the panel; `.chat-
  // fullscreen` cancels the shift since fullscreen covers everything.
  document.body.classList.add('chat-open');
  document.body.classList.remove('chat-autostart-reserved');
  document.body.classList.toggle('chat-fullscreen', fullscreen);
  backdrop.classList.add('open');
  // Backdrop is now pointer-events: none — opening chat no longer
  // locks scrolling on the dashboard. Removed `body.style.overflow=hidden`
  // (which would also break the dashboard's scroll affordance).
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.add('hidden');
  dismissCurrentChatNudge();
  loadChatPersonality();
  updateChatHeaderTitle();
  updateLensIndicator();
  updatePersonalityBar();
  // Sync web search toggle
  const wsCb = panel.querySelector('#chat-websearch-checkbox');
  if (wsCb) wsCb.checked = getChatWebSearchEnabled();
  updateWebSearchToggleVisibility();
  // Load threads and ensure active thread
  loadChatThreads();
  ensureActiveThread();
  restoreRailState();
  renderThreadList();
  renderSavedSummaries();
  await loadChatHistory();
  panelCallbacks.restoreDiscussionContinuePrompt?.();
  updateChatInputState();
  const input = document.getElementById('chat-input');
  if (input) {
    if (prefillMessage) input.value = prefillMessage;
    input.focus();
  }
}

export function updateChatInputState() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const noAI = !hasAIProvider();
  if (input) {
    input.disabled = noAI;
    input.placeholder = noAI
      ? (isAIPaused() ? 'AI features are paused' : 'Connect an AI provider in Settings to chat')
      : 'Ask about your lab results...';
  }
  if (sendBtn) sendBtn.disabled = noAI;
  updateWebSearchToggleVisibility();
}

export function closeChatPanel() {
  document.getElementById('chat-panel')?.classList.remove('open');
  document.getElementById('chat-backdrop')?.classList.remove('open');
  // body.style.overflow no longer set on open (so nothing to restore)
  // Drop the dashboard-shift body classes so the layout reflows back.
  document.body.classList.remove('chat-open', 'chat-fullscreen', 'cards-focus', 'import-focus', 'chat-autostart-reserved');
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.remove('hidden');
  window.refreshMobileDashboardActiveTab?.();
}
