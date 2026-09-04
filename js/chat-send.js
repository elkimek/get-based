// @ts-check
// chat-send.js — direct chat send, streaming, stop button, and typewriter state

import { state } from './state.js';
import { CHAT_SYSTEM_PROMPT } from './chat-system-prompt.js';
import { calculateCost, formatCost, trackUsage } from './schema.js';
import { escapeHTML, showNotification } from './utils.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
import {
  getActiveModelDisplay, getActiveModelId, getAIProvider,
  isPpqPrivateModeActive, isRoutstrPrivateModeActive, isVeniceE2EEActive, supportsWebSearch,
} from './api.js';
import { buildVisionContent, formatImageBlock } from './image-utils.js';
import {
  clearAttachments, configureChatImages, getPendingAttachments, hasPendingAttachments,
  rememberMessageAttachments,
} from './chat-images.js';
import {
  configureChatComposer, initChatComposer, resetChatComposer,
} from './chat-composer.js';
import { autoNameThread, createNewThread } from './chat-threads.js';
import { injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti } from './lens.js';
import { renderMarkdown } from './markdown.js';
import { setIconButtonContent } from './chat-icons.js';
import { _renderLensSources, renderChatMessages } from './chat-render.js';
import {
  CHAT_RESPONSE_MAX_TOKENS, callChatAPIWithContinuation,
  isAIResponseTruncated, responseLimitNote,
} from './chat-continuation.js';
import {
  attachLensSources, buildChatLabContext, buildChatSystemPrompt, buildMultiPersonaInstruction,
  buildPersonalityPrompt, buildTaggedChatMessages, buildWebSearchHint,
} from './chat-prompt-context.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import {
  getActivePersonality, getCustomPersonality, updateChatHeaderTitle,
} from './chat-personalities.js';
import { canSaveChatHistory, saveChatHistory } from './chat-history.js';
import { buildActionBar, chatMessageActionAttrs } from './chat-actions.js';
import { getChatWebSearchEnabled, isChatThreadInputBlocked } from './chat-panel.js';
import {
  getCurrentDiscussionState, sendDiscussionUserTurn, updateDiscussButton,
} from './chat-discussion.js';
import {
  detectChatSendSupplementSlots,
  getChatSendProviderAttestation,
  getChatSendRecommendationRuntime,
  isChatSendEMFRelevant,
} from './chat-send-runtime.js';
import { maybeAutoReadAssistantMessage } from './voice-loader.js';
import {
  initChatScrollControls, notifyChatContentAdded,
} from './chat-scroll.js';
import {
  getRecommendationDisclosureState, recommendationSummaryHTML, startRecommendationAttention,
} from './chat-recommendation-disclosure.js';
import {
  getPendingChatMessageEditText,
  prepareChatMessageEditSend,
} from './chat-message-edit.js';
import { setChatStreamStatus } from './chat-stream-status.js';
import { callCodexAgent } from './agent-chat-backend.js';
import {
  getChatBackendDisplay, hasChatResponseBackend, isCodexChatBackend,
} from './chat-backend-selection.js';
import { getAssistantExecutionRoute } from './ai-execution-routing.js';
import { getAgentModelDisplay, getCachedAgentModelCatalog } from './agent-model-catalog.js';
import { getAgentHostAgent, getAgentHostTarget } from './agent-chat-settings.js';
import { isPersonalAgentTarget } from './agent-chat-context.js';
import { mergeAgentContextReceipts } from './agent-tool-runtime.js';
import { getDirectChatReasoningEffort } from './chat-model-preferences.js';
import {
  applyChatMessageAvatar, shouldShowChatPersonaLabel,
} from './chat-message-avatars.js';
import {
  createChatThinkingIndicator, stopChatThinkingStatus,
} from './chat-thinking-status.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';

// ═══════════════════════════════════════════════
// ABORT CONTROLLER (stop streaming)
// ═══════════════════════════════════════════════
/** @type {AbortController | null} */
let _chatAbortController = null;

/** @type {{ container: HTMLElement, typingEl: HTMLElement, aiMsgEl: HTMLElement | null, labelEl: HTMLElement | null, personalityName: string } | null} */
let _activeChatGenerationUI = null;

