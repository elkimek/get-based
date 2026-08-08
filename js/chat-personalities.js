// @ts-check
// chat-personalities.js - chat personality selection, custom personas, and header status

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { escapeAttr, escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, getActiveModelDisplay, isVeniceE2EEActive, isPpqPrivateModeActive, isRoutstrPrivateModeActive } from './api.js';
import { saveChatThreadIndex, renderThreadList } from './chat-threads.js';
import { CHAT_ICON_EDIT, CHAT_ICON_X } from './chat-icons.js';
import { e2eeLockHTML } from './chat-attestation.js';
import { getLensSummary } from './lens.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import {
  getChatProviderAttestation,
  notifyCustomPersonalitySavedRuntime,
  openChatContextModalRuntime,
  renderChatMessagesRuntime,
} from './chat-runtime.js';
import { createUniqueId } from './unique-id.js';
import { removeModalOverlay } from './modal-lifecycle.js';
import {
  getCachedCustomPersonalities,
  loadCustomPersonalitiesFromStorage,
  recordCustomPersonalityDeletion,
  saveCustomPersonalitiesToStorage,
} from './chat-personality-storage.js';
import {
  buildPersonaAgreementRecord,
  getPersonaAgreementCheckbox,
  hasCurrentPersonaAgreement,
  isCustomPersonalityUsable,
  isOfficialHostedPersonaApp,
  openPersonaEditorDialog,
} from './chat-personality-editor.js';

export { hasCurrentPersonaAgreement, isCustomPersonalityUsable, isOfficialHostedPersonaApp };

const PERSONA_ICONS = ['🧠', '🎭', '🔮', '🌿', '⚡', '🦊', '🧬', '🌊', '🔥', '🏛️'];

const CHAT_PERSONALITY_ACTION_ATTR = 'data-chat-personality-action';
const CHAT_PERSONALITY_INPUT_ATTR = 'data-chat-personality-input';
const CHAT_PERSONALITY_ID_ATTR = 'data-chat-personality-id';
const CHAT_PERSONALITY_ACTION_SELECTOR = `[${CHAT_PERSONALITY_ACTION_ATTR}]`;
const CHAT_PERSONALITY_INPUT_SELECTOR = `[${CHAT_PERSONALITY_INPUT_ATTR}]`;
const chatPersonalityDelegateRoots = new WeakSet();

function chatPersonalityAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

function chatPersonalityAttrs(kind, action, attrs = {}) {
  let html = `data-chat-personality-${kind}="${escapeAttr(action)}"`;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    html += ` data-chat-personality-${escapeAttr(chatPersonalityAttrName(name))}="${escapeAttr(String(value))}"`;
  }
  return html;
}

export function chatPersonalityActionAttrs(action, attrs = {}) {
  return chatPersonalityAttrs('action', action, attrs);
}

export function chatPersonalityInputAttrs(action, attrs = {}) {
  return chatPersonalityAttrs('input', action, attrs);
}

function closestChatPersonalityElement(target, selector) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function' ? target.closest(selector) : null
  );
}

function rootContains(root, el) {
  return !!(root && typeof root.contains === 'function' && root.contains(el));
}

function containPersonalityClick(event) {
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
}

function handleChatPersonalityClick(event) {
  const actionEl = closestChatPersonalityElement(event.target, CHAT_PERSONALITY_ACTION_SELECTOR);
  if (!actionEl || !rootContains(event.currentTarget, actionEl)) return;
  const action = actionEl.getAttribute(CHAT_PERSONALITY_ACTION_ATTR);
  const id = actionEl.getAttribute(CHAT_PERSONALITY_ID_ATTR) || '';
  event.preventDefault();
  if (action === 'edit-custom') {
    containPersonalityClick(event);
    if (id) editCustomPersonality(id);
  } else if (action === 'delete-custom') {
    containPersonalityClick(event);
    if (id) void deleteCustomPersonality(id);
  } else if (action === 'start-new-custom') {
    startNewCustomPersonality();
  } else if (action === 'generate-custom') {
    void generateCustomPersonality();
  } else if (action === 'save-custom') {
    void saveCustomPersonality();
  } else if (action === 'cancel-custom') {
    void cancelCustomPersonalityEditor();
  }
}

