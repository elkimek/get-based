// @ts-check
// chat-panel.js — Chat panel chrome, web-search toggle, and input state

import { hasAIProvider, isAIPaused, supportsWebSearch } from './api.js';
import {
  loadChatThreads, ensureActiveThread, renderThreadList, restoreRailState,
} from './chat-threads.js';
import { loadChatHistory } from './chat-history.js';
import {
  loadChatPersonality, loadCustomPersonalities, updateChatHeaderTitle, updatePersonalityBar,
} from './chat-personalities.js';
import { renderSavedSummaries } from './chat-summaries.js';
import { dismissCurrentChatNudge } from './chat-nudge.js';
import {
  startMobileChatViewportSync,
  stopMobileChatViewportSync,
} from './chat-mobile-viewport.js';
import {
  initChatComposer, refreshChatComposer, restoreChatDraft, setChatInputValue,
} from './chat-composer.js';
import { showNotification } from './utils.js';

export { setChatNudge, updateChatNudge } from './chat-nudge.js';

/** @typedef {{ name: string, url: string, anchorSelector?: string }} ChatPresentationStylesheet */

/** @type {ChatPresentationStylesheet[]} */
const CHAT_PRESENTATION_STYLESHEETS = [
  { name: 'panel-open', url: new URL('../css/chat-panel-open.css', import.meta.url).href },
  { name: 'personality', url: new URL('../css/chat-personality.css', import.meta.url).href },
  { name: 'messages', url: new URL('../css/chat-messages.css', import.meta.url).href },
  { name: 'composer', url: new URL('../css/chat-composer.css', import.meta.url).href },
  { name: 'onboarding', url: new URL('../css/chat-onboarding.css', import.meta.url).href },
  { name: 'responsive', url: new URL('../css/chat-responsive.css', import.meta.url).href },
  { name: 'actions', url: new URL('../css/chat-actions.css', import.meta.url).href },
  { name: 'mobile', url: new URL('../css/chat-mobile.css', import.meta.url).href },
  {
    name: 'redesign-open',
    url: new URL('../css/chat-redesign-open.css', import.meta.url).href,
    anchorSelector: '[data-chat-redesign-open-stylesheet-anchor]',
  },
];

/** @type {Promise<HTMLLinkElement[]> | null} */
let chatPresentationStylesheetPromise = null;
let chatPresentationStylesheetsLoaded = false;
let useChatPresentationStylesheetRetryUrl = false;

/** @type {{
 *   restoreDiscussionContinuePrompt: (() => void) | null,
 *   isChatStreaming: (() => boolean) | null,
 *   refreshMobileDashboardActiveTab: (() => void) | null,
 *   restoreChatGenerationUI: (() => boolean) | null,
 *   stopVoiceActivity: (() => void) | null,
 * }} */
const panelCallbacks = {
  restoreDiscussionContinuePrompt: null,
  isChatStreaming: null,
  refreshMobileDashboardActiveTab: null,
  restoreChatGenerationUI: null,
  stopVoiceActivity: null,
};
let chatThreadInputBlocked = false;
let chatPanelReturnFocus = null;
let chatPanelIntent = 0;

function setChatBackgroundInert(inert) {
  document.querySelectorAll('.main, .sidebar, .app-footer, .mobile-dashboard').forEach(element => {
    if (element.id === 'chat-panel' || element.contains(document.getElementById('chat-panel'))) return;
    /** @type {HTMLElement} */ (element).inert = inert;
  });
}

function updateChatPanelAccessibility(panel, open) {
  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches;
  panel.inert = !open;
  panel.setAttribute('aria-hidden', String(!open));
  panel.setAttribute('role', mobile ? 'dialog' : 'complementary');
  if (mobile && open) panel.setAttribute('aria-modal', 'true');
  else panel.removeAttribute('aria-modal');
  setChatBackgroundInert(open && mobile);
}

/** @param {{ restoreDiscussionContinuePrompt?: (() => void) | null, isChatStreaming?: (() => boolean) | null, refreshMobileDashboardActiveTab?: (() => void) | null, restoreChatGenerationUI?: (() => boolean) | null, stopVoiceActivity?: (() => void) | null }} [callbacks] */
export function configureChatPanel(callbacks = {}) {
  const previous = { ...panelCallbacks };
  Object.assign(panelCallbacks, callbacks);
  return previous;
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
  const label = /** @type {HTMLElement | null} */ (document.querySelector('#chat-panel .chat-websearch-toggle-label'));
  if (label) label.style.display = supportsWebSearch() ? '' : 'none';
}

