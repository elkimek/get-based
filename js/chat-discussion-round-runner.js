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
  createDiscussionPersonaLabel, createDiscussionTypingIndicator, renderDiscussionRoundError,
  renderFinalDiscussionMessage,
} from './chat-discussion-round-view.js';

export async function runDiscussionRound(personas, steerPrompt, opts = {}) {
  const container = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!container) return;
  const roundThreadId = opts.threadId || state.currentThreadId;
  const roundHistory = state.chatHistory;

  const controller = new AbortController();
  setChatAbortController(controller);
  setSendButtonMode(sendBtn, 'streaming');

  const hasExistingDebate = hasExistingDiscussionResponses(roundHistory);

  try {
    for (let pi = 0; pi < personas.length; pi++) {
      if (controller.signal.aborted) break;
      const persona = personas[pi];

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

      const typewriter = createDiscussionTypewriter(aiMsgEl, typingEl, container);

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
      // Partial text handled by DOM already.
    } else if (!err?._modalShown) {
      // Skip when a modal already surfaced the condition (e.g., 402).
      renderDiscussionRoundError({ threadId: roundThreadId, container, error: err });
    }
  }

  setChatAbortController(null);
  setSendButtonMode(sendBtn, 'idle');
}
