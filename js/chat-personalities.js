// chat-personalities.js - chat personality selection, custom personas, and header status

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { escapeHTML, showNotification, showConfirmDialog } from './utils.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, getActiveModelDisplay, isVeniceE2EEActive } from './api.js';
import { saveChatThreadIndex, renderThreadList } from './chat-threads.js';
import { CHAT_ICON_EDIT, CHAT_ICON_X } from './chat-icons.js';
import { e2eeLockHTML } from './chat-attestation.js';

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
    // Single object with promptText -> wrap as array
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

// Compat shim - returns the custom personality matching current selection, or first, or blank
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
  }
  return CHAT_PERSONALITIES.find(p => p.id === state.currentChatPersonality) || CHAT_PERSONALITIES[0];
}

export function getCustomPersonalityText() {
  return getCustomPersonality().promptText;
}

export async function setChatPersonality(id, opts = {}) {
  const prev = state.currentChatPersonality;
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
    saveChatThreadIndex();
  }
  if (state.chatHistory.length === 0) {
    window.renderChatMessages?.();
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
  if (saved.startsWith('custom_') && getCustomPersonalities().some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
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
  const el = document.querySelector('.chat-header-title');
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
  document.querySelectorAll('.chat-personality-opt[data-personality="default"], .chat-personality-opt[data-personality="house"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.personality === state.currentChatPersonality);
  });
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
      <button class="chat-personality-edit" onclick="event.stopPropagation(); editCustomPersonality('${escapeHTML(cp.id)}')" title="Edit personality" aria-label="Edit personality">${CHAT_ICON_EDIT}</button>
      <button class="chat-personality-delete" onclick="event.stopPropagation(); deleteCustomPersonality('${escapeHTML(cp.id)}')" title="Delete personality" aria-label="Delete personality">${CHAT_ICON_X}</button>
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

let _editingPersonalityId = null;
let _generatedPersonaIcon = null;
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
    id = _editingPersonalityId;
    const idx = customs.findIndex(p => p.id === id);
    if (idx >= 0) customs[idx] = { ...customs[idx], name, icon, promptText };
  } else {
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
  if (state.currentChatPersonality !== id) {
    setChatPersonality(id, { keepPickerOpen: true });
  }
  updatePersonalityBar();
}

export async function deleteCustomPersonality(id) {
  const customs = getCustomPersonalities();
  const cp = customs.find(p => p.id === id);
  const name = cp ? cp.name : 'personality';
  if (await showConfirmDialog(`Delete "${name}"? This cannot be undone.`)) {
    const updated = customs.filter(p => p.id !== id);
    saveCustomPersonalities(updated);
    if (state.currentChatPersonality === id) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      _editingPersonalityId = null;
    }
    updatePersonalityBar();
    updateChatHeaderTitle();
    window.renderChatMessages?.();
  }
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
    textarea.placeholder = 'Describe how you want the AI to communicate, or type a name above and click Generate...';
  } catch (err) {
    textarea.placeholder = 'Describe how you want the AI to communicate, or type a name above and click Generate...';
    showNotification(`Generation failed: ${err.message}`, 'error');
  }
  if (genBtn) { genBtn.disabled = false; genBtn.textContent = 'Generate'; }
}
