// @ts-check
// chat-discussion-round-runner.js - per-persona discussion round execution

import { state } from './state.js';
import {
  CHAT_RESPONSE_MAX_TOKENS, callChatAPIWithContinuation,
  isAIResponseTruncated,
} from './chat-continuation.js';
import {
  createDiscussionTypewriter, renderChatMessages,
  setChatAbortController, setSendButtonMode,
} from './chat-discussion-callbacks.js';
import {
  buildDiscussionAutoMessage, getDiscussionPromptText,
  hasExistingDiscussionResponses,
} from './chat-discussion-round-prompts.js';
import {
  buildDiscussionAssistantMessage, buildDiscussionRoundRequest, trackDiscussionUsage,
} from './chat-discussion-round-request.js';
import {
  isRoundThreadActive, renderRoundMessages, saveRoundChatHistory,
} from './chat-discussion-round-state.js';
import {
  appendDiscussionUsageFootnote, appendRoundPersonaLabel, createDiscussionAiMessage,
  createDiscussionPersonaLabel, createDiscussionTypingIndicator,
  renderFinalDiscussionMessage,
} from './chat-discussion-round-view.js';
import { getChatProviderAttestation } from './chat-runtime.js';
import { notifyChatContentAdded } from './chat-scroll.js';
import { updateDiscussionProgress } from './chat-discussion-ui.js';
import { setChatStreamStatus } from './chat-stream-status.js';
import { stopChatThinkingStatus } from './chat-thinking-status.js';

export async function runDiscussionRound(personas, steerPrompt, opts = {}) {
  const container = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!container) return { completedCount: 0, outcome: 'unavailable', remainingPersonas: personas };
  const roundThreadId = opts.threadId || state.currentThreadId;
  const roundHistory = state.chatHistory;

  const controller = new AbortController();
  setChatAbortController(controller);
  setSendButtonMode(sendBtn, 'streaming');

  const hasExistingDebate = hasExistingDiscussionResponses(roundHistory);
  /** @type {{ aiMsgEl: HTMLElement | null, index: number, persona: any, request: any, typewriter: any, typingEl: HTMLElement } | null} */
  let activeRound = null;
  let completedCount = 0;
  let remainingPersonas = [];
  let outcome = 'complete';

  try {
    for (let pi = 0; pi < personas.length; pi++) {
      if (controller.signal.aborted) {
        outcome = 'stopped';
        remainingPersonas = personas.slice(pi);
        break;
      }
      const persona = personas[pi];
      updateDiscussionProgress(persona, pi, personas.length);
      setChatStreamStatus(`${persona.name || 'Participant'} is responding, ${pi + 1} of ${personas.length}.`, { busy: true });

      state.currentChatPersonality = persona.id;

      const msgText = getDiscussionPromptText({
        hasExistingDebate,
        personaIndex: pi,
        steerPrompt,
      });
      if (!opts.suppressAutoMsg) {
        const autoMsg = buildDiscussionAutoMessage(msgText, { hideAutoMsg: opts.hideAutoMsg });
        roundHistory.push(autoMsg);
        renderRoundMessages(roundThreadId, roundHistory, renderChatMessages);
        await saveRoundChatHistory(roundThreadId, roundHistory);
      }

      const typingEl = createDiscussionTypingIndicator(persona);
      activeRound = { aiMsgEl: null, index: pi, persona, request: null, typewriter: null, typingEl };
      if (isRoundThreadActive(roundThreadId)) {
        container.appendChild(typingEl);
        notifyChatContentAdded(container);
      }

      const request = await buildDiscussionRoundRequest({
        msgText,
        roundHistory,
        signal: controller.signal,
      });
      activeRound.request = request;

      const labelEl = createDiscussionPersonaLabel(request.personality);
      appendRoundPersonaLabel(roundThreadId, container, labelEl);

      const aiMsgEl = createDiscussionAiMessage(request.personality);

      const typewriter = createDiscussionTypewriter(aiMsgEl, typingEl, container);
      activeRound.aiMsgEl = aiMsgEl;
      activeRound.typewriter = typewriter;

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
        reasoningEffort: request.reasoningEffort,
      });
      const fullText = aiResult.text;
      const usage = /** @type {{ inputTokens?: number, outputTokens?: number } | undefined} */ (aiResult.usage);
      const responseTruncated = isAIResponseTruncated(aiResult);
      const attestation = getChatProviderAttestation(request.provider);

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
        attestation,
      });

      const assistantMsg = buildDiscussionAssistantMessage({
        fullText,
        request,
        aiResult,
        responseTruncated,
        attestation,
      });
      if (usage && (usage.inputTokens || usage.outputTokens)) {
        assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
        trackDiscussionUsage(request, usage);
      }
      roundHistory.push(assistantMsg);
      await saveRoundChatHistory(roundThreadId, roundHistory);
      renderRoundMessages(roundThreadId, roundHistory, renderChatMessages);
      completedCount = pi + 1;
      activeRound = null;
      if (isRoundThreadActive(roundThreadId)) notifyChatContentAdded(container);
    }
  } catch (err) {
    const error = /** @type {any} */ (err);
    const interruptedRound = activeRound;
    interruptedRound?.typewriter?.stop?.();
    if (interruptedRound?.typingEl) stopChatThinkingStatus(interruptedRound.typingEl);
    interruptedRound?.typingEl?.remove?.();
    if (error.name === 'AbortError') {
      outcome = 'stopped';
      const partialText = interruptedRound?.aiMsgEl?.textContent?.trim() || '';
      if (partialText && interruptedRound?.request) {
        const assistantMsg = buildDiscussionAssistantMessage({
          fullText: partialText,
          request: interruptedRound.request,
          aiResult: {},
          responseTruncated: false,
          attestation: getChatProviderAttestation(interruptedRound.request.provider),
        });
        assistantMsg.stopped = true;
        roundHistory.push(assistantMsg);
        completedCount = interruptedRound.index + 1;
        await saveRoundChatHistory(roundThreadId, roundHistory);
        renderRoundMessages(roundThreadId, roundHistory, renderChatMessages);
      }
      const interruptedIndex = interruptedRound?.index ?? 0;
      remainingPersonas = personas.slice(partialText ? interruptedIndex + 1 : interruptedIndex);
    } else {
      outcome = 'error';
      const persona = interruptedRound?.persona || personas[completedCount];
      remainingPersonas = personas.slice(interruptedRound?.index ?? completedCount);
      if (!error?._modalShown) {
        roundHistory.push({
          role: 'assistant',
          content: `Couldn't get ${persona?.name || 'this participant'}'s response. You can retry the remaining round or continue the discussion.`,
          error: true,
          discussion: true,
          discussionError: true,
          discussionPersonaId: persona?.id,
          personalityName: persona?.name,
          personalityIcon: persona?.icon,
        });
        await saveRoundChatHistory(roundThreadId, roundHistory);
        renderRoundMessages(roundThreadId, roundHistory, renderChatMessages);
      }
    }
  }

  updateDiscussionProgress(null, 0, 0);
  setChatAbortController(null);
  setChatStreamStatus(
    outcome === 'complete' ? 'Discussion round complete.'
      : outcome === 'stopped' ? 'Discussion round paused.'
        : 'Discussion response failed. Retry is available.',
    { busy: false },
  );
  setSendButtonMode(sendBtn, 'idle');
  return { completedCount, outcome, remainingPersonas };
}
