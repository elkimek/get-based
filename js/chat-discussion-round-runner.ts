// Sequential discussion requests use one origin lifetime and the shared authored message view.
import { state } from './state.js';
import { isAIResponseTruncated } from './chat-continuation.js';
import { createDiscussionTypewriter, getChatAbortController, renderChatMessages, setChatAbortController, setSendButtonMode } from './chat-discussion-callbacks.js';
import { buildDiscussionAutoMessage, getDiscussionPromptText, hasExistingDiscussionResponses } from './chat-discussion-round-prompts.js';
import { buildDiscussionAssistantMessage, buildDiscussionRoundRequest, callDiscussionRoundAssistant, trackDiscussionUsage } from './chat-discussion-round-request.js';
import { renderRoundMessages, saveRoundChatHistory } from './chat-discussion-round-state.js';
import { captureDiscussionOrigin, type DiscussionOrigin } from './chat-discussion-origin.js';
import { createDiscussionTypingIndicator } from './chat-discussion-round-view.js';
import { createChatLiveMessage, completeChatLiveMessage, type ChatLiveMessageHandle } from './chat-live-message-component.js';
import { getChatProviderAttestation } from './chat-runtime.js';
import { notifyChatContentAdded } from './chat-scroll.js';
import { updateDiscussionProgress } from './chat-discussion-ui.js';
import { setChatStreamStatus } from './chat-stream-status.js';
import { stopChatThinkingStatus } from './chat-thinking-status.js';
import type { DiscussionRoundRequest } from './chat-discussion-round-request.js';
import type { DiscussionTypewriter } from './chat-discussion-callbacks.js';

type ChatMessage = (typeof state.chatHistory)[number];
export interface DiscussionRoundPersona { id?: unknown; name?: unknown; icon?: unknown }
export interface DiscussionRoundOptions { threadId?: unknown; suppressAutoMsg?: unknown; hideAutoMsg?: unknown; origin?: DiscussionOrigin }
export interface DiscussionRoundResult { completedCount: number; outcome: 'unavailable' | 'complete' | 'stopped' | 'error'; remainingPersonas: unknown }
interface RoundPersonaOperations { length: number; [index: number]: DiscussionRoundPersona; slice(start: number): unknown }
interface ActiveDiscussionRound {
  index: number;
  persona: DiscussionRoundPersona;
  request: DiscussionRoundRequest | null;
  typewriter: DiscussionTypewriter | null;
  typingEl: HTMLElement;
  live: ChatLiveMessageHandle | null;
}