export function refreshWebSearchToggle() {
  updateWebSearchToggleVisibility();
}

export function isChatThreadInputBlocked() {
  return chatThreadInputBlocked;
}

/** @param {ChatPresentationStylesheet} stylesheet */
function existingChatPresentationStylesheet(stylesheet) {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLLinkElement | null} */ (
    document.querySelector(`link[data-chat-presentation-stylesheet="${stylesheet.name}"]`)
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname
            === new URL(stylesheet.url).pathname;
        } catch {
          return false;
        }
      })
    || null
  );
}

/** @param {ChatPresentationStylesheet} stylesheet */
function chatPresentationStylesheetUrl(stylesheet) {
  if (!useChatPresentationStylesheetRetryUrl) return stylesheet.url;
  const retryUrl = new URL(stylesheet.url);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function areChatPresentationStylesheetsLoaded() {
  return chatPresentationStylesheetsLoaded || CHAT_PRESENTATION_STYLESHEETS.every(
    stylesheet => !!existingChatPresentationStylesheet(stylesheet)?.sheet,
  );
}

/**
 * @param {ChatPresentationStylesheet} stylesheet
 * @param {Element | null} anchor
 * @returns {Promise<HTMLLinkElement>}
 */
function loadChatPresentationStylesheet(stylesheet, anchor) {
  const existing = existingChatPresentationStylesheet(stylesheet);
  if (existing?.sheet) {
    return Promise.resolve(existing);
  }
  const link = existing || document.createElement('link');
  if (!existing) {
    link.rel = 'stylesheet';
    link.href = chatPresentationStylesheetUrl(stylesheet);
    link.dataset.chatPresentationStylesheet = stylesheet.name;
  }
  return new Promise(function beginChatPresentationStylesheetLoad(resolve, reject) {
    link.addEventListener('load', function markChatPresentationStylesheetLoaded() {
      resolve(link);
    }, { once: true });
    link.addEventListener('error', function rejectChatPresentationStylesheetLoad() {
      link.remove();
      reject(new Error(`Chat ${stylesheet.name} stylesheet could not be loaded`));
    }, { once: true });
    if (!link.isConnected) {
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }
  });
}

/** @returns {Promise<HTMLLinkElement[]>} */
export function loadChatPresentationStylesheets() {
  if (areChatPresentationStylesheetsLoaded()) {
    return Promise.resolve(CHAT_PRESENTATION_STYLESHEETS.map(
      stylesheet => /** @type {HTMLLinkElement} */ (existingChatPresentationStylesheet(stylesheet)),
    ));
  }
  if (!chatPresentationStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Chat presentation stylesheets require a document'));
    }
    const defaultAnchor = document.querySelector('[data-chat-presentation-stylesheet-anchor]');
    chatPresentationStylesheetPromise = Promise.all(
      CHAT_PRESENTATION_STYLESHEETS.map(stylesheet => loadChatPresentationStylesheet(
        stylesheet,
        stylesheet.anchorSelector ? document.querySelector(stylesheet.anchorSelector) : defaultAnchor,
      )),
    ).then(function markChatPresentationStylesheetsLoaded(links) {
      chatPresentationStylesheetsLoaded = true;
      return links;
    }).catch(function resetChatPresentationStylesheetLoad(err) {
      chatPresentationStylesheetPromise = null;
      chatPresentationStylesheetsLoaded = false;
      useChatPresentationStylesheetRetryUrl = true;
      throw err;
    });
  }
  return chatPresentationStylesheetPromise;
}

export async function loadChatPresentationStylesheetsForAction() {
  try {
    await loadChatPresentationStylesheets();
    return true;
  } catch (err) {
    console.error('Failed to load Chat presentation', err);
    showNotification('Chat could not be opened. Try again.', 'error');
    return false;
  }
}

// ═══════════════════════════════════════════════
// PANEL OPEN/CLOSE
// ═══════════════════════════════════════════════
export function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return false;
  if (panel.classList.contains('open')) {
    closeChatPanel();
    return false;
  } else {
    return openChatPanel();
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
  const button = /** @type {HTMLElement | null} */ (document.querySelector('.chat-fullscreen-btn'));
  button?.setAttribute('aria-pressed', String(next));
  button?.setAttribute('aria-label', next ? 'Exit fullscreen chat' : 'Enter fullscreen chat');
  if (button) button.title = next ? 'Exit fullscreen' : 'Enter fullscreen';
}

