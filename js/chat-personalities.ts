import { requestChatLayoutSync } from './chat-layout-view.js';
import { updateChatHeaderTitle } from './chat-header-presentation.js';
export { updateChatHeaderTitle, updateChatHeaderModel, updateSummaryButton } from './chat-header-presentation.js';
// chat-personalities.js - chat personality selection, custom personas, and header status

import type { PersonaEditorLocation } from './chat-personality-editor.js';

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { escapeAttr, showNotification } from './utils.js';
import { saveChatThreadIndex, renderThreadList } from './chat-threads.js';
import { configurePersonalityPicker, getPersonalityPickerView, closePersonalityPickerView } from './chat-personality-picker-view.js';
import { updateChatContextStatus } from './chat-context-status.js';
import {
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
  requestChatLayoutSync();
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