export async function runDiscussionRound(personas: unknown, steerPrompt: unknown, opts: DiscussionRoundOptions = {}): Promise<DiscussionRoundResult> {
  const container = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send-btn');
  if (!container) return { completedCount: 0, outcome: 'unavailable', remainingPersonas: personas };
  const roundThreadId = opts.threadId || state.currentThreadId;
  const origin = opts.origin || captureDiscussionOrigin(roundThreadId);
  const roundHistory = origin.history;
  if (!origin.isValid()) return { completedCount: 0, outcome: 'stopped', remainingPersonas: personas };
  const controller = new AbortController();
  setChatAbortController(controller);
  const ownsController = () => getChatAbortController() === controller;
  const ownsView = () => origin.isActive() && ownsController();
  if (ownsView()) setSendButtonMode(sendBtn, 'streaming');
  const participants = personas as RoundPersonaOperations;
  const hasExistingDebate = hasExistingDiscussionResponses(roundHistory);
  let activeRound: ActiveDiscussionRound | null = null;
  let completedCount = 0;
  let remainingPersonas: unknown = [];
  let outcome: DiscussionRoundResult['outcome'] = 'complete';
  const assertOrigin = () => {
    if (!origin.isValid() || (!ownsController() && !controller.signal.aborted)) {
      origin.retire();
      controller.abort();
    }
    controller.signal.throwIfAborted();
  };
  const release = origin.watch(() => {
    if (!origin.isValid() || (!ownsController() && !controller.signal.aborted)) {
      origin.retire();
      controller.abort();
      if (ownsController()) {
        setChatAbortController(null);
        setSendButtonMode(document.getElementById('chat-send-btn'), 'idle');
        setChatStreamStatus('', { busy: false });
      }
    }
    if (!ownsView()) {
      activeRound?.typewriter?.stop();
      activeRound?.typingEl.remove();
      activeRound?.live?.detach();
    } else if (activeRound) {
      activeRound.live?.restore(container);
      if (!activeRound.live?.element.textContent && !activeRound.typingEl.isConnected) container.appendChild(activeRound.typingEl);
    }
  });
  const save = () => saveRoundChatHistory(roundThreadId, roundHistory, origin);
  const render = () => renderRoundMessages(roundThreadId, roundHistory, renderChatMessages, origin);

  try {
    for (let index = 0; index < participants.length; index++) {
      assertOrigin();
      const persona = participants[index]!;
      if (ownsView()) {
        updateDiscussionProgress(persona, index, participants.length);
        setChatStreamStatus(`${persona.name || 'Participant'} is responding, ${index + 1} of ${participants.length}.`, { busy: true });
      }
      const msgText = getDiscussionPromptText({ hasExistingDebate, personaIndex: index, steerPrompt });
      if (!opts.suppressAutoMsg) {
        roundHistory.push(buildDiscussionAutoMessage(msgText, { hideAutoMsg: opts.hideAutoMsg }) as ChatMessage);
        render();
        if (!await save()) throw new Error('The discussion prompt could not be saved.');
        assertOrigin();
      }
      const typingEl = createDiscussionTypingIndicator(persona);
      activeRound = { index, persona, request: null, typewriter: null, typingEl, live: null };
      if (ownsView()) { container.appendChild(typingEl); notifyChatContentAdded(container); }
      const request = await buildDiscussionRoundRequest({
        msgText, roundHistory, signal: controller.signal,
        personalityId: typeof persona.id === 'string' ? persona.id : '',
      });
      assertOrigin();
      activeRound.request = request;
      const live = createChatLiveMessage(container, {
        personalityName: request.personality.name,
        personalityIcon: request.personality.icon,
        agentId: request.agentId,
      }, () => origin.isValid() && ownsController(), `${request.personality.icon || ''} ${request.personality.name}`);
      if (!ownsView()) live.detach();
      activeRound.live = live;
      const typewriter = createDiscussionTypewriter(live.element, typingEl, container, ownsView);
      activeRound.typewriter = typewriter;
      const aiResult = await callDiscussionRoundAssistant({
        request, thread: origin.thread, profileId: origin.profileId || '', signal: controller.signal,
        onStream(text) {
          if (ownsView()) { live.restore(container); typewriter.update(text); }
        },
      });
      assertOrigin();
      typewriter.stop();
      stopChatThinkingStatus(typingEl);
      typingEl.remove();
      const assistantMsg = buildDiscussionAssistantMessage({
        fullText: aiResult.text, request, aiResult,
        responseTruncated: isAIResponseTruncated(aiResult),
        attestation: getChatProviderAttestation(request.provider),
      });
      if (aiResult.usage && (aiResult.usage.inputTokens || aiResult.usage.outputTokens)) {
        assistantMsg.usage = { inputTokens: aiResult.usage.inputTokens, outputTokens: aiResult.usage.outputTokens };
        trackDiscussionUsage(request, aiResult.usage);
      }
      if (ownsView()) completeChatLiveMessage(live.element, assistantMsg as ChatMessage);
      roundHistory.push(assistantMsg as ChatMessage);
      await save();
      render();
      live.dispose();
      activeRound = null;
      completedCount = index + 1;
      if (ownsView()) notifyChatContentAdded(container);
    }
  } catch (error) {
    const failure = error as { name?: unknown; _modalShown?: unknown };
    const interrupted = activeRound;
    interrupted?.typewriter?.stop();
    if (interrupted) { stopChatThinkingStatus(interrupted.typingEl); interrupted.typingEl.remove(); }
    if (failure?.name === 'AbortError' || !origin.isValid()) {
      outcome = 'stopped';
      const partial = origin.isValid() ? interrupted?.live?.element.textContent?.trim() || '' : '';
      if (partial && interrupted?.request) {
        const message = buildDiscussionAssistantMessage({ fullText: partial, request: interrupted.request, aiResult: {}, responseTruncated: false, attestation: getChatProviderAttestation(interrupted.request.provider) });
        message.stopped = true;
        roundHistory.push(message as ChatMessage);
        completedCount = interrupted.index + 1;
        await save();
        render();
      }
      remainingPersonas = participants.slice((interrupted?.index ?? completedCount) + (partial ? 1 : 0));
    } else {
      outcome = 'error';
      const persona = interrupted?.persona || participants[completedCount];
      remainingPersonas = participants.slice(interrupted?.index ?? completedCount);
      if (!failure?._modalShown) {
        roundHistory.push({ role: 'assistant', content: `Couldn't get ${persona?.name || 'this participant'}'s response. You can retry the remaining round or continue the discussion.`, error: true, discussion: true, discussionError: true, discussionPersonaId: persona?.id, personalityName: persona?.name, personalityIcon: persona?.icon } as ChatMessage);
        await save();
        render();
      }
    }
  } finally {
    release();
    activeRound?.live?.dispose();
    if (ownsController()) {
      if (origin.isActive()) {
        updateDiscussionProgress(null, 0, 0);
        setChatStreamStatus(outcome === 'complete' ? 'Discussion round complete.' : outcome === 'stopped' ? 'Discussion round paused.' : 'Discussion response failed. Retry is available.', { busy: false });
      } else setChatStreamStatus('', { busy: false });
      setChatAbortController(null);
      setSendButtonMode(sendBtn, 'idle');
    }
  }
  return { completedCount, outcome, remainingPersonas };
}
