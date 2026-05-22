// chat.js — AI chat send orchestration, personalities, and conversation entry points

import { state } from './state.js';
import { CHAT_SYSTEM_PROMPT } from './constants.js';
import { calculateCost, formatCost, trackUsage } from './schema.js';
import { escapeHTML, formatValue, getStatus } from './utils.js';
import { getActiveData, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex } from './data.js';
import { hasAIProvider, setAIPaused, getAIProvider, getActiveModelId, getActiveModelDisplay, supportsWebSearch, isVeniceE2EEActive } from './api.js';
import { formatImageBlock, buildVisionContent } from './image-utils.js';
import { getPendingAttachments, hasPendingAttachments, clearAttachments } from './chat-images.js';
import {
  createNewThread, autoNameThread, getChatThreadKey, getChatThreadsKey,
} from './chat-threads.js';
import { buildLabContext, getContextSummary, injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti } from './lens.js';
import { applyInlineMarkdown, renderMarkdown } from './markdown.js';
import { setIconButtonContent } from './chat-icons.js';
import { renderChatMessages } from './chat-render.js';
import {
  closeSummaryModal, copySummary, deleteSavedSummary, downloadSummary,
  printSummary, renderSavedSummaries, summarizeThread, viewSavedSummary,
} from './chat-summaries.js';
import {
  CHAT_RESPONSE_MAX_TOKENS, callChatAPIWithContinuation,
  isAIResponseTruncated, responseLimitNote,
} from './chat-continuation.js';
import {
  attachLensSources, buildChatSystemPrompt, buildMultiPersonaInstruction,
  buildPersonalityPrompt, buildTaggedChatMessages, buildWebSearchHint,
} from './chat-prompt-context.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import {
  autoResizePersonaTextarea, deleteCustomPersonality, editCustomPersonality,
  generateCustomPersonality, getActivePersonality, getCustomPersonalities,
  getCustomPersonality, getCustomPersonalityText, loadChatPersonality,
  markPersonalityDirty, pickPersonaIcon, saveCustomPersonalities,
  saveCustomPersonality, setChatPersonality, snapshotPersonalityClean,
  startNewCustomPersonality, togglePersonalityBar, updateChatHeaderModel,
  updateChatHeaderTitle, updatePersonalityBar, updateSummaryButton,
} from './chat-personalities.js';
import {
  clearChatHistory, getChatStorageKey, loadChatHistory, saveChatHistory,
} from './chat-history.js';
import {
  buildActionBar, copyMessage, regenerateLastMessage, toggleContextDetails,
} from './chat-actions.js';
import {
  closeChatPanel, configureChatPanel, getChatWebSearchEnabled,
  refreshWebSearchToggle, setChatNudge, setChatWebSearchEnabled,
  toggleChatFullscreen, toggleChatPanel, openChatPanel, updateChatInputState,
  updateChatNudge,
} from './chat-panel.js';
import {
  cleanupDiscussionState, configureChatDiscussion, continueDiscussion,
  endDiscussion, getCurrentDiscussionState, getThreadPersonaCount,
  removeDiscussContinuePrompt, restoreDiscussionContinuePrompt,
  sendDiscussionUserTurn, showDiscussContinuePrompt, startDiscussion,
  startDiscussionFromPicker, updateDiscussButton,
} from './chat-discussion.js';
import {
  _updatePeriodBtn, addChatSupplement,
  backToProviderQuiz, configureChatOnboarding, onContextCardSaved,
  onboardHeightUnitChanged, removeChatSupplement,
  requestOnboardingLabImportProvider, saveChatLocation, saveChatPeriod,
  saveChatProfile, saveCycleStatus, setChatProfileSex,
  setProviderQuizBranch, showCycleNoMensesOptions, showCyclePeriodEntry,
  skipOnboardingExtras, skipProviderSetup, startOnboardingLabImport,
  useChatPrompt,
} from './chat-onboarding.js';
export { renderChatMessages } from './chat-render.js';
export {
  autoResizePersonaTextarea, deleteCustomPersonality, editCustomPersonality,
  generateCustomPersonality, getActivePersonality, getCustomPersonalities,
  getCustomPersonality, getCustomPersonalityText, loadChatPersonality,
  markPersonalityDirty, pickPersonaIcon, saveCustomPersonalities,
  saveCustomPersonality, setChatPersonality, snapshotPersonalityClean,
  startNewCustomPersonality, togglePersonalityBar, updateChatHeaderModel,
  updateChatHeaderTitle, updatePersonalityBar, updateSummaryButton,
} from './chat-personalities.js';
export {
  clearChatHistory, getChatStorageKey, loadChatHistory, saveChatHistory,
} from './chat-history.js';
export {
  buildActionBar, copyMessage, regenerateLastMessage, toggleContextDetails,
} from './chat-actions.js';
export {
  closeChatPanel, getChatWebSearchEnabled, refreshWebSearchToggle,
  setChatNudge, setChatWebSearchEnabled, toggleChatFullscreen,
  toggleChatPanel, openChatPanel, updateChatInputState, updateChatNudge,
} from './chat-panel.js';
export {
  cleanupDiscussionState, continueDiscussion, endDiscussion,
  getCurrentDiscussionState, getThreadPersonaCount,
  removeDiscussContinuePrompt, restoreDiscussionContinuePrompt,
  sendDiscussionUserTurn, showDiscussContinuePrompt, startDiscussion,
  startDiscussionFromPicker, updateDiscussButton,
} from './chat-discussion.js';
export {
  _countFilledCards, _renderOnboardCrumbs, _renderProviderQuiz,
  _updateOnboardNextBtn, _updatePeriodBtn, addChatSupplement,
  backToProviderQuiz, onContextCardSaved, onboardHeightUnitChanged,
  removeChatSupplement, requestOnboardingLabImportProvider,
  saveChatLocation, saveChatPeriod, saveChatProfile, saveCycleStatus,
  setChatProfileSex, setProviderQuizBranch, showCycleNoMensesOptions,
  showCyclePeriodEntry, skipOnboardingExtras, skipProviderSetup,
  startOnboardingLabImport, useChatPrompt,
} from './chat-onboarding.js';