function handleChatPersonalityInput(event) {
  const actionEl = closestChatPersonalityElement(event.target, CHAT_PERSONALITY_INPUT_SELECTOR);
  if (!actionEl || !rootContains(event.currentTarget, actionEl)) return;
  const action = actionEl.getAttribute(CHAT_PERSONALITY_INPUT_ATTR);
  if (action === 'mark-dirty') {
    markPersonalityDirty();
  } else if (action === 'resize-and-mark-dirty') {
    autoResizePersonaTextarea();
    markPersonalityDirty();
  }
}

function handlePersonalityDismiss(event) {
  const bar = document.querySelector('.chat-personality-bar');
  if (!bar?.classList.contains('open')) return;
  const target = event.target;
  // Custom-personality actions can replace or remove their original button
  // before this second document click listener runs. Treat the original
  // delegated action as internal even when its node is no longer connected.
  if (closestChatPersonalityElement(target, CHAT_PERSONALITY_ACTION_SELECTOR)) return;
  if (target instanceof Node && bar.contains(target)) return;
  if (isPersonalityDirty()) return;
  bar.classList.remove('open');
  document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
}

function handlePersonalityEscape(event) {
  if (event.key !== 'Escape') return;
  const bar = document.querySelector('.chat-personality-bar');
  if (!bar?.classList.contains('open')) return;
  event.preventDefault();
  if (isPersonalityDirty()) {
    void confirmDiscardPersonalityChanges().then(discard => {
      if (!discard) return;
      bar.classList.remove('open');
      document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
      /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-current'))?.focus();
    });
    return;
  }
  bar.classList.remove('open');
  document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
  /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-current'))?.focus();
}

export function installChatPersonalityActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || chatPersonalityDelegateRoots.has(root)) return;
  chatPersonalityDelegateRoots.add(root);
  root.addEventListener('click', handleChatPersonalityClick);
  root.addEventListener('input', handleChatPersonalityInput);
  root.addEventListener('click', handlePersonalityDismiss);
  root.addEventListener('keydown', handlePersonalityEscape);
}

installChatPersonalityActionDelegates();

/** @param {string} id */
function textControlById(id) {
  return /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
}

/** @param {string} selector */
function textareaBySelector(selector) {
  return /** @type {HTMLTextAreaElement | null} */ (document.querySelector(selector));
}

/** @param {string} selector */
function buttonBySelector(selector) {
  return /** @type {HTMLButtonElement | null} */ (document.querySelector(selector));
}

/** @param {string} id */
function buttonById(id) {
  return /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
}

export function pickPersonaIcon(name) {
  if (!name || !name.trim()) return '✏️';
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash) + name.charCodeAt(i);
  return PERSONA_ICONS[Math.abs(hash) % PERSONA_ICONS.length];
}

export function getCustomPersonalities() { return getCachedCustomPersonalities(); }

export function loadCustomPersonalities() {
  return loadCustomPersonalitiesFromStorage();
}

export async function saveCustomPersonalities(arr) {
  const saved = await saveCustomPersonalitiesToStorage(arr);
  notifyCustomPersonalitySavedRuntime();
  return saved;
}

// Compat shim - returns the custom personality matching current selection, or first, or blank
export function getCustomPersonality() {
  const customs = getCustomPersonalities();
  if (state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_')) {
    const match = customs.find(p => p.id === state.currentChatPersonality);
    if (match && isCustomPersonalityUsable(match)) return match;
    if (match) return { ...match, promptText: '' };
  }
  const firstUsable = customs.find(personality => isCustomPersonalityUsable(personality));
  if (firstUsable) return firstUsable;
  return { name: 'Custom Personality', icon: '✏️', promptText: '', evidenceBased: false };
}