export function isChatStreaming() {
  return !!_chatAbortController;
}

export function getChatAbortController() {
  return _chatAbortController;
}

export function setChatAbortController(controller) {
  _chatAbortController = controller;
}

export function stopChatGeneration() {
  _chatAbortController?.abort();
}

// Closing the panel deliberately does not stop generation. If reopening (or
// another transcript render) displaced the live placeholder, reconnect the
// same DOM nodes and restore the Stop affordance without restarting or
// duplicating the billable request.
export function restoreChatGenerationUI() {
  if (!_chatAbortController) return false;
  const sendBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-send-btn'));
  setSendButtonMode(sendBtn, 'streaming');

  const active = _activeChatGenerationUI;
  if (!active) return true; // Discussion rounds own their live message UI.
  const container = /** @type {HTMLElement | null} */ (document.getElementById('chat-messages')) || active.container;
  active.container = container;
  if (active.aiMsgEl?.textContent) {
    if (active.labelEl && !active.labelEl.isConnected) container.appendChild(active.labelEl);
    if (!active.aiMsgEl.isConnected) container.appendChild(active.aiMsgEl);
  } else if (!active.typingEl.isConnected) {
    container.appendChild(active.typingEl);
  }
  setChatStreamStatus(`${active.personalityName} is responding.`, { busy: true });
  notifyChatContentAdded(container);
  return true;
}

// ═══════════════════════════════════════════════
// TYPEWRITER — smooth character trickle for streaming
// ═══════════════════════════════════════════════
/**
 * @param {HTMLElement} el
 * @param {HTMLElement} typingEl
 * @param {HTMLElement} container
 */
export function createTypewriter(el, typingEl, container) {
  let target = '';
  let displayed = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function tick() {
    if (displayed >= target.length) { timer = null; return; }
    const behind = target.length - displayed;
    const batch = Math.max(1, Math.ceil(behind * 0.3));
    displayed = Math.min(displayed + batch, target.length);
    stopChatThinkingStatus(typingEl);
    if (typingEl.parentNode) typingEl.remove();
    if (!el.parentNode) container.appendChild(el);
    el.textContent = target.slice(0, displayed);
    notifyChatContentAdded(container);
    timer = setTimeout(tick, 16);
  }

  return {
    update(text) {
      target = text;
      if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        if (timer) { clearTimeout(timer); timer = null; }
        displayed = target.length;
        stopChatThinkingStatus(typingEl);
        if (typingEl.parentNode) typingEl.remove();
        if (!el.parentNode) container.appendChild(el);
        el.textContent = target;
        notifyChatContentAdded(container);
        return;
      }
      if (!timer) tick();
    },
    stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      displayed = target.length;
      stopChatThinkingStatus(typingEl);
    }
  };
}

// Image-attachment flow (paste/drop/picker handlers, HD-mode toggle,
// pending-queue, thumbnail generation) lives in chat-images.js.
export function updateSendButtonState() {
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  const sendBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-send-btn'));
  if (!sendBtn) return;
  const hasContent = (input && input.value.trim()) || hasPendingAttachments();
  if (input?.disabled && !_chatAbortController) {
    sendBtn.disabled = true;
    return;
  }
  sendBtn.disabled = !hasContent && !_chatAbortController;
}
configureChatImages({ updateSendButtonState });
configureChatComposer({ updateSendButtonState });
initChatComposer();
initChatScrollControls();

// ═══════════════════════════════════════════════
// SEND BUTTON STATE
// ═══════════════════════════════════════════════
export function setSendButtonMode(btn, mode) {
  if (!btn) return;
  // Editing the latest prompt would replace the response that is currently
  // arriving. Keep the action out of sight until the active request settles,
  // including after a close/reopen cycle.
  document.querySelectorAll('.chat-edit-retry-action').forEach(action => {
    const button = /** @type {HTMLButtonElement} */ (action);
    button.hidden = mode === 'streaming';
    button.disabled = mode === 'streaming';
  });
  if (mode === 'streaming') {
    btn.disabled = false;
    setIconButtonContent(btn, 'stop');
    btn.classList.add('streaming');
    btn.setAttribute('aria-label', 'Stop generating');
    btn.title = 'Stop generating';
  } else {
    setIconButtonContent(btn, 'send');
    btn.classList.remove('streaming');
    btn.setAttribute('aria-label', 'Send message');
    btn.title = 'Send message';
    updateSendButtonState();
  }
}

