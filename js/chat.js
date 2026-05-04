// chat.js — AI chat panel, markdown rendering, personalities, conversation threads

import { state } from './state.js';
import { CHAT_PERSONALITIES, CHAT_SYSTEM_PROMPT, LATITUDE_BANDS } from './constants.js';
import { calculateCost, formatCost, trackUsage } from './schema.js';
import { escapeHTML, showNotification, showConfirmDialog, formatValue, getStatus, hasCardContent } from './utils.js';
import { getActiveData, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, saveImportedData } from './data.js';
import { encryptedSetItem, encryptedGetItem, getEncryptionEnabled } from './crypto.js';
import { getProfileLocation, setProfileLocation, getLatitudeFromLocation, getLocationCache, latitudeToBand, detectLatitudeWithAI, getProfiles, renameProfile, setProfileSex, setProfileDob } from './profile.js';
import { callClaudeAPI, hasAIProvider, isAIPaused, setAIPaused, getAIProvider, getActiveModelId, getActiveModelDisplay, supportsWebSearch, isVeniceE2EEActive } from './api.js';
import { formatImageBlock, buildVisionContent } from './image-utils.js';
import { getPendingAttachments, hasPendingAttachments, clearAttachments } from './chat-images.js';
import {
  loadChatThreads, saveChatThreadIndex, ensureActiveThread, createNewThread,
  autoNameThread,
  renderThreadList, invalidateThreadContentCache,
  restoreRailState, getChatThreadKey, getChatThreadsKey,
} from './chat-threads.js';
import { buildLabContext, getContextSummary, injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti, updateLensIndicator } from './lens.js';
import { applyInlineMarkdown, renderMarkdown } from './markdown.js';

// ═══════════════════════════════════════════════
// ABORT CONTROLLER (stop streaming)
// ═══════════════════════════════════════════════
let _chatAbortController = null;

// ═══════════════════════════════════════════════
// TYPEWRITER — smooth character trickle for streaming
// ═══════════════════════════════════════════════
function createTypewriter(el, typingEl, container) {
  let target = '';
  let displayed = 0;
  let timer = null;
  let autoScrollLocked = false;

  function isNearBottom() {
    return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }
  function onWheel(e) { if (e.deltaY < 0) autoScrollLocked = true; }
  function onTouchMove() { autoScrollLocked = true; }
  function onScroll() { if (isNearBottom()) autoScrollLocked = false; }

  container.addEventListener('wheel', onWheel, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: true });
  container.addEventListener('scroll', onScroll, { passive: true });

  function cleanup() {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('scroll', onScroll);
  }

  function tick() {
    if (displayed >= target.length) { timer = null; return; }
    const behind = target.length - displayed;
    const batch = Math.max(1, Math.ceil(behind * 0.3));
    displayed = Math.min(displayed + batch, target.length);
    if (typingEl.parentNode) typingEl.remove();
    if (!el.parentNode) container.appendChild(el);
    el.textContent = target.slice(0, displayed);
    if (!autoScrollLocked) container.scrollTop = container.scrollHeight;
    timer = setTimeout(tick, 16);
  }

  return {
    update(text) {
      target = text;
      if (!timer) tick();
    },
    stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      displayed = target.length;
      cleanup();
    }
  };
}

// Image-attachment flow (paste/drop/picker handlers, HD-mode toggle,
// pending-queue, thumbnail generation) lives in chat-images.js as of
// v1.21.9. chat.js imports read-only queue access + clearAttachments
// at the top of the file; chat-images.js exposes the user-facing
// functions on window directly. Back-reference from chat-images.js
// into chat.js uses window.updateSendButtonState below.
function updateSendButtonState() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!sendBtn) return;
  const hasContent = (input && input.value.trim()) || hasPendingAttachments();
  sendBtn.disabled = !hasContent && !_chatAbortController;
}
Object.assign(window, { updateSendButtonState });

// Thread management (storage CRUD, rail UI, content search,
// navigate-to-match highlighting) lives in chat-threads.js as of
// v1.21.9. chat.js imports the functions it needs from that module;
// chat-threads.js exposes its HTML-facing functions on window and
// calls back into chat.js via window.fn() for the render/load/save
// helpers (renderChatMessages, updateChatHeaderTitle, etc.).

// ═══════════════════════════════════════════════
// WEB SEARCH
// ═══════════════════════════════════════════════
export function getChatWebSearchEnabled() {
  return localStorage.getItem('labcharts-chat-websearch') === 'on';
}

export function setChatWebSearchEnabled(val) {
  localStorage.setItem('labcharts-chat-websearch', val ? 'on' : 'off');
  _updateWebSearchToggleVisibility();
}

function _updateWebSearchToggleVisibility() {
  const label = document.querySelector('.chat-websearch-toggle-label');
  if (label) label.style.display = supportsWebSearch() ? '' : 'none';
}
export function refreshWebSearchToggle() { _updateWebSearchToggleVisibility(); }

// ═══════════════════════════════════════════════
// ACTION BAR RENDERING
// ═══════════════════════════════════════════════
export function buildActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'assistant') return '';
  const isLast = msgIndex === state.chatHistory.length - 1;

  let html = '<div class="chat-action-bar">';
  if (isLast) {
    html += `<button class="chat-action-btn" onclick="regenerateLastMessage()" title="Regenerate response">\u21BB Regenerate</button>`;
  }
  html += `<button class="chat-action-btn" onclick="copyMessage(${msgIndex})" id="chat-copy-btn-${msgIndex}" title="Copy to clipboard">\uD83D\uDCCB Copy</button>`;
  html += '</div>';

  // Context used section
  if (msg.context && msg.context.length > 0) {
    html += `<div class="chat-context-toggle" onclick="toggleContextDetails(${msgIndex})">`;
    html += `<span class="chat-toggle-arrow" id="chat-ctx-arrow-${msgIndex}">\u25B8</span> Context used (${msg.context.length} area${msg.context.length !== 1 ? 's' : ''})`;
    html += '</div>';
    html += `<div class="chat-context-details" id="chat-ctx-details-${msgIndex}" style="display:none">`;
    for (const area of msg.context) {
      html += `<span class="chat-context-item">\u2713 ${escapeHTML(area.label)}${area.detail ? ' (' + escapeHTML(area.detail) + ')' : ''}</span>`;
    }
    html += '</div>';
  }

  return html;
}

// ═══════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════
export function regenerateLastMessage() {
  if (state.chatHistory.length < 2) return;
  if (_chatAbortController) return; // streaming in progress
  // Pop the last assistant message
  state.chatHistory.pop();
  // Get the last user message
  const lastUserMsg = state.chatHistory[state.chatHistory.length - 1];
  if (!lastUserMsg || lastUserMsg.role !== 'user') return;
  // Re-fill input and re-send
  const input = document.getElementById('chat-input');
  if (input) input.value = lastUserMsg.content;
  // Remove the user message too (sendChatMessage will re-add it)
  state.chatHistory.pop();
  saveChatHistory();
  renderChatMessages();
  sendChatMessage();
}

export function copyMessage(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg) return;
  const btn = document.getElementById(`chat-copy-btn-${msgIndex}`);
  if (!navigator.clipboard) { if (btn) { btn.innerHTML = '\u2717 Not supported'; setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copy'; }, 1500); } return; }
  navigator.clipboard.writeText(msg.content).then(() => {
    if (btn) {
      btn.innerHTML = '\u2713 Copied!';
      setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copy'; }, 1500);
    }
  }).catch(() => {
    if (btn) { btn.innerHTML = '\u2717 Failed'; setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copy'; }, 1500); }
  });
}

export function toggleContextDetails(msgIndex) {
  const details = document.getElementById(`chat-ctx-details-${msgIndex}`);
  const arrow = document.getElementById(`chat-ctx-arrow-${msgIndex}`);
  if (!details) return;
  const open = details.style.display !== 'none';
  details.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.textContent = open ? '\u25B8' : '\u25BE';
}


// ═══════════════════════════════════════════════
// LEGACY STORAGE KEY (for migration detection)
// ═══════════════════════════════════════════════
export function getChatStorageKey() {
  return `labcharts-${state.currentProfile}-chat`;
}

// ═══════════════════════════════════════════════
// PERSONALITY
// ═══════════════════════════════════════════════
const PERSONA_ICONS = ['🧠', '🎭', '🔮', '🌿', '⚡', '🦊', '🧬', '🌊', '🔥', '🏛️'];

export function pickPersonaIcon(name) {
  if (!name || !name.trim()) return '✏️';
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash) + name.charCodeAt(i);
  return PERSONA_ICONS[Math.abs(hash) % PERSONA_ICONS.length];
}

export function getCustomPersonalities() {
  const raw = localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`) || '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // Single object with promptText → wrap as array
    if (parsed && typeof parsed === 'object' && 'promptText' in parsed) {
      return [{ ...parsed, id: parsed.id || 'custom_migrated' }];
    }
  } catch {}
  // Legacy plain string
  return [{ id: 'custom_migrated', name: 'Custom Personality', icon: '✏️', promptText: raw, evidenceBased: false }];
}

export function saveCustomPersonalities(arr) {
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`, JSON.stringify(arr));
}

// Compat shim — returns the custom personality matching current selection, or first, or blank
export function getCustomPersonality() {
  const customs = getCustomPersonalities();
  if (state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_')) {
    const match = customs.find(p => p.id === state.currentChatPersonality);
    if (match) return match;
  }
  if (customs.length > 0) return customs[0];
  return { name: 'Custom Personality', icon: '✏️', promptText: '', evidenceBased: false };
}

export function getActivePersonality() {
  // Check if current personality is a custom one
  if (state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_')) {
    const customs = getCustomPersonalities();
    const cp = customs.find(p => p.id === state.currentChatPersonality);
    if (cp) {
      return {
        id: cp.id,
        name: cp.name,
        icon: cp.icon,
        description: 'Custom personality',
        greeting: 'Ask me about your lab results, trends, or what specific biomarkers mean.',
        promptAddition: null
      };
    }
    // Custom was deleted — fall through to default
  }
  return CHAT_PERSONALITIES.find(p => p.id === state.currentChatPersonality) || CHAT_PERSONALITIES[0];
}

export function getCustomPersonalityText() {
  return getCustomPersonality().promptText;
}

export async function setChatPersonality(id) {
  const prev = state.currentChatPersonality;
  if (prev === id) {
    // Collapse bar if same personality clicked
    const bar = document.querySelector('.chat-personality-bar');
    if (bar) bar.classList.remove('open');
    return;
  }
  _editingPersonalityId = null;
  // Switch personality in-place — keep current conversation so users can
  // get different perspectives in the same thread
  state.currentChatPersonality = id;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, id);
  // Update thread metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    thread.personality = id;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    saveChatThreadIndex();
  }
  if (state.chatHistory.length === 0) {
    renderChatMessages(); // re-render empty state with new personality greeting
  }
  renderThreadList();
  updateChatHeaderTitle();
  updatePersonalityBar();
  const personality = getActivePersonality();
  showNotification(`Switched to ${personality.name}`, 'info');
  const bar = document.querySelector('.chat-personality-bar');
  if (bar) bar.classList.remove('open');
}

