// chat-personalities.js - chat personality selection, custom personas, and header status

import type { PersonaEditorLocation } from './chat-personality-editor.js';

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { escapeAttr, escapeHTML, showNotification } from './utils.js';
import { getAIProvider, isVeniceE2EEActive, isPpqPrivateModeActive, isRoutstrPrivateModeActive } from './api.js';
import { saveChatThreadIndex, renderThreadList } from './chat-threads.js';
import { configurePersonalityPicker, getPersonalityPickerView, closePersonalityPickerView } from './chat-personality-picker-view.js';
import { e2eeLockHTML } from './chat-attestation.js';
import { updateChatContextStatus } from './chat-context-status.js';
import {
  getChatBackendDisplay, hasChatResponseBackend, isCodexChatBackend,
} from './chat-backend-selection.js';
import {
  getChatProviderAttestation,
  renderChatMessagesRuntime,
} from './chat-runtime.js';
import { hasCurrentPersonaAgreement, isCustomPersonalityUsable, isOfficialHostedPersonaApp } from './chat-personality-policy.js';
import { getCustomPersonalities, getActivePersonality } from './chat-personality-models.js';
import { configurePersonaEditing, getPersonaEditorIdentity, isPersonalityDirty, confirmDiscardPersonalityChanges, startNewCustomPersonality, editCustomPersonality, deleteCustomPersonality } from './chat-personality-editing.js';
export { getCustomPersonalities, loadCustomPersonalities, saveCustomPersonalities, getCustomPersonality, getActivePersonality, getCustomPersonalityText, loadChatPersonality, pickPersonaIcon } from './chat-personality-models.js';
export { startNewCustomPersonality, editCustomPersonality, deleteCustomPersonality, cancelCustomPersonalityEditor, saveCustomPersonality, generateCustomPersonality, markPersonalityDirty, snapshotPersonalityClean, autoResizePersonaTextarea } from './chat-personality-editing.js';

export { hasCurrentPersonaAgreement, isCustomPersonalityUsable, isOfficialHostedPersonaApp };
export { updateChatContextStatus };

function chatPersonalityAttrName(name: unknown) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

function chatPersonalityAttrs(kind: string, action: unknown, attrs: Record<string, unknown> = {}) {
  let html = `data-chat-personality-${kind}="${escapeAttr(action)}"`;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    html += ` data-chat-personality-${escapeAttr(chatPersonalityAttrName(name))}="${escapeAttr(String(value))}"`;
  }
  return html;
}

export function chatPersonalityActionAttrs(action: unknown, attrs: Record<string, unknown> = {}) {
  return chatPersonalityAttrs('action', action, attrs);
}

export function chatPersonalityInputAttrs(action: unknown, attrs: Record<string, unknown> = {}) {
  return chatPersonalityAttrs('input', action, attrs);
}

export async function setChatPersonality(id: string, opts: { locationLike?: PersonaEditorLocation | null; keepPickerOpen?: unknown; } = {}) {
  const prev = state.currentChatPersonality;
  const profile = state.currentProfile, threadId = state.currentThreadId, owner = getPersonaEditorIdentity();
  const ownsSelection = () => state.currentProfile === profile && state.currentThreadId === threadId && getPersonaEditorIdentity() === owner;
  if (isPersonalityDirty() && !(await confirmDiscardPersonalityChanges())) return;
  if (!ownsSelection() || state.currentChatPersonality !== prev) return;
  if (!CHAT_PERSONALITIES.some(item => item.id === id) && !getCustomPersonalities().some(item => item.id === id)) return;
  if (id.startsWith('custom_')) {
    const custom = getCustomPersonalities().find(personality => personality.id === id);
    const locationLike = opts.locationLike || globalThis.location;
    if (custom && !isCustomPersonalityUsable(custom, locationLike)) {
      editCustomPersonality(id, locationLike);
      showNotification('Review and accept the persona use agreement before using this personality.', 'info', 5000);
      return;
    }
  }
  if (prev === id) {
    if (!opts.keepPickerOpen) closePersonalityPickerView();
    return;
  }
  // Switch personality in-place - keep current conversation so users can
  // get different perspectives in the same thread.
  state.currentChatPersonality = id;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, id);
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    thread.personality = id;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    await saveChatThreadIndex();
    if (!ownsSelection() || state.currentChatPersonality !== id) return;
  }
  if (state.chatHistory.length === 0) {
    renderChatMessagesRuntime();
  }
  renderThreadList();
  updateChatHeaderTitle();
  updatePersonalityBar();
  const personality = getActivePersonality();
  showNotification(`Switched to ${personality.name}`, 'info');
  if (!opts.keepPickerOpen) closePersonalityPickerView();
}

