// chat-empty-state.js — chat empty states and onboarding message HTML

import { state } from './state.js';
import { hasAIProvider, isAIPaused } from './api.js';
import { getActiveData } from './data.js';
import { getProfileLocation, getProfiles } from './profile.js';
import { renderProfileContextCards } from './context-cards.js';
import { escapeHTML, hasCardContent } from './utils.js';
import { getActivePersonality } from './chat-personalities.js';
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

export function renderEmptyChatState(container, panel) {
  const context = getEmptyChatContext();

  if (!context.hasProfile) return renderProfileOnboardingState(container, panel, context);
  if (isAIPaused()) return renderAIPausedState(container, panel, context);
  if (shouldRenderProviderSetup()) return renderProviderSetupState(container, panel, context);

  const filled = _countFilledCards();
  const extrasDone = localStorage.getItem(`labcharts-onboard-extras-done-${state.currentProfile}`);

  if (!context.hasData && !extrasDone) return renderOptionalContextState(container, panel, context);
  if (filled >= 9 && !context.hasData) return renderFullContextNoDataState(container, panel, context);
  if (!context.hasData && filled > 0) return renderPartialContextNoDataState(container, panel, context, filled);
  if (!context.hasData) return renderInitialNoDataState(container, panel, context);
  if (filled < 3) return renderDataContextNudgeState(container, context);

  return renderGeneralPromptState(container, context);
}

function getEmptyChatContext() {
  const personality = getActivePersonality();
  const hasData = state.importedData?.entries?.length > 0;
  const currentP = getProfiles().find(p => p.id === state.currentProfile);
  const hasProfile = Boolean(currentP?.name && currentP.name !== 'Default' && state.profileSex);
  const name = currentP?.name || 'there';

  return { personality, hasData, currentP, hasProfile, name };
}

function setOnboardingActive(panel) {
  panel?.classList.add('chat-onboarding-active');
}

function shouldRenderProviderSetup() {
  const providerRequested = sessionStorage.getItem(`chat-onboard-provider-requested-${state.currentProfile}`) === '1';
  return !hasAIProvider() && providerRequested;
}

function renderProfileOnboardingState(container, panel, { personality, currentP }) {
  setOnboardingActive(panel);
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
  return true;
}

function renderAIPausedState(container, panel, { personality, name }) {
  setOnboardingActive(panel);
  container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
    <div class="chat-msg chat-ai">
      <p>${escapeHTML(name)}, AI features are currently paused. Turn them back on to chat, get insights, and import PDFs with AI.</p>
      <div style="margin-top:12px">
        <button class="import-btn import-btn-primary" onclick="window._resumeAI()">Enable AI</button>
      </div>
    </div>`;
  return true;
}

function renderProviderSetupState(container, panel, { personality, name }) {
  setOnboardingActive(panel);
  const branch = sessionStorage.getItem(`chat-onboard-provider-branch-${state.currentProfile}`) || '';
  container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
    <div class="chat-msg chat-ai">
      ${_renderOnboardCrumbs(2)}
      ${_renderProviderQuiz(branch, name)}
    </div>`;
  return true;
}

function renderOptionalContextState(container, panel, { personality }) {
  setOnboardingActive(panel);
  const cards = buildOptionalContextTaskCards();
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
  return true;
}

function buildOptionalContextTaskCards() {
  const isFemale = state.profileSex === 'female';
  const mc = state.importedData?.menstrualCycle;
  const hasCycle = mc?.periods?.length > 0 || mc?.cycleLength || mc?.cycleStatus;
  const supps = state.importedData.supplements || [];
  const genetics = state.importedData.genetics || {};
  const hasSnps = Object.keys(genetics.snps || {}).length > 0;
  const hasMtdna = !!genetics.mtdna;
  const wearableConns = state.importedData?.wearableConnections || {};
  const hasWearable = Object.values(wearableConns).some(c => c?.accessToken || c?.connectedSince);
  const suppSummary = summarizeSupplements(supps);
  const dnaSummary = summarizeGenetics(genetics, hasSnps, hasMtdna);

  return [
    isFemale ? renderCycleTask(hasCycle) : '',
    renderSupplementsTask(supps, suppSummary),
    renderGeneticsTask(hasSnps, hasMtdna, dnaSummary),
    hasWearable ? '' : renderWearableTask(),
  ].filter(Boolean).join('');
}