export function loadChatPersonality() {
  const saved = localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`);
  if (!saved) { state.currentChatPersonality = 'default'; return; }
  // Accept built-in personalities
  if (CHAT_PERSONALITIES.some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
  // Accept custom personalities
  if (saved.startsWith('custom_') && getCustomPersonalities().some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
  // Legacy 'custom' → migrate to custom_migrated if it exists
  if (saved === 'custom') {
    const customs = getCustomPersonalities();
    if (customs.length > 0) { state.currentChatPersonality = customs[0].id; localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, customs[0].id); return; }
  }
  state.currentChatPersonality = 'default';
}

export function updateChatHeaderTitle() {
  const el = document.querySelector('.chat-header-title');
  if (!el) return;
  // Show all persona names when 2+ have responded in this thread
  const names = [];
  const seen = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName && !seen.has(m.personalityName)) {
      seen.add(m.personalityName);
      names.push((m.personalityIcon || '') + ' ' + m.personalityName);
    }
  }
  if (names.length >= 2) {
    el.textContent = names.join(' & ');
  } else {
    const p = getActivePersonality();
    el.textContent = p.name;
  }
  updateChatHeaderModel();
  updateSummaryButton();
}

export function updateSummaryButton() {
  const btn = document.querySelector('.chat-summary-btn');
  if (!btn) return;
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  const hasSummary = !!thread?.summary;
  btn.classList.toggle('has-summary', hasSummary);
  btn.title = hasSummary ? 'View summary' : 'Summarize this conversation';
}

/** Build attestation tooltip text. */
function _attestationTooltip(attestation) {
  const ok = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const lines = [
    `Nonce: ${attestation.nonceVerified ? '\u2713' : '\u2717'}`,
    `Key binding: ${attestation.signingKeyBound ? '\u2713' : '\u2717'}`,
    `Debug mode: ${attestation.debugMode ? 'YES \u2717' : 'no \u2713'}`,
    attestation.serverTdxValid != null ? `Server TDX: ${attestation.serverTdxValid ? '\u2713' : '\u2717'}` : null,
    attestation.dcap ? `DCAP: ${attestation.dcap.status}` : null,
  ].filter(Boolean);
  return (ok ? 'TEE attestation verified' : 'TEE attestation FAILED') + '\n' + lines.join('\n');
}

/** E2EE lock HTML for header: 🔒 alone, or 🔒 + colored ✓/✗ with tooltip. */
function e2eeLockHTML(attestation) {
  if (!attestation) return ' \uD83D\uDD12';
  const ok = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const color = ok ? '#22c55e' : '#ef4444';
  const mark = ok ? '\u2713' : '\u2717';
  return ` <span title="${_attestationTooltip(attestation)}">\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span></span>`;
}

/** E2EE lock HTML for cost footnotes. */
function e2eeLockFootnote(attestation) {
  if (!attestation) return ' \u00b7 \uD83D\uDD12 e2ee';
  const ok = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const color = ok ? '#22c55e' : '#ef4444';
  const mark = ok ? '\u2713' : '\u2717';
  return ` \u00b7 <span title="${_attestationTooltip(attestation)}">\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span> e2ee</span>`;
}

// Auto-refresh header when attestation becomes available
let _headerListenerAdded = false;
export function updateChatHeaderModel() {
  const el = document.querySelector('.chat-header-model');
  if (!el) return;
  if (!_headerListenerAdded) {
    el.addEventListener('e2ee-attestation', () => updateChatHeaderModel());
    _headerListenerAdded = true;
  }
  if (!hasAIProvider()) { el.textContent = ''; return; }
  const display = getActiveModelDisplay();
  const e2ee = getAIProvider() === 'venice' && isVeniceE2EEActive();
  if (e2ee) {
    el.innerHTML = escapeHTML(display) + e2eeLockHTML(window._veniceAttestation);
  } else {
    el.textContent = display;
  }
}

export function updatePersonalityBar() {
  const currentEl = document.querySelector('.chat-personality-current');
  if (currentEl) {
    const p = getActivePersonality();
    currentEl.querySelector('.chat-personality-current-icon').textContent = p.icon;
    currentEl.querySelector('.chat-personality-current-name').textContent = p.name;
  }
  // Update active states on built-in buttons
  document.querySelectorAll('.chat-personality-opt[data-personality="default"], .chat-personality-opt[data-personality="house"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.personality === state.currentChatPersonality);
  });
  // Build custom section dynamically
  const section = document.getElementById('chat-personality-custom-section');
  if (!section) return;
  const customs = getCustomPersonalities();
  const isCustomActive = state.currentChatPersonality && state.currentChatPersonality.startsWith('custom_');
  const showEditor = _editingPersonalityId === 'new' || (isCustomActive && _editingPersonalityId === state.currentChatPersonality);
  let html = '<div class="chat-personality-divider">Custom</div>';
  for (const cp of customs) {
    const isActive = cp.id === state.currentChatPersonality;
    html += `<div class="chat-personality-opt-wrapper">
      <button class="chat-personality-opt${isActive ? ' active' : ''}" data-personality="${escapeHTML(cp.id)}" onclick="setChatPersonality('${escapeHTML(cp.id)}')">
        <span class="chat-personality-opt-icon">${cp.icon}</span>
        <div class="chat-personality-opt-info">
          <span class="chat-personality-opt-name">${escapeHTML(cp.name)}</span>
          <span class="chat-personality-opt-desc">Custom personality</span>
        </div>
        <span class="chat-personality-opt-check">&#10003;</span>
      </button>
      <button class="chat-personality-edit" onclick="event.stopPropagation(); editCustomPersonality('${escapeHTML(cp.id)}')" title="Edit personality">&#9998;</button>
      <button class="chat-personality-delete" onclick="event.stopPropagation(); deleteCustomPersonality('${escapeHTML(cp.id)}')" title="Delete personality">&times;</button>
    </div>`;
  }
  html += '<button class="chat-personality-add-btn" onclick="startNewCustomPersonality()">+ New Personality</button>';
  html += `<div class="chat-personality-custom-area" style="display:${showEditor ? 'block' : 'none'}">
    <div class="chat-personality-custom-header">
      <input type="text" id="chat-personality-custom-name" class="chat-personality-custom-name-input" placeholder="e.g. A longevity researcher" maxlength="60" oninput="markPersonalityDirty()">
      <button id="chat-personality-generate-btn" class="chat-personality-generate-btn" onclick="generateCustomPersonality()">Generate</button>
    </div>
    <textarea class="chat-personality-custom-textarea" placeholder="Describe how you want the AI to communicate, or type a name above and click Generate..." oninput="autoResizePersonaTextarea(); markPersonalityDirty()"></textarea>
    <div class="chat-personality-custom-footer">
      <span class="chat-personality-disclaimer">Custom personas are for personal use. Don't impersonate real individuals without their consent.</span>
      <button class="chat-personality-custom-save" onclick="saveCustomPersonality()" disabled>Save</button>
    </div>
  </div>`;
  section.innerHTML = html;
  // Populate editor
  if (isCustomActive && _editingPersonalityId !== 'new') {
    const cp = getCustomPersonality();
    const textarea = section.querySelector('.chat-personality-custom-textarea');
    const nameInput = document.getElementById('chat-personality-custom-name');
    if (textarea) { textarea.value = cp.promptText; autoResizePersonaTextarea(); }
    if (nameInput) nameInput.value = cp.name !== 'Custom Personality' ? cp.name : '';
    _editingPersonalityId = state.currentChatPersonality;
    snapshotPersonalityClean();
  } else if (_editingPersonalityId === 'new') {
    snapshotPersonalityClean();
  }
}

export function togglePersonalityBar() {
  const options = document.querySelector('.chat-personality-options');
  const bar = document.querySelector('.chat-personality-bar');
  if (options && bar) {
    bar.classList.toggle('open');
    const trigger = document.querySelector('.chat-personality-current');
    if (trigger) trigger.setAttribute('aria-expanded', bar.classList.contains('open'));
  }
}

// Track which custom personality is being edited (ID, 'new', or null)
let _editingPersonalityId = null;
let _generatedPersonaIcon = null;

// Dirty state tracking for custom personality
let _personaCleanState = null;

function _getPersonaCurrentState() {
  const nameInput = document.getElementById('chat-personality-custom-name');
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  return {
    name: nameInput ? nameInput.value : '',
    text: textarea ? textarea.value : ''
  };
}

export function snapshotPersonalityClean() {
  _personaCleanState = _getPersonaCurrentState();
  const saveBtn = document.querySelector('.chat-personality-custom-save');
  if (saveBtn) saveBtn.disabled = true;
}

export function markPersonalityDirty() {
  const saveBtn = document.querySelector('.chat-personality-custom-save');
  if (!saveBtn || !_personaCleanState) { if (saveBtn) saveBtn.disabled = false; return; }
  const cur = _getPersonaCurrentState();
  const dirty = cur.name !== _personaCleanState.name || cur.text !== _personaCleanState.text;
  saveBtn.disabled = !dirty;
}

export function autoResizePersonaTextarea() {
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
}

export function saveCustomPersonality() {
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  const nameInput = document.getElementById('chat-personality-custom-name');
  if (!textarea) return;
  const name = (nameInput ? nameInput.value.trim() : '') || 'Custom Personality';
  const icon = _generatedPersonaIcon || pickPersonaIcon(name);
  _generatedPersonaIcon = null;
  const promptText = textarea.value.trim();
  const customs = getCustomPersonalities();
  let id;
  if (_editingPersonalityId && _editingPersonalityId !== 'new') {
    // Update existing
    id = _editingPersonalityId;
    const idx = customs.findIndex(p => p.id === id);
    if (idx >= 0) customs[idx] = { ...customs[idx], name, icon, promptText };
  } else {
    // Create new
    id = 'custom_' + Date.now().toString(36);
    customs.push({ id, name, icon, promptText });
  }
  saveCustomPersonalities(customs);
  _editingPersonalityId = id;
  state.currentChatPersonality = id;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, id);
  snapshotPersonalityClean();
  updatePersonalityBar();
  updateChatHeaderTitle();
  showNotification('Custom personality saved', 'success');
}

export function startNewCustomPersonality() {
  _editingPersonalityId = 'new';
  updatePersonalityBar();
}

export function editCustomPersonality(id) {
  _editingPersonalityId = id;
  // Select the persona if not already active
  if (state.currentChatPersonality !== id) {
    setChatPersonality(id);
  }
  updatePersonalityBar();
}

export function deleteCustomPersonality(id) {
  const customs = getCustomPersonalities();
  const cp = customs.find(p => p.id === id);
  const name = cp ? cp.name : 'personality';
  showConfirmDialog(`Delete "${name}"? This cannot be undone.`, () => {
    const updated = customs.filter(p => p.id !== id);
    saveCustomPersonalities(updated);
    if (state.currentChatPersonality === id) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      _editingPersonalityId = null;
    }
    updatePersonalityBar();
    updateChatHeaderTitle();
    renderChatMessages();
  });
}

export async function generateCustomPersonality() {
  if (!hasAIProvider()) {
    showNotification('AI provider not configured. Open Settings first.', 'info');
    return;
  }
  const nameInput = document.getElementById('chat-personality-custom-name');
  const textarea = document.querySelector('.chat-personality-custom-textarea');
  const genBtn = document.getElementById('chat-personality-generate-btn');
  if (!nameInput || !textarea) return;
  const name = nameInput.value.trim();
  if (!name) {
    showNotification('Enter a name first (e.g. "A longevity researcher")', 'info');
    nameInput.focus();
    return;
  }
  // Loading state
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = 'Generating\u2026'; }
  textarea.value = '';
  textarea.placeholder = `Generating ${name} persona\u2026`;

  try {
    const systemPrompt = `You are a persona designer for a health/blood work AI chat assistant called getbased. The user will give you a name — a real person, fictional character, or archetype. Create a thorough, vivid persona profile that the AI should fully embody when discussing lab results and health data.

Write in second person ("You are..."). Output a rich persona description covering ALL of the following:

1. **Identity & Background**: Who this persona is — their professional history, credentials, intellectual lineage, what shaped their worldview. What are they known for? What's their origin story?
2. **Communication Style**: Exact tone, vocabulary, formality level. Specific signature phrases, verbal tics, metaphors, or rhetorical patterns they'd use. How do they open conversations? How do they deliver bad news vs good news?
3. **Medical & Health Philosophy**: Their core framework for interpreting lab data. What do they emphasize that mainstream medicine overlooks? What conventional advice do they challenge or dismiss? What biomarkers excite them and why?
4. **Analytical Approach**: How they connect dots between markers. Do they focus on ratios, trends, context, root causes? What patterns do they look for first? How do they weigh reference ranges vs optimal ranges?
5. **Lifestyle & Optimization Lens**: What lifestyle factors do they always ask about? Diet, light exposure, sleep, environment, hormones — what's their hierarchy? What interventions do they champion?
6. **Character & Personality**: Temperament, humor style, patience level. How they handle disagreement, uncertainty, or when a patient pushes back. What makes them passionate or frustrated?
7. **Signature Recommendations**: Specific tests, supplements, protocols, or lifestyle changes they'd commonly suggest. What's their go-to advice?
8. **Unconventional Views**: Where do their views diverge from mainstream medical consensus? How do they naturally acknowledge this in conversation — using their own voice, not disclaimers? (e.g. "Conventional endocrinology won't tell you this, but..." or "The literature is catching up to what we've known for years...")

Be extremely specific — include actual phrases, real concepts they'd reference, genuine intellectual positions. This persona should feel unmistakably like talking to the real person, not a generic impression. Aim for 400-500 words. Do NOT include any disclaimers or accuracy warnings — just the pure persona.

End the persona with this exact paragraph (copy it verbatim, do not modify):
"When your views diverge from mainstream medical consensus, acknowledge it naturally in your own voice and style — never with generic disclaimers, never breaking character. Your perspective is the point."

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
    // Extract AI-picked emoji from first line
    const lines = text.split('\n');
    const firstLine = lines[0].trim();
    const emojiMatch = firstLine.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?(\u200D(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?))*)/u);
    if (emojiMatch && emojiMatch[0] && firstLine.length <= 4) {
      _generatedPersonaIcon = emojiMatch[0];
      // Strip emoji line from prompt text
      const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
      textarea.value = rest;
    } else {
      textarea.value = text;
    }
    autoResizePersonaTextarea();
    markPersonalityDirty();
    textarea.placeholder = 'Describe how you want the AI to communicate, or type a name above and click Generate...';
  } catch (err) {
    textarea.placeholder = 'Describe how you want the AI to communicate, or type a name above and click Generate...';
    showNotification(`Generation failed: ${err.message}`, 'error');
  }
  if (genBtn) { genBtn.disabled = false; genBtn.textContent = 'Generate'; }
}

// ═══════════════════════════════════════════════
// CHAT HISTORY (now thread-aware)
// ═══════════════════════════════════════════════
export async function loadChatHistory() {
  if (!state.currentThreadId) {
    state.chatHistory = [];
    renderChatMessages();
    return;
  }
  try {
    const key = getChatThreadKey(state.currentThreadId);
    const stored = await encryptedGetItem(key);
    state.chatHistory = stored ? JSON.parse(stored) : [];
  } catch { state.chatHistory = []; }
  renderChatMessages();
}

export async function saveChatHistory() {
  if (!state.currentThreadId) return;
  invalidateThreadContentCache();
  // No message limit per thread (API still sends last 10)
  const key = getChatThreadKey(state.currentThreadId);
  const value = JSON.stringify(state.chatHistory);
  if (getEncryptionEnabled()) {
    await encryptedSetItem(key, value);
  } else {
    localStorage.setItem(key, value);
  }
  // Update thread index metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    // Only bump timestamp if messages changed (avoids reordering on thread switch)
    if (thread.messageCount !== state.chatHistory.length) thread.updatedAt = new Date().toISOString();
    thread.messageCount = state.chatHistory.length;
    thread.personality = state.currentChatPersonality;
    const p = getActivePersonality();
    thread.personalityName = p.name;
    thread.personalityIcon = p.icon;
    saveChatThreadIndex();
    renderThreadList();
  }
}

// ═══════════════════════════════════════════════
// THREAD SUMMARY
// ═══════════════════════════════════════════════
const SUMMARY_PROMPT = `You are a concise medical note-taker. Summarize this health consultation into a structured note.

FORMAT (use these exact headings):
## Key Findings
Bullet list of the most important lab results, patterns, and insights discussed.

## Action Items
Numbered list of concrete next steps — tests to order, supplements to try, lifestyle changes, things to discuss with a doctor.

## Open Questions
Bullet list of unresolved questions or areas that need follow-up.

RULES:
- Be specific: include actual marker names, values, and ranges when discussed
- Keep it short — this is a reference note, not a transcript
- Skip pleasantries and meta-discussion, extract only substance
- If the conversation is too short or trivial, say so in one line`;

let _summaryAbortController = null;

export async function summarizeThread() {
  if (!state.chatHistory || state.chatHistory.length < 4) {
    showNotification('Need at least 4 messages to summarize', 'info');
    return;
  }
  if (!hasAIProvider()) {
    showNotification('No AI provider configured', 'error');
    return;
  }
  if (isAIPaused()) {
    showNotification('AI features are paused', 'info');
    return;
  }

  // Check for existing summary
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread?.summary) {
    _showSummaryModal(thread.summary, thread);
    return;
  }

  _generateSummary();
}