export function getActivePersonality() {
  if (state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_')) {
    const customs = getCustomPersonalities();
    const cp = customs.find(p => p.id === state.currentChatPersonality);
    if (cp && isCustomPersonalityUsable(cp)) {
      return {
        id: cp.id,
        name: cp.name,
        icon: cp.icon,
        description: 'Custom personality',
        greeting: 'Ask me about your lab results, trends, or what specific biomarkers mean.',
        promptAddition: null
      };
    }
  }
  return CHAT_PERSONALITIES.find(p => p.id === state.currentChatPersonality) || CHAT_PERSONALITIES[0];
}

export function getCustomPersonalityText() {
  return getCustomPersonality().promptText;
}

export async function setChatPersonality(id, opts = {}) {
  const prev = state.currentChatPersonality;
  if (isPersonalityDirty() && !(await confirmDiscardPersonalityChanges())) return;
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
    const bar = document.querySelector('.chat-personality-bar');
    if (bar && !opts.keepPickerOpen) bar.classList.remove('open');
    return;
  }
  _editingPersonalityId = null;
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
  }
  if (state.chatHistory.length === 0) {
    renderChatMessagesRuntime();
  }
  renderThreadList();
  updateChatHeaderTitle();
  updatePersonalityBar();
  const personality = getActivePersonality();
  showNotification(`Switched to ${personality.name}`, 'info');
  const bar = document.querySelector('.chat-personality-bar');
  if (bar && !opts.keepPickerOpen) bar.classList.remove('open');
}

