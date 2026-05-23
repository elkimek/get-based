// chat-discussion.js — Multi-persona discussion/debate orchestration

import { state } from './state.js';
import { saveChatThreadIndex } from './chat-threads.js';
import {
  updateChatHeaderTitle,
} from './chat-personalities.js';
import {
  CHAT_RESPONSE_MAX_TOKENS, callChatAPIWithContinuation,
  isAIResponseTruncated,
} from './chat-continuation.js';
import {
  collectDiscussionPersonas, getCurrentDiscussionState, getCurrentThread,
  getThreadPersonaCount,
} from './chat-discussion-state.js';
import {
  removeDiscussContinuePrompt, removeDiscussPersonaPicker,
  showDiscussContinuePrompt as showDiscussContinuePromptUI,
  showDiscussPersonaPicker,
} from './chat-discussion-ui.js';
import {
  isRoundThreadActive, persistDiscussionThreadState, renderRoundMessages,
  saveRoundChatHistory,
} from './chat-discussion-round-state.js';
import {
  buildDiscussionAssistantMessage, buildDiscussionRoundRequest, trackDiscussionUsage,
} from './chat-discussion-round-request.js';
import {
  appendDiscussionUsageFootnote, appendRoundPersonaLabel, createDiscussionAiMessage,
  createDiscussionPersonaLabel, createDiscussionTypingIndicator, renderDiscussionRoundError,
  renderFinalDiscussionMessage,
} from './chat-discussion-round-view.js';

export { getCurrentDiscussionState, getThreadPersonaCount } from './chat-discussion-state.js';
export { removeDiscussContinuePrompt } from './chat-discussion-ui.js';

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
        renderRoundMessages(roundThreadId, roundHistory, renderChatMessages);
        await saveRoundChatHistory(roundThreadId, roundHistory);
      }

      const typingEl = createDiscussionTypingIndicator();
      if (isRoundThreadActive(roundThreadId)) {
        container.appendChild(typingEl);
        container.scrollTop = container.scrollHeight;
      }

      const request = await buildDiscussionRoundRequest({
        msgText,
        roundHistory,
        signal: controller.signal,
      });

      const labelEl = createDiscussionPersonaLabel(request.personality);
      appendRoundPersonaLabel(roundThreadId, container, labelEl);

      const aiMsgEl = createDiscussionAiMessage();

      const typewriter = createTypewriter(aiMsgEl, typingEl, container);

      const aiResult = await callChatAPIWithContinuation({
        system: request.systemPrompt,
        messages: request.apiMessages,
        maxTokens: CHAT_RESPONSE_MAX_TOKENS,
        signal: controller.signal,
        onStream(text) {
          if (isRoundThreadActive(roundThreadId)) {
            appendRoundPersonaLabel(roundThreadId, container, labelEl);
            typewriter.update(text);
          }
        },
        webSearch: request.webSearch,
        provider: request.provider,
      });
      const { text: fullText, usage } = aiResult;
      const responseTruncated = isAIResponseTruncated(aiResult);

      typewriter.stop();
      renderFinalDiscussionMessage({
        threadId: roundThreadId,
        container,
        labelEl,
        aiMsgEl,
        typingEl,
        fullText,
        responseTruncated,
      });

      appendDiscussionUsageFootnote({
        threadId: roundThreadId,
        aiMsgEl,
        provider: request.provider,
        modelId: request.modelId,
        modelDisplay: request.modelDisplay,
        usage,
        webSearch: request.webSearch,
        e2ee: request.e2ee,
        attestation: window._veniceAttestation,
      });

      const assistantMsg = buildDiscussionAssistantMessage({
        fullText,
        request,
        aiResult,
        responseTruncated,
        attestation: window._veniceAttestation,
      });
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
        trackDiscussionUsage(request, usage);
      }
      roundHistory.push(assistantMsg);
      await saveRoundChatHistory(roundThreadId, roundHistory);
      if (isRoundThreadActive(roundThreadId)) container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Partial text handled by DOM already
    } else if (!err?._modalShown) {
      // Skip when a modal already surfaced the condition (e.g., 402).
      renderDiscussionRoundError({ threadId: roundThreadId, container, error: err });
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
  showDiscussContinuePromptUI(personas, originalPersonality, {
    onPersist() {
      const thread = getCurrentThread();
      if (thread) persistDiscussionThreadState(thread.id, personas, originalPersonality);
    },
  });
}

export function cleanupDiscussionState({ clearThread = false, markEnded = false } = {}) {
  removeDiscussContinuePrompt();
  removeDiscussPersonaPicker();
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

  showDiscussPersonaPicker();
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