// ═══════════════════════════════════════════════
// ABORT CONTROLLER (stop streaming)
// ═══════════════════════════════════════════════
let _chatAbortController = null;

export function isChatStreaming() {
  return !!_chatAbortController;
}

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

// Panel chrome (open/close/fullscreen, web-search toggle, input disabled state,
// FAB nudge) lives in chat-panel.js as of v1.8.82. chat.js wires the one
// discussion-prompt callback at the bottom of this file; the panel module owns
// the DOM behavior, including the no-scroll-lock note that body.style.overflow
// is no longer set on open.

// ═══════════════════════════════════════════════
// MARKDOWN — extracted to js/markdown.js
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// SEND BUTTON STATE
// ═══════════════════════════════════════════════
function setSendButtonMode(btn, mode) {
  if (!btn) return;
  if (mode === 'streaming') {
    btn.disabled = false;
    setIconButtonContent(btn, 'stop');
    btn.classList.add('streaming');
  } else {
    btn.disabled = false;
    setIconButtonContent(btn, 'send');
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

  const discussionState = text && !hasImages ? getCurrentDiscussionState() : null;

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
  await saveChatHistory(); // persist immediately so messages survive API failures

  if (isFirstMessage) {
    autoNameThread(state.currentThreadId, text);
  }

  if (discussionState && !isFirstMessage) {
    await sendDiscussionUserTurn(text, discussionState);
    return;
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
  const _msgProvider = getAIProvider();
  const _msgModelId = getActiveModelId(_msgProvider);
  const _msgModelDisplay = getActiveModelDisplay(_msgProvider);
  const _msgE2EE = _msgProvider === 'venice' && isVeniceE2EEActive();
  const webSearchSupported = supportsWebSearch(_msgProvider);
  const webSearchEnabled = getChatWebSearchEnabled() && webSearchSupported;

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
    if (!lastAiMsg || lastAiMsg.personalityName !== personality.name) {
      const labelEl = document.createElement('div');
      labelEl.className = 'chat-persona-label';
      labelEl.textContent = `${personality.icon || ''} ${personality.name}`;
      container.appendChild(labelEl);
    }

    // Create AI message placeholder
    const aiMsgEl = document.createElement('div');
    aiMsgEl.className = 'chat-msg chat-ai';
    aiMsgEl.style.whiteSpace = 'pre-wrap';

    // Typewriter: trickle buffered text at a steady rate for smooth appearance
    const typewriter = createTypewriter(aiMsgEl, typingEl, container);

    const aiResult = await callChatAPIWithContinuation({
      system: systemPrompt,
      messages: apiMessages,
      maxTokens: CHAT_RESPONSE_MAX_TOKENS,
      signal: _chatAbortController ? _chatAbortController.signal : undefined,
      onStream(text) { typewriter.update(text); },
      webSearch: webSearchEnabled,
      provider: _msgProvider
    });
    const { text: fullText, usage } = aiResult;
    const responseTruncated = isAIResponseTruncated(aiResult);

    // Final render with full markdown
    typewriter.stop();
    aiMsgEl.style.whiteSpace = '';
    if (typingEl.parentNode) typingEl.remove();
    if (!aiMsgEl.parentNode) container.appendChild(aiMsgEl);

    aiMsgEl.innerHTML = renderMarkdown(fullText);
    if (responseTruncated) aiMsgEl.insertAdjacentHTML('beforeend', responseLimitNote());
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
    const assistantMsg = { role: 'assistant', content: fullText, context: contextSnapshot, personalityName: personality.name, personalityIcon: personality.icon, provider: _msgProvider, modelId: _msgModelId, modelDisplay: _msgModelDisplay };
    if (responseTruncated) {
      assistantMsg.truncated = true;
      assistantMsg.finishReason = aiResult.finishReason || 'length';
    }
    if (webSearchEnabled) assistantMsg.webSearch = true;
    if (_msgE2EE) { assistantMsg.e2ee = true; assistantMsg.attestation = window._veniceAttestation || null; }
    attachLensSources(assistantMsg, _lensResultForMsg);
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

    await saveChatHistory(); // persist before any sync-triggered chat reload can repaint older storage

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
        await saveChatHistory();
      }
    } else if (!err?._modalShown) {
      // Skip inline error rendering when a modal already surfaced the
      // condition (e.g., OpenRouter 402 → showInsufficientBalanceDialog),
      // to avoid double-notifying the user.
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
// WINDOW EXPORTS (for onclick handlers)
// ═══════════════════════════════════════════════
function _resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

configureChatDiscussion({
  createTypewriter,
  getChatAbortController: () => _chatAbortController,
  renderChatMessages,
  setChatAbortController: (controller) => { _chatAbortController = controller; },
  setSendButtonMode,
});
configureChatOnboarding({
  closeChatPanel,
  renderChatMessages,
  sendChatMessage,
  setChatNudge,
  updateChatNudge,
});
configureChatPanel({ restoreDiscussionContinuePrompt });

Object.assign(window, {
  _resumeAI,
  isChatStreaming,
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
  startOnboardingLabImport,
  requestOnboardingLabImportProvider,
  sendChatMessage,
  handleChatKeydown,
  startDiscussion,
  startDiscussionFromPicker,
  continueDiscussion,
  endDiscussion,
  editCustomPersonality,
  showDiscussContinuePrompt,
  restoreDiscussionContinuePrompt,
  cleanupDiscussionState,
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
  setProviderQuizBranch,
  backToProviderQuiz,
  skipProviderSetup,
  skipOnboardingExtras,
  showCycleNoMensesOptions,
  showCyclePeriodEntry,
  saveCycleStatus,
  _updatePeriodBtn,
  onContextCardSaved,
});