export function loadChatPersonality() {
  const saved = localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`);
  if (!saved) { state.currentChatPersonality = 'default'; return; }
  if (CHAT_PERSONALITIES.some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
  if (saved.startsWith('custom_')) {
    const custom = getCustomPersonalities().find(personality => personality.id === saved);
    if (custom && isCustomPersonalityUsable(custom)) { state.currentChatPersonality = saved; return; }
    if (custom) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      return;
    }
  }
  if (saved === 'custom') {
    const customs = getCustomPersonalities();
    if (customs.length > 0) {
      state.currentChatPersonality = customs[0].id;
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, customs[0].id);
      return;
    }
  }
  state.currentChatPersonality = 'default';
}

export function updateChatHeaderTitle() {
  const el = /** @type {HTMLElement | null} */ (document.querySelector('.chat-header-title'));
  if (!el) return;
  const names = [];
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
  const btn = buttonBySelector('.chat-summary-btn');
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
function isGenomeLookupContextActive() {
  try { return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY); }
  catch { return false; }
}

function getAIContextHeaderState() {
  const active = [];
  const pending = [];
  if ((state.importedData?.interpretiveLens || '').trim()) active.push('Lens');
  try {
    const kb = getLensSummary();
    if (kb?.configured) active.push(kb.displayName || 'Knowledge Base');
    else if (kb?.enabled) pending.push('KB empty');
  } catch { /* Knowledge Base not initialised yet. */ }
  if (isGenomeLookupContextActive()) active.push('Genome lookup');
  return { active, pending };
}

function ensureChatContextStatus(el) {
  const parent = el.parentElement;
  if (!parent) return null;
  let status = parent.querySelector('.chat-context-status');
  if (!status) {
    status = document.createElement('button');
    status.type = 'button';
    status.className = 'chat-context-status';
    status.addEventListener('click', () => openChatContextModalRuntime());
    parent.appendChild(status);
  }
  return status;
}

export function updateChatContextStatus() {
  const modelEl = document.querySelector('.chat-header-model');
  if (!modelEl) return;
  const status = ensureChatContextStatus(modelEl);
  if (!status) return;
  if (!hasAIProvider()) {
    status.textContent = '';
    status.hidden = true;
    status.removeAttribute('aria-label');
    status.classList.remove('chat-context-status-pending');
    return;
  }
  const contextState = getAIContextHeaderState();
  const parts = [...contextState.active, ...contextState.pending];
  if (parts.length === 0) {
    status.textContent = '';
    status.hidden = true;
    status.removeAttribute('aria-label');
    status.classList.remove('chat-context-status-pending');
    return;
  }
  const pendingOnly = contextState.active.length === 0 && contextState.pending.length > 0;
  const label = `AI Context: ${parts.join(' + ')}`;
  const ariaSuffix = pendingOnly
    ? 'Knowledge Base is enabled but no library is indexed yet. Click to manage Context.'
    : 'Click to manage Context.';
  status.hidden = false;
  status.classList.toggle('chat-context-status-pending', pendingOnly);
  status.setAttribute('aria-label', `${label}. ${ariaSuffix}`);
  status.innerHTML = `<span class="chat-context-dot" aria-hidden="true"></span><span>${escapeHTML(label)}</span>`;
}

export function updateChatHeaderModel() {
  const el = document.querySelector('.chat-header-model');
  if (!el) return;
  if (!_headerListenerAdded) {
    el.addEventListener('e2ee-attestation', () => updateChatHeaderModel());
    _headerListenerAdded = true;
  }
  if (!hasAIProvider()) { el.textContent = ''; updateChatContextStatus(); return; }
  updateChatContextStatus();
  const display = getActiveModelDisplay();
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

export function updatePersonalityBar() {
  const currentEl = document.querySelector('.chat-personality-current');
  if (currentEl) {
    const p = getActivePersonality();
    const icon = currentEl.querySelector('.chat-personality-current-icon');
    const name = currentEl.querySelector('.chat-personality-current-name');
    if (icon) icon.textContent = p.icon;
    if (name) name.textContent = p.name;
  }
  document.querySelectorAll('.chat-personality-opt[data-personality="default"], .chat-personality-opt[data-personality="house"]').forEach(btn => {
    const option = /** @type {HTMLElement} */ (btn);
    option.classList.toggle('active', option.dataset.personality === state.currentChatPersonality);
  });
  const section = document.getElementById('chat-personality-custom-section');
  if (!section) return;
  const customs = getCustomPersonalities();
  let html = '<div class="chat-personality-divider">Custom</div>';
  for (const cp of customs) {
    const isActive = cp.id === state.currentChatPersonality;
    html += `<div class="chat-personality-opt-wrapper">
      <button class="chat-personality-opt${isActive ? ' active' : ''}" type="button" data-personality="${escapeAttr(cp.id)}" data-chat-action="set-personality">
        <span class="chat-personality-opt-icon">${escapeHTML(cp.icon)}</span>
        <div class="chat-personality-opt-info">
          <span class="chat-personality-opt-name">${escapeHTML(cp.name)}</span>
          <span class="chat-personality-opt-desc">Custom personality</span>
        </div>
        <span class="chat-personality-opt-check">&#10003;</span>
      </button>
      <button class="chat-personality-edit" type="button" ${chatPersonalityActionAttrs('edit-custom', { id: cp.id })} title="Edit personality" aria-label="Edit personality">${CHAT_ICON_EDIT}</button>
      <button class="chat-personality-delete" type="button" ${chatPersonalityActionAttrs('delete-custom', { id: cp.id })} title="Delete personality" aria-label="Delete personality">${CHAT_ICON_X}</button>
    </div>`;
  }
  html += `<button class="chat-personality-add-btn" type="button" ${chatPersonalityActionAttrs('start-new-custom')}>+ New Personality</button>`;
  section.innerHTML = html;
}

export function togglePersonalityBar() {
  const options = document.querySelector('.chat-personality-options');
  const bar = document.querySelector('.chat-personality-bar');
  if (options && bar) {
    const trigger = document.querySelector('.chat-personality-current');
    const close = () => {
      bar.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    };
    if (bar.classList.contains('open')) {
      if (isPersonalityDirty()) {
        void confirmDiscardPersonalityChanges().then(discard => { if (discard) close(); });
        return;
      }
      close();
      return;
    }
    document.querySelector('.discuss-persona-picker')?.remove();
    document.getElementById('chat-thread-rail')?.classList.remove('open');
    document.querySelector('.chat-rail-toggle')?.setAttribute('aria-expanded', 'false');
    bar.classList.add('open');
    trigger?.setAttribute('aria-expanded', 'true');
  }
}

let _editingPersonalityId = null;
let _generatedPersonaIcon = null;
let _personaCleanState = null;
const PERSONALITY_EDITOR_OVERLAY_ID = 'chat-personality-editor-overlay';

function closePersonalityPicker() {
  document.querySelector('.chat-personality-bar')?.classList.remove('open');
  document.querySelector('.chat-personality-current')?.setAttribute('aria-expanded', 'false');
}

function showPersonalityPickerAfterEditor(personalityId = '') {
  const bar = document.querySelector('.chat-personality-bar');
  const trigger = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-current'));
  if (!bar || !trigger) return;
  bar.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    const target = personalityId
      ? document.querySelector(`.chat-personality-opt[data-personality="${CSS.escape(personalityId)}"]`)
      : document.querySelector('.chat-personality-add-btn');
    /** @type {HTMLElement | null} */ (target)?.focus();
  });
}

function closePersonalityEditor({ returnToPicker = true, personalityId = '' } = {}) {
  const overlay = document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID);
  if (overlay) removeModalOverlay(overlay);
  _editingPersonalityId = null;
  _generatedPersonaIcon = null;
  _personaCleanState = null;
  updatePersonalityBar();
  if (returnToPicker) showPersonalityPickerAfterEditor(personalityId);
  else /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-current'))?.focus();
}

function openPersonalityEditor(id, locationLike = globalThis.location) {
  document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID)?.remove();
  const isNew = id === 'new';
  const personality = isNew ? null : getCustomPersonalities().find(item => item.id === id);
  if (!isNew && !personality) return;

  _editingPersonalityId = id;
  _generatedPersonaIcon = null;
  closePersonalityPicker();
  openPersonaEditorDialog({
    isNew,
    personality,
    locationLike,
    actionAttrs: chatPersonalityActionAttrs,
    inputAttrs: chatPersonalityInputAttrs,
    onCancel: cancelCustomPersonalityEditor,
  });
  autoResizePersonaTextarea();
  snapshotPersonalityClean();
}

function _getPersonaCurrentState() {
  const nameInput = textControlById('chat-personality-custom-name');
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  return {
    name: nameInput ? nameInput.value : '',
    text: textarea ? textarea.value : '',
    agreementAccepted: getPersonaAgreementCheckbox()?.checked === true,
  };
}

function isPersonalityDirty() {
  if (!_editingPersonalityId || !_personaCleanState) return false;
  const current = _getPersonaCurrentState();
  return current.name !== _personaCleanState.name
    || current.text !== _personaCleanState.text
    || current.agreementAccepted !== _personaCleanState.agreementAccepted;
}

async function confirmDiscardPersonalityChanges() {
  if (!isPersonalityDirty()) return true;
  return showConfirmDialog('Discard your unsaved personality changes?');
}

export function snapshotPersonalityClean() {
  _personaCleanState = _getPersonaCurrentState();
  const saveBtn = buttonBySelector('.chat-personality-custom-save');
  if (saveBtn) saveBtn.disabled = true;
}

export function markPersonalityDirty() {
  const saveBtn = buttonBySelector('.chat-personality-custom-save');
  const agreementCheckbox = getPersonaAgreementCheckbox();
  const agreementSatisfied = !agreementCheckbox || agreementCheckbox.checked;
  if (!saveBtn || !_personaCleanState) {
    if (saveBtn) saveBtn.disabled = !agreementSatisfied;
    return;
  }
  const cur = _getPersonaCurrentState();
  const dirty = cur.name !== _personaCleanState.name || cur.text !== _personaCleanState.text;
  const agreementChanged = cur.agreementAccepted !== _personaCleanState.agreementAccepted;
  saveBtn.disabled = !(dirty || agreementChanged) || !agreementSatisfied;
}

export function autoResizePersonaTextarea() {
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  if (!textarea) return;
  if (textarea.closest('.chat-personality-editor')) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
}

export async function saveCustomPersonality() {
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  const nameInput = textControlById('chat-personality-custom-name');
  if (!textarea) return;
  const name = (nameInput ? nameInput.value.trim() : '') || 'Custom Personality';
  const icon = _generatedPersonaIcon || pickPersonaIcon(name);
  _generatedPersonaIcon = null;
  const promptText = textarea.value.trim();
  if (!promptText) {
    showNotification('Describe how this personality should communicate before saving.', 'info');
    textarea.focus();
    return;
  }
  const agreementCheckbox = getPersonaAgreementCheckbox();
  if (agreementCheckbox && !agreementCheckbox.checked) {
    showNotification('Accept the persona use agreement before saving.', 'info', 5000);
    agreementCheckbox.focus();
    return;
  }
  const editorOverlay = document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID);
  const personaAgreement = buildPersonaAgreementRecord(editorOverlay);
  const customs = getCustomPersonalities();
  const now = new Date().toISOString();
  let id;
  if (_editingPersonalityId && _editingPersonalityId !== 'new') {
    id = _editingPersonalityId;
    const idx = customs.findIndex(p => p.id === id);
    if (idx >= 0) customs[idx] = {
      ...customs[idx],
      name,
      icon,
      promptText,
      createdAt: customs[idx].createdAt || now,
      updatedAt: now,
      ...(personaAgreement ? { personaAgreement } : {}),
    };
  } else {
    id = createUniqueId('custom_');
    customs.push({
      id,
      name,
      icon,
      promptText,
      evidenceBased: false,
      createdAt: now,
      updatedAt: now,
      ...(personaAgreement ? { personaAgreement } : {}),
    });
  }
  try {
    await saveCustomPersonalities(customs);
  } catch {
    showNotification('Could not save custom personality', 'error');
    return;
  }
  _editingPersonalityId = id;
  if (state.currentChatPersonality === id) {
    const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
    if (thread) {
      thread.personality = id;
      thread.personalityName = name;
      thread.personalityIcon = icon;
      void saveChatThreadIndex();
    }
  }
  closePersonalityEditor({ personalityId: id });
  updateChatHeaderTitle();
  renderThreadList();
  showNotification('Custom personality saved', 'success');
}

export function startNewCustomPersonality(locationLike = globalThis.location) {
  const openEditor = () => openPersonalityEditor('new', locationLike);
  if (isPersonalityDirty()) {
    void confirmDiscardPersonalityChanges().then(discard => { if (discard) openEditor(); });
  } else {
    openEditor();
  }
}

export function editCustomPersonality(id, locationLike = globalThis.location) {
  const openEditor = () => openPersonalityEditor(id, locationLike);
  if (isPersonalityDirty()) {
    void confirmDiscardPersonalityChanges().then(discard => { if (discard) openEditor(); });
  } else {
    openEditor();
  }
}

export async function cancelCustomPersonalityEditor() {
  if (!(await confirmDiscardPersonalityChanges())) return;
  closePersonalityEditor();
}

export async function deleteCustomPersonality(id) {
  const customs = getCustomPersonalities();
  const cp = customs.find(p => p.id === id);
  const name = cp ? cp.name : 'personality';
  if (await showConfirmDialog(`Delete "${name}"? This cannot be undone.`)) {
    const updated = customs.filter(p => p.id !== id);
    try {
      await saveCustomPersonalities(updated);
      await recordCustomPersonalityDeletion(id);
    } catch {
      showNotification('Could not delete custom personality', 'error');
      return;
    }
    if (state.currentChatPersonality === id) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      _editingPersonalityId = null;
      const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
      if (thread) {
        thread.personality = 'default';
        const fallback = CHAT_PERSONALITIES.find(p => p.id === 'default') || CHAT_PERSONALITIES[0];
        thread.personalityName = fallback?.name || 'Default';
        thread.personalityIcon = fallback?.icon || '';
        void saveChatThreadIndex();
      }
    } else if (_editingPersonalityId === id) {
      _editingPersonalityId = null;
    }
    updatePersonalityBar();
    updateChatHeaderTitle();
    renderChatMessagesRuntime();
  }
}

export async function generateCustomPersonality() {
  if (!hasAIProvider()) {
    showNotification('AI provider not configured. Open Settings first.', 'info');
    return;
  }
  const nameInput = textControlById('chat-personality-custom-name');
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  const genBtn = buttonById('chat-personality-generate-btn');
  if (!nameInput || !textarea) return;
  const name = nameInput.value.trim();
  if (!name) {
    showNotification('Enter a name first (e.g. "A longevity researcher")', 'info');
    nameInput.focus();
    return;
  }
  const previousText = textarea.value;
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = 'Generating\u2026'; }
  textarea.placeholder = `Generating ${name} persona\u2026`;

  try {
    const systemPrompt = `You are a persona designer for a health and blood-work AI chat assistant called getbased. The user will give you a real person, fictional character, archetype, or intellectual framework. Create a thorough, vivid, editable persona draft that genuinely reflects the requested communication style and worldview when discussing lab results and health data.

Write in second person ("You are..."). Output a rich persona description covering ALL of the following:

1. **Identity & Background**: Who this persona is, the intellectual lineage that shaped their worldview, and what they are known for. Do not fabricate precise credentials, quotations, biography, or positions.
2. **Communication Style**: Exact tone, vocabulary, formality level. Specific signature phrases, verbal tics, metaphors, or rhetorical patterns they'd use. How do they open conversations? How do they deliver bad news vs good news?
3. **Medical & Health Philosophy**: Their core framework for interpreting lab data. What do they emphasize that mainstream medicine overlooks? What conventional advice do they challenge or dismiss? What biomarkers excite them and why?
4. **Analytical Approach**: How they connect dots between markers. Do they focus on ratios, trends, context, root causes? What patterns do they look for first? How do they weigh reference ranges vs optimal ranges?
5. **Lifestyle & Optimization Lens**: What lifestyle factors do they always ask about? Diet, light exposure, sleep, environment, hormones — what's their hierarchy? What interventions do they champion?
6. **Character & Personality**: Temperament, humor style, patience level. How they handle disagreement, uncertainty, or when a patient pushes back. What makes them passionate or frustrated?
7. **Signature Recommendations**: Tests, supplements, protocols, or lifestyle changes genuinely associated with this person or framework. Do not invent endorsements or protocols merely to make the persona more specific.
8. **Unconventional Views**: Where their views diverge from mainstream medical consensus and how they express that disagreement naturally in their own voice. Preserve controversial and anti-establishment positions rather than diluting them.

Be extremely specific and capture characteristic phrases, real concepts, genuine intellectual positions, and recognizable reasoning patterns. Aim for 400-500 words. Do not add boilerplate health disclaimers, repetitive warnings, or out-of-character safety language.

When evidence is limited, disputed, or uncertain, express that naturally in the persona's own voice. The persona may strongly disagree with mainstream medical consensus, but should distinguish established evidence, personal interpretation, and speculation when that distinction is relevant. If precise knowledge is unavailable, create a faithful interpretation of the broader philosophy rather than inventing specifics.

Write only the persona instructions. Do not include commentary about these generation rules.

IMPORTANT: On the very first line, output ONLY a single emoji that best captures this specific person's identity or what they're most known for — not just their profession. Think about what makes them unique (e.g. ☀️ for someone known for sun exposure protocols, 🧊 for a cold therapy advocate, 🍖 for a carnivore diet proponent). Then a blank line, then the persona description.`;

    const { text } = await callClaudeAPI({
      system: systemPrompt,
      messages: [{ role: 'user', content: `Create a comprehensive persona for: ${name}` }],
      maxTokens: 2048,
      onStream(text) {
        textarea.value = text;
        autoResizePersonaTextarea();
      }
    });
    const lines = text.split('\n');
    const firstLine = lines[0].trim();
    const emojiMatch = firstLine.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?(\u200D(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?))*)/u);
    if (emojiMatch && emojiMatch[0] && firstLine.length <= 4) {
      _generatedPersonaIcon = emojiMatch[0];
      const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
      textarea.value = rest;
    } else {
      textarea.value = text;
    }
    autoResizePersonaTextarea();
    markPersonalityDirty();
    textarea.placeholder = 'Describe how you want the AI to communicate, or enter a name above and generate a draft...';
  } catch (err) {
    const error = /** @type {Error} */ (err);
    textarea.placeholder = 'Describe how you want the AI to communicate, or enter a name above and generate a draft...';
    textarea.value = previousText;
    autoResizePersonaTextarea();
    showNotification(`Generation failed: ${error.message}`, 'error');
  }
  if (genBtn) { genBtn.disabled = false; genBtn.textContent = 'Generate draft'; }
}