export async function openChatPanel(prefillMessage) {
  const openIntent = ++chatPanelIntent;
  const panel = document.getElementById('chat-panel');
  const backdrop = document.getElementById('chat-backdrop');
  if (!panel || !backdrop) return false;
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!(await loadChatPresentationStylesheetsForAction())) return false;
  if (openIntent !== chatPanelIntent) return false;
  chatPanelReturnFocus = returnFocus;
  panel.classList.add('open');
  updateChatPanelAccessibility(panel, true);
  startMobileChatViewportSync(panel);
  // Restore the user's last fullscreen preference. Persisted in
  // localStorage so reopening chat keeps the mode they chose last.
  // Use toggle(force) so previous-session state is fully overwritten —
  // not just additive — when localStorage flips to false.
  const fullscreen = localStorage.getItem('labcharts-chat-fullscreen') === 'true';
  panel.classList.toggle('chat-panel-fullscreen', fullscreen);
  const fullscreenButton = panel.querySelector('.chat-fullscreen-btn');
  fullscreenButton?.setAttribute('aria-pressed', String(fullscreen));
  fullscreenButton?.setAttribute('aria-label', fullscreen ? 'Exit fullscreen chat' : 'Enter fullscreen chat');
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
  await loadCustomPersonalities();
  loadChatPersonality();
  updateChatHeaderTitle();
  updatePersonalityBar();
  // Sync web search toggle
  const wsCb = /** @type {HTMLInputElement | null} */ (panel.querySelector('#chat-websearch-checkbox'));
  if (wsCb) wsCb.checked = getChatWebSearchEnabled();
  updateWebSearchToggleVisibility();
  // An in-flight answer exists only in the live request/typewriter state
  // until it finishes. Reloading the persisted thread here would erase that
  // partial response and typing indicator while the request kept running,
  // making the latest user message look interrupted and retryable.
  const generationInProgress = panelCallbacks.isChatStreaming?.() === true;
  // Load threads and ensure active thread
  let threadsLoaded = true;
  if (!generationInProgress) {
    threadsLoaded = await loadChatThreads();
    chatThreadInputBlocked = threadsLoaded === false;
    if (threadsLoaded !== false) ensureActiveThread();
  }
  restoreRailState();
  renderThreadList();
  renderSavedSummaries();
  if (!generationInProgress && threadsLoaded !== false) await loadChatHistory();
  if (!generationInProgress) panelCallbacks.restoreDiscussionContinuePrompt?.();
  updateChatInputState();
  initChatComposer();
  if (generationInProgress) {
    panelCallbacks.restoreChatGenerationUI?.();
  } else if (!chatThreadInputBlocked) {
    if (prefillMessage) setChatInputValue(prefillMessage, { focus: true });
    else await restoreChatDraft(undefined, { focus: true });
  }
  return true;
}

export function updateChatInputState() {
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  const sendBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-send-btn'));
  const voiceBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-voice-btn'));
  const noAI = !hasAIProvider();
  const blocked = chatThreadInputBlocked;
  if (input) {
    input.disabled = noAI || blocked;
    input.placeholder = blocked
      ? 'Conversations are paused to protect saved chats'
      : noAI
        ? (isAIPaused() ? 'AI features are paused' : 'Connect an AI provider in Settings to chat')
        : 'Ask about your lab results...';
  }
  if (sendBtn) sendBtn.disabled = noAI || blocked;
  if (voiceBtn) voiceBtn.disabled = noAI || blocked;
  refreshChatComposer();
  updateWebSearchToggleVisibility();
}

export function closeChatPanel() {
  chatPanelIntent += 1;
  panelCallbacks.stopVoiceActivity?.();
  stopMobileChatViewportSync();
  const panel = document.getElementById('chat-panel');
  panel?.classList.remove('open');
  if (panel) updateChatPanelAccessibility(panel, false);
  document.querySelector('.chat-personality-bar')?.classList.remove('open');
  document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
  document.querySelector('.discuss-persona-picker')?.remove();
  document.getElementById('chat-backdrop')?.classList.remove('open');
  // body.style.overflow no longer set on open (so nothing to restore)
  // Drop the dashboard-shift body classes so the layout reflows back.
  document.body.classList.remove('chat-open', 'chat-fullscreen', 'cards-focus', 'import-focus', 'chat-autostart-reserved');
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.remove('hidden');
  const returnTarget = chatPanelReturnFocus?.isConnected ? chatPanelReturnFocus : fab;
  returnTarget?.focus?.();
  chatPanelReturnFocus = null;
  panelCallbacks.refreshMobileDashboardActiveTab?.();
}