export function updateChatHeaderTitle() {
  const el = (document.querySelector('.chat-header-title') as HTMLElement | null);
  if (!el) return;
  const names: string[] = [];
  const seen = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName && !seen.has(m.personalityName)) {
      seen.add(m.personalityName);
      names.push((m.personalityIcon || '') + ' ' + m.personalityName);
    }
  }
  if (names.length >= 2) {
    el.textContent = `${names[0]} + ${names.length - 1} perspective${names.length === 2 ? '' : 's'}`;
    el.title = names.join(', ');
  } else {
    const p = getActivePersonality();
    el.textContent = p.name;
    el.removeAttribute('title');
  }
  updateChatHeaderModel();
  updateSummaryButton();
}

export function updateSummaryButton() {
  const btn = document.querySelector<HTMLButtonElement>('.chat-summary-btn');
  if (!btn) return;
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  const hasSummary = !!thread?.summary;
  const eligibleMessages = state.chatHistory.filter(message => !message.hidden && !message.joined).length;
  const canSummarize = hasSummary || eligibleMessages >= 4;
  btn.classList.toggle('has-summary', hasSummary);
  btn.disabled = !canSummarize;
  btn.title = hasSummary
    ? 'View summary'
    : canSummarize
      ? 'Summarize this conversation'
      : 'Summary available after four messages';
  btn.setAttribute('aria-label', btn.title);
}

let _headerListenerAdded = false;

export function updateChatHeaderModel() {
  const el = document.querySelector('.chat-header-model');
  if (!el) return;
  if (!_headerListenerAdded) {
    el.addEventListener('e2ee-attestation', () => updateChatHeaderModel());
    _headerListenerAdded = true;
  }
  if (!hasChatResponseBackend()) { el.textContent = ''; updateChatContextStatus(); return; }
  updateChatContextStatus();
  const display = getChatBackendDisplay();
  if (isCodexChatBackend()) {
    el.textContent = display;
    return;
  }
  const provider = getAIProvider();
  const e2ee = provider === 'venice' && isVeniceE2EEActive();
  const ppqPrivate = provider === 'ppq' && isPpqPrivateModeActive();
  const routstrPrivate = provider === 'routstr' && isRoutstrPrivateModeActive();
  if (e2ee || ppqPrivate || routstrPrivate) {
    el.innerHTML = escapeHTML(display) + e2eeLockHTML(getChatProviderAttestation(provider));
  } else {
    el.textContent = display;
  }
}

let pickerVersion = 0;
let pickerContext: { profile: typeof state.currentProfile; thread: typeof state.currentThreadId; view: ReturnType<typeof getPersonalityPickerView>; version: number; } | null = null;
function acceptsPickerAction(version: number): boolean {
  return !!pickerContext && pickerContext.version === version
    && pickerContext.profile === state.currentProfile && pickerContext.thread === state.currentThreadId
    && pickerContext.view === getPersonalityPickerView();
}
export function updatePersonalityBar() {
  const view = getPersonalityPickerView();
  if (!view) return;
  pickerContext = { profile: state.currentProfile, thread: state.currentThreadId, view, version: ++pickerVersion };
  const personality = getActivePersonality();
  view.render({
    version: pickerContext.version,
    current: state.currentChatPersonality,
    name: personality.name,
    icon: personality.icon,
    options: [
      ...CHAT_PERSONALITIES.map(item => ({ id: item.id, name: item.name, icon: item.icon, description: item.description, custom: false })),
      ...getCustomPersonalities().map(item => ({ id: item.id, name: item.name, icon: item.icon, description: 'Custom personality', custom: true })),
    ],
  });
}

export function togglePersonalityBar() {
  const view = getPersonalityPickerView(); if (!view) return;
  if (view.isOpen()) { view.setOpen(false); return; }
  document.querySelector('.discuss-persona-picker')?.remove();
  document.getElementById('chat-thread-rail')?.classList.remove('open');
  document.querySelector('.chat-rail-toggle')?.setAttribute('aria-expanded', 'false');
  updatePersonalityBar(); view.setOpen(true);
}

configurePersonaEditing({ refresh: updatePersonalityBar, header: updateChatHeaderTitle });
configurePersonalityPicker({
  refresh: updatePersonalityBar, toggle: togglePersonalityBar,
  select: (id, version) => { if (acceptsPickerAction(version)) return setChatPersonality(id); return undefined; },
  edit: (id, version) => { if (acceptsPickerAction(version)) editCustomPersonality(id); },
  delete: (id, version) => { if (acceptsPickerAction(version)) return deleteCustomPersonality(id); return undefined; },
  add: version => { if (acceptsPickerAction(version)) startNewCustomPersonality(); },
});