function summarizeSupplements(supps) {
  return supps.length
    ? supps.slice(0, 2).map(s => `${s.name}${s.dosage ? ` ${s.dosage}` : ''}`).join(', ') + (supps.length > 2 ? ` +${supps.length - 2}` : '')
    : 'Add medications or supplements that can shift labs.';
}

function summarizeGenetics(genetics, hasSnps, hasMtdna) {
  return [
    hasSnps ? `${Object.keys(genetics.snps || {}).length} SNPs` : '',
    hasMtdna ? `mtDNA ${genetics.mtdna?.haplogroup || ''}`.trim() : '',
  ].filter(Boolean).join(' · ') || 'Optional: import DNA context when you have it.';
}

function renderCycleTask(hasCycle) {
  return `<article class="chat-onboard-task${hasCycle ? ' is-complete' : ''}">
    <span class="chat-onboard-task-icon" aria-hidden="true">◐</span>
    <span class="chat-onboard-task-body">
      <strong>Cycle context</strong>
      <small>${hasCycle ? 'Cycle tracking is already set.' : 'Helps interpret hormones, iron, and inflammation.'}</small>
    </span>
    <button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.openMenstrualCycleEditor?.()">${hasCycle ? 'Edit' : 'Set up'}</button>
  </article>`;
}

function renderSupplementsTask(supps, suppSummary) {
  return `<article class="chat-onboard-task${supps.length ? ' is-complete' : ''}">
    <span class="chat-onboard-task-icon" aria-hidden="true">Rx</span>
    <span class="chat-onboard-task-body">
      <strong>Supplements &amp; meds</strong>
      <small>${escapeHTML(suppSummary)}</small>
    </span>
    <button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.openSupplementsEditor?.()">${supps.length ? 'Edit' : 'Add'}</button>
  </article>`;
}

function renderGeneticsTask(hasSnps, hasMtdna, dnaSummary) {
  return `<article class="chat-onboard-task chat-onboard-dna${hasSnps || hasMtdna ? ' is-complete' : ''}">
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
  </article>`;
}

function renderWearableTask() {
  return `<article class="chat-onboard-task">
    <span class="chat-onboard-task-icon" aria-hidden="true">HRV</span>
    <span class="chat-onboard-task-body">
      <strong>Wearables</strong>
      <small>Optional HRV, sleep, recovery, and body composition trends.</small>
    </span>
    <button type="button" class="chat-onboard-mini-btn" onclick="event.stopPropagation();closeChatPanel();window.openSettingsModal('wearables')">Connect</button>
  </article>`;
}

function renderFullContextNoDataState(container, panel, { personality, name }) {
  setOnboardingActive(panel);
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
  return true;
}

function renderPartialContextNoDataState(container, panel, { personality, name }, filled) {
  setOnboardingActive(panel);
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
  return true;
}

function renderInitialNoDataState(container, panel, { personality, name }) {
  setOnboardingActive(panel);
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
  return true;
}

function renderDataContextNudgeState(container, { personality }) {
  container.innerHTML = `<div class="chat-persona-label">${personality.icon} ${escapeHTML(personality.name)}</div>
    <div class="chat-msg chat-ai">
      <p>I can see your lab results — nice! 👋 I can already analyze these, but if you fill in a few lifestyle cards I'll give you much more personalized insights.</p>
      <div class="chat-onboard-actions">
        <button class="chat-prompt-btn" onclick="window.setOnboardingFocus('cards')">📋 Fill in lifestyle cards</button>
        <button class="chat-prompt-btn" onclick="useChatPrompt('What are my most concerning results?')">Analyze my results now</button>
      </div>
    </div>`;
  return true;
}

function renderGeneralPromptState(container, { personality }) {
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
      ${prompts.map(p => `<button class="chat-prompt-btn" onclick="useChatPrompt('${escapeHTML(p)}')">${escapeHTML(p)}</button>`).join('\n      ')}
    </div>
  </div>`;
  return true;
}
