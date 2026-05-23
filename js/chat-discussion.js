// chat-discussion.js — Multi-persona discussion/debate orchestration

import { state } from './state.js';
import { CHAT_PERSONALITIES, CHAT_SYSTEM_PROMPT } from './constants.js';
import { calculateCost, formatCost, trackUsage } from './schema.js';
import { escapeHTML } from './utils.js';
import {
  getAIProvider, getActiveModelId, getActiveModelDisplay, supportsWebSearch,
  isVeniceE2EEActive,
} from './api.js';
import {
  getChatThreadKey, invalidateThreadContentCache, renderThreadList,
  saveChatThreadIndex,
} from './chat-threads.js';
import { encryptedSetItem, getEncryptionEnabled } from './crypto.js';
import { buildLabContext, injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti } from './lens.js';
import { renderMarkdown } from './markdown.js';
import {
  getActivePersonality, getCustomPersonalities, getCustomPersonality,
  updateChatHeaderTitle,
} from './chat-personalities.js';
import { saveChatHistory } from './chat-history.js';
import {
  CHAT_RESPONSE_MAX_TOKENS, callChatAPIWithContinuation,
  isAIResponseTruncated, responseLimitNote,
} from './chat-continuation.js';
import {
  attachLensSources, buildChatSystemPrompt, buildMultiPersonaInstruction,
  buildPersonalityPrompt, buildTaggedChatMessages, buildWebSearchHint,
} from './chat-prompt-context.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import { getChatWebSearchEnabled } from './chat-panel.js';
import {
  collectDiscussionPersonas, getCurrentDiscussionState, getCurrentThread,
  getThreadPersonaCount,
} from './chat-discussion-state.js';

export { getCurrentDiscussionState, getThreadPersonaCount } from './chat-discussion-state.js';

const discussionCallbacks = {
  createTypewriter: null,
  getChatAbortController: () => null,
  renderChatMessages: () => {},
  setChatAbortController: () => {},
  setSendButtonMode: () => {},
};

export function configureChatDiscussion(callbacks = {}) {
  Object.assign(discussionCallbacks, callbacks);
}

function getChatAbortController() {
  return discussionCallbacks.getChatAbortController?.() || null;
}

function setChatAbortController(controller) {
  discussionCallbacks.setChatAbortController?.(controller);
}

function renderChatMessages() {
  discussionCallbacks.renderChatMessages?.();
}

function setSendButtonMode(btn, mode) {
  discussionCallbacks.setSendButtonMode?.(btn, mode);
}

function createTypewriter(el, typingEl, container) {
  if (!discussionCallbacks.createTypewriter) {
    return {
      update() {},
      stop() {},
    };
  }
  return discussionCallbacks.createTypewriter(el, typingEl, container);
}

function isRoundThreadActive(threadId) {
  return !threadId || state.currentThreadId === threadId;
}

function getThreadById(threadId) {
  return state.chatThreads.find(t => t.id === threadId) || null;
}

function persistDiscussionThreadState(threadId, personas, originalPersonality) {
  const thread = getThreadById(threadId);
  if (!thread) return;
  thread.discussionPersonas = personas;
  thread.discussionOriginalPersonality = originalPersonality;
  delete thread.discussionEnded;
  saveChatThreadIndex();
}

function renderRoundMessages(threadId, messages) {
  if (!isRoundThreadActive(threadId)) return;
  state.chatHistory = messages;
  renderChatMessages();
}