// ═══════════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════════
export async function sendChatMessage() {
  const useCodexAgent = isCodexChatBackend();
  if (!hasChatResponseBackend()) {
    renderChatMessages(); // Re-render to show setup guide
    return;
  }
  // If currently streaming, abort and return (toggle behavior)
  if (_chatAbortController) {
    _chatAbortController.abort();
    _chatAbortController = null;
    return;
  }
  if (isChatThreadInputBlocked()) return;

  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  const sendBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-send-btn'));
  const container = /** @type {HTMLElement | null} */ (document.getElementById('chat-messages'));
  if (!input || !sendBtn || !container) return;
  const pendingEditText = getPendingChatMessageEditText();
  const isEditedRetry = pendingEditText != null;
  const text = (pendingEditText ?? input.value).trim();
  const hasImages = !isEditedRetry && hasPendingAttachments();
  if (!text && !hasImages) return;
  if (useCodexAgent && hasImages && !getAssistantExecutionRoute().inputModalities?.includes('image')) {
    showNotification('The selected CLI model does not report image support.', 'info');
    return;
  }

  // Ask before mutating the conversation or preparing any provider request.
  // The shared gate separates AI transparency from endpoint-specific route
  // confirmation or remote sensitive-data approval.
  const _msgAgentTarget = useCodexAgent ? getAgentHostTarget() : 'local';
  const _msgAgentId = useCodexAgent ? getAgentHostAgent() : '';
  const _msgProvider = useCodexAgent
    ? (isPersonalAgentTarget(_msgAgentTarget) ? 'personal-agent-gateway' : 'codex-agent')
    : getAIProvider();
  const { requestAIProcessingApproval } = await import('./cloud-ai-consent.js');
  if (!await requestAIProcessingApproval(_msgProvider, { kind: hasImages ? 'image' : 'text' })) return;

  // Capture attachments before clearing (they're ephemeral)
  const attachments = hasImages ? [...getPendingAttachments()] : [];

  // Ensure we have a thread
  if (!state.currentThreadId) {
    createNewThread();
    if (!state.currentThreadId) return;
  }
  if (!canSaveChatHistory()) return;
  const editPreparation = prepareChatMessageEditSend();
  if (editPreparation === false) return;

  const discussionState = text && !hasImages ? getCurrentDiscussionState() : null;

  // Auto-name thread from first user message
  const isFirstMessage = state.chatHistory.length === 0;

  // Add user message — store tiny thumbnails for display, NOT full base64
  const userMsg = { role: 'user', content: text || '(image)' };
  if (hasImages) {
    userMsg.hasImages = true;
    userMsg.imageCount = attachments.length;
    userMsg.thumbnails = attachments.map(a => a.thumbUrl).filter(Boolean);
    rememberMessageAttachments(userMsg, attachments);
  }
  state.chatHistory.push(userMsg);
  if (!editPreparation) {
    resetChatComposer();
    clearAttachments();
  }
  renderChatMessages();
  await saveChatHistory(); // persist immediately so messages survive API failures

  if (isFirstMessage) {
    autoNameThread(state.currentThreadId, text);
  }

  if (discussionState && !isFirstMessage) {
    await sendDiscussionUserTurn(text, discussionState);
    return;
  }

  // Show typing indicator
  const pendingPersonality = getActivePersonality();
  const typingEl = createChatThinkingIndicator({
    personalityName: pendingPersonality.name,
    personalityIcon: pendingPersonality.icon,
    agentId: _msgAgentId,
  });
  container.appendChild(typingEl);
  notifyChatContentAdded(container);

  // Switch to stop mode
  _chatAbortController = new AbortController();
  _activeChatGenerationUI = {
    container,
    typingEl,
    aiMsgEl: null,
    labelEl: null,
    personalityName: getActivePersonality().name,
  };
  setSendButtonMode(sendBtn, 'streaming');
  setChatStreamStatus(`${getActivePersonality().name} is responding.`, { busy: true });
  let streamOutcome = 'complete';

  let _msgModelId = useCodexAgent ? 'codex' : getActiveModelId(_msgProvider);
  let _msgModelDisplay = useCodexAgent ? getChatBackendDisplay() : getActiveModelDisplay(_msgProvider);
  const _msgReasoningEffort = useCodexAgent ? '' : getDirectChatReasoningEffort(_msgProvider, _msgModelId);
  const _msgE2EE = !useCodexAgent && ((_msgProvider === 'venice' && isVeniceE2EEActive())
    || (_msgProvider === 'ppq' && isPpqPrivateModeActive())
    || (_msgProvider === 'routstr' && isRoutstrPrivateModeActive()));
  const _msgAttestation = useCodexAgent ? null : getChatSendProviderAttestation(_msgProvider);
  const webSearchSupported = !useCodexAgent && supportsWebSearch(_msgProvider);
  const webSearchEnabled = getChatWebSearchEnabled() && webSearchSupported;
  let aiMsgEl = null;

  try {
    let labContext = buildChatLabContext(text);
    let _lensResultForMsg = null;
    if (hasLens()) {
      const lensResult = await queryLensMulti(text, { signal: _chatAbortController ? _chatAbortController.signal : undefined });
      if (lensResult) {
        labContext = injectLensChunks(labContext, lensResult);
        _lensResultForMsg = lensResult;
      }
    }
    // Every provider receives the same user-enabled baseline projection.
    // Local CLI agents can additionally use bounded tools for exact lookups,
    // navigation, and reviewable drafts.
    const { getContextSummary } = await import('./chat-context-summary.js');
    let contextSnapshot = getContextSummary(labContext);
    const personality = getActivePersonality();
    const currentPersonaName = personality.name;
    const personalityPrompt = buildPersonalityPrompt(personality, getCustomPersonality());
    const multiPersonaInstruction = buildMultiPersonaInstruction(state.chatHistory, currentPersonaName);
    const webHint = buildWebSearchHint({ isE2EE: _msgE2EE, webSearchEnabled, webSearchSupported });
    const systemPrompt = buildChatSystemPrompt({
      basePrompt: CHAT_SYSTEM_PROMPT,
      labContext,
      personalityPrompt,
      multiPersonaInstruction,
      webHint,
    });

    // Send last 30 messages for context — tag messages from other personas
    const apiMessages = buildTaggedChatMessages(state.chatHistory, currentPersonaName);

    // Inject vision content into the last user message if images were attached
    if (attachments.length > 0 && apiMessages.length > 0) {
      const lastUserIdx = apiMessages.length - 1;
      const imageBlocks = attachments.map(att => formatImageBlock(att.base64, att.mediaType, _msgProvider));
      apiMessages[lastUserIdx] = {
        role: 'user',
        content: buildVisionContent(imageBlocks, apiMessages[lastUserIdx].content, _msgProvider)
      };
    }

    // Show persona label if personality changed from last AI message
    const lastAiMsg = [...state.chatHistory].reverse().find(m => m.role === 'assistant');
    if (shouldShowChatPersonaLabel({ personalityName: personality.name })
      && (!lastAiMsg || lastAiMsg.personalityName !== personality.name)) {
      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      container.appendChild(labelEl);
      if (_activeChatGenerationUI) _activeChatGenerationUI.labelEl = labelEl;
    }

    // Create AI message placeholder
    aiMsgEl = document.createElement('div');
    aiMsgEl.className = 'chat-msg chat-ai';
    aiMsgEl.setAttribute('role', 'article');
    aiMsgEl.setAttribute('aria-label', `${personality.name} response`);
    aiMsgEl.dataset.chatStreaming = 'true';
    aiMsgEl.style.whiteSpace = 'pre-wrap';
    applyChatMessageAvatar(aiMsgEl, {
      role: 'assistant',
      personalityName: personality.name,
      personalityIcon: personality.icon,
      agentId: _msgAgentId,
    });
    if (_activeChatGenerationUI) _activeChatGenerationUI.aiMsgEl = aiMsgEl;

    // Typewriter: trickle buffered text at a steady rate for smooth appearance
    const typewriter = createTypewriter(aiMsgEl, typingEl, container);

    const getStreamSignal = () => _chatAbortController ? _chatAbortController.signal : undefined;
    let aiResult;
    if (useCodexAgent) {
      const currentThread = state.chatThreads.find(thread => thread.id === state.currentThreadId);
      aiResult = await callCodexAgent({
        prompt: text || 'Respond to the attached image.',
        instructions: `${CHAT_SYSTEM_PROMPT}${personalityPrompt}${multiPersonaInstruction}`,
        labContext,
        profileId: state.currentProfile || '',
        target: _msgAgentTarget,
        threadId: currentThread?.agentThreadId,
        history: apiMessages.slice(0, -1).filter(message => typeof message.content === 'string').map(message => ({
          role: message.role,
          content: message.content,
        })),
        images: attachments.map(attachment => ({ base64: attachment.base64, mediaType: attachment.mediaType })),
        signal: getStreamSignal(),
        onStream(streamedText) { typewriter.update(streamedText); },
      });
      if (currentThread) {
        currentThread.agentThreadId = aiResult.threadId;
        currentThread.chatBackend = 'codex';
        currentThread.agentModel = aiResult.model;
      }
      const agentToolCalls = Array.isArray(aiResult.toolCalls) ? aiResult.toolCalls : [];
      contextSnapshot = mergeAgentContextReceipts(agentToolCalls, contextSnapshot);
    } else {
      aiResult = await callChatAPIWithContinuation({
        system: systemPrompt,
        messages: apiMessages,
        maxTokens: CHAT_RESPONSE_MAX_TOKENS,
        signal: getStreamSignal(),
        onStream(streamedText) { typewriter.update(streamedText); },
        webSearch: webSearchEnabled,
        provider: _msgProvider,
        reasoningEffort: _msgReasoningEffort,
      });
    }
    if (useCodexAgent && aiResult.model) {
      _msgModelId = aiResult.model;
      _msgModelDisplay = getAgentModelDisplay(aiResult.model, getCachedAgentModelCatalog(getAgentHostAgent(), _msgAgentTarget));
    }
    const fullText = aiResult.text;
    const usage = /** @type {{ inputTokens?: number, outputTokens?: number } | undefined} */ (aiResult.usage);
    const responseTruncated = isAIResponseTruncated(aiResult);

    // Final render with full markdown
    typewriter.stop();
    aiMsgEl.style.whiteSpace = '';
    delete aiMsgEl.dataset.chatStreaming;
    stopChatThinkingStatus(typingEl);
    if (typingEl.parentNode) typingEl.remove();
    if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);

    aiMsgEl.innerHTML = renderMarkdown(fullText);
    if (responseTruncated) aiMsgEl.insertAdjacentHTML('beforeend', responseLimitNote());
    // Cost footnote
    if (!useCodexAgent && usage && (usage.inputTokens || usage.outputTokens) && !shouldHideAppExtensionAIUsage(_msgProvider)) {
      const cost = calculateCost(_msgProvider, _msgModelId, usage.inputTokens, usage.outputTokens);
      const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
      const webTag = webSearchEnabled ? ' \u00b7 \ud83c\udf10 web' : '';
      const e2eeTag = _msgE2EE ? e2eeLockFootnote(getChatSendProviderAttestation(_msgProvider)) : '';
      const footnote = document.createElement('div');
      footnote.className = 'chat-cost-footnote';
      footnote.innerHTML = `${escapeHTML(_msgModelDisplay)} \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens${webTag}${e2eeTag}`;
      aiMsgEl.appendChild(footnote);
    } else if (useCodexAgent) {
      const footnote = document.createElement('div');
      footnote.className = 'chat-cost-footnote';
      const webTag = aiResult.webSearches?.length ? ' · 🌐 web' : '';
      footnote.textContent = `${_msgModelDisplay} · CLI subscription${webTag}`;
      aiMsgEl.appendChild(footnote);
    }

    const attribution = getAIOutputAttribution({
      provider: _msgProvider,
      agentId: _msgAgentId,
      modelId: _msgModelId,
      modelDisplay: _msgModelDisplay,
    });
    if (attribution) {
      const attributionEl = document.createElement('div');
      attributionEl.className = 'chat-provider-attribution';
      attributionEl.textContent = attribution;
      aiMsgEl.appendChild(attributionEl);
    }

    // Build assistant message object with context snapshot
    const assistantMsg = { role: 'assistant', content: fullText, context: contextSnapshot, personalityName: personality.name, personalityIcon: personality.icon, provider: _msgProvider, agentId: _msgAgentId, modelId: _msgModelId, modelDisplay: _msgModelDisplay };
    if (useCodexAgent && Array.isArray(aiResult.drafts) && aiResult.drafts.length) assistantMsg.agentDrafts = aiResult.drafts;
    if (responseTruncated) {
      assistantMsg.truncated = true;
      assistantMsg.finishReason = aiResult.finishReason || 'length';
    }
    if (webSearchEnabled || (useCodexAgent && aiResult.webSearches?.length)) assistantMsg.webSearch = true;
    if (_msgE2EE) { assistantMsg.e2ee = true; assistantMsg.attestation = getChatSendProviderAttestation(_msgProvider) || _msgAttestation || null; }
    attachLensSources(assistantMsg, _lensResultForMsg);
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      assistantMsg.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
      if (!useCodexAgent) trackUsage(_msgProvider, _msgModelId, usage.inputTokens, usage.outputTokens);
    }
    state.chatHistory.push(assistantMsg);

    // Detect supplement slots from AI text — persist on message for re-rendering
    const _recSlots = detectChatSendSupplementSlots(fullText);
    if (_recSlots.length) {
      const disclosure = getRecommendationDisclosureState(state.chatHistory, _recSlots, assistantMsg);
      assistantMsg.recSlots = _recSlots;
      assistantMsg.recOpen = disclosure.open;
      assistantMsg.recNew = disclosure.isNew;
    }

    // EMF hint with profile-level 30-day cooldown. Fires only when (a) EMF is
    // explicitly on the user's mind in this turn AND (b) they haven't already
    // explored EMF (no fresh assessment) AND (c) we haven't surfaced this hint
    // for this profile in the last 30 days AND (d) the hint actually rendered
    // to the DOM (so a stop-mid-stream doesn't burn the cooldown).
    (function maybeInjectEMFHint() {
      try {
        const userText = state.chatHistory[state.chatHistory.length - 2]?.content || '';
        const turnText = `${userText}\n${fullText}`;
        if (!isChatSendEMFRelevant(turnText)) return;
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
        hintEl.innerHTML = `<span aria-hidden="true">💡</span> Curious about your EMF environment? <a href="#" ${chatMessageActionAttrs('open-emf-assessment')} data-umami-event="emf-nudge-chat">Open the assessment →</a>`;
        const actionBar = aiMsgEl.querySelector('.chat-action-bar');
        if (actionBar) aiMsgEl.insertBefore(hintEl, actionBar);
        else aiMsgEl.appendChild(hintEl);
        assistantMsg.emfHint = true;
        localStorage.setItem(flagKey, String(Date.now()));
      } catch {}
    })();

    await saveChatHistory(); // persist before any sync-triggered chat reload can repaint older storage

    if (assistantMsg.lensSources?.length) {
      const lensContainer = document.createElement('div');
      lensContainer.innerHTML = _renderLensSources(assistantMsg.lensSources, assistantMsg.lensSourceName);
      while (lensContainer.firstChild) aiMsgEl.appendChild(lensContainer.firstChild);
    }

    // Append action bar
    const msgIndex = state.chatHistory.length - 1;
    const actionBarHtml = buildActionBar(msgIndex);
    const actionBarContainer = document.createElement('div');
    actionBarContainer.innerHTML = actionBarHtml;
    while (actionBarContainer.firstChild) aiMsgEl.appendChild(actionBarContainer.firstChild);

    // Async-render supplement recommendations before action bar
    const recommendationRuntime = getChatSendRecommendationRuntime();
    if (_recSlots.length && recommendationRuntime) {
      const { renderRecommendationSectionSync, loadCatalog } = recommendationRuntime;
      loadCatalog().then(catalog => {
        if (!catalog?.slots || !aiMsgEl.isConnected) return;
        const sections = _recSlots.map(slot => {
          const slotLabel = catalog.slots[slot]?.label || slot.split('.').pop();
          return renderRecommendationSectionSync(slot, { label: slotLabel, maxProducts: 2 });
        }).filter(Boolean);
        if (!sections.length) return;
        const wrapper = document.createElement('details');
        wrapper.className = `rec-chat-wrapper${assistantMsg.recNew ? ' rec-chat-unseen' : ''}`;
        wrapper.open = Boolean(assistantMsg.recOpen);
        wrapper.setAttribute('data-chat-message-index', String(msgIndex));
        wrapper.addEventListener('click', e => e.stopPropagation());
        const summary = document.createElement('summary');
        summary.className = 'rec-chat-summary';
        summary.innerHTML = recommendationSummaryHTML(sections.length, Boolean(assistantMsg.recNew));
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
        if (assistantMsg.recNew) startRecommendationAttention(wrapper);
        notifyChatContentAdded(container);
      });
    }

    notifyChatContentAdded(container);
    void maybeAutoReadAssistantMessage(msgIndex);
  } catch (err) {
    const error = /** @type {any} */ (err);
    stopChatThinkingStatus(typingEl);
    if (typingEl.parentNode) typingEl.remove();

    // Abort: save partial streamed text as a normal message
    if (error.name === 'AbortError') {
      streamOutcome = 'stopped';
      // Read partial text from the DOM (typewriter accumulates into textContent)
      const partialText = aiMsgEl?.textContent?.trim() || '';
      if (partialText && aiMsgEl) {
        if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);
        aiMsgEl.style.whiteSpace = '';
        aiMsgEl.innerHTML = renderMarkdown(partialText) + '<div class="chat-stopped-note">[stopped]</div>';
        const personality = getActivePersonality();
        state.chatHistory.push({ role: 'assistant', content: partialText, personalityName: personality.name, personalityIcon: personality.icon, provider: _msgProvider, agentId: _msgAgentId, modelId: _msgModelId, modelDisplay: _msgModelDisplay, stopped: true });
        await saveChatHistory();
        renderChatMessages({ preserveScroll: true });
      }
    } else {
      streamOutcome = 'failed';
      if (!error?._modalShown) {
        // Skip inline error rendering when a modal already surfaced the
        // condition (e.g., OpenRouter 402 → showInsufficientBalanceDialog),
        // to avoid double-notifying the user.
        const technicalMessage = error.message || 'AI request failed';
        const agentRestartRequired = error?.code === 'agent_host_upgrade_required';
        const errorMessage = agentRestartRequired
          ? technicalMessage
          : 'I couldn\'t complete this response. Check your provider connection and try again.';
        const personality = getActivePersonality();
        state.chatHistory.push({
          role: 'assistant',
          content: errorMessage,
          error: true,
          errorDetail: technicalMessage,
          personalityName: personality.name,
          personalityIcon: personality.icon,
          provider: _msgProvider,
          agentId: _msgAgentId,
          modelId: _msgModelId,
          modelDisplay: _msgModelDisplay,
        });
        await saveChatHistory();
        renderChatMessages({ preserveScroll: true });
        console.warn('[chat] AI request failed', technicalMessage);
        showNotification(agentRestartRequired
          ? technicalMessage
          : 'AI response failed. Check your provider connection and try again.', 'error', 10000);
      }
    }
  }

  _chatAbortController = null;
  _activeChatGenerationUI = null;
  setSendButtonMode(sendBtn, 'idle');
  updateDiscussButton();
  updateChatHeaderTitle();
  notifyChatContentAdded(container);
  setChatStreamStatus(
    streamOutcome === 'complete' ? 'Response complete.'
      : streamOutcome === 'stopped' ? 'Response stopped. Retry is available.'
        : 'Response failed. Retry is available.',
    { busy: false },
  );
}

export function handleChatKeydown(event) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}
