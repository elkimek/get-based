// chat-render.js — chat empty states, onboarding message HTML, and transcript rendering

import { state } from './state.js';
import { calculateCost, formatCost } from './schema.js';
import { escapeHTML, hasCardContent } from './utils.js';
import { getActiveData } from './data.js';
import { getProfileLocation, getProfiles } from './profile.js';
import {
  getAIProvider, getActiveModelDisplay, getActiveModelId, hasAIProvider,
  isAIPaused,
} from './api.js';
import { renderMarkdown } from './markdown.js';
import { renderProfileContextCards } from './context-cards.js';
import { buildActionBar } from './chat-actions.js';
import { responseLimitNote } from './chat-continuation.js';
import { e2eeLockFootnote } from './chat-attestation.js';
import { getActivePersonality, updateChatHeaderTitle } from './chat-personalities.js';
import { updateChatInputState } from './chat-panel.js';
import { updateDiscussButton } from './chat-discussion.js';
import {
  _countFilledCards, _renderOnboardCrumbs, _renderProviderQuiz,
  _updateOnboardNextBtn, saveChatLocation,
} from './chat-onboarding.js';

export function _getNoDataPrompts() {
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
export function _renderLensSources(chunks, sourceName) {
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