async function saveRoundChatHistory(threadId, messages) {
  if (!threadId) return;
  if (isRoundThreadActive(threadId)) {
    state.chatHistory = messages;
    await saveChatHistory();
    return;
  }

  invalidateThreadContentCache();
  const value = JSON.stringify(messages);
  const key = getChatThreadKey(threadId);
  if (getEncryptionEnabled()) {
    await encryptedSetItem(key, value);
  } else {
    localStorage.setItem(key, value);
  }

  const thread = getThreadById(threadId);
  if (thread) {
    if (thread.messageCount !== messages.length) thread.updatedAt = new Date().toISOString();
    thread.messageCount = messages.length;
    saveChatThreadIndex();
    renderThreadList();
  }
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

export function restoreDiscussionContinuePrompt() {
  const discussionState = getCurrentDiscussionState();
  if (!discussionState) return;
  showDiscussContinuePrompt(discussionState.personas, discussionState.originalPersonality);
}

const DEFAULT_DISCUSS_PROMPT = 'Respond to the other analyst\'s points above. Where do you agree or disagree? Add any insights they may have missed.';

async function runDiscussionRound(personas, steerPrompt, opts = {}) {
  const container = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!container) return;
  const roundThreadId = opts.threadId || state.currentThreadId;
  const roundHistory = state.chatHistory;

  const controller = new AbortController();
  setChatAbortController(controller);
  setSendButtonMode(sendBtn, 'streaming');

  const promptText = steerPrompt || DEFAULT_DISCUSS_PROMPT;

  // Check if any persona has already responded in this thread
  const hasExistingDebate = roundHistory.some(m => m.role === 'assistant' && m.personalityName);

  try {
    for (let pi = 0; pi < personas.length; pi++) {
      if (controller.signal.aborted) break;
      const persona = personas[pi];

      state.currentChatPersonality = persona.id;

      // First persona in a fresh debate gets an open prompt, not a rebuttal prompt
      const isFirstEver = !hasExistingDebate && pi === 0;
      const msgText = isFirstEver
        ? (steerPrompt || 'Share your analysis and interpretation of these lab results.')
        : promptText;
      if (!opts.suppressAutoMsg) {
        const autoMsg = { role: 'user', content: msgText, auto: true, hidden: !!opts.hideAutoMsg };
        roundHistory.push(autoMsg);
        renderRoundMessages(roundThreadId, roundHistory);
        await saveRoundChatHistory(roundThreadId, roundHistory);
      }

      const typingEl = document.createElement('div');
      typingEl.className = 'typing-indicator';
      typingEl.setAttribute('role', 'status');
      typingEl.setAttribute('aria-live', 'polite');
      typingEl.setAttribute('aria-label', 'AI is responding');
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      if (isRoundThreadActive(roundThreadId)) {
        container.appendChild(typingEl);
        container.scrollTop = container.scrollHeight;
      }

      let labContext = buildLabContext({ userMessage: msgText });
      let _lensResultForMsg = null;
      if (hasLens()) {
        const lensResult = await queryLensMulti(msgText, { signal: controller.signal });
        if (lensResult) {
          labContext = injectLensChunks(labContext, lensResult);
          _lensResultForMsg = lensResult;
        }
      }
      const personality = getActivePersonality();
      const personalityPrompt = buildPersonalityPrompt(personality, getCustomPersonality());
      const multiPersonaInstruction = buildMultiPersonaInstruction(roundHistory, personality.name);
      const _dMsgProvider = getAIProvider();
      const _dMsgModelId = getActiveModelId(_dMsgProvider);
      const _dMsgModelDisplay = getActiveModelDisplay(_dMsgProvider);
      const _dMsgE2EE = _dMsgProvider === 'venice' && isVeniceE2EEActive();
      const _dWebSearchSupported = supportsWebSearch(_dMsgProvider);
      const _dWebSearch = getChatWebSearchEnabled() && _dWebSearchSupported;

      const webHint = buildWebSearchHint({
        isE2EE: _dMsgE2EE,
        webSearchEnabled: _dWebSearch,
        webSearchSupported: _dWebSearchSupported,
        includeActiveSearchHints: false,
      });
      const systemPrompt = buildChatSystemPrompt({
        basePrompt: CHAT_SYSTEM_PROMPT,
        labContext,
        personalityPrompt,
        multiPersonaInstruction,
        webHint,
      });

      const apiMessages = buildTaggedChatMessages(roundHistory, personality.name);

      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      if (isRoundThreadActive(roundThreadId)) container.appendChild(labelEl);

      const aiMsgEl = document.createElement('div');
      aiMsgEl.className = 'chat-msg chat-ai';
      aiMsgEl.style.whiteSpace = 'pre-wrap';

      const typewriter = createTypewriter(aiMsgEl, typingEl, container);

      const aiResult = await callChatAPIWithContinuation({
        system: systemPrompt,
        messages: apiMessages,
        maxTokens: CHAT_RESPONSE_MAX_TOKENS,
        signal: controller.signal,
        onStream(text) {
          if (isRoundThreadActive(roundThreadId)) typewriter.update(text);
        },
        webSearch: _dWebSearch,
        provider: _dMsgProvider
      });
      const { text: fullText, usage } = aiResult;
      const responseTruncated = isAIResponseTruncated(aiResult);

      typewriter.stop();
      if (isRoundThreadActive(roundThreadId)) {
        aiMsgEl.style.whiteSpace = '';
        if (typingEl.parentNode) typingEl.remove();
        if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
        aiMsgEl.innerHTML = renderMarkdown(fullText);
        if (responseTruncated) aiMsgEl.insertAdjacentHTML('beforeend', responseLimitNote());
      }

      if (isRoundThreadActive(roundThreadId) && usage && (usage.inputTokens || usage.outputTokens)) {
        const cost = calculateCost(_dMsgProvider, _dMsgModelId, usage.inputTokens, usage.outputTokens);
        const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
        const webTag = _dWebSearch ? ' \u00b7 \ud83c\udf10 web' : '';
        const e2eeTag = _dMsgE2EE ? e2eeLockFootnote(window._veniceAttestation) : '';
        const footnote = document.createElement('div');
        footnote.className = 'chat-cost-footnote';
        footnote.innerHTML = `${escapeHTML(_dMsgModelDisplay)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}`;
        aiMsgEl.appendChild(footnote);
      }

      const assistantMsg = { role: 'assistant', content: fullText, personalityName: personality.name, personalityIcon: personality.icon, provider: _dMsgProvider, modelId: _dMsgModelId, modelDisplay: _dMsgModelDisplay };
      if (responseTruncated) {
        assistantMsg.truncated = true;
        assistantMsg.finishReason = aiResult.finishReason || 'length';
      }
      if (_dWebSearch) assistantMsg.webSearch = true;
      if (_dMsgE2EE) { assistantMsg.e2ee = true; assistantMsg.attestation = window._veniceAttestation || null; }
      attachLensSources(assistantMsg, _lensResultForMsg);
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
        trackUsage(_dMsgProvider, _dMsgModelId, usage.inputTokens, usage.outputTokens);
      }
      roundHistory.push(assistantMsg);
      await saveRoundChatHistory(roundThreadId, roundHistory);
      if (isRoundThreadActive(roundThreadId)) container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Partial text handled by DOM already
    } else if (isRoundThreadActive(roundThreadId) && !err?._modalShown) {
      // Skip when a modal already surfaced the condition (e.g., 402).
      const errEl = document.createElement('div');
      errEl.className = 'chat-msg chat-ai';
      errEl.innerHTML = `<span style="color:var(--red)">Error: ${escapeHTML(err.message)}</span>`;
      container.appendChild(errEl);
    }
  }

  setChatAbortController(null);
  setSendButtonMode(sendBtn, 'idle');
}

