// chat-panel.js — Chat panel chrome, web-search toggle, and input state

import { isAIPaused, supportsWebSearch } from './api.js';
import {
  loadChatThreads, ensureActiveThread, renderThreadList, restoreRailState,
} from './chat-threads.js';
import { loadChatHistory } from './chat-history.js';
import {
  loadChatPersonality, loadCustomPersonalities, updateChatHeaderModel, updateChatHeaderTitle, updatePersonalityBar,
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
import { connectDetectedCodex } from './agent-chat-settings.js';
import { updateAttachButtonVisibility } from './chat-images.js';
import { initChatLayout, syncChatLayout } from './chat-layout.js';
import { initChatModelControls, refreshChatModelControls } from './chat-model-controls.js';
import {
  hasChatResponseBackend, isCodexChatBackend, refreshChatBackendControl, refreshLocalAgentAvailability,
  setChatBackendFromUI as persistChatBackend,
} from './chat-backend-selection.js';

export { setChatNudge, updateChatNudge } from './chat-nudge.js';

interface ChatPresentationStylesheet {name:string;url:string;anchorSelector?:string}
interface PanelCallbackOperations {restoreDiscussionContinuePrompt?:(()=>unknown)|null;isChatStreaming?:(()=>unknown)|null;isVoicePlaybackActive?:(()=>unknown)|null;
refreshMobileDashboardActiveTab?:(()=>unknown)|null;restoreChatGenerationUI?:(()=>unknown)|null;restoreVoicePlaybackUi?:(()=>unknown)|null;
stopVoiceActivity?:((options?:{preservePlayback?:boolean})=>unknown)|null}
const CHAT_PRESENTATION_STYLESHEETS: ChatPresentationStylesheet[] = [
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

let chatPresentationStylesheetPromise: Promise<HTMLLinkElement[]>|null = null;
let chatPresentationStylesheetsLoaded = false;
let useChatPresentationStylesheetRetryUrl = false;

const panelCallbacks: Record<string,unknown> = {
  restoreDiscussionContinuePrompt: null,
  isChatStreaming: null,
  isVoicePlaybackActive: null,
  refreshMobileDashboardActiveTab: null,
  restoreChatGenerationUI: null,
  restoreVoicePlaybackUi: null,
  stopVoiceActivity: null,
};
let chatThreadInputBlocked = false;
let chatPanelReturnFocus: Element|null = null;
let chatPanelIntent = 0;

function setChatBackgroundInert(inert: boolean) {
  document.querySelectorAll('.main, .sidebar, .app-footer, .mobile-dashboard').forEach(element => {
    if (element.id === 'chat-panel' || element.contains(document.getElementById('chat-panel'))) return;
    (element as HTMLElement).inert = inert;
  });
}

function updateChatPanelAccessibility(panel: HTMLElement, open: boolean) {
  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches;
  panel.inert = !open;
  panel.setAttribute('aria-hidden', String(!open));
  panel.setAttribute('role', mobile ? 'dialog' : 'complementary');
  if (mobile && open) panel.setAttribute('aria-modal', 'true');
  else panel.removeAttribute('aria-modal');
  setChatBackgroundInert(open && mobile);
}

export function configureChatPanel(callbacks: unknown = {}) {
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

export function setChatWebSearchEnabled(val: unknown) {
  localStorage.setItem('labcharts-chat-websearch', val ? 'on' : 'off');
  updateWebSearchToggleVisibility();
}

export async function setChatBackendFromUI(value: unknown) {
  const select = document.getElementById('chat-backend-select') as HTMLSelectElement|null;
  if (value === 'codex') {
    if (select) select.disabled = true;
    try {
      await connectDetectedCodex();
      persistChatBackend('codex');
      showNotification('CLI agent selected for chat', 'success');
    } catch (error) {
      persistChatBackend('direct');
      showNotification(error instanceof Error ? error.message : 'CLI agent could not connect.', 'error', 9000);
    } finally {
      if (select) select.disabled = false;
      await refreshLocalAgentAvailability(true);
    }
  } else {
    persistChatBackend('direct');
  }
  updateChatInputState();
  updateChatHeaderModel();
  updateAttachButtonVisibility();
}

function updateWebSearchToggleVisibility() {
  const label = document.querySelector('#chat-panel .chat-websearch-toggle-label') as HTMLElement|null;
  if (label) label.style.display = !isCodexChatBackend() && supportsWebSearch() ? '' : 'none';
}

export function refreshWebSearchToggle() {
  updateWebSearchToggleVisibility();
}

export function isChatThreadInputBlocked() {
  return chatThreadInputBlocked;
}

function existingChatPresentationStylesheet(stylesheet: ChatPresentationStylesheet): HTMLLinkElement|null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector<HTMLLinkElement>(`link[data-chat-presentation-stylesheet="${stylesheet.name}"]`)
    || Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL(link.href).pathname
            === new URL(stylesheet.url).pathname;
        } catch {
          return false;
        }
      })
    || null
  );
}

