// chat.js — AI chat panel, markdown rendering, personalities, conversation threads

import { state } from './state.js';
import { CHAT_SYSTEM_PROMPT, LATITUDE_BANDS } from './constants.js';
import { calculateCost, formatCost, trackUsage } from './schema.js';
import { escapeHTML, showNotification, formatValue, getStatus, hasCardContent } from './utils.js';
import { getActiveData, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, saveImportedData } from './data.js';
import { getProfileLocation, setProfileLocation, getLatitudeFromLocation, getLocationCache, latitudeToBand, detectLatitudeWithAI, getProfiles, renameProfile, setProfileSex, setProfileDob } from './profile.js';
import { callClaudeAPI, hasAIProvider, isAIPaused, setAIPaused, getAIProvider, getActiveModelId, getActiveModelDisplay, supportsWebSearch, isVeniceE2EEActive } from './api.js';
import { formatImageBlock, buildVisionContent } from './image-utils.js';
import { getPendingAttachments, hasPendingAttachments, clearAttachments } from './chat-images.js';
import {
  createNewThread, autoNameThread, getChatThreadKey, getChatThreadsKey,
} from './chat-threads.js';
import { buildLabContext, getContextSummary, injectLensChunks } from './lab-context.js';
import { hasLens, queryLensMulti } from './lens.js';
import { applyInlineMarkdown, renderMarkdown } from './markdown.js';
import { renderProfileContextCards } from './context-cards.js';
import { setIconButtonContent } from './chat-icons.js';
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
  const panel = document.getElementById('chat-panel');
  panel?.classList.remove('chat-onboarding-active');

  // ── Onboarding flow: conversational chat bubbles guide through setup ──
  if (state.chatHistory.length === 0) {
    const personality = getActivePersonality();
    const hasData = state.importedData?.entries?.length > 0;
    const currentP = getProfiles().find(p => p.id === state.currentProfile);
    const hasProfile = currentP?.name && currentP.name !== 'Default' && state.profileSex;

    // Stage 1: No profile — ask name/sex/DOB/location
    if (!hasProfile) {
      panel?.classList.add('chat-onboarding-active');
      const pName = (currentP?.name && currentP.name !== 'Default') ? currentP.name : '';
      const pSex = state.profileSex || '';
      const pDob = state.profileDob || '';
      const pLoc = getProfileLocation(state.currentProfile);
      const _pH = window.getProfileHeight ? window.getProfileHeight(state.currentProfile) : { height: null, unit: 'cm' };
      const pHeight = _pH.height ? (_pH.unit === 'in' ? (_pH.height / 2.54).toFixed(1) : _pH.height) : '';
      const pHeightUnit = _pH.unit || 'cm';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          ${_renderOnboardCrumbs(1)}
          <p>Hey! 👋 I'll be your AI health analyst — I help you understand blood work, track trends, and spot what matters. First, tell me a bit about yourself:</p>
          <div class="chat-onboard-form">
            <div class="chat-onboard-row">
              <label class="chat-onboard-label" for="chat-onboard-name">Name</label>
              <input type="text" class="chat-onboard-input" id="chat-onboard-name" placeholder="your name" value="${escapeHTML(pName)}" onchange="window.saveChatProfile()">
            </div>
            <div class="chat-onboard-row">
              <span class="chat-onboard-label" id="chat-onboard-sex-label">Sex</span>
              <div class="chat-onboard-sex" role="group" aria-labelledby="chat-onboard-sex-label">
                <button class="welcome-sex-btn${pSex === 'male' ? ' active' : ''}" onclick="window.setChatProfileSex('male')">Male</button>
                <button class="welcome-sex-btn${pSex === 'female' ? ' active' : ''}" onclick="window.setChatProfileSex('female')">Female</button>
              </div>
            </div>
            <div class="chat-onboard-row">
              <label class="chat-onboard-label" for="chat-onboard-dob">Born</label>
              <input type="date" class="chat-onboard-input" id="chat-onboard-dob" value="${escapeHTML(pDob)}" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}">
            </div>
            <details class="chat-onboard-more">
              <summary>Optional body and location context</summary>
              <div class="chat-onboard-more-body">
                <div class="chat-onboard-row">
                  <label class="chat-onboard-label" for="chat-onboard-height">Height</label>
                  <div class="chat-onboard-input-with-unit">
                    <input type="number" class="chat-onboard-input" id="chat-onboard-height" placeholder="cm" step="0.1" value="${pHeight || ''}">
                    <select class="chat-onboard-input chat-onboard-unit-select" id="chat-onboard-height-unit" aria-label="Height unit" onchange="window.onboardHeightUnitChanged()">
                      <option value="cm"${pHeightUnit !== 'in' ? ' selected' : ''}>cm</option>
                      <option value="in"${pHeightUnit === 'in' ? ' selected' : ''}>in</option>
                    </select>
                  </div>
                </div>
                <div class="chat-onboard-row">
                  <label class="chat-onboard-label" for="chat-onboard-weight">Weight</label>
                  <div class="chat-onboard-input-with-unit">
                    <input type="number" class="chat-onboard-input" id="chat-onboard-weight" placeholder="kg" step="0.1">
                    <select class="chat-onboard-input chat-onboard-unit-select" id="chat-onboard-weight-unit" aria-label="Weight unit">
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>
                </div>
                <div class="chat-onboard-row">
                  <label class="chat-onboard-label" for="chat-onboard-country">Location</label>
                  <input type="text" class="chat-onboard-input" id="chat-onboard-country" placeholder="e.g. Germany" value="${escapeHTML(pLoc.country || '')}" oninput="window.saveChatLocation()">
                </div>
                <div id="chat-onboard-lat" class="chat-onboard-lat"></div>
                <div class="chat-onboard-help">Latitude affects vitamin D, circadian rhythm, and seasonal health patterns.</div>
              </div>
            </details>
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
      panel?.classList.add('chat-onboarding-active');
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

    // Provider setup is explicit. Fresh profiles continue into context
    // collection first; the quiz appears only when the user asks to connect AI.
    const providerRequested = sessionStorage.getItem(`chat-onboard-provider-requested-${state.currentProfile}`) === '1';
    if (!hasAIProvider() && providerRequested) {
      panel?.classList.add('chat-onboarding-active');
      const name = currentP?.name || 'there';
      const branch = sessionStorage.getItem(`chat-onboard-provider-branch-${state.currentProfile}`) || '';
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          ${_renderOnboardCrumbs(2)}
          ${_renderProviderQuiz(branch, name)}
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
      panel?.classList.add('chat-onboarding-active');
      const genetics = state.importedData.genetics || {};
      const hasSnps = Object.keys(genetics.snps || {}).length > 0;
      const hasMtdna = !!genetics.mtdna;
      const wearableConns = state.importedData?.wearableConnections || {};
      const hasWearable = Object.values(wearableConns).some(c => c?.accessToken || c?.connectedSince);
      const suppSummary = supps.length
        ? supps.slice(0, 2).map(s => `${s.name}${s.dosage ? ` ${s.dosage}` : ''}`).join(', ') + (supps.length > 2 ? ` +${supps.length - 2}` : '')
        : 'Add medications or supplements that can shift labs.';
      const dnaSummary = [
        hasSnps ? `${Object.keys(genetics.snps || {}).length} SNPs` : '',
        hasMtdna ? `mtDNA ${genetics.mtdna?.haplogroup || ''}`.trim() : '',
      ].filter(Boolean).join(' · ') || 'Optional: import DNA context when you have it.';
      const cards = [
        isFemale ? `<article class="chat-onboard-task${hasCycle ? ' is-complete' : ''}">
          <span class="chat-onboard-task-icon" aria-hidden="true">◐</span>
          <span class="chat-onboard-task-body">
            <strong>Cycle context</strong>
            <small>${hasCycle ? 'Cycle tracking is already set.' : 'Helps interpret hormones, iron, and inflammation.'}</small>
          </span>
          <button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.openMenstrualCycleEditor?.()">${hasCycle ? 'Edit' : 'Set up'}</button>
        </article>` : '',
        `<article class="chat-onboard-task${supps.length ? ' is-complete' : ''}">
          <span class="chat-onboard-task-icon" aria-hidden="true">Rx</span>
          <span class="chat-onboard-task-body">
            <strong>Supplements &amp; meds</strong>
            <small>${escapeHTML(suppSummary)}</small>
          </span>
          <button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.openSupplementsEditor?.()">${supps.length ? 'Edit' : 'Add'}</button>
        </article>`,
        `<article class="chat-onboard-task chat-onboard-dna${hasSnps || hasMtdna ? ' is-complete' : ''}">
          <span class="chat-onboard-task-icon" aria-hidden="true">DNA</span>
          <span class="chat-onboard-task-body">
            <strong>Genetics</strong>
            <small>${escapeHTML(dnaSummary)}</small>
          </span>
          <span class="chat-onboard-mini-actions">
            ${!hasSnps ? `<button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.triggerDNAFilePicker?.()">Import</button>` : ''}
            ${!hasMtdna ? `<button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();const input=document.getElementById('mtdna-onboard-input');closeChatPanel();input?.click()">mtDNA</button>
            <input type="file" id="mtdna-onboard-input" class="sr-only" accept=".txt,.csv" onchange="if(this.files[0]){window.handleMtDNAFile?.(this.files[0]);this.value=''}">` : ''}
            ${hasSnps && hasMtdna ? `<button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.triggerDNAFilePicker?.()">Re-import</button>` : ''}
          </span>
        </article>`,
        hasWearable ? '' : `<article class="chat-onboard-task">
          <span class="chat-onboard-task-icon" aria-hidden="true">HRV</span>
          <span class="chat-onboard-task-body">
            <strong>Wearables</strong>
            <small>Optional HRV, sleep, recovery, and body composition trends.</small>
          </span>
          <button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.openSettingsModal('wearables')">Connect</button>
        </article>`,
      ].filter(Boolean).join('');
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          ${_renderOnboardCrumbs(3)}
          <p>${hasAIProvider() ? 'Great, we are connected.' : 'Nice. We can collect useful context first and connect AI when recommendations or AI imports need it.'} These optional context pieces make later interpretation more useful, but you can skip them and import labs now.</p>
          <div class="chat-onboard-task-grid">${cards}</div>
          <div class="chat-onboard-note">You can change all of this later from the dashboard, settings, or client profile.</div>
          <div class="chat-onboard-actions chat-onboard-actions-row">
            <button class="chat-onboard-cta" onclick="window.skipOnboardingExtras()">Continue to import</button>
            <button class="chat-prompt-btn" onclick="window.skipOnboardingExtras()">Skip optional setup</button>
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3a: All 9 cards filled, no data — full picture
    if (filled >= 9 && !hasData) {
      panel?.classList.add('chat-onboarding-active');
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          ${_renderOnboardCrumbs(4)}
          <p>${escapeHTML(name)}, you filled everything in — I have a really complete picture of your lifestyle now. ${hasAIProvider() ? 'Even without lab data, I can already help:' : 'Import your labs or connect an AI provider to get personalized insights.'}</p>
          <div class="chat-onboard-actions">
            ${hasAIProvider()
              ? `<button class="chat-prompt-btn" onclick="useChatPrompt('Based on my full profile, what blood tests should I get and why?')">What tests should I get?</button>
                 <button class="chat-prompt-btn" onclick="useChatPrompt('What can you tell about my health from my lifestyle info?')">Analyze my lifestyle</button>`
              : `<button class="chat-onboard-cta" onclick="window.requestOnboardingLabImportProvider()">Connect AI to import labs</button>
                 <button class="chat-prompt-btn" onclick="window.openChatProviderQuiz()">Connect AI for recommendations</button>`}
          </div>
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3b: No data, some cards filled — show progress, encourage more
    if (!hasData && filled > 0) {
      panel?.classList.add('chat-onboarding-active');
      const remaining = 9 - filled;
      const progressPct = Math.round((filled / 9) * 100);
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          ${_renderOnboardCrumbs(4)}
          <p>${filled >= 6 ? `Almost there, ${escapeHTML(name)}!` : filled >= 3 ? `Nice progress, ${escapeHTML(name)}!` : `Good start, ${escapeHTML(name)}!`} You've filled ${filled} of 9 context areas.</p>
          <div class="chat-onboard-progress"><div class="chat-onboard-progress-bar" style="width:${progressPct}%"></div></div>
          <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">The more context I have, the better I can interpret results and recommend what to test. Everything is optional.</p>
          <div class="chat-onboard-actions">
            ${hasAIProvider()
              ? `<button class="chat-onboard-cta" onclick="useChatPrompt('Help me finish the remaining health context. Ask me one question at a time.')">Continue in chat - ${remaining} area${remaining !== 1 ? 's' : ''} left</button>
                 <button class="chat-prompt-btn" onclick="useChatPrompt('Based on what you know about me so far, what blood tests should I get?')">Skip ahead - recommend tests</button>`
              : `<button class="chat-onboard-cta" onclick="document.querySelector('.chat-context-cards')?.scrollIntoView({behavior:'smooth',block:'start'})">Continue context cards</button>
                 <button class="chat-prompt-btn" onclick="window.openChatProviderQuiz()">Connect AI for recommendations</button>`}
          </div>
          ${!hasAIProvider() ? `<div class="chat-context-cards">${renderProfileContextCards()}</div>` : ''}
        </div>`;
      updateDiscussButton();
      return;
    }

    // 3c: No data, no cards — initial prompt
    if (!hasData) {
      panel?.classList.add('chat-onboarding-active');
      container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
        <div class="chat-msg chat-ai">
          ${_renderOnboardCrumbs(4)}
          <p>You're ready to go, ${escapeHTML(name)}. Tell me what you have or what you want to understand, and I'll guide the next step.</p>
          <p style="font-size:13px;margin:4px 0"><strong>Have lab results?</strong> ${hasAIProvider() ? "Import them directly and I'll build the dashboard." : 'Connect AI first for lab PDFs or photos. JSON and DNA files can still be imported from the header.'}</p>
          <p style="font-size:13px;margin:4px 0"><strong>No labs yet?</strong> ${hasAIProvider() ? 'I can ask for the useful context here and recommend what to test first.' : 'Add useful context below, then connect AI when you want recommendations.'}</p>
          <div class="chat-onboard-actions">
            ${hasAIProvider()
              ? `<button class="chat-onboard-cta" onclick="window.startOnboardingLabImport()">Import a lab file</button>
                 <button class="chat-onboard-cta" onclick="useChatPrompt('Help me build my health context before labs. Ask me one question at a time.')">Build my context in chat</button>
                 <button class="chat-prompt-btn" onclick="useChatPrompt('I don\\'t have any labs yet. Based on my profile, what blood tests should I get and why?')">Just tell me what to test</button>`
              : `<button class="chat-onboard-cta" onclick="window.requestOnboardingLabImportProvider()">Connect AI to import labs</button>
                 <button class="chat-onboard-cta" onclick="document.querySelector('.chat-context-cards')?.scrollIntoView({behavior:'smooth',block:'start'})">Add context below</button>
                 <button class="chat-prompt-btn" onclick="window.openChatProviderQuiz()">Connect AI when ready</button>`}
          </div>
          ${!hasAIProvider() ? `<div class="chat-context-cards">${renderProfileContextCards()}</div>` : ''}
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
            <button class="chat-prompt-btn" onclick="window.setOnboardingFocus('cards')">📋 Fill in lifestyle cards</button>
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
    if (msg.role === 'assistant' && msg.truncated) html += responseLimitNote();
    if (msg.role === 'assistant') {
      if (msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens)) {
        const mId = msg.modelId || getActiveModelId();
        const mProvider = msg.provider || (msg.modelId ? (msg.modelId.includes('/') ? 'openrouter' : getAIProvider()) : getAIProvider());
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
  updateChatInputState();
}

export function useChatPrompt(text) {
  if (!hasAIProvider()) {
    showNotification('Connect an AI provider first — open Settings → AI to set one up.', 'info');
    return;
  }
  const input = document.getElementById('chat-input');
  if (input) { input.value = text; sendChatMessage(); }
}

export function requestOnboardingLabImportProvider() {
  showNotification('Lab PDFs and photos need an AI provider first. Connect AI, then import the file.', 'info');
  if (window.openChatProviderQuiz) {
    window.openChatProviderQuiz();
    return;
  }
  sessionStorage.setItem(`chat-onboard-provider-requested-${state.currentProfile}`, '1');
  renderChatMessages();
}

export function startOnboardingLabImport() {
  if (isAIPaused()) {
    showNotification('AI features are paused. Re-enable AI to import lab PDFs or report photos.', 'info');
    closeChatPanel();
    window.openSettingsModal?.('ai');
    return;
  }
  if (!hasAIProvider()) {
    requestOnboardingLabImportProvider();
    return;
  }
  const input = document.getElementById('pdf-input');
  if (!input) {
    showNotification('Import control is not available on this screen.', 'error');
    return;
  }
  closeChatPanel();
  input.value = '';
  input.click();
}

// ═══════════════════════════════════════════════
// MARKDOWN — extracted to js/markdown.js
// ═══════════════════════════════════════════════

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
    const inDashboardCycleWidget = !!el.closest('.dashboard-widget[data-widget-id="cycle"]');
    el.outerHTML = window.renderMenstrualCycleSection(
      window.getActiveData(),
      inDashboardCycleWidget ? { variant: 'dashboard', showHeader: false } : {}
    );
  } else if (!el && state.profileSex === 'female' && window.renderMenstrualCycleSection) {
    // Cycle section doesn't exist yet — insert it after context cards
    const supps = document.querySelector('.supp-timeline-section');
    if (supps) supps.insertAdjacentHTML('beforebegin', window.renderMenstrualCycleSection(window.getActiveData()));
  }
}

// Thin progress strip shown at the top of each onboarding chat message.
// 4 steps: 1) profile, 2) AI setup, 3) extras (cycle/supplements), 4) cards
// + import. The dots make the funnel feel finite — a wall of unknown
// length is a big drop-off driver for non-tech users.
function _renderOnboardCrumbs(currentStep, totalSteps = 4) {
  const dots = Array.from({ length: totalSteps }, (_, i) => `<span class="chat-onboard-crumb${i + 1 <= currentStep ? ' active' : ''}"></span>`).join('');
  return `<div class="chat-onboard-crumbs" aria-label="Onboarding step ${currentStep} of ${totalSteps}">
    <span class="chat-onboard-crumbs-label">Step ${currentStep} of ${totalSteps}</span>
    <span class="chat-onboard-crumbs-dots" aria-hidden="true">${dots}</span>
  </div>`;
}

// Provider quiz — 4 plain-language branches replace the 5-card jargon grid.
// Branch state lives in sessionStorage so a tab refresh mid-flow doesn't
// drop the user back at the root (deliberately *not* localStorage — a new
// session starts fresh).
function _renderProviderQuiz(branch, name) {
  const safeName = escapeHTML(name);
  if (branch === 'card') {
    return `<button class="chat-quiz-back" onclick="window.backToProviderQuiz()" aria-label="Back to provider options">&larr; Back</button>
      <p><strong>Pay with a card &rarr; OpenRouter</strong></p>
      <p style="font-size:13px">Click below &mdash; log in with Google or email, top up with your card, you&rsquo;re done. You&rsquo;ll come right back here.</p>
      <button class="or-oauth-btn" onclick="startOpenRouterOAuth()">Connect with OpenRouter</button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">
        <a href="#" onclick="event.preventDefault();closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('openrouter')},300)" style="color:var(--text-muted)">or paste a key manually</a>
      </div>`;
  }
  if (branch === 'local') {
    return `<button class="chat-quiz-back" onclick="window.backToProviderQuiz()" aria-label="Back to provider options">&larr; Back</button>
      <p><strong>Runs on your computer &rarr; Local AI</strong></p>
      <p style="font-size:13px">Install <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--accent)">Ollama</a>, <a href="https://lmstudio.ai" target="_blank" rel="noopener" style="color:var(--accent)">LM Studio</a>, or <a href="https://jan.ai" target="_blank" rel="noopener" style="color:var(--accent)">Jan</a> on your computer &mdash; they run AI models locally. Nothing leaves your machine, free forever. After install, point getbased at it.</p>
      <button class="chat-setup-btn" onclick="closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('ollama')},300)">Open Local AI setup &rarr;</button>`;
  }
  if (branch === 'bitcoin') {
    return `<button class="chat-quiz-back" onclick="window.backToProviderQuiz()" aria-label="Back to provider options">&larr; Back</button>
      <p><strong>Pay with Bitcoin &rarr; 2 options</strong></p>
      <div class="chat-quiz-options" style="margin-top:8px">
        <button class="chat-quiz-option" onclick="closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('routstr')},300)">
          <span class="chat-quiz-body">
            <strong>Routstr</strong>
            <span>Lightning + Cashu eCash. No account. Top up with a QR code.</span>
          </span>
          <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button class="chat-quiz-option" onclick="closeChatPanel();setTimeout(()=>{window.openSettingsModal('ai');window.switchAIProvider('ppq')},300)">
          <span class="chat-quiz-body">
            <strong>PPQ</strong>
            <span>300+ models. Pay with BTC, Lightning, Monero, or Litecoin.</span>
          </span>
          <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </div>`;
  }
  // Root question
  return `<p>Welcome, ${safeName}! One more step &mdash; pick how you want to power the AI:</p>
    <div class="chat-quiz-options">
      <button class="chat-quiz-option chat-quiz-recommended" onclick="window.setProviderQuizBranch('card')">
        <span class="chat-quiz-icon" aria-hidden="true">&#128179;</span>
        <span class="chat-quiz-body">
          <strong>Easiest &mdash; pay with a card</strong>
          <span>One-click login. <em class="chat-quiz-rec">Recommended</em></span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button class="chat-quiz-option" onclick="window.setProviderQuizBranch('local')">
        <span class="chat-quiz-icon" aria-hidden="true">&#128274;</span>
        <span class="chat-quiz-body">
          <strong>Most private &mdash; runs on my computer</strong>
          <span>No internet calls, free forever. Needs a desktop app.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button class="chat-quiz-option" onclick="window.setProviderQuizBranch('bitcoin')">
        <span class="chat-quiz-icon" aria-hidden="true">&#8383;</span>
        <span class="chat-quiz-body">
          <strong>No account &mdash; pay with Bitcoin</strong>
          <span>Anonymous. Top up with sats or eCash.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button class="chat-quiz-option" onclick="closeChatPanel();setTimeout(()=>window.openSettingsModal('ai'),300)">
        <span class="chat-quiz-icon" aria-hidden="true">&#128273;</span>
        <span class="chat-quiz-body">
          <strong>Advanced: I have an API key</strong>
          <span>Skip ahead to AI settings to paste it.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
    </div>
    <div class="chat-quiz-skip">
      <button class="chat-quiz-skip-btn" onclick="window.skipProviderSetup()">Try the app first &mdash; I&rsquo;ll connect AI later</button>
    </div>`;
}

export function setProviderQuizBranch(branch) {
  sessionStorage.setItem(`chat-onboard-provider-requested-${state.currentProfile}`, '1');
  sessionStorage.setItem(`chat-onboard-provider-branch-${state.currentProfile}`, branch);
  renderChatMessages();
}

export function backToProviderQuiz() {
  sessionStorage.setItem(`chat-onboard-provider-requested-${state.currentProfile}`, '1');
  sessionStorage.removeItem(`chat-onboard-provider-branch-${state.currentProfile}`);
  renderChatMessages();
}

export function skipProviderSetup() {
  localStorage.setItem(`labcharts-onboard-provider-skipped-${state.currentProfile}`, '1');
  sessionStorage.removeItem(`chat-onboard-provider-requested-${state.currentProfile}`);
  sessionStorage.removeItem(`chat-onboard-provider-branch-${state.currentProfile}`);
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