export async function sendDiscussionUserTurn(text, discussionState = getCurrentDiscussionState()) {
  if (!discussionState) return;
  if (getChatAbortController()) return;
  const threadId = state.currentThreadId;
  removeDiscussContinuePrompt();
  persistDiscussionThreadState(threadId, discussionState.personas, discussionState.originalPersonality);
  await runDiscussionRound(discussionState.personas, text, { suppressAutoMsg: true, threadId });
  _finishDiscussionRound(discussionState.personas, discussionState.originalPersonality, threadId);
}

export function showDiscussContinuePrompt(personas, originalPersonality) {
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
  const thread = getCurrentThread();
  if (thread) {
    thread.discussionPersonas = personas;
    thread.discussionOriginalPersonality = originalPersonality;
    delete thread.discussionEnded;
    saveChatThreadIndex();
  }
}

export function removeDiscussContinuePrompt() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const el = container.querySelector('.chat-discuss-continue');
  if (el) el.remove();
}

export function cleanupDiscussionState({ clearThread = false, markEnded = false } = {}) {
  removeDiscussContinuePrompt();
  const picker = document.querySelector('.discuss-persona-picker');
  if (picker) picker.remove();
  delete state._discussionPersonas;
  delete state._discussionOriginalPersonality;

  // Only clear persisted discussion state when the user explicitly ends it.
  // Thread switches and new-thread creation should remove transient UI state
  // without erasing the old thread's Continue prompt metadata.
  const thread = getCurrentThread();
  if (thread && (clearThread || markEnded)) {
    delete thread.discussionPersonas;
    delete thread.discussionOriginalPersonality;
    if (markEnded) thread.discussionEnded = true;
    else delete thread.discussionEnded;
    saveChatThreadIndex();
  }
}