async function _generateSummary() {
  // Abort any in-flight summary generation
  if (_summaryAbortController) {
    _summaryAbortController.abort();
    _summaryAbortController = null;
  }
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (!thread) return;

  // Build conversation for summarization
  const messages = state.chatHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  // Show modal with loading state
  _showSummaryModal(null, thread, true);

  const _modelId = getActiveModelId();
  const _modelDisplay = getActiveModelDisplay();
  const _provider = getAIProvider();

  _summaryAbortController = new AbortController();

  try {
    const { text, usage } = await callClaudeAPI({
      system: SUMMARY_PROMPT,
      messages,
      maxTokens: 2048,
      signal: _summaryAbortController.signal,
      onStream(partial) {
        const body = document.getElementById('summary-modal-body');
        if (body) {
          body.innerHTML = renderMarkdown(partial);
          body.scrollTop = body.scrollHeight;
        }
      }
    });

    // Save summary to thread + standalone storage
    const costInfo = usage ? { provider: _provider, modelId: _modelId, modelDisplay: _modelDisplay, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : null;
    const now = new Date().toISOString();
    thread.summary = text;
    thread.summaryDate = now;
    thread.summaryModel = _modelDisplay;
    if (costInfo) thread.summaryCost = costInfo;
    saveChatThreadIndex();

    // Persist standalone copy
    await _saveSummaryToProfile({
      id: 's_' + Date.now().toString(36),
      threadId: thread.id,
      threadName: thread.name,
      content: text,
      createdAt: now,
      model: _modelDisplay,
      cost: costInfo
    });

    renderThreadList();
    renderSavedSummaries();

    // Update modal to final state
    const savedSummary = _getLatestSavedSummary(thread.id);
    _showSummaryModal(text, { ...thread, _savedId: savedSummary?.id }, false, costInfo);
  } catch (e) {
    if (e.name === 'AbortError') {
      showNotification('Summary cancelled', 'info');
    } else {
      showNotification('Summary failed: ' + e.message, 'error');
    }
    _closeSummaryModal();
  } finally {
    _summaryAbortController = null;
  }
}

// ── Standalone summary storage ──
function _getSavedSummaries() {
  return (state.importedData.chatSummaries || []);
}

async function _saveSummaryToProfile(summary) {
  if (!state.importedData.chatSummaries) state.importedData.chatSummaries = [];
  // Replace existing summary for the same thread
  const idx = state.importedData.chatSummaries.findIndex(s => s.threadId === summary.threadId);
  if (idx >= 0) {
    summary.id = state.importedData.chatSummaries[idx].id;
    state.importedData.chatSummaries[idx] = summary;
  } else {
    state.importedData.chatSummaries.push(summary);
  }
  await saveImportedData();
}

function _getLatestSavedSummary(threadId) {
  return _getSavedSummaries().find(s => s.threadId === threadId);
}

export async function deleteSavedSummary(id) {
  if (!state.importedData.chatSummaries) return;
  state.importedData.chatSummaries = state.importedData.chatSummaries.filter(s => s.id !== id);
  await saveImportedData();
  renderSavedSummaries();
  _closeSummaryModal();
  showNotification('Summary deleted', 'info');
}

export function viewSavedSummary(id) {
  const s = _getSavedSummaries().find(s => s.id === id);
  if (!s) return;
  _showSummaryModal(s.content, {
    name: s.threadName,
    summaryDate: s.createdAt,
    summaryModel: s.model,
    summaryCost: s.cost,
    summary: s.content,
    _savedId: s.id
  });
}

export function renderSavedSummaries() {
  const container = document.getElementById('chat-saved-summaries');
  if (!container) return;
  const summaries = _getSavedSummaries().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (summaries.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<div class="chat-saved-summaries-title">Summaries</div>' +
    summaries.map(s => {
      const date = new Date(s.createdAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="chat-saved-summary-item" onclick="viewSavedSummary('${escapeHTML(s.id)}')">
        <div class="chat-saved-summary-name">${escapeHTML(s.threadName)}</div>
        <div class="chat-saved-summary-meta">${dateStr}${s.model ? ' \u00b7 ' + escapeHTML(s.model) : ''}</div>
      </div>`;
    }).join('');
}

function _showSummaryModal(summaryText, thread, loading = false, usageInfo = null) {
  _activeSummary = summaryText ? { content: summaryText, name: thread?.name, date: thread?.summaryDate, model: thread?.summaryModel } : null;
  let overlay = document.getElementById('summary-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'summary-modal-overlay';
    overlay.className = 'modal-overlay show';
    let mdInside = false;
    overlay.addEventListener('mousedown', (e) => { mdInside = e.target !== overlay; });
    overlay.onclick = (e) => { if (e.target === overlay && !mdInside) _closeSummaryModal(); mdInside = false; };
    document.body.appendChild(overlay);
  } else {
    overlay.className = 'modal-overlay show';
  }

  const threadName = thread ? escapeHTML(thread.name) : 'Conversation';
  const dateStr = thread?.summaryDate ? new Date(thread.summaryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const modelStr = thread?.summaryModel ? ` \u00b7 ${escapeHTML(thread.summaryModel)}` : '';

  // Show cost from usageInfo (fresh generation) or saved on thread (cached view)
  let costLine = '';
  const ui = usageInfo || thread?.summaryCost;
  if (ui && ui.modelDisplay) {
    const cost = calculateCost(ui.provider, ui.modelId, ui.inputTokens, ui.outputTokens);
    const totalTokens = (ui.inputTokens || 0) + (ui.outputTokens || 0);
    costLine = ` \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens`;
  }

  let bodyContent;
  if (loading) {
    bodyContent = '<div class="typing-indicator" style="margin:20px auto"><span></span><span></span><span></span></div>';
  } else if (summaryText) {
    bodyContent = renderMarkdown(summaryText);
  } else {
    bodyContent = '';
  }

  overlay.innerHTML = `<div class="modal">
    <button class="modal-close" onclick="closeSummaryModal()" aria-label="Close">&times;</button>
    <h3>Summary</h3>
    <div class="summary-modal-meta">${threadName}${dateStr ? ' \u00b7 ' + dateStr : ''}${modelStr}${costLine}</div>
    <div id="summary-modal-body" class="summary-modal-body">${bodyContent}</div>
    <div class="summary-modal-actions"${loading ? ' style="display:none"' : ''}>
      <button class="summary-action-btn" onclick="copySummary()" title="Copy as markdown">Copy</button>
      <button class="summary-action-btn" onclick="downloadSummary()" title="Download as .md file">Download</button>
      <button class="summary-action-btn" onclick="printSummary()" title="Print">Print</button>
      ${thread?._savedId ? `<button class="summary-action-btn secondary delete" onclick="deleteSavedSummary('${escapeHTML(thread._savedId)}')" title="Delete summary">Delete</button>` : ''}
    </div>
  </div>`;
}

function _closeSummaryModal() {
  if (_summaryAbortController) {
    _summaryAbortController.abort();
    _summaryAbortController = null;
  }
  _activeSummary = null;
  const overlay = document.getElementById('summary-modal-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }
}

export function closeSummaryModal() { _closeSummaryModal(); }

// Currently viewed summary — used by copy/download/print regardless of source
let _activeSummary = null;

export function copySummary() {
  if (!_activeSummary?.content) return;
  navigator.clipboard.writeText(_activeSummary.content).then(() => {
    showNotification('Summary copied to clipboard', 'info');
  });
}

export function downloadSummary() {
  if (!_activeSummary?.content) return;
  const name = _activeSummary.name || 'summary';
  const filename = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '_summary.md';
  const dateLine = _activeSummary.date ? `_Summarized ${new Date(_activeSummary.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${_activeSummary.model ? ' \u00b7 ' + _activeSummary.model : ''}_` : '';
  const header = `# ${name}\n\n${dateLine}\n\n---\n\n`;
  const blob = new Blob([header + _activeSummary.content], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function printSummary() {
  if (!_activeSummary?.content) return;
  const name = _activeSummary.name || 'Summary';
  const html = renderMarkdown(_activeSummary.content);
  const dateLine = _activeSummary.date ? `Summarized ${new Date(_activeSummary.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${_activeSummary.model ? ' \u00b7 ' + escapeHTML(_activeSummary.model) : ''}` : '';
  const w = window.open('', '_blank');
  if (!w) { showNotification('Popup blocked — allow popups for this site', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHTML(name)} - Summary</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}
h1{font-size:20px;border-bottom:1px solid #ddd;padding-bottom:8px}h2{font-size:16px;margin-top:24px}
ul,ol{padding-left:20px}li{margin:4px 0}.meta{color:#666;font-size:13px;margin-bottom:20px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
@media print{body{margin:20px}}</style>
</head><body>
<h1>${escapeHTML(name)}</h1>
${dateLine ? `<div class="meta">${dateLine}</div>` : ''}
${html}
</body></html>`);
  w.document.close();
  w.print();
}

export function clearChatHistory() {
  // Sister "delete thread" confirms; this one used to wipe immediately.
  showConfirmDialog("Clear all messages in this conversation? This can't be undone.", () => {
    state.chatHistory = [];
    if (state.currentThreadId) {
      localStorage.removeItem(getChatThreadKey(state.currentThreadId));
      // Update thread metadata
      const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
      if (thread) {
        thread.messageCount = 0;
        thread.updatedAt = new Date().toISOString();
        delete thread.summary;
        delete thread.summaryDate;
        delete thread.summaryModel;
        delete thread.summaryCost;
        saveChatThreadIndex();
        renderThreadList();
        // Remove saved summary
        if (state.importedData.chatSummaries) {
          state.importedData.chatSummaries = state.importedData.chatSummaries.filter(s => s.threadId !== state.currentThreadId);
          saveImportedData();
        }
        renderSavedSummaries();
      }
    }
    renderChatMessages();
    updateChatHeaderTitle();
    updateDiscussButton();
    showNotification('Chat history cleared', 'info');
  });
}

// ═══════════════════════════════════════════════
// MESSAGE RENDERING
// ═══════════════════════════════════════════════

function _getNoDataPrompts() {
  const data = getActiveData();
  const hasLabs = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate);
  if (hasLabs) return null;
  const cardKeys = ['healthGoals', 'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment'];
  const filledCount = cardKeys.filter(k => {
    if (k === 'healthGoals') return (state.importedData.healthGoals || []).length > 0;
    return hasCardContent(state.importedData[k]);
  }).length;
  if (filledCount === 0) {
    return [
      'What should I tell you about myself first?',
      'Why do the context cards matter?',
      'What blood tests are worth getting?',
      'Where do I start with optimizing my health?'
    ];
  }
  return [
    'Based on my profile, what blood tests should I get?',
    'What panels would help with my health goals?',
    'What should I tell my doctor to test for?',
    'Which markers are most relevant to my lifestyle?'
  ];
}

/**
 * Render the collapsible "Sources" block under an assistant message.
 * Shows the excerpts the lens returned for this question — filename, score,
 * and the actual chunk text. Lets users verify what the AI was grounded on
 * (or not, if its answer drifts from the cited sources). Collapsed by
 * default so the chat stays scannable.
 */
function _renderLensSources(chunks, sourceName) {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';
  const sourceLabel = sourceName ? escapeHTML(sourceName) : 'knowledge base';
  const items = chunks.map((c, i) => {
    const src = c.source || `excerpt ${i + 1}`;
    const score = typeof c.score === 'number'
      ? `<span class="chat-lens-source-score" title="Cosine similarity">${c.score.toFixed(2)}</span>`
      : '';
    const text = c.text ? escapeHTML(c.text).replace(/\n/g, '<br>') : '';
    return `<details class="chat-lens-source" onclick="event.stopPropagation()">
      <summary class="chat-lens-source-summary">
        <span class="chat-lens-source-name">${escapeHTML(src)}</span>
        ${score}
      </summary>
      <div class="chat-lens-source-text">${text}</div>
    </details>`;
  }).join('');
  return `<details class="chat-lens-sources" onclick="event.stopPropagation()">
    <summary class="chat-lens-sources-summary">📎 ${chunks.length} excerpt${chunks.length !== 1 ? 's' : ''} from ${sourceLabel}</summary>
    <div class="chat-lens-sources-body">${items}</div>
  </details>`;
}

export function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // ── Onboarding flow: conversational chat bubbles guide through setup ──
  if (state.chatHistory.length === 0) {
    const personality = getActivePersonality();
    const hasData = state.importedData?.entries?.length > 0;
    const currentP = getProfiles().find(p => p.id === state.currentProfile);
    const hasProfile = currentP?.name && currentP.name !== 'Default' && state.profileSex;

    // Stage 1: No profile — ask name/sex/DOB/location
    if (!hasProfile) {
      const pName = (currentP?.name && currentP.name !== 'Default') ? currentP.name : '';
      const pSex = state.profileSex || '';
      const pDob = state.profileDob || '';
      const pLoc = getProfileLocation(state.currentProfile);
      const _pH = window.getProfileHeight ? window.getProfileHeight(state.currentProfile) : { height: null, unit: 'cm' };
      const pHeight = _pH.height ? (_pH.unit === 'in' ? (_pH.height / 2.54).toFixed(1) : _pH.height) : '';
      const pHeightUnit = _pH.unit || 'cm';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>Hey! 👋 I'll be your AI health analyst — I help you understand blood work, track trends, and spot what matters. First, tell me a bit about yourself:</p>
          <div class="chat-onboard-form">
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Name</label>
              <input type="text" class="chat-onboard-input" id="chat-onboard-name" placeholder="your name" value="${escapeHTML(pName)}" onchange="window.saveChatProfile()">
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Sex</label>
              <div class="chat-onboard-sex">
                <button class="welcome-sex-btn${pSex === 'male' ? ' active' : ''}" onclick="window.setChatProfileSex('male')">Male</button>
                <button class="welcome-sex-btn${pSex === 'female' ? ' active' : ''}" onclick="window.setChatProfileSex('female')">Female</button>
              </div>
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Born</label>
              <input type="date" class="chat-onboard-input" id="chat-onboard-dob" value="${escapeHTML(pDob)}" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}">
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Height</label>
              <div style="display:flex;gap:6px;flex:1">
                <input type="number" class="chat-onboard-input" id="chat-onboard-height" placeholder="cm" step="0.1" value="${pHeight || ''}" style="flex:1">
                <select class="chat-onboard-input" id="chat-onboard-height-unit" style="flex:0 0 55px" onchange="window.onboardHeightUnitChanged()">
                  <option value="cm"${pHeightUnit !== 'in' ? ' selected' : ''}>cm</option>
                  <option value="in"${pHeightUnit === 'in' ? ' selected' : ''}>in</option>
                </select>
              </div>
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Weight</label>
              <div style="display:flex;gap:6px;flex:1">
                <input type="number" class="chat-onboard-input" id="chat-onboard-weight" placeholder="kg" step="0.1" style="flex:1">
                <select class="chat-onboard-input" id="chat-onboard-weight-unit" style="flex:0 0 55px">
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </select>
              </div>
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label">Location</label>
              <input type="text" class="chat-onboard-input" id="chat-onboard-country" placeholder="e.g. Germany" value="${escapeHTML(pLoc.country || '')}" oninput="window.saveChatLocation()">
            </div>
            <div id="chat-onboard-lat" style="font-size:12px;margin:2px 0 0 52px"></div>
            <div style="font-size:11px;color:var(--text-muted);margin:2px 0 0 52px;line-height:1.3">Latitude affects vitamin D, circadian rhythm, and seasonal health patterns.</div>
            <button class="chat-onboard-next" id="chat-onboard-next" onclick="window.saveChatProfile(true)" disabled>Continue →</button>
          </div>
        </div>`;
      _updateOnboardNextBtn();
      if (pLoc.country) saveChatLocation(); // show latitude for pre-filled country
      updateDiscussButton();
      return;
    }

    // AI paused — show re-enable prompt instead of setup guide
    if (isAIPaused()) {
      const name = currentP?.name || 'there';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>${escapeHTML(name)}, AI features are currently paused. Turn them back on to chat, get insights, and import PDFs with AI.</p>
          <div style="margin-top:12px">
            <button class="import-btn import-btn-primary" onclick="window._resumeAI()">Enable AI</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // Stage 2: Profile set, no AI — connect provider (full list)
    const providerSkipped = localStorage.getItem(`labcharts-onboard-provider-skipped-${state.currentProfile}`);
    if (!hasAIProvider() && !providerSkipped) {
      const name = currentP?.name || 'there';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>Nice to meet you, ${escapeHTML(name)}! I need an AI brain to analyze your labs. Pick a provider:</p>
          <div class="chat-setup-providers">
            <div class="chat-setup-provider">
              <strong>PPQ</strong> <span class="chat-setup-rec">(Anonymous)</span><br>
              <span class="chat-setup-detail">300+ models, no KYC. Bitcoin, Lightning, Monero, Litecoin. Top up in the app.</span><br>
              <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('ppq')},300)" style="color:var(--accent)">Set up PPQ &rarr;</a>
            </div>
            <div class="chat-setup-provider">
              <strong>Routstr</strong> <span class="chat-setup-rec">(Bitcoin)</span><br>
              <span class="chat-setup-detail">Lightning and Cashu eCash. No account needed. Top up with QR codes in the app.</span><br>
              <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('routstr')},300)" style="color:var(--accent)">Set up Routstr &rarr;</a>
            </div>
            <div class="chat-setup-provider">
              <strong>OpenRouter</strong> <span class="chat-setup-rec">(Most models)</span><br>
              <span class="chat-setup-detail">200+ models. Pay with card or USDC. One-click login.</span><br>
              <button class="or-oauth-btn" style="margin-top:8px" onclick="startOpenRouterOAuth()">Connect with OpenRouter</button>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">or <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('openrouter')},300)" style="color:var(--accent)">paste a key manually</a></div>
            </div>
            <div class="chat-setup-provider">
              <strong>Venice</strong><br>
              <span class="chat-setup-detail">Uncensored models with optional E2EE. No-log policy.</span><br>
              <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('venice')},300)" style="color:var(--accent)">Set up Venice &rarr;</a>
            </div>
            <div class="chat-setup-provider">
              <strong>Local AI</strong><br>
              <span class="chat-setup-detail">Ollama, LM Studio, or Jan. Fully offline. Free forever.</span><br>
              <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('ollama')},300)" style="color:var(--accent)">Set up Local AI &rarr;</a>
            </div>
          </div>
          <p style="font-size:13px">Got a key from one of these? Paste it here:</p>
          <button class="chat-setup-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">Open AI Settings</button>
          <div style="text-align:center;margin-top:12px">
            <a href="#" onclick="event.preventDefault();window.skipProviderSetup()" style="color:var(--text-muted);font-size:12px">Skip for now — I'll set this up later</a>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // Stage 3+: API connected — guide through cards and import
    const filled = _countFilledCards();
    const name = currentP?.name || 'there';

    const isFemale = state.profileSex === 'female';
    const mc = state.importedData?.menstrualCycle;
    const hasCycle = mc?.periods?.length > 0 || mc?.cycleLength || mc?.cycleStatus;
    const supps = state.importedData.supplements || [];
    const extrasDone = localStorage.getItem(`labcharts-onboard-extras-done-${state.currentProfile}`);

    // Stage 3-extras: Cycle + supplements (dedicated step, shown once before cards/import)
    if (!hasData && !extrasDone) {
      const cycleSection = (isFemale && !hasCycle) ? `<div class="chat-onboard-cycle-hint">
            <p>🩸 Do you currently have a menstrual cycle? This helps me interpret hormones, iron, and inflammation — they shift significantly with cycle phase.</p>
            <div class="chat-onboard-cycle-options" id="chat-onboard-cycle-options">
              <button class="ctx-btn-option" onclick="window.showCyclePeriodEntry()">Yes — I get regular periods</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('perimenopause')">They're irregular / perimenopause</button>
              <button class="ctx-btn-option" onclick="window.showCycleNoMensesOptions()">No — not currently menstruating</button>
            </div>
            <div class="chat-onboard-cycle-options" id="chat-onboard-cycle-no-menses" style="display:none">
              <p style="font-size:13px;margin:0 0 6px;color:var(--text-muted)">What's the reason? This helps me interpret your labs correctly.</p>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('postmenopause')">Menopause</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('pregnant')">Pregnant</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('breastfeeding')">Breastfeeding</button>
              <button class="ctx-btn-option" onclick="window.saveCycleStatus('absent')">Other reason</button>
            </div>
            <div class="chat-onboard-cycle-form" id="chat-onboard-cycle-entry" style="display:none">
              <p style="font-size:13px;margin:8px 0 4px">When did your last period start and end? (day of month)</p>
              <div class="chat-onboard-cycle-dates">
                <label class="chat-onboard-label">Started</label>
                <input type="number" class="chat-onboard-input chat-onboard-day" id="chat-onboard-period-start" min="1" max="31" placeholder="?" oninput="window._updatePeriodBtn()">
                <label class="chat-onboard-label">ended</label>
                <input type="number" class="chat-onboard-input chat-onboard-day" id="chat-onboard-period-end" min="1" max="31" placeholder="?" oninput="window._updatePeriodBtn()">
              </div>
              <div id="chat-onboard-period-preview" style="font-size:12px;color:var(--text-muted);margin:4px 0"></div>
              <button class="chat-onboard-next" id="chat-onboard-period-btn" onclick="window.saveChatPeriod()" disabled>Save</button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">You can always change this later in the <a href="#" onclick="event.stopPropagation();closeChatPanel();window.openMenstrualCycleEditor?.()" style="color:var(--accent)">cycle editor</a>.</div>
          </div>` : '';
      const suppList = supps.map((s, i) => `<div class="chat-onboard-supp-item"><span>${escapeHTML(s.name)}${s.dosage ? ' — ' + escapeHTML(s.dosage) : ''} <span style="color:var(--text-muted);font-size:11px">(${s.type})</span></span><button class="chat-onboard-supp-remove" onclick="window.removeChatSupplement(${i})" title="Remove">&times;</button></div>`).join('');
      const suppSection = `<div class="chat-onboard-supps">
            <p>💊 Are you taking any supplements or medications? These can significantly affect your lab results.</p>
            <div id="chat-onboard-supp-list">${suppList}</div>
            <div class="chat-onboard-supp-form">
              <input type="text" class="chat-onboard-input" id="chat-onboard-supp-name" placeholder="Name (e.g. Creatine, Metformin)" style="flex:2" onkeydown="if(event.key==='Enter'){event.preventDefault();window.addChatSupplement()}">
              <input type="text" class="chat-onboard-input" id="chat-onboard-supp-dose" placeholder="Dosage (e.g. 5g/day)" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();window.addChatSupplement()}">
              <select class="chat-onboard-input" id="chat-onboard-supp-type" style="flex:0 0 auto;width:auto">
                <option value="supplement">Supplement</option>
                <option value="medication">Medication</option>
              </select>
              <button class="chat-onboard-supp-add" onclick="window.addChatSupplement()">+</button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Press + or Enter to add. You can always edit these later on the dashboard.</div>
          </div>`;
      const genetics = state.importedData.genetics;
      const hasSnps = genetics && Object.keys(genetics.snps || {}).length > 0;
      const hasMtdna = genetics && genetics.mtdna;
      let dnaSection = `<div class="chat-onboard-dna" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">`;
      if (hasSnps) {
        const fx = genetics.effects || {};
        const dots = [];
        if (genetics.apoe) dots.push(`APOE: <strong>${escapeHTML(genetics.apoe)}</strong>`);
        if (fx.significant > 0) dots.push(`\uD83D\uDD34 ${fx.significant} significant`);
        if (fx.moderate > 0) dots.push(`\uD83D\uDFE1 ${fx.moderate} moderate`);
        if (fx.normal > 0) dots.push(`\uD83D\uDFE2 ${fx.normal} normal`);
        const dotsHtml = dots.length > 0 ? `<div style="font-size:13px;line-height:1.8">${dots.join(' &nbsp;\u00B7&nbsp; ')}</div>` : '';
        dnaSection += `<p style="margin:0 0 6px">\uD83E\uDDEC <strong>${Object.keys(genetics.snps).length} SNPs imported</strong> from ${escapeHTML(genetics.source)}</p>${dotsHtml}`;
      }
      if (hasMtdna) {
        const mt = genetics.mtdna;
        dnaSection += `<p style="margin:${hasSnps ? '8' : '0'}px 0 6px">\uD83E\uDDEC mtDNA Haplogroup: <strong>${escapeHTML(mt.haplogroup)}</strong>${mt.coupling ? ` \u2014 ${escapeHTML(mt.coupling.shortLabel)}` : ''}</p>`;
      }
      if (hasSnps || hasMtdna) {
        dnaSection += `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">I'll factor these into all your lab interpretations.</div>`;
      }
      if (!hasSnps || !hasMtdna) {
        const prompts = [];
        if (!hasSnps) prompts.push('autosomal raw data (23andMe, Ancestry, etc.)');
        if (!hasMtdna) prompts.push('mtDNA mutation file (maternal haplogroup)');
        dnaSection += `<p style="margin:${hasSnps || hasMtdna ? '8' : '0'}px 0 8px">\uD83E\uDDEC ${hasSnps || hasMtdna ? 'You can also add' : 'Have you ever done a DNA test? Upload'} ${prompts.join(' or ')}${hasSnps || hasMtdna ? '.' : ' \u2014 it helps me understand <em>why</em> your labs look the way they do.'}</p>
            <div style="display:flex;align-items:center;gap:8px;margin:8px 0">
              ${!hasSnps ? `<button class="ctx-btn-option" onclick="document.getElementById('dna-onboard-input').click()">Upload DNA raw data</button>` : ''}
              ${!hasMtdna ? `<button class="ctx-btn-option" onclick="document.getElementById('mtdna-onboard-input').click()">Upload mtDNA file</button>` : ''}
              ${!hasMtdna ? `<span style="font-size:12px;color:var(--text-muted)">or</span>
              <select class="ctx-btn-option" style="padding:4px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px" onchange="if(this.value){window.setManualHaplogroup(this.value);this.value=''}">
                <option value="">Enter haplogroup</option>
                ${window.HAPLOGROUP_LIST ? window.HAPLOGROUP_LIST.map(h => '<option value="' + h + '">' + h + '</option>').join('') : ''}
              </select>` : ''}
            </div>
            ${!hasSnps ? `<input type="file" id="dna-onboard-input" accept=".txt,.csv" style="display:none" onchange="if(this.files[0]){window.handleDNAFile(this.files[0]);this.value=''}">` : ''}
            ${!hasMtdna ? `<input type="file" id="mtdna-onboard-input" accept=".txt,.csv" style="display:none" onchange="if(this.files[0]){window.handleMtDNAFile(this.files[0]);this.value=''}">` : ''}
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5">Processed locally \u2014 your DNA files never leave your device.</div>`;
      }
      dnaSection += `</div>`;
      const wearableConns = state.importedData?.wearableConnections || {};
      const hasWearable = Object.values(wearableConns).some(c => c?.accessToken || c?.connectedSince);
      const wearableSection = hasWearable ? '' : `<div class="chat-onboard-wearable" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <p style="margin:0 0 6px">⧬ Do you wear a smartwatch or fitness tracker? HRV, sleep, recovery and body composition give me a much richer picture alongside your blood work.</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
              <button class="ctx-btn-option" onclick="event.stopPropagation();closeChatPanel();window.openSettingsModal('wearables')">Connect a wearable</button>
              <button class="ctx-btn-option" onclick="event.stopPropagation();this.closest('.chat-onboard-wearable').style.display='none'">I don't wear one</button>
              <span style="font-size:12px;color:var(--text-muted);align-self:center">Oura · Withings · Fitbit · Polar · Apple Health</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5">Raw daily samples stay on your device. Sync only carries a compact encrypted summary.</div>
          </div>`;
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai" style="width:88%">
          <p>${hasAIProvider() ? 'Great, we\'re connected! 🎉' : 'Nice!'} A couple of quick things that help me give better advice:</p>
          ${cycleSection}
          ${suppSection}
          ${dnaSection}
          ${wearableSection}
          <div class="chat-onboard-actions">
            <button class="chat-onboard-cta" onclick="window.skipOnboardingExtras()">Continue →</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3a: All 9 cards filled, no data — full picture
    if (filled >= 9 && !hasData) {
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>${escapeHTML(name)}, you filled everything in — I have a really complete picture of your lifestyle now. ${hasAIProvider() ? 'Even without lab data, I can already help:' : 'Import your labs or connect an AI provider to get personalized insights.'}</p>
          <div class="chat-onboard-actions">
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('Based on my full profile, what blood tests should I get and why?')">What tests should I get?</button>
                 <button class="chat-prompt-btn" onclick="useChatPrompt('What can you tell about my health from my lifestyle info?')">Analyze my lifestyle</button>`
              : `<button class="chat-onboard-cta" onclick="closeChatPanel()">📄 Import a lab PDF</button>
                 <button class="chat-prompt-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">⚙️ Connect AI to get recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3b: No data, some cards filled — show progress, encourage more
    if (!hasData && filled > 0) {
      const remaining = 9 - filled;
      const progressPct = Math.round((filled / 9) * 100);
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>${filled >= 6 ? `Almost there, ${escapeHTML(name)}!` : filled >= 3 ? `Nice progress, ${escapeHTML(name)}!` : `Good start, ${escapeHTML(name)}!`} You've filled ${filled} of 9 cards.</p>
          <div class="chat-onboard-progress"><div class="chat-onboard-progress-bar" style="width:${progressPct}%"></div></div>
          <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">The more I know about your lifestyle, the better I can interpret your results and recommend what to test. Everything is optional.</p>
          <div class="chat-onboard-actions">
            <button class="chat-onboard-cta" onclick="closeChatPanel();sessionStorage.setItem('welcome-details-open','1');document.querySelector('.welcome-context-details')?.setAttribute('open','');document.querySelector('.welcome-context-details')?.scrollIntoView({behavior:'smooth'})">📋 Continue — ${remaining} card${remaining !== 1 ? 's' : ''} left</button>
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('Based on what you know about me so far, what blood tests should I get?')">Skip ahead — recommend tests</button>`
              : `<button class="chat-prompt-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">⚙️ Connect AI to get recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3c: No data, no cards — initial prompt
    if (!hasData) {
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>You're ready to go, ${escapeHTML(name)}! Here's how to get the most out of this:</p>
          <p style="font-size:13px;margin:4px 0"><strong>Have lab results?</strong> Drop a PDF on the page — I'll extract everything and build your dashboard with trend charts, flags, and insights.</p>
          <p style="font-size:13px;margin:4px 0"><strong>No labs yet?</strong> Tell me about your lifestyle and I'll recommend what to test first.</p>
          <div class="chat-onboard-actions">
            <button class="chat-onboard-cta" onclick="closeChatPanel()">📄 Import a lab PDF</button>
            <button class="chat-onboard-cta" onclick="closeChatPanel();sessionStorage.setItem('welcome-details-open','1');document.querySelector('.welcome-context-details')?.setAttribute('open','');document.querySelector('.welcome-context-details')?.scrollIntoView({behavior:'smooth'})">📋 Fill in my lifestyle cards</button>
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('I don\\'t have any labs yet. Based on my profile, what blood tests should I get and why?')">Just tell me what to test</button>`
              : `<button class="chat-prompt-btn" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">⚙️ Connect AI to get recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // Stage 4: Has data, few context cards — nudge lifestyle
    if (filled < 3) {
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          <p>I can see your lab results — nice! 👋 I can already analyze these, but if you fill in a few lifestyle cards I'll give you much more personalized insights.</p>
          <div class="chat-onboard-actions">
            <button class="chat-prompt-btn" onclick="closeChatPanel();document.querySelector('.profile-context-cards')?.scrollIntoView({behavior:'smooth'})">📋 Fill in lifestyle cards</button>
            <button class="chat-prompt-btn" onclick="useChatPrompt('What are my most concerning results?')">Analyze my results now</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }
    const noDataPrompts = _getNoDataPrompts();
    const prompts = noDataPrompts || [
      'What are my most concerning results?',
      'How has my bloodwork changed over time?',
      'Are there any patterns in my flagged markers?',
      'Explain my thyroid panel',
      'What should I test next?'
    ];
    container.innerHTML = `<div class="chat-empty">
      <div class="chat-empty-icon">${personality.icon}</div>
      <div>${escapeHTML(personality.greeting)}</div>
      <div class="chat-prompts">
        ${prompts.map(p => `<button class="chat-prompt-btn" onclick="useChatPrompt('${escapeHTML(p)}')">${escapeHTML(p)}</button>`).join('\n        ')}
      </div>
    </div>`;
    updateDiscussButton();
    return;
  }
  let html = '';
  let lastPersonaName = null;
  for (let i = 0; i < state.chatHistory.length; i++) {
    const msg = state.chatHistory[i];
    const cls = msg.role === 'user' ? 'chat-user' : 'chat-ai';
    // "Joined" system messages
    if (msg.joined) {
      html += `<div class="chat-persona-joined">${msg.joinIcon || ''} ${escapeHTML(msg.joinName || '')} joined the discussion</div>`;
      continue;
    }
    // Hidden auto messages (instruction sent to API but not shown)
    if (msg.hidden) continue;
    // Show persona label when personality changes between AI messages
    if (msg.role === 'assistant' && msg.personalityName && msg.personalityName !== lastPersonaName) {
      html += `<div class="chat-persona-label">${msg.personalityIcon || ''} ${escapeHTML(msg.personalityName)}</div>`;
    }
    if (msg.role === 'assistant') lastPersonaName = msg.personalityName || null;
    const autoClass = msg.auto ? ' chat-msg-auto' : '';
    const stoppedNote = msg.stopped ? '<div class="chat-stopped-note">[stopped]</div>' : '';
    let imageBadge = '';
    if (msg.hasImages) {
      if (msg.thumbnails && msg.thumbnails.length > 0) {
        imageBadge = '<div class="chat-image-thumbs">' + msg.thumbnails.map(t =>
          `<img src="${t}" class="chat-image-thumb" alt="attached image" onclick="openImageLightbox(this.src)">`
        ).join('') + '</div>';
      } else {
        imageBadge = `<div class="chat-image-badge">\uD83D\uDDBC ${msg.imageCount} image${msg.imageCount !== 1 ? 's' : ''} attached</div>`;
      }
    }
    html += `<div class="chat-msg ${cls}${autoClass}" id="chat-msg-${i}">${imageBadge}${renderMarkdown(msg.content)}${stoppedNote}`;
    if (msg.role === 'assistant') {
      if (msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens)) {
        const mId = msg.modelId || getActiveModelId();
        const mProvider = msg.modelId ? (msg.modelId.includes('/') ? 'openrouter' : getAIProvider()) : getAIProvider();
        const cost = calculateCost(mProvider, mId, msg.usage.inputTokens, msg.usage.outputTokens);
        const totalTokens = (msg.usage.inputTokens || 0) + (msg.usage.outputTokens || 0);
        const mName = msg.modelDisplay || getActiveModelDisplay();
        const webTag = msg.webSearch ? ' \u00b7 \ud83c\udf10 web' : '';
        const e2eeTag = msg.e2ee ? e2eeLockFootnote(msg.attestation) : '';
        html += `<div class="chat-cost-footnote">${escapeHTML(mName)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}</div>`;
      }
      html += buildActionBar(i);
      // Lens citations — show which excerpts the AI received with this question.
      // Persisted on the message so re-rendering or switching threads keeps
      // the sources visible. Collapsed by default to keep the chat scannable;
      // user can expand any time to verify what grounded the response.
      if (msg.lensSources?.length) {
        html += _renderLensSources(msg.lensSources, msg.lensSourceName);
      }
      // EMF hint (persisted, single-line link to assessment editor)
      if (msg.emfHint && window.isProductRecsEnabled?.()) {
        const openHandler = `event.preventDefault();window.openEMFAssessmentEditor&&window.openEMFAssessmentEditor();`;
        html += `<div class="chat-emf-hint"><span aria-hidden="true">💡</span> Curious about your EMF environment? <a href="#" onclick="${openHandler}" data-umami-event="emf-nudge-chat">Open the assessment →</a></div>`;
      }
      // Rec slots (persisted on message, rendered from catalog)
      if (msg.recSlots?.length && window.isProductRecsEnabled?.() && window.renderRecommendationSectionSync && window._cachedCatalog?.slots) {
        const recSections = msg.recSlots.map(slot => {
          const slotLabel = window._cachedCatalog.slots[slot]?.label || slot.split('.').pop();
          return window.renderRecommendationSectionSync(slot, { label: slotLabel, maxProducts: 2 });
        }).filter(Boolean);
        if (recSections.length) {
          html += `<details class="rec-chat-wrapper" onclick="event.stopPropagation()"><summary class="rec-chat-summary">What can help</summary>`;
          let recBody = recSections.map(s => s.replace('rec-section-header', 'rec-chat-subheading')).join('');
          // Deduplicate disclosure banners (each renderRecommendationSectionSync prepends one)
          let bannerCount = 0;
          recBody = recBody.replace(/<div class="rec-disclosure-banner">[\s\S]*?<\/div>/g, m => ++bannerCount > 1 ? '' : m);
          html += recBody;
          html += `</details>`;
        }
      }
    }
    html += '</div>';
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
  updateDiscussButton();
  updateChatHeaderTitle();
  _updateChatInputState();
}

export function useChatPrompt(text) {
  if (!hasAIProvider()) {
    showNotification('Connect an AI provider first — open Settings → AI to set one up.', 'info');
    return;
  }
  const input = document.getElementById('chat-input');
  if (input) { input.value = text; sendChatMessage(); }
}

// ═══════════════════════════════════════════════
// MARKDOWN — extracted to js/markdown.js
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// PANEL OPEN/CLOSE
// ═══════════════════════════════════════════════
export function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
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
  document.body.classList.toggle('chat-fullscreen', fullscreen);
  backdrop.classList.add('open');
  // Backdrop is now pointer-events: none — opening chat no longer
  // locks scrolling on the dashboard. Removed `body.style.overflow=hidden`
  // (which would also break the dashboard's scroll affordance).
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.add('hidden');
  // Dismiss current nudge stage (but not 'profile' — user must complete the form)
  const currentNudge = localStorage.getItem('labcharts-chat-nudge');
  if (currentNudge && currentNudge !== 'profile') {
    localStorage.setItem(`labcharts-chat-nudge-dismissed-${state.currentProfile}`, currentNudge);
    setChatNudge(null);
  }
  loadChatPersonality();
  updateChatHeaderTitle();
  updateLensIndicator();
  updatePersonalityBar();
  // Sync web search toggle
  const wsCb = document.getElementById('chat-websearch-checkbox');
  if (wsCb) wsCb.checked = getChatWebSearchEnabled();
  _updateWebSearchToggleVisibility();
  // Load threads and ensure active thread
  loadChatThreads();
  ensureActiveThread();
  restoreRailState();
  renderThreadList();
  renderSavedSummaries();
  await loadChatHistory();
  // Restore discussion continue prompt if this thread had an active discussion
  const activeThread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (activeThread && activeThread.discussionPersonas) {
    showDiscussContinuePrompt(activeThread.discussionPersonas, activeThread.discussionOriginalPersonality);
  }
  _updateChatInputState();
  if (prefillMessage) {
    const input = document.getElementById('chat-input');
    if (input) { input.value = prefillMessage; input.focus(); }
  } else {
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }
}

function _updateChatInputState() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const noAI = !hasAIProvider();
  if (input) {
    input.disabled = noAI;
    input.placeholder = noAI ? (isAIPaused() ? 'AI features are paused' : 'Connect an AI provider in Settings to chat') : 'Ask about your lab results...';
  }
  if (sendBtn) sendBtn.disabled = noAI;
  _updateWebSearchToggleVisibility();
}

export function closeChatPanel() {
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-backdrop').classList.remove('open');
  // body.style.overflow no longer set on open (so nothing to restore)
  // Drop the dashboard-shift body classes so the layout reflows back.
  document.body.classList.remove('chat-open', 'chat-fullscreen');
  const fab = document.getElementById('chat-fab');
  if (fab) fab.classList.remove('hidden');
}

// ═══════════════════════════════════════════════
// CHAT NUDGE (unread badge on FAB)
// ═══════════════════════════════════════════════

/**
 * Show/hide the unread badge + gentle pulse on the chat FAB.
 * Stages:
 *   'profile' — no name/sex set yet (first visit)
 *   'api'     — no AI provider connected
 *   'data'    — API connected but no lab data imported
 *   'context' — data imported, nudge to fill context cards
 *   null      — clear the nudge
 */
export function setChatNudge(stage) {
  const fab = document.getElementById('chat-fab');
  if (!fab) return;
  let badge = fab.querySelector('.chat-fab-badge');
  if (stage) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-fab-badge';
      fab.appendChild(badge);
    }
    fab.classList.add('chat-fab-nudge');
    localStorage.setItem('labcharts-chat-nudge', stage);
  } else {
    if (badge) badge.remove();
    fab.classList.remove('chat-fab-nudge');
    localStorage.removeItem('labcharts-chat-nudge');
  }
}

/** Check state and show appropriate nudge if user hasn't dismissed it. */
export function updateChatNudge() {
  const dismissed = localStorage.getItem(`labcharts-chat-nudge-dismissed-${state.currentProfile}`);
  const hasData = state.importedData?.entries?.length > 0;
  const currentP = getProfiles().find(p => p.id === state.currentProfile);
  const hasProfile = currentP?.name && currentP.name !== 'Default' && state.profileSex;

  if (!hasProfile) {
    // Stage 0: no profile — always nudge (can't dismiss)
    setChatNudge('profile');
  } else if (!hasAIProvider()) {
    if (dismissed !== 'api') setChatNudge('api');
    else setChatNudge(null);
  } else if (!hasData) {
    if (dismissed !== 'data') setChatNudge('data');
    else setChatNudge(null);
  } else {
    const filledCards = ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'healthGoals']
      .filter(k => {
        const v = state.importedData?.[k];
        return v && typeof v === 'object' && Object.values(v).some(f => f != null && f !== '' && !(Array.isArray(f) && f.length === 0));
      }).length;
    if (filledCards < 3 && dismissed !== 'context') setChatNudge('context');
    else setChatNudge(null);
  }
}

// ═══════════════════════════════════════════════
// CHAT ONBOARDING PROFILE FORM HELPERS
// ═══════════════════════════════════════════════

function _updateOnboardNextBtn() {
  const btn = document.getElementById('chat-onboard-next');
  if (!btn) return;
  const name = document.getElementById('chat-onboard-name')?.value?.trim();
  const sex = state.profileSex;
  btn.disabled = !(name && sex);
}

export function setChatProfileSex(sex) {
  document.querySelectorAll('.chat-onboard-form .welcome-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.chat-onboard-form .welcome-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
  setProfileSex(state.currentProfile, sex);
  state.profileSex = sex;
  _updateOnboardNextBtn();
}

var _chatLocTimer = null;
export function onboardHeightUnitChanged() {
  const input = document.getElementById('chat-onboard-height');
  const select = document.getElementById('chat-onboard-height-unit');
  if (!input || !select) return;
  const val = parseFloat(input.value);
  if (!val) { input.placeholder = select.value === 'in' ? 'inches' : 'cm'; return; }
  if (select.value === 'in') { input.value = (val / 2.54).toFixed(1); input.placeholder = 'inches'; }
  else { input.value = (val * 2.54).toFixed(1); input.placeholder = 'cm'; }
}

export function saveChatLocation() {
  const country = document.getElementById('chat-onboard-country')?.value?.trim();
  if (country == null) return;
  setProfileLocation(state.currentProfile, country, '');
  const el = document.getElementById('chat-onboard-lat');
  if (!el) return;
  if (!country) { el.textContent = ''; return; }

  // Check AI cache first
  const cacheKey = (country + '|').toLowerCase();
  const cached = getLocationCache()[cacheKey];
  if (cached !== undefined) {
    const band = latitudeToBand(cached);
    el.style.color = 'var(--green)';
    el.textContent = '\u2713 ' + Math.abs(Math.round(cached)) + '\u00b0' + (cached >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band];
    return;
  }
  // Hardcoded fallback
  const latStr = getLatitudeFromLocation();
  if (latStr) {
    el.style.color = 'var(--green)';
    el.textContent = '\u2713 ' + latStr;
  } else if (hasAIProvider()) {
    el.style.color = 'var(--text-muted)';
    el.textContent = 'Detecting\u2026';
  } else {
    el.textContent = '';
  }
  // Debounced AI refinement
  if (_chatLocTimer) clearTimeout(_chatLocTimer);
  if (hasAIProvider()) {
    _chatLocTimer = setTimeout(async () => {
      await detectLatitudeWithAI(country, '');
      // Re-read cache after AI detection
      const lat = getLocationCache()[(country + '|').toLowerCase()];
      const latEl = document.getElementById('chat-onboard-lat');
      if (lat !== undefined && latEl) {
        const band = latitudeToBand(lat);
        latEl.style.color = 'var(--green)';
        latEl.textContent = '\u2713 ' + Math.abs(Math.round(lat)) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band];
      }
    }, 1500);
  }
}

export function saveChatProfile(advance) {
  const nameEl = document.getElementById('chat-onboard-name');
  const dobEl = document.getElementById('chat-onboard-dob');
  const name = nameEl?.value?.trim();
  const dob = dobEl?.value;
  if (name) renameProfile(state.currentProfile, name);
  if (dob) {
    const dobYear = parseInt(dob.slice(0, 4));
    if (dobYear >= 1900 && dobYear <= new Date().getFullYear()) {
      setProfileDob(state.currentProfile, dob); state.profileDob = dob;
    }
    // Silently ignore invalid DOB — user can fix before clicking Continue
  }
  // Save height
  const heightRaw = parseFloat(document.getElementById('chat-onboard-height')?.value);
  const heightUnit = document.getElementById('chat-onboard-height-unit')?.value || 'cm';
  if (heightRaw && window.setProfileHeight) {
    const heightCm = heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : heightRaw;
    window.setProfileHeight(state.currentProfile, heightCm, heightUnit);
  }
  // Save weight as first biometric entry
  const weightRaw = parseFloat(document.getElementById('chat-onboard-weight')?.value);
  const weightUnit = document.getElementById('chat-onboard-weight-unit')?.value || 'kg';
  if (weightRaw) {
    if (!state.importedData.biometrics) state.importedData.biometrics = { weight: [], bp: [], pulse: [] };
    const today = new Date().toISOString().slice(0, 10);
    const w = state.importedData.biometrics.weight || [];
    state.importedData.biometrics.weight = w.filter(e => e.date !== today);
    state.importedData.biometrics.weight.push({ date: today, value: weightRaw, unit: weightUnit, source: 'manual' });
    state.importedData.biometrics.weight.sort((a, b) => a.date.localeCompare(b.date));
    window.saveImportedData();
  }
  saveChatLocation();
  window.renderProfileButton?.();
  _updateOnboardNextBtn();
  if (advance && name && state.profileSex) {
    // Profile complete — advance to next stage
    updateChatNudge();
    renderChatMessages();
  }
}

export function showCycleNoMensesOptions() {
  const options = document.getElementById('chat-onboard-cycle-options');
  const noMenses = document.getElementById('chat-onboard-cycle-no-menses');
  if (options) options.style.display = 'none';
  if (noMenses) noMenses.style.display = 'block';
}

export function showCyclePeriodEntry() {
  const options = document.getElementById('chat-onboard-cycle-options');
  const entry = document.getElementById('chat-onboard-cycle-entry');
  if (options) options.style.display = 'none';
  if (entry) entry.style.display = 'block';
}

export function saveCycleStatus(status) {
  if (!state.importedData.menstrualCycle) state.importedData.menstrualCycle = {};
  state.importedData.menstrualCycle.cycleStatus = status;
  if (!state.importedData.menstrualCycle.periods) state.importedData.menstrualCycle.periods = [];
  window.recordChange('menstrualCycle');
  saveImportedData();
  const labels = { perimenopause: 'Perimenopause noted', postmenopause: 'Noted — postmenopause', pregnant: 'Noted — pregnant', breastfeeding: 'Noted — breastfeeding', absent: 'Noted — no active cycle' };
  showNotification(labels[status] || 'Cycle status saved', 'success');
  _refreshDashboardCycle();
  renderChatMessages();
}

function _inferPeriodDates(startDay, endDay) {
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth();
  if (startDay > now.getDate()) month--;
  if (month < 0) { month = 11; year--; }
  const pad = n => String(n).padStart(2, '0');
  const startDate = `${year}-${pad(month + 1)}-${pad(startDay)}`;
  let eMonth = month, eYear = year;
  if (endDay < startDay) { eMonth++; if (eMonth > 11) { eMonth = 0; eYear++; } }
  const endDate = `${eYear}-${pad(eMonth + 1)}-${pad(endDay)}`;
  return { startDate, endDate };
}

export function _updatePeriodBtn() {
  const startVal = document.getElementById('chat-onboard-period-start')?.value;
  const endVal = document.getElementById('chat-onboard-period-end')?.value;
  const btn = document.getElementById('chat-onboard-period-btn');
  const preview = document.getElementById('chat-onboard-period-preview');
  const startDay = parseInt(startVal);
  const endDay = parseInt(endVal);
  if (btn) btn.disabled = !(startDay && endDay);
  if (preview && startDay && endDay) {
    const { startDate, endDate } = _inferPeriodDates(startDay, endDay);
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const days = Math.max(1, Math.round((e - s) / 86400000));
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (days <= 10) {
      preview.textContent = `→ ${fmt(s)} – ${fmt(e)} (${days} day${days !== 1 ? 's' : ''})`;
      preview.style.color = 'var(--text-muted)';
    } else {
      preview.textContent = `→ ${fmt(s)} – ${fmt(e)} (${days} days) — that seems long, double-check?`;
      preview.style.color = 'var(--yellow)';
    }
  } else if (preview) {
    preview.textContent = '';
  }
}

export function saveChatPeriod() {
  const startDay = parseInt(document.getElementById('chat-onboard-period-start')?.value);
  const endDay = parseInt(document.getElementById('chat-onboard-period-end')?.value);
  if (!startDay || !endDay) return;
  const { startDate, endDate } = _inferPeriodDates(startDay, endDay);
  const periodDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));
  if (!state.importedData.menstrualCycle) state.importedData.menstrualCycle = {};
  const mc = state.importedData.menstrualCycle;
  if (!mc.periods) mc.periods = [];
  mc.periods.push({ startDate, endDate, flow: 'moderate' });
  mc.cycleStatus = 'regular';
  if (!mc.cycleLength) mc.cycleLength = 28;
  mc.periodLength = periodDays;
  window.recordChange('menstrualCycle');
  saveImportedData();
  showNotification('Cycle tracking set up!', 'success');
  _refreshDashboardCycle();
  renderChatMessages();
}

export function addChatSupplement() {
  const nameEl = document.getElementById('chat-onboard-supp-name');
  const doseEl = document.getElementById('chat-onboard-supp-dose');
  const typeEl = document.getElementById('chat-onboard-supp-type');
  const name = nameEl?.value?.trim();
  if (!name) { nameEl?.focus(); return; }
  if (!state.importedData.supplements) state.importedData.supplements = [];
  state.importedData.supplements.push({
    name,
    dosage: doseEl?.value?.trim() || '',
    type: typeEl?.value || 'supplement',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null
  });
  saveImportedData();
  _refreshDashboardSupps();
  renderChatMessages();
}

export function removeChatSupplement(idx) {
  if (!state.importedData.supplements?.[idx]) return;
  state.importedData.supplements.splice(idx, 1);
  saveImportedData();
  _refreshDashboardSupps();
  renderChatMessages();
}

function _refreshDashboardSupps() {
  const el = document.querySelector('.supp-timeline-section');
  if (el && window.renderSupplementsSection) el.outerHTML = window.renderSupplementsSection();
}

function _refreshDashboardCycle() {
  // Ensure the lifestyle details section is open so the cycle section is visible
  const details = document.querySelector('.welcome-context-details');
  if (details && !details.open) { details.setAttribute('open', ''); sessionStorage.setItem('welcome-details-open', '1'); }
  const el = document.querySelector('.cycle-section');
  if (el && window.renderMenstrualCycleSection) {
    el.outerHTML = window.renderMenstrualCycleSection(window.getActiveData());
  } else if (!el && state.profileSex === 'female' && window.renderMenstrualCycleSection) {
    // Cycle section doesn't exist yet — insert it after context cards
    const supps = document.querySelector('.supp-timeline-section');
    if (supps) supps.insertAdjacentHTML('beforebegin', window.renderMenstrualCycleSection(window.getActiveData()));
  }
}

export function skipProviderSetup() {
  localStorage.setItem(`labcharts-onboard-provider-skipped-${state.currentProfile}`, '1');
  renderChatMessages();
}

export function skipOnboardingExtras() {
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
  // Ensure the lifestyle details section is open so cycle/supplements are visible
  sessionStorage.setItem('welcome-details-open', '1');
  // Re-render dashboard to reflect cycle + supplement changes from onboarding
  if (window.navigate) window.navigate('dashboard');
  renderChatMessages();
}

/** Called by context-cards.js after saving a card. Nudges or advances the onboarding. */
function _countFilledCards() {
  return ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'healthGoals']
    .filter(k => {
      const v = state.importedData?.[k];
      return v && typeof v === 'object' && Object.values(v).some(f => f != null && f !== '' && !(Array.isArray(f) && f.length === 0));
    }).length;
}

export function onContextCardSaved() {
  const filled = _countFilledCards();
  const hasData = state.importedData?.entries?.length > 0;
  if (!hasData) {
    setChatNudge(filled >= 9 ? 'ready' : 'context');
  }
  // Re-render chat if open so progress bar / nudge updates
  const panel = document.getElementById('chat-panel');
  if (panel?.classList.contains('open') && state.chatHistory.length === 0) {
    renderChatMessages();
  }
}

// ═══════════════════════════════════════════════
// SEND BUTTON STATE
// ═══════════════════════════════════════════════
function setSendButtonMode(btn, mode) {
  if (!btn) return;
  if (mode === 'streaming') {
    btn.disabled = false;
    btn.innerHTML = '&#9632;'; // ■ stop square
    btn.classList.add('streaming');
  } else {
    btn.disabled = false;
    btn.innerHTML = '&#10148;'; // ➤ send arrow
    btn.classList.remove('streaming');
  }
}

// ═══════════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════════
export async function sendChatMessage() {
  if (!hasAIProvider()) {
    renderChatMessages(); // Re-render to show setup guide
    return;
  }
  // If currently streaming, abort and return (toggle behavior)
  if (_chatAbortController) {
    _chatAbortController.abort();
    _chatAbortController = null;
    return;
  }

  // Clear any pending discussion continue prompt
  removeDiscussContinuePrompt();
  delete state._discussionPersonas;
  delete state._discussionOriginalPersonality;
  // Clear persisted discussion state
  const curThread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (curThread && curThread.discussionPersonas) {
    delete curThread.discussionPersonas;
    delete curThread.discussionOriginalPersonality;
    saveChatThreadIndex();
  }

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const container = document.getElementById('chat-messages');
  const text = input.value.trim();
  const hasImages = hasPendingAttachments();
  if (!text && !hasImages) return;

  // Capture attachments before clearing (they're ephemeral)
  const attachments = hasImages ? [...getPendingAttachments()] : [];

  // Ensure we have a thread
  if (!state.currentThreadId) {
    createNewThread();
  }

  // Auto-name thread from first user message
  const isFirstMessage = state.chatHistory.length === 0;

  // Add user message — store tiny thumbnails for display, NOT full base64
  const userMsg = { role: 'user', content: text || '(image)' };
  if (hasImages) {
    userMsg.hasImages = true;
    userMsg.imageCount = attachments.length;
    userMsg.thumbnails = attachments.map(a => a.thumbUrl).filter(Boolean);
  }
  state.chatHistory.push(userMsg);
  input.value = '';
  input.style.height = '';
  clearAttachments();
  renderChatMessages();
  saveChatHistory(); // persist immediately so messages survive API failures

  if (isFirstMessage) {
    autoNameThread(state.currentThreadId, text);
  }

  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'typing-indicator';
  typingEl.setAttribute('role', 'status');
  typingEl.setAttribute('aria-live', 'polite');
  typingEl.setAttribute('aria-label', 'AI is responding');
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  // Switch to stop mode
  _chatAbortController = new AbortController();
  setSendButtonMode(sendBtn, 'streaming');

  // Snapshot context areas before sending
  const contextSnapshot = getContextSummary();
  const webSearchEnabled = getChatWebSearchEnabled() && supportsWebSearch();

  try {
    let labContext = buildLabContext({ userMessage: text });
    let _lensResultForMsg = null;
    if (hasLens()) {
      const lensResult = await queryLensMulti(text, { signal: _chatAbortController ? _chatAbortController.signal : undefined });
      if (lensResult) {
        labContext = injectLensChunks(labContext, lensResult);
        _lensResultForMsg = lensResult;
      }
    }
    const personality = getActivePersonality();
    let personalityPrompt = '';
    if (personality.id && personality.id.startsWith('custom_')) {
      const cp = getCustomPersonality();
      if (cp.promptText) {
        personalityPrompt = `\n\nPersona: ${cp.promptText}`;
      }
    } else if (personality.promptAddition) {
      personalityPrompt = '\n\n' + personality.promptAddition;
    }
    // Check if other personas have responded in this thread
    const currentPersonaName = personality.name;
    const otherPersonas = new Set();
    for (const m of state.chatHistory) {
      if (m.role === 'assistant' && m.personalityName && m.personalityName !== currentPersonaName) {
        otherPersonas.add(m.personalityName);
      }
    }
    let multiPersonaInstruction = '';
    if (otherPersonas.size > 0) {
      multiPersonaInstruction = `\n\nThis conversation includes responses from other AI personalities (${[...otherPersonas].join(', ')}). Messages marked [Response from ...] were written by a different persona — treat them as a separate analyst's opinion, not your own. You may agree or disagree with their analysis, but never claim you wrote their responses.`;
    }
    const _isE2EE = getAIProvider() === 'venice' && isVeniceE2EEActive();
    let webHint = '';
    if (_isE2EE) {
      webHint = '\n\n[NO WEB ACCESS — E2EE mode] Do not generate URLs. Suggest disabling E2EE for web-enabled queries.';
    } else if (webSearchEnabled) {
      webHint = '\n\n[WEB SEARCH ACTIVE] You can search the internet. Always include direct URLs to specific products/pages when the user asks. Do not give generic advice without links when the user names a specific website.';
    } else if (supportsWebSearch()) {
      webHint = '\n\n[NO WEB ACCESS] Do not fabricate URLs. The user can enable web search via the "Web" toggle in the chat header.';
    }
    const systemPrompt = CHAT_SYSTEM_PROMPT + webHint + '\n\nCurrent lab data:\n' + labContext + personalityPrompt + multiPersonaInstruction;

    // Send last 30 messages for context — tag messages from other personas
    const apiMessages = state.chatHistory.filter(m => !m.joined && m.role).slice(-30).map(m => {
      if (m.role === 'assistant' && m.personalityName && m.personalityName !== currentPersonaName) {
        return { role: m.role, content: `[Response from ${m.personalityName}]\n${m.content}` };
      }
      return { role: m.role, content: m.content };
    });

    // Inject vision content into the last user message if images were attached
    if (attachments.length > 0 && apiMessages.length > 0) {
      const lastUserIdx = apiMessages.length - 1;
      const provider = getAIProvider();
      const imageBlocks = attachments.map(att => formatImageBlock(att.base64, att.mediaType, provider));
      apiMessages[lastUserIdx] = {
        role: 'user',
        content: buildVisionContent(imageBlocks, apiMessages[lastUserIdx].content, provider)
      };
    }

    // Show persona label if personality changed from last AI message
    const lastAiMsg = [...state.chatHistory].reverse().find(m => m.role === 'assistant');
    if (!lastAiMsg || lastAiMsg.personalityName !== personality.name) {
      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      container.appendChild(labelEl);
    }

    // Capture model info before API call (user may switch models mid-conversation)
    const _msgModelId = getActiveModelId();
    const _msgModelDisplay = getActiveModelDisplay();
    const _msgProvider = getAIProvider();
    const _msgE2EE = _isE2EE;

    // Create AI message placeholder
    const aiMsgEl = document.createElement('div');
    aiMsgEl.className = 'chat-msg chat-ai';
    aiMsgEl.style.whiteSpace = 'pre-wrap';

    // Typewriter: trickle buffered text at a steady rate for smooth appearance
    const typewriter = createTypewriter(aiMsgEl, typingEl, container);

    const { text: fullText, usage } = await callClaudeAPI({
      system: systemPrompt,
      messages: apiMessages,
      maxTokens: 4096,
      signal: _chatAbortController ? _chatAbortController.signal : undefined,
      onStream(text) { typewriter.update(text); },
      webSearch: webSearchEnabled
    });

    // Final render with full markdown
    typewriter.stop();
    aiMsgEl.style.whiteSpace = '';
    if (typingEl.parentNode) typingEl.remove();
    if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);

    aiMsgEl.innerHTML = renderMarkdown(fullText);
    // Cost footnote
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      const cost = calculateCost(_msgProvider, _msgModelId, usage.inputTokens, usage.outputTokens);
      const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
      const webTag = webSearchEnabled ? ' \u00b7 \ud83c\udf10 web' : '';
      const e2eeTag = _msgE2EE ? e2eeLockFootnote(window._veniceAttestation) : '';
      const footnote = document.createElement('div');
      footnote.className = 'chat-cost-footnote';
      footnote.innerHTML = `${escapeHTML(_msgModelDisplay)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}`;
      aiMsgEl.appendChild(footnote);
    }

    // Build assistant message object with context snapshot
    const assistantMsg = { role: 'assistant', content: fullText, context: contextSnapshot, personalityName: personality.name, personalityIcon: personality.icon, modelId: _msgModelId, modelDisplay: _msgModelDisplay };
    if (webSearchEnabled) assistantMsg.webSearch = true;
    if (_msgE2EE) { assistantMsg.e2ee = true; assistantMsg.attestation = window._veniceAttestation || null; }
    if (_lensResultForMsg && _lensResultForMsg.chunks?.length) {
      // Persist the retrieved excerpts on the message itself so the UI can
      // show a collapsible Sources block and the user can verify what the
      // AI actually saw. Cap text length per chunk to keep the chat
      // history record from ballooning if a future model returns very
      // long excerpts.
      assistantMsg.lensSources = _lensResultForMsg.chunks.slice(0, 10).map(c => ({
        text: typeof c.text === 'string' ? c.text.slice(0, 1500) : '',
        source: c.source || '',
        score: typeof c.score === 'number' ? c.score : null,
      }));
      assistantMsg.lensSourceName = _lensResultForMsg.sourceName || '';
    }
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
      trackUsage(_msgProvider, _msgModelId, usage.inputTokens, usage.outputTokens);
    }
    state.chatHistory.push(assistantMsg);

    // Detect supplement slots from AI text — persist on message for re-rendering
    const _recSlots = (window.isProductRecsEnabled && window.isProductRecsEnabled() && window.detectSupplementSlots) ? window.detectSupplementSlots(fullText) : [];
    if (_recSlots.length) assistantMsg.recSlots = _recSlots;

    // EMF hint with profile-level 30-day cooldown. Fires only when (a) EMF is
    // explicitly on the user's mind in this turn AND (b) they haven't already
    // explored EMF (no fresh assessment) AND (c) we haven't surfaced this hint
    // for this profile in the last 30 days AND (d) the hint actually rendered
    // to the DOM (so a stop-mid-stream doesn't burn the cooldown).
    (function maybeInjectEMFHint() {
      try {
        if (!window.isProductRecsEnabled?.() || !window.detectEMFRelevance) return;
        const userText = state.chatHistory[state.chatHistory.length - 2]?.content || '';
        const turnText = `${userText}\n${fullText}`;
        if (!window.detectEMFRelevance(turnText)) return;
        const assessments = state.importedData?.emfAssessment?.assessments || [];
        if (assessments.length) {
          const latest = assessments.reduce((a, b) => (a.date > b.date ? a : b));
          const ageDays = (Date.now() - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
          if (ageDays < 120) return;
        }
        const profileId = state.currentProfile || 'default';
        const flagKey = `labcharts-emf-hint-last-${profileId}`;
        const lastShown = parseInt(localStorage.getItem(flagKey) || '0', 10);
        const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
        if (lastShown && (Date.now() - lastShown) < COOLDOWN_MS) return;
        // Only persist the hint + cooldown once we've actually injected the
        // DOM node — otherwise a torn-down message (stop, regenerate, error)
        // would silently consume the 30-day cooldown.
        if (!aiMsgEl?.isConnected) return;
        const hintEl = document.createElement('div');
        hintEl.className = 'chat-emf-hint';
        hintEl.innerHTML = `<span aria-hidden="true">💡</span> Curious about your EMF environment? <a href="#" onclick="event.preventDefault();window.openEMFAssessmentEditor&&window.openEMFAssessmentEditor();" data-umami-event="emf-nudge-chat">Open the assessment →</a>`;
        const actionBar = aiMsgEl.querySelector('.chat-action-bar');
        if (actionBar) aiMsgEl.insertBefore(hintEl, actionBar);
        else aiMsgEl.appendChild(hintEl);
        assistantMsg.emfHint = true;
        localStorage.setItem(flagKey, String(Date.now()));
      } catch {}
    })();

    // Append action bar
    const msgIndex = state.chatHistory.length - 1;
    const actionBarHtml = buildActionBar(msgIndex);
    const actionBarContainer = document.createElement('div');
    actionBarContainer.innerHTML = actionBarHtml;
    while (actionBarContainer.firstChild) aiMsgEl.appendChild(actionBarContainer.firstChild);

    // Async-render supplement recommendations before action bar
    if (_recSlots.length && window.renderRecommendationSection && window.loadCatalog) {
      window.loadCatalog().then(catalog => {
        if (!catalog?.slots || !aiMsgEl.isConnected) return;
        const sections = _recSlots.map(slot => {
          const slotLabel = catalog.slots[slot]?.label || slot.split('.').pop();
          return window.renderRecommendationSectionSync(slot, { label: slotLabel, maxProducts: 2 });
        }).filter(Boolean);
        if (!sections.length) return;
        const wrapper = document.createElement('details');
        wrapper.className = 'rec-chat-wrapper';
        wrapper.open = true;
        wrapper.onclick = (e) => e.stopPropagation();
        const summary = document.createElement('summary');
        summary.className = 'rec-chat-summary';
        summary.textContent = 'What can help';
        wrapper.appendChild(summary);
        const body = document.createElement('div');
        body.innerHTML = sections.join('');
        // Deduplicate disclosure banners
        const banners = body.querySelectorAll('.rec-disclosure-banner');
        for (let i = 1; i < banners.length; i++) banners[i].remove();
        // Downgrade per-section headers to subheadings (shared header is the <summary>)
        body.querySelectorAll('.rec-section-header').forEach(h => h.className = 'rec-chat-subheading');
        wrapper.appendChild(body);
        const actionBar = aiMsgEl.querySelector('.chat-action-bar');
        if (actionBar) aiMsgEl.insertBefore(wrapper, actionBar);
        else aiMsgEl.appendChild(wrapper);
      });
    }

    container.scrollTop = container.scrollHeight;
    saveChatHistory();
  } catch (err) {
    if (typingEl.parentNode) typingEl.remove();

    // Abort: save partial streamed text as a normal message
    if (err.name === 'AbortError') {
      // Read partial text from the DOM (typewriter accumulates into textContent)
      const partialText = aiMsgEl?.textContent?.trim() || '';
      if (partialText) {
        if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
        aiMsgEl.style.whiteSpace = '';
        aiMsgEl.innerHTML = renderMarkdown(partialText) + '<div class="chat-stopped-note">[stopped]</div>';
        const personality = getActivePersonality();
        state.chatHistory.push({ role: 'assistant', content: partialText, personalityName: personality.name, personalityIcon: personality.icon, stopped: true });
        saveChatHistory();
      }
    } else {
      const errEl = document.createElement('div');
      errEl.className = 'chat-msg chat-ai';
      errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(err.message)}</span>`;
      container.appendChild(errEl);
    }
  }

  _chatAbortController = null;
  setSendButtonMode(sendBtn, 'idle');
  updateDiscussButton();
  updateChatHeaderTitle();
  container.scrollTop = container.scrollHeight;
}

export function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

export function askAIAboutMarker(markerId) {
  const marker = state.markerRegistry[markerId];
  if (!marker) return;
  const data = getActiveData();
  const dates = marker.singlePoint ? [marker.singleDateLabel || 'N/A'] : data.dates;
  const valuesText = marker.values
    .map((v, i) => {
      if (v === null) return null;
      let text = `${dates[i]}: ${formatValue(v)} ${marker.unit}`;
      if (marker.phaseLabels && marker.phaseLabels[i]) {
        const pr = marker.phaseRefRanges[i];
        text += ` (${marker.phaseLabels[i]} phase, ref ${formatValue(pr.min)}\u2013${formatValue(pr.max)})`;
      }
      return text;
    })
    .filter(Boolean).join(', ');
  const latestIdx = getLatestValueIndex(marker.values);
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const status = latestIdx !== -1 ? getStatus(marker.values[latestIdx], lr.min, lr.max) : 'no data';
  let prompt = `Tell me about my ${marker.name} results. Values: ${valuesText}. Reference range: ${marker.refMin}\u2013${marker.refMax} ${marker.unit}${marker.optimalMin != null ? `. Optimal range: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}. Current status: ${status}.`;
  if (marker.phaseLabels) prompt += ' Note: reference ranges shown are phase-specific for the menstrual cycle.';
  const nonNull = marker.values.filter(v => v !== null);
  if (nonNull.length >= 2) {
    const prev = nonNull[nonNull.length - 2];
    const last = nonNull[nonNull.length - 1];
    if (prev !== 0) {
      const pctChange = ((last - prev) / prev * 100).toFixed(1);
      const dir = last > prev ? 'up' : last < prev ? 'down' : 'stable';
      prompt += ` Trend: ${dir} ${Math.abs(parseFloat(pctChange))}% from previous.`;
    }
  }
  prompt += ' What does this mean and should I be concerned about anything?';
  window.closeModal();
  openChatPanel(prompt);
}

export function askAIAboutCorrelations() {
  if (state.selectedCorrelationMarkers.length < 2) return;
  const data = getActiveData();
  const parts = state.selectedCorrelationMarkers.map(key => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return null;
    const valuesText = marker.values
      .map((v, i) => v !== null ? `${data.dates[i]}: ${formatValue(v)} ${marker.unit}` : null)
      .filter(Boolean).join(', ');
    const mr = getEffectiveRange(marker);
    const latestIdx = getLatestValueIndex(marker.values);
    const status = latestIdx !== -1 ? getStatus(marker.values[latestIdx], mr.min, mr.max) : 'no data';
    return `- ${marker.name}: ${valuesText} (ref: ${marker.refMin}\u2013${marker.refMax} ${marker.unit}${marker.optimalMin != null ? `, optimal: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}, status: ${status})`;
  }).filter(Boolean);
  const names = state.selectedCorrelationMarkers.map(key => {
    const [catKey, markerKey] = key.split('.');
    return data.categories[catKey]?.markers[markerKey]?.name || key;
  });
  const prompt = `Analyze the correlation between these biomarkers: ${names.join(', ')}.\n\nHere are my values:\n${parts.join('\n')}\n\nHow do these markers relate to each other? Are there any patterns, imbalances, or concerns based on their combined trends?`;
  openChatPanel(prompt);
}

// ═══════════════════════════════════════════════
// DISCUSS (multi-persona debate)
// ═══════════════════════════════════════════════
export function getThreadPersonaCount() {
  const names = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName) names.add(m.personalityName);
  }
  return names.size;
}

export function updateDiscussButton() {
  const btn = document.getElementById('chat-discuss-btn');
  if (!btn) return;
  const hasAssistant = state.chatHistory && state.chatHistory.some(m => m.role === 'assistant');
  if (!hasAssistant) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  const count = getThreadPersonaCount();
  btn.style.opacity = count >= 2 ? '1' : '0.5';
  btn.title = count >= 2
    ? 'Continue the debate'
    : 'Add another persona for a second opinion';
}

function collectDiscussionPersonas() {
  // Walk history backwards to find the 2 most recently active personas
  const seenIds = new Set();
  const personas = [];
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    const m = state.chatHistory[i];
    if (m.role === 'assistant' && m.personalityName) {
      let pid = null;
      const builtIn = CHAT_PERSONALITIES.find(p => p.name === m.personalityName);
      if (builtIn) pid = builtIn.id;
      else {
        const customs = getCustomPersonalities();
        const cp = customs.find(p => p.name === m.personalityName);
        if (cp) pid = cp.id;
      }
      if (pid && !seenIds.has(pid)) {
        seenIds.add(pid);
        personas.unshift({ id: pid, name: m.personalityName, icon: m.personalityIcon });
        if (personas.length === 2) break;
      }
    }
  }
  return personas;
}

const DEFAULT_DISCUSS_PROMPT = 'Respond to the other analyst\'s points above. Where do you agree or disagree? Add any insights they may have missed.';

async function runDiscussionRound(personas, steerPrompt, opts = {}) {
  const container = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!container) return;

  _chatAbortController = new AbortController();
  setSendButtonMode(sendBtn, 'streaming');

  const promptText = steerPrompt || DEFAULT_DISCUSS_PROMPT;

  // Check if any persona has already responded in this thread
  const hasExistingDebate = state.chatHistory.some(m => m.role === 'assistant' && m.personalityName);

  try {
    for (let pi = 0; pi < personas.length; pi++) {
      if (_chatAbortController.signal.aborted) break;
      const persona = personas[pi];

      state.currentChatPersonality = persona.id;

      // First persona in a fresh debate gets an open prompt, not a rebuttal prompt
      const isFirstEver = !hasExistingDebate && pi === 0;
      const msgText = isFirstEver
        ? (steerPrompt || 'Share your analysis and interpretation of these lab results.')
        : promptText;
      const autoMsg = { role: 'user', content: msgText, auto: true, hidden: !!opts.hideAutoMsg };
      state.chatHistory.push(autoMsg);
      renderChatMessages();
      saveChatHistory();

      const typingEl = document.createElement('div');
      typingEl.className = 'typing-indicator';
      typingEl.setAttribute('role', 'status');
      typingEl.setAttribute('aria-live', 'polite');
      typingEl.setAttribute('aria-label', 'AI is responding');
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      container.appendChild(typingEl);
      container.scrollTop = container.scrollHeight;

      let labContext = buildLabContext({ userMessage: msgText });
      let _lensResultForMsg = null;
      if (hasLens()) {
        const lensResult = await queryLensMulti(msgText, { signal: _chatAbortController.signal });
        if (lensResult) {
          labContext = injectLensChunks(labContext, lensResult);
          _lensResultForMsg = lensResult;
        }
      }
      const personality = getActivePersonality();
      let personalityPrompt = '';
      if (personality.id && personality.id.startsWith('custom_')) {
        const cp = getCustomPersonality();
        if (cp.promptText) {
          personalityPrompt = `\n\nPersona: ${cp.promptText}`;
        }
      } else if (personality.promptAddition) {
        personalityPrompt = '\n\n' + personality.promptAddition;
      }
      const otherNames = new Set();
      for (const m of state.chatHistory) {
        if (m.role === 'assistant' && m.personalityName && m.personalityName !== personality.name) {
          otherNames.add(m.personalityName);
        }
      }
      let multiPersonaInstruction = '';
      if (otherNames.size > 0) {
        multiPersonaInstruction = `\n\nThis conversation includes responses from other AI personalities (${[...otherNames].join(', ')}). Messages marked [Response from ...] were written by a different persona — treat them as a separate analyst's opinion, not your own. You may agree or disagree with their analysis, but never claim you wrote their responses.`;
      }
      const _dMsgModelId = getActiveModelId();
      const _dMsgModelDisplay = getActiveModelDisplay();
      const _dMsgProvider = getAIProvider();
      const _dMsgE2EE = _dMsgProvider === 'venice' && isVeniceE2EEActive();

      const e2eeInstruction = _dMsgE2EE ? '\n\n[NO WEB ACCESS — E2EE mode] Do not generate URLs. Suggest disabling E2EE for web-enabled queries.' : '';
      const systemPrompt = CHAT_SYSTEM_PROMPT + e2eeInstruction + '\n\nCurrent lab data:\n' + labContext + personalityPrompt + multiPersonaInstruction;

      const apiMessages = state.chatHistory.filter(m => !m.joined && m.role).slice(-30).map(m => {
        if (m.role === 'assistant' && m.personalityName && m.personalityName !== personality.name) {
          return { role: m.role, content: `[Response from ${m.personalityName}]\n${m.content}` };
        }
        return { role: m.role, content: m.content };
      });

      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      container.appendChild(labelEl);

      const aiMsgEl = document.createElement('div');
      aiMsgEl.className = 'chat-msg chat-ai';
      aiMsgEl.style.whiteSpace = 'pre-wrap';

      const typewriter = createTypewriter(aiMsgEl, typingEl, container);

      const { text: fullText, usage } = await callClaudeAPI({
        system: systemPrompt,
        messages: apiMessages,
        maxTokens: 4096,
        signal: _chatAbortController.signal,
        onStream(text) { typewriter.update(text); },
        webSearch: getChatWebSearchEnabled() && supportsWebSearch()
      });

      typewriter.stop();
      aiMsgEl.style.whiteSpace = '';
      if (typingEl.parentNode) typingEl.remove();
      if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
      aiMsgEl.innerHTML = renderMarkdown(fullText);

      const _dWebSearch = getChatWebSearchEnabled() && supportsWebSearch();
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        const cost = calculateCost(_dMsgProvider, _dMsgModelId, usage.inputTokens, usage.outputTokens);
        const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
        const webTag = _dWebSearch ? ' \u00b7 \ud83c\udf10 web' : '';
        const e2eeTag = _dMsgE2EE ? e2eeLockFootnote(window._veniceAttestation) : '';
        const footnote = document.createElement('div');
        footnote.className = 'chat-cost-footnote';
        footnote.innerHTML = `${escapeHTML(_dMsgModelDisplay)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}`;
        aiMsgEl.appendChild(footnote);
      }

      const assistantMsg = { role: 'assistant', content: fullText, personalityName: personality.name, personalityIcon: personality.icon, modelId: _dMsgModelId, modelDisplay: _dMsgModelDisplay };
      if (_dWebSearch) assistantMsg.webSearch = true;
      if (_dMsgE2EE) { assistantMsg.e2ee = true; assistantMsg.attestation = window._veniceAttestation || null; }
      if (_lensResultForMsg && _lensResultForMsg.chunks?.length) {
        assistantMsg.lensSources = _lensResultForMsg.chunks.slice(0, 10).map(c => ({
          text: typeof c.text === 'string' ? c.text.slice(0, 1500) : '',
          source: c.source || '',
          score: typeof c.score === 'number' ? c.score : null,
        }));
        assistantMsg.lensSourceName = _lensResultForMsg.sourceName || '';
      }
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
        trackUsage(_dMsgProvider, _dMsgModelId, usage.inputTokens, usage.outputTokens);
      }
      state.chatHistory.push(assistantMsg);
      saveChatHistory();
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Partial text handled by DOM already
    } else {
      const errEl = document.createElement('div');
      errEl.className = 'chat-msg chat-ai';
      errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(err.message)}</span>`;
      container.appendChild(errEl);
    }
  }

  _chatAbortController = null;
  setSendButtonMode(sendBtn, 'idle');
}

function showDiscussContinuePrompt(personas, originalPersonality) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  // Remove any existing continue prompt
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
  // Focus the steer input
  const steerInput = prompt.querySelector('.chat-discuss-steer');
  if (steerInput) steerInput.focus();

  // Stash state for continue/done
  state._discussionPersonas = personas;
  state._discussionOriginalPersonality = originalPersonality;

  // Persist discussion state to thread metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread) {
    thread.discussionPersonas = personas;
    thread.discussionOriginalPersonality = originalPersonality;
    saveChatThreadIndex();
  }
}

export function removeDiscussContinuePrompt() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const el = container.querySelector('.chat-discuss-continue');
  if (el) el.remove();
}

function cleanupDiscussionState() {
  removeDiscussContinuePrompt();
  const picker = document.querySelector('.discuss-persona-picker');
  if (picker) picker.remove();
  delete state._discussionPersonas;
  delete state._discussionOriginalPersonality;

  // Clear persisted discussion state from thread metadata
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread && thread.discussionPersonas) {
    delete thread.discussionPersonas;
    delete thread.discussionOriginalPersonality;
    saveChatThreadIndex();
  }
}

export async function continueDiscussion() {
  // Read steer input before removing the prompt
  const steerInput = document.getElementById('chat-discuss-steer');
  const steerText = steerInput ? steerInput.value.trim() : '';
  removeDiscussContinuePrompt();
  const personas = state._discussionPersonas;
  const originalPersonality = state._discussionOriginalPersonality;
  if (!personas || personas.length < 2) return;

  await runDiscussionRound(personas, steerText || null);
  _finishDiscussionRound(personas, originalPersonality);
}

export function endDiscussion() {
  const orig = state._discussionOriginalPersonality;
  cleanupDiscussionState();
  if (orig) {
    state.currentChatPersonality = orig;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  updateDiscussButton();
}

export async function startDiscussion() {
  if (_chatAbortController) return; // already streaming

  if (getThreadPersonaCount() >= 2) {
    // Already have 2+ personas — run another round
    const personas = collectDiscussionPersonas();
    if (personas.length < 2) return;
    return _runDiscussion(personas);
  }

  // Only 1 persona — show picker to add a second
  showDiscussPersonaPicker();
}

function showDiscussPersonaPicker() {
  const allPersonas = [
    ...CHAT_PERSONALITIES.map(p => ({ id: p.id, name: p.name, icon: p.icon })),
    ...getCustomPersonalities().map(p => ({ id: p.id, name: p.name, icon: p.icon || '✏️' }))
  ];
  if (allPersonas.length < 2) return;

  // Remove existing picker
  const existing = document.querySelector('.discuss-persona-picker');
  if (existing) { existing.remove(); return; }

  const container = document.querySelector('.chat-input-area');
  if (!container) return;

  // Find which persona is already active in this thread
  const activePersonaIds = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName) {
      const bp = CHAT_PERSONALITIES.find(p => p.name === m.personalityName);
      if (bp) activePersonaIds.add(bp.id);
      else {
        const cp = getCustomPersonalities().find(p => p.name === m.personalityName);
        if (cp) activePersonaIds.add(cp.id);
      }
    }
  }
  const hasActive = activePersonaIds.size > 0;
  const needsOne = hasActive && activePersonaIds.size < 2;

  const picker = document.createElement('div');
  picker.className = 'discuss-persona-picker';
  picker.innerHTML = `
    <div class="discuss-picker-header">${needsOne ? 'Add another persona to the debate' : 'Pick two personas to debate'}</div>
    <div class="discuss-picker-list">
      ${allPersonas.map(p => {
        const isActive = activePersonaIds.has(p.id);
        const checked = isActive ? ' checked' : '';
        const locked = isActive && needsOne;
        return `<label class="discuss-picker-item${locked ? ' locked' : ''}">
        <input type="checkbox" value="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}" data-icon="${escapeHTML(p.icon)}"${checked}${locked ? ' disabled' : ''} data-locked="${locked ? '1' : ''}">
        <span>${p.icon} ${escapeHTML(p.name)}</span>
      </label>`;
      }).join('')}
    </div>
    <button class="discuss-picker-start"${needsOne ? '' : ' disabled'} onclick="startDiscussionFromPicker()">${needsOne ? 'Add to Discussion' : 'Start Debate'}</button>`;

  function updatePickerState() {
    const lockedCount = picker.querySelectorAll('input[data-locked="1"]').length;
    const checkedCount = picker.querySelectorAll('input:checked:not([data-locked="1"])').length;
    const total = lockedCount + checkedCount;
    const startBtn = picker.querySelector('.discuss-picker-start');
    startBtn.disabled = total !== 2;
    // Limit to 2 total
    if (total >= 2) {
      picker.querySelectorAll('input:not(:checked):not([data-locked="1"])').forEach(cb => cb.disabled = true);
    } else {
      picker.querySelectorAll('input:not([data-locked="1"])').forEach(cb => cb.disabled = false);
    }
  }
  picker.addEventListener('change', updatePickerState);
  updatePickerState();

  container.insertBefore(picker, container.firstChild);
}

export async function startDiscussionFromPicker() {
  const picker = document.querySelector('.discuss-persona-picker');
  if (!picker) return;
  // Collect locked (already in thread) and newly checked personas
  const lockedInputs = picker.querySelectorAll('input[data-locked="1"]');
  const checkedInputs = picker.querySelectorAll('input:checked:not([data-locked="1"])');
  const allSelected = [...lockedInputs, ...checkedInputs];
  if (allSelected.length !== 2) return;

  const lockedIds = new Set(Array.from(lockedInputs).map(cb => cb.value));
  const allPersonas = allSelected.map(cb => ({
    id: cb.value,
    name: cb.dataset.name,
    icon: cb.dataset.icon
  }));
  // Only the NEW persona (not locked) responds — they're joining the conversation
  const newPersonas = allPersonas.filter(p => !lockedIds.has(p.id));
  picker.remove();

  if (newPersonas.length > 0) {
    // Adding a second persona — only they respond (one turn)
    return _runSingleTurn(newPersonas[0], allPersonas);
  }
  // Shouldn't happen, but fallback
  return _runDiscussion(allPersonas);
}

function _finishDiscussionRound(personas, originalPersonality) {
  state.currentChatPersonality = originalPersonality;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, originalPersonality);
  updateDiscussButton();
  updateChatHeaderTitle();
  if (!_chatAbortController) {
    showDiscussContinuePrompt(personas, originalPersonality);
  }
}

async function _runSingleTurn(persona, allPersonas) {
  const originalPersonality = state.currentChatPersonality;
  state.chatHistory.push({ joined: true, joinName: persona.name, joinIcon: persona.icon });
  const joinPrompt = 'You\'ve just joined this conversation. Review the discussion above and weigh in with your perspective.';
  await runDiscussionRound([persona], joinPrompt, { hideAutoMsg: true });
  _finishDiscussionRound(allPersonas, originalPersonality);
}

async function _runDiscussion(personas) {
  const originalPersonality = state.currentChatPersonality;
  await runDiscussionRound(personas);
  _finishDiscussionRound(personas, originalPersonality);
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS (for onclick handlers)
// ═══════════════════════════════════════════════
function _resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  _updateChatInputState();
}

Object.assign(window, {
  _resumeAI,
  toggleChatFullscreen,
  getChatStorageKey,
  getChatThreadsKey,
  getChatThreadKey,
  getActivePersonality,
  getCustomPersonalities,
  saveCustomPersonalities,
  getCustomPersonality,
  getCustomPersonalityText,
  pickPersonaIcon,
  generateCustomPersonality,
  autoResizePersonaTextarea,
  markPersonalityDirty,
  snapshotPersonalityClean,
  setChatPersonality,
  loadChatPersonality,
  updateChatHeaderTitle,
  updateChatHeaderModel,
  refreshWebSearchToggle,
  updatePersonalityBar,
  togglePersonalityBar,
  saveCustomPersonality,
  startNewCustomPersonality,
  deleteCustomPersonality,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  summarizeThread,
  closeSummaryModal,
  updateSummaryButton,
  viewSavedSummary,
  deleteSavedSummary,
  renderSavedSummaries,
  copySummary,
  downloadSummary,
  printSummary,
  renderChatMessages,
  useChatPrompt,
  applyInlineMarkdown,
  renderMarkdown,
  toggleChatPanel,
  openChatPanel,
  closeChatPanel,
  sendChatMessage,
  handleChatKeydown,
  startDiscussion,
  startDiscussionFromPicker,
  continueDiscussion,
  endDiscussion,
  editCustomPersonality,
  removeDiscussContinuePrompt,
  updateDiscussButton,
  getThreadPersonaCount,
  askAIAboutMarker,
  askAIAboutCorrelations,
  // Thread functions live in chat-threads.js; it does its own Object.assign(window, ...)
  // Image attachments live in chat-images.js; same pattern.
  // Action bar
  buildActionBar,
  regenerateLastMessage,
  copyMessage,
  toggleContextDetails,
  getChatWebSearchEnabled,
  setChatWebSearchEnabled,
  setChatNudge,
  updateChatNudge,
  setChatProfileSex,
  saveChatProfile,
  saveChatLocation,
  onboardHeightUnitChanged,
  saveChatPeriod,
  addChatSupplement,
  removeChatSupplement,
  skipProviderSetup,
  skipOnboardingExtras,
  showCycleNoMensesOptions,
  showCyclePeriodEntry,
  saveCycleStatus,
  _updatePeriodBtn,
  onContextCardSaved,
});