function chatPresentationStylesheetUrl(stylesheet: ChatPresentationStylesheet) {
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

function loadChatPresentationStylesheet(stylesheet: ChatPresentationStylesheet, anchor: Element|null) {
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
  return new Promise<HTMLLinkElement>(function beginChatPresentationStylesheetLoad(resolve, reject) {
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

export function loadChatPresentationStylesheets(): Promise<Array<HTMLLinkElement|null>> {
  if (areChatPresentationStylesheetsLoaded()) {
    return Promise.resolve(CHAT_PRESENTATION_STYLESHEETS.map(
      stylesheet => existingChatPresentationStylesheet(stylesheet),
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
    }).catch(function resetChatPresentationStylesheetLoad(err: unknown): never {
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
  const button = document.querySelector('.chat-fullscreen-btn') as HTMLElement|null;
  button?.setAttribute('aria-pressed', String(next));
  button?.setAttribute('aria-label', next ? 'Exit fullscreen chat' : 'Enter fullscreen chat');
  if (button) button.title = next ? 'Exit fullscreen' : 'Enter fullscreen';
  syncChatLayout();
}

export async function openChatPanel(prefillMessage?: Parameters<typeof setChatInputValue>[0]) {
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
  refreshChatBackendControl();
  updateChatHeaderTitle();
  updatePersonalityBar();
  // Sync web search toggle
  const wsCb = panel.querySelector('#chat-websearch-checkbox') as HTMLInputElement|null;
  if (wsCb) wsCb.checked = getChatWebSearchEnabled();
  updateWebSearchToggleVisibility();
  // An in-flight answer exists only in the live request/typewriter state
  // until it finishes. Reloading the persisted thread here would erase that
  // partial response and typing indicator while the request kept running,
  // making the latest user message look interrupted and retryable. Replacing
  // message objects during speech would likewise invalidate its active turn.
  const generationInProgress = (panelCallbacks as PanelCallbackOperations).isChatStreaming?.() === true;
  const voicePlaybackInProgress = (panelCallbacks as PanelCallbackOperations).isVoicePlaybackActive?.() === true;
  const liveSessionInProgress = generationInProgress || voicePlaybackInProgress;
  // Load threads and ensure active thread
  let threadsLoaded = true;
  if (!liveSessionInProgress) {
    threadsLoaded = await loadChatThreads();
    chatThreadInputBlocked = threadsLoaded === false;
    if (threadsLoaded !== false) ensureActiveThread();
  }
  restoreRailState();
  initChatLayout();
  renderThreadList();
  renderSavedSummaries();
  if (!liveSessionInProgress && threadsLoaded !== false) await loadChatHistory();
  if (!generationInProgress) (panelCallbacks as PanelCallbackOperations).restoreDiscussionContinuePrompt?.();
  updateChatInputState();
  initChatComposer();
  initChatModelControls();
  if (generationInProgress) {
    (panelCallbacks as PanelCallbackOperations).restoreChatGenerationUI?.();
  } else if (!chatThreadInputBlocked) {
    if (prefillMessage) setChatInputValue(prefillMessage, { focus: true });
    else await restoreChatDraft(undefined, { focus: true });
  }
  (panelCallbacks as PanelCallbackOperations).restoreVoicePlaybackUi?.();
  return true;
}

export function updateChatInputState() {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement|null;
  const sendBtn = document.getElementById('chat-send-btn') as HTMLButtonElement|null;
  const voiceBtn = document.getElementById('chat-voice-btn') as HTMLButtonElement|null;
  const noAI = !hasChatResponseBackend();
  const blocked = chatThreadInputBlocked;
  if (input) {
    input.disabled = noAI || blocked;
    input.placeholder = blocked
      ? 'Conversations are paused to protect saved chats'
      : noAI
        ? (isAIPaused()
          ? 'AI features are paused'
          : isCodexChatBackend()
          ? 'Codex is unavailable on this computer'
          : 'Connect an AI provider in Settings to chat')
        : 'Ask about your lab results...';
  }
  if (sendBtn) sendBtn.disabled = noAI || blocked;
  // Dictation is routed through getbased's independent voice service. A CLI
  // agent handles the resulting text, but does not need to transport audio.
  if (voiceBtn) voiceBtn.disabled = noAI || blocked;
  refreshChatComposer();
  updateWebSearchToggleVisibility();
}

if (typeof globalThis.addEventListener === 'function') {
  const refreshAgentChatUi = () => {
    refreshChatBackendControl();
    updateChatInputState();
    updateChatHeaderModel();
    updateAttachButtonVisibility();
    refreshChatModelControls();
  };
  globalThis.addEventListener('getbased:chat-backend-changed', refreshAgentChatUi);
  globalThis.addEventListener('getbased:agent-host-settings-changed', refreshAgentChatUi);
  globalThis.addEventListener('getbased:agent-model-catalog-changed', refreshAgentChatUi);
}

export function closeChatPanel() {
  chatPanelIntent += 1;
  (panelCallbacks as PanelCallbackOperations).stopVoiceActivity?.({ preservePlayback: true });
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
  (returnTarget as (Element & {focus?:()=>unknown})|null)?.focus?.();
  chatPanelReturnFocus = null;
  (panelCallbacks as PanelCallbackOperations).refreshMobileDashboardActiveTab?.();
}