export async function continueDiscussion() {
  if (getChatAbortController()) return;
  // Read steer input before removing the prompt
  const steerInput = document.getElementById('chat-discuss-steer');
  const steerText = steerInput ? steerInput.value.trim() : '';
  const threadId = state.currentThreadId;
  removeDiscussContinuePrompt();
  const personas = state._discussionPersonas;
  const originalPersonality = state._discussionOriginalPersonality;
  if (!personas || personas.length < 2) return;

  persistDiscussionThreadState(threadId, personas, originalPersonality);
  await runDiscussionRound(personas, steerText || null, { threadId });
  _finishDiscussionRound(personas, originalPersonality, threadId);
}

export function endDiscussion() {
  const orig = state._discussionOriginalPersonality;
  cleanupDiscussionState({ clearThread: true, markEnded: true });
  if (orig) {
    state.currentChatPersonality = orig;
    localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, orig);
  }
  updateDiscussButton();
}

export async function startDiscussion() {
  if (getChatAbortController()) return; // already streaming

  if (getThreadPersonaCount() >= 2) {
    // Already have 2+ personas — run another round
    const personas = collectDiscussionPersonas();
    if (personas.length < 2) return;
    const thread = getCurrentThread();
    if (thread?.discussionEnded) {
      delete thread.discussionEnded;
      saveChatThreadIndex();
    }
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

function _finishDiscussionRound(personas, originalPersonality, threadId = state.currentThreadId) {
  persistDiscussionThreadState(threadId, personas, originalPersonality);
  if (!isRoundThreadActive(threadId)) return;
  state.currentChatPersonality = originalPersonality;
  localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, originalPersonality);
  updateDiscussButton();
  updateChatHeaderTitle();
  if (!getChatAbortController()) {
    showDiscussContinuePrompt(personas, originalPersonality);
  }
}

async function _runSingleTurn(persona, allPersonas) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  persistDiscussionThreadState(threadId, allPersonas, originalPersonality);
  state.chatHistory.push({ joined: true, joinName: persona.name, joinIcon: persona.icon });
  const joinPrompt = 'You\'ve just joined this conversation. Review the discussion above and weigh in with your perspective.';
  await runDiscussionRound([persona], joinPrompt, { hideAutoMsg: true, threadId });
  _finishDiscussionRound(allPersonas, originalPersonality, threadId);
}

async function _runDiscussion(personas) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  persistDiscussionThreadState(threadId, personas, originalPersonality);
  await runDiscussionRound(personas, null, { threadId });
  _finishDiscussionRound(personas, originalPersonality, threadId);
}
