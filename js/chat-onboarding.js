// @ts-check
// chat-onboarding.js — Chat-first onboarding handlers and render helpers

import { state } from './state.js';
import { LATITUDE_BANDS } from './constants.js';
import { escapeAttr, escapeHTML, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import {
  appendImportedArrayItem,
  deleteImportedArrayItem,
} from './data-merge.js';
import {
  detectLatitudeWithAI, getLatitudeFromLocation, getLocationCache,
  latitudeToBand, renameProfile, setProfileDob, setProfileLocation,
  setProfileSex,
} from './profile.js';
import { hasAIProvider, isAIPaused } from './api.js';

/** @type {{
 *   closeChatPanel: () => void,
 *   getActiveData: () => any,
 *   navigate: (route: string, data?: any) => void,
 *   openChatProviderQuiz: null | (() => void),
 *   openSettingsModal: (tab?: string) => void,
 *   recordChange: (field: string) => void,
 *   renderChatMessages: () => void,
 *   renderMenstrualCycleSection: null | ((data: any, opts?: any) => string),
 *   renderProfileButton: () => void,
 *   renderSupplementsSection: null | (() => string),
 *   sendChatMessage: () => void,
 *   setChatNudge: (mode?: string) => void,
 *   setProfileHeight: null | ((profileId: string, height: number, unit: string) => Promise<boolean> | boolean | void),
 *   startOpenRouterOAuth: () => void,
 *   switchAIProvider: (provider: string) => void,
 *   updateChatNudge: () => void,
 * }} */
const onboardingCallbacks = {
  closeChatPanel: () => {},
  getActiveData: () => state.importedData,
  navigate: () => {},
  openChatProviderQuiz: null,
  openSettingsModal: () => {},
  recordChange: () => {},
  renderChatMessages: () => {},
  renderMenstrualCycleSection: null,
  renderProfileButton: () => {},
  renderSupplementsSection: null,
  sendChatMessage: () => {},
  setChatNudge: () => {},
  setProfileHeight: null,
  startOpenRouterOAuth: () => {},
  switchAIProvider: () => {},
  updateChatNudge: () => {},
};

let chatOnboardingDelegatesInstalled = false;
const CHAT_ONBOARDING_SETTING_PROVIDERS = new Set(['openrouter', 'ollama', 'routstr', 'ppq']);

export function chatOnboardingActionAttrs(action, attrs = {}) {
  return [
    `data-chat-onboarding-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-chat-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function isChatOnboardingActionScope(actionEl) {
  return !!actionEl.closest('#chat-panel, .chat-provider-quiz');
}

function openAiSettings() {
  clearForcedOnboardingStep();
  closeChatPanel();
  setTimeout(() => {
    openSettingsModal('ai');
  }, 300);
}

function openAiProviderSettings(provider) {
  clearForcedOnboardingStep();
  closeChatPanel();
  setTimeout(() => {
    openSettingsModal('ai');
    if (CHAT_ONBOARDING_SETTING_PROVIDERS.has(provider)) switchAIProvider(provider);
  }, 300);
}

function handleChatOnboardingClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-chat-onboarding-action]'));
  if (!actionEl || !isChatOnboardingActionScope(actionEl)) return;
  const action = actionEl.dataset.chatOnboardingAction || '';
  event.preventDefault();

  if (action === 'back-to-provider-quiz') {
    backToProviderQuiz();
  } else if (action === 'start-openrouter-oauth') {
    clearForcedOnboardingStep();
    startOpenRouterOAuth();
  } else if (action === 'open-ai-settings') {
    openAiSettings();
  } else if (action === 'open-provider-settings') {
    openAiProviderSettings(actionEl.dataset.chatProvider || '');
  } else if (action === 'set-provider-branch') {
    setProviderQuizBranch(actionEl.dataset.chatProviderBranch || '');
  } else if (action === 'start-file-import') {
    startOnboardingFileImport();
  } else if (action === 'skip-provider-setup') {
    skipProviderSetup();
  } else if (action === 'go-onboarding-step') {
    goToOnboardingStep(Number(actionEl.dataset.chatStep || ''));
  }
}

function initChatOnboardingDelegates() {
  if (chatOnboardingDelegatesInstalled || typeof document === 'undefined') return;
  chatOnboardingDelegatesInstalled = true;
  document.addEventListener('click', handleChatOnboardingClick);
}

/** @param {Partial<typeof onboardingCallbacks>} [callbacks] */
export function configureChatOnboarding(callbacks = {}) {
  Object.assign(onboardingCallbacks, callbacks);
}

/** @param {string} id */
function textControlById(id) {
  return /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
}

/** @param {string} id */
function inputById(id) {
  return /** @type {HTMLInputElement | null} */ (document.getElementById(id));
}

/** @param {string} id */
function selectById(id) {
  return /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
}

/** @param {string} id */
function buttonById(id) {
  return /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
}

function closeChatPanel() {
  onboardingCallbacks.closeChatPanel?.();
}

function getActiveData() {
  return onboardingCallbacks.getActiveData?.() || state.importedData;
}

function navigate(route, data) {
  onboardingCallbacks.navigate?.(route, data);
}

function openChatProviderQuiz() {
  if (typeof onboardingCallbacks.openChatProviderQuiz !== 'function') return false;
  onboardingCallbacks.openChatProviderQuiz();
  return true;
}

function openSettingsModal(tab) {
  onboardingCallbacks.openSettingsModal?.(tab);
}

function recordChange(field) {
  onboardingCallbacks.recordChange?.(field);
}

function renderChatMessages() {
  onboardingCallbacks.renderChatMessages?.();
}

function renderMenstrualCycleSection(data, opts) {
  return onboardingCallbacks.renderMenstrualCycleSection?.(data, opts) || '';
}

function renderProfileButton() {
  onboardingCallbacks.renderProfileButton?.();
}

function renderSupplementsSection() {
  return onboardingCallbacks.renderSupplementsSection?.() || '';
}

function sendChatMessage() {
  onboardingCallbacks.sendChatMessage?.();
}

function setChatNudge(mode) {
  onboardingCallbacks.setChatNudge?.(mode);
}

async function setProfileHeight(profileId, height, unit) {
  if (!onboardingCallbacks.setProfileHeight) return false;
  return await onboardingCallbacks.setProfileHeight(profileId, height, unit) !== false;
}

function startOpenRouterOAuth() {
  onboardingCallbacks.startOpenRouterOAuth?.();
}

function switchAIProvider(provider) {
  onboardingCallbacks.switchAIProvider?.(provider);
}

function updateChatNudge() {
  onboardingCallbacks.updateChatNudge?.();
}

function forcedStepKey() {
  return `chat-onboard-force-step-${state.currentProfile}`;
}

function clearForcedOnboardingStep() {
  sessionStorage.removeItem(forcedStepKey());
}

export function useChatPrompt(text) {
  if (!hasAIProvider()) {
    showNotification('Connect an AI provider first — open Settings → AI to set one up.', 'info');
    return;
  }
  const input = textControlById('chat-input');
  if (input) { input.value = text; sendChatMessage(); }
}

export function requestOnboardingLabImportProvider() {
  showNotification('Lab PDFs and photos need an AI provider first. Connect AI, then import the file.', 'info');
  if (openChatProviderQuiz()) {
    return;
  }
  sessionStorage.setItem(`chat-onboard-provider-requested-${state.currentProfile}`, '1');
  renderChatMessages();
}

export function startOnboardingLabImport() {
  if (isAIPaused()) {
    showNotification('AI features are paused. Re-enable AI to import lab PDFs or report photos.', 'info');
    closeChatPanel();
    openSettingsModal('ai');
    return;
  }
  if (!hasAIProvider()) {
    requestOnboardingLabImportProvider();
    return;
  }
  const input = inputById('pdf-input');
  if (!input) {
    showNotification('Import control is not available on this screen.', 'error');
    return;
  }
  closeChatPanel();
  input.value = '';
  input.click();
}

export function startOnboardingFileImport() {
  const input = inputById('pdf-input');
  if (!input) {
    showNotification('Import control is not available on this screen.', 'error');
    return;
  }
  closeChatPanel();
  input.value = '';
  input.click();
}

export function _updateOnboardNextBtn() {
  const btn = buttonById('chat-onboard-next');
  if (!btn) return;
  const name = textControlById('chat-onboard-name')?.value?.trim();
  const sex = state.profileSex;
  btn.disabled = !(name && sex);
}

export async function setChatProfileSex(sex) {
  try {
    if (!await setProfileSex(state.currentProfile, sex)) return false;
  } catch {
    return false;
  }
  document.querySelectorAll('.chat-onboard-form .welcome-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.chat-onboard-form .welcome-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
  state.profileSex = sex;
  _updateOnboardNextBtn();
  return true;
}

let _chatLocTimer = null;
export function onboardHeightUnitChanged() {
  const input = textControlById('chat-onboard-height');
  const select = selectById('chat-onboard-height-unit');
  if (!input || !select) return;
  const val = parseFloat(input.value);
  if (!val) { input.placeholder = select.value === 'in' ? 'inches' : 'cm'; return; }
  if (select.value === 'in') { input.value = (val / 2.54).toFixed(1); input.placeholder = 'inches'; }
  else { input.value = (val * 2.54).toFixed(1); input.placeholder = 'cm'; }
}

export async function saveChatLocation() {
  const country = textControlById('chat-onboard-country')?.value?.trim();
  if (country == null) return false;
  try {
    if (!await setProfileLocation(state.currentProfile, country, '')) return false;
  } catch {
    return false;
  }
  const el = document.getElementById('chat-onboard-lat');
  if (!el) return true;
  if (!country) { el.textContent = ''; return true; }

  // Check AI cache first
  const cacheKey = (country + '|').toLowerCase();
  const cached = getLocationCache()[cacheKey];
  if (cached !== undefined) {
    const band = latitudeToBand(cached);
    el.style.color = 'var(--green)';
    el.textContent = '\u2713 ' + Math.abs(Math.round(cached)) + '\u00b0' + (cached >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band];
    return true;
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
  return true;
}

export async function saveChatProfile(advance) {
  const nameEl = textControlById('chat-onboard-name');
  const dobEl = textControlById('chat-onboard-dob');
  const name = nameEl?.value?.trim();
  const dob = dobEl?.value;
  try {
    if (name && !await renameProfile(state.currentProfile, name)) return false;
    if (dob) {
      const dobYear = parseInt(dob.slice(0, 4));
      if (dobYear >= 1900 && dobYear <= new Date().getFullYear()) {
        if (!await setProfileDob(state.currentProfile, dob)) return false;
        state.profileDob = dob;
      }
      // Silently ignore invalid DOB — user can fix before clicking Continue
    }
    // Save height
    const heightRaw = parseFloat(textControlById('chat-onboard-height')?.value || '');
    const heightUnit = selectById('chat-onboard-height-unit')?.value || 'cm';
    if (heightRaw) {
      const heightCm = heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : heightRaw;
      if (!await setProfileHeight(state.currentProfile, heightCm, heightUnit)) return false;
    }
    // Save weight as first biometric entry
    const weightRaw = parseFloat(textControlById('chat-onboard-weight')?.value || '');
    const weightUnit = selectById('chat-onboard-weight-unit')?.value || 'kg';
    if (weightRaw) {
      if (!state.importedData.biometrics) state.importedData.biometrics = { weight: [], bp: [], pulse: [] };
      const today = new Date().toISOString().slice(0, 10);
      const w = state.importedData.biometrics.weight || [];
      state.importedData.biometrics.weight = w.filter(e => e.date !== today);
      state.importedData.biometrics.weight.push({ date: today, value: weightRaw, unit: weightUnit, source: 'manual' });
      state.importedData.biometrics.weight.sort((a, b) => a.date.localeCompare(b.date));
      if (!await saveImportedData()) return false;
    }
    if (!await saveChatLocation()) return false;
  } catch {
    return false;
  }
  renderProfileButton();
  _updateOnboardNextBtn();
  if (advance && name && state.profileSex) {
    const shouldContinueOnboarding = !state.importedData?.entries?.length && !isAIPaused();
    if (sessionStorage.getItem(forcedStepKey()) === 'profile' && shouldContinueOnboarding) {
      goToOnboardingStep(hasAIProvider() ? 3 : 2);
      return true;
    }
    if (shouldContinueOnboarding) {
      goToOnboardingStep(hasAIProvider() ? 3 : 2);
      return true;
    }
    // Profile complete — advance to next stage
    clearForcedOnboardingStep();
    updateChatNudge();
    renderChatMessages();
  }
  return true;
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
  recordChange('menstrualCycle');
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
  const startVal = textControlById('chat-onboard-period-start')?.value;
  const endVal = textControlById('chat-onboard-period-end')?.value;
  const btn = buttonById('chat-onboard-period-btn');
  const preview = document.getElementById('chat-onboard-period-preview');
  const startDay = parseInt(startVal || '', 10);
  const endDay = parseInt(endVal || '', 10);
  if (btn) btn.disabled = !(startDay && endDay);
  if (preview && startDay && endDay) {
    const { startDate, endDate } = _inferPeriodDates(startDay, endDay);
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
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
  const startDay = parseInt(textControlById('chat-onboard-period-start')?.value || '');
  const endDay = parseInt(textControlById('chat-onboard-period-end')?.value || '');
  if (!startDay || !endDay) return;
  const { startDate, endDate } = _inferPeriodDates(startDay, endDay);
  const periodDays = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
  if (!state.importedData.menstrualCycle) state.importedData.menstrualCycle = {};
  const mc = state.importedData.menstrualCycle;
  if (!mc.periods) mc.periods = [];
  mc.periods.push({ startDate, endDate, flow: 'moderate' });
  mc.cycleStatus = 'regular';
  if (!mc.cycleLength) mc.cycleLength = 28;
  mc.periodLength = periodDays;
  recordChange('menstrualCycle');
  saveImportedData();
  showNotification('Cycle tracking set up!', 'success');
  _refreshDashboardCycle();
  renderChatMessages();
}

export function addChatSupplement() {
  const nameEl = textControlById('chat-onboard-supp-name');
  const doseEl = textControlById('chat-onboard-supp-dose');
  const typeEl = selectById('chat-onboard-supp-type');
  const name = nameEl?.value?.trim();
  if (!name) { nameEl?.focus(); return; }
  appendImportedArrayItem(state.importedData, 'supplements', {
    name,
    dosage: doseEl?.value?.trim() || '',
    type: typeEl?.value || 'supplement',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    updatedAt: Date.now(),
  });
  saveImportedData();
  _refreshDashboardSupps();
  renderChatMessages();
}

export function removeChatSupplement(idx) {
  if (!state.importedData.supplements?.[idx]) return;
  deleteImportedArrayItem(state.importedData, 'supplements', idx);
  saveImportedData();
  _refreshDashboardSupps();
  renderChatMessages();
}

function _refreshDashboardSupps() {
  const el = document.querySelector('.supp-timeline-section');
  if (el && onboardingCallbacks.renderSupplementsSection) el.outerHTML = renderSupplementsSection();
}

function _refreshDashboardCycle() {
  // Ensure the lifestyle details section is open so the cycle section is visible
  const details = /** @type {HTMLDetailsElement | null} */ (document.querySelector('.welcome-context-details'));
  if (details && !details.open) { details.setAttribute('open', ''); sessionStorage.setItem('welcome-details-open', '1'); }
  const el = document.querySelector('.cycle-section');
  if (el && onboardingCallbacks.renderMenstrualCycleSection) {
    const inDashboardCycleWidget = !!el.closest('.dashboard-widget[data-widget-id="cycle"]');
    el.outerHTML = renderMenstrualCycleSection(
      getActiveData(),
      inDashboardCycleWidget ? { variant: 'dashboard', showHeader: false } : {}
    );
  } else if (!el && state.profileSex === 'female' && onboardingCallbacks.renderMenstrualCycleSection) {
    // Cycle section doesn't exist yet — insert it after context cards
    const supps = document.querySelector('.supp-timeline-section');
    if (supps) supps.insertAdjacentHTML('beforebegin', renderMenstrualCycleSection(getActiveData()));
  }
}

function getOnboardingProgressMeta(currentStep) {
  const providerConnected = hasAIProvider();
  const labels = {
    1: 'Basics',
    2: 'AI setup',
    3: 'Add-ons',
    4: 'Context',
  };
  if (providerConnected && currentStep === 1) {
    return {
      step: 1,
      total: 3,
      label: labels[1],
    };
  }
  if (providerConnected && currentStep >= 3) {
    return {
      step: currentStep - 1,
      total: 3,
      label: labels[currentStep] || 'Setup',
    };
  }
  return {
    step: currentStep,
    total: 4,
    label: labels[currentStep] || 'Setup',
  };
}

// Thin progress strip shown at the top of each onboarding chat message.
// AI-connected users skip the AI setup phase, so the displayed progress is
// mapped to a 3-step path while navigation still uses the internal 4 routes.
export function _renderOnboardCrumbs(currentStep) {
  const progress = getOnboardingProgressMeta(currentStep);
  const dots = Array.from({ length: progress.total }, (_, i) => `<span class="chat-onboard-crumb${i + 1 <= progress.step ? ' active' : ''}"></span>`).join('');
  const previousStep = currentStep === 3 && hasAIProvider() ? 1 : currentStep - 1;
  const back = currentStep > 1
    ? `<button type="button" class="chat-onboard-back-btn" ${chatOnboardingActionAttrs('go-onboarding-step', { step: previousStep })} aria-label="Back to previous onboarding step" title="Previous step">&larr;</button>`
    : '';
  return `<div class="chat-onboard-crumbs" aria-label="Onboarding step ${progress.step} of ${progress.total}: ${escapeAttr(progress.label)}">
    <span class="chat-onboard-crumbs-main">${back}<span class="chat-onboard-crumbs-label">Step ${progress.step} of ${progress.total} &middot; ${escapeHTML(progress.label)}</span></span>
    <span class="chat-onboard-crumbs-dots" aria-hidden="true">${dots}</span>
  </div>`;
}

// Provider quiz — 4 plain-language branches replace the 5-card jargon grid.
// Branch state lives in sessionStorage so a tab refresh mid-flow doesn't
// drop the user back at the root (deliberately *not* localStorage — a new
// session starts fresh).
export function _renderProviderQuiz(branch, name) {
  const safeName = escapeHTML(name);
  if (branch === 'card') {
    return `<div class="chat-provider-quiz"><button type="button" class="chat-quiz-back" ${chatOnboardingActionAttrs('back-to-provider-quiz')} aria-label="Back to provider options">&larr; Back</button>
      <p><strong>Pay with a card &rarr; OpenRouter</strong></p>
      <p style="font-size:13px">Click below &mdash; log in with Google or email, top up with your card, you&rsquo;re done. You&rsquo;ll come right back here.</p>
      <button type="button" class="or-oauth-btn" ${chatOnboardingActionAttrs('start-openrouter-oauth')}>Connect with OpenRouter</button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">
        <button type="button" class="chat-quiz-link" ${chatOnboardingActionAttrs('open-provider-settings', { provider: 'openrouter' })}>or paste a key manually</button>
      </div></div>`;
  }
  if (branch === 'local') {
    return `<div class="chat-provider-quiz"><button type="button" class="chat-quiz-back" ${chatOnboardingActionAttrs('back-to-provider-quiz')} aria-label="Back to provider options">&larr; Back</button>
      <p><strong>Runs on your computer &rarr; Local AI</strong></p>
      <p style="font-size:13px">Install <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--accent)">Ollama</a>, <a href="https://lmstudio.ai" target="_blank" rel="noopener" style="color:var(--accent)">LM Studio</a>, or <a href="https://jan.ai" target="_blank" rel="noopener" style="color:var(--accent)">Jan</a> on your computer &mdash; they run AI models locally. Nothing leaves your machine, free forever. After install, point getbased at it.</p>
      <button type="button" class="chat-setup-btn" ${chatOnboardingActionAttrs('open-provider-settings', { provider: 'ollama' })}>Open Local AI setup &rarr;</button></div>`;
  }
  if (branch === 'bitcoin') {
    return `<div class="chat-provider-quiz"><button type="button" class="chat-quiz-back" ${chatOnboardingActionAttrs('back-to-provider-quiz')} aria-label="Back to provider options">&larr; Back</button>
      <p><strong>Pay with Bitcoin &rarr; 2 options</strong></p>
      <div class="chat-quiz-options" style="margin-top:8px">
        <button type="button" class="chat-quiz-option" ${chatOnboardingActionAttrs('open-provider-settings', { provider: 'routstr' })}>
          <span class="chat-quiz-body">
            <strong>Routstr</strong>
            <span>Lightning + Cashu eCash. No account. Top up with a QR code.</span>
          </span>
          <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button type="button" class="chat-quiz-option" ${chatOnboardingActionAttrs('open-provider-settings', { provider: 'ppq' })}>
          <span class="chat-quiz-body">
            <strong>PPQ</strong>
            <span>300+ models. Pay with BTC, Lightning, Monero, or Litecoin.</span>
          </span>
          <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </div></div>`;
  }
  // Root question
  return `<div class="chat-provider-quiz"><p>Welcome, ${safeName}! Next, pick how you want to power the AI:</p>
    <div class="chat-quiz-options">
      <button type="button" class="chat-quiz-option chat-quiz-recommended" ${chatOnboardingActionAttrs('set-provider-branch', { 'provider-branch': 'card' })}>
        <span class="chat-quiz-icon" aria-hidden="true">&#128179;</span>
        <span class="chat-quiz-body">
          <strong>Easiest &mdash; pay with a card</strong>
          <span>One-click login. <em class="chat-quiz-rec">Recommended</em></span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button type="button" class="chat-quiz-option" ${chatOnboardingActionAttrs('set-provider-branch', { 'provider-branch': 'local' })}>
        <span class="chat-quiz-icon" aria-hidden="true">&#128274;</span>
        <span class="chat-quiz-body">
          <strong>Most private &mdash; runs on my computer</strong>
          <span>No internet calls, free forever. Needs a desktop app.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button type="button" class="chat-quiz-option" ${chatOnboardingActionAttrs('set-provider-branch', { 'provider-branch': 'bitcoin' })}>
        <span class="chat-quiz-icon" aria-hidden="true">&#8383;</span>
        <span class="chat-quiz-body">
          <strong>No account &mdash; pay with Bitcoin</strong>
          <span>Anonymous. Top up with sats or eCash.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button type="button" class="chat-quiz-option" ${chatOnboardingActionAttrs('open-ai-settings')}>
        <span class="chat-quiz-icon" aria-hidden="true">&#128273;</span>
        <span class="chat-quiz-body">
          <strong>Advanced: I have an API key</strong>
          <span>Skip ahead to AI settings to paste it.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
    </div>
    <div class="chat-quiz-skip">
      <button type="button" class="chat-quiz-skip-btn" ${chatOnboardingActionAttrs('skip-provider-setup')}>Try the app first &mdash; I&rsquo;ll connect AI later</button>
    </div></div>`;
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
  goToOnboardingStep(3);
}

export function skipOnboardingExtras() {
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
  // Ensure the lifestyle details section is open so cycle/supplements are visible
  sessionStorage.setItem('welcome-details-open', '1');
  // Re-render dashboard to reflect cycle + supplement changes from onboarding
  navigate('dashboard');
  if (sessionStorage.getItem(forcedStepKey()) === 'extras') {
    goToOnboardingStep(4);
    return;
  }
  clearForcedOnboardingStep();
  renderChatMessages();
}

export function skipContextCards() {
  clearForcedOnboardingStep();
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
  localStorage.setItem(`labcharts-onboard-context-cards-skipped-${state.currentProfile}`, '1');
  localStorage.removeItem(`labcharts-onboard-context-cards-done-${state.currentProfile}`);
  sessionStorage.removeItem(`chat-onboard-force-context-cards-${state.currentProfile}`);
  sessionStorage.setItem('welcome-details-open', '1');
  navigate('dashboard');
  updateChatNudge();
  renderChatMessages();
}

export function continueAfterContextCards() {
  clearForcedOnboardingStep();
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
  localStorage.setItem(`labcharts-onboard-context-cards-done-${state.currentProfile}`, '1');
  localStorage.removeItem(`labcharts-onboard-context-cards-skipped-${state.currentProfile}`);
  sessionStorage.removeItem(`chat-onboard-force-context-cards-${state.currentProfile}`);
  sessionStorage.setItem('welcome-details-open', '1');
  navigate('dashboard');
  updateChatNudge();
  renderChatMessages();
}

export function goToOnboardingStep(step) {
  const target = Number(step);
  if (!Number.isFinite(target)) return;
  const profileId = state.currentProfile;
  if (target <= 1) {
    sessionStorage.setItem(forcedStepKey(), 'profile');
  } else if (target === 2) {
    sessionStorage.setItem(forcedStepKey(), 'provider');
    sessionStorage.setItem(`chat-onboard-provider-requested-${profileId}`, '1');
    sessionStorage.removeItem(`chat-onboard-provider-branch-${profileId}`);
  } else if (target === 3) {
    sessionStorage.setItem(forcedStepKey(), 'extras');
    sessionStorage.removeItem(`chat-onboard-provider-requested-${profileId}`);
    sessionStorage.removeItem(`chat-onboard-provider-branch-${profileId}`);
    sessionStorage.removeItem(`chat-onboard-force-context-cards-${profileId}`);
  } else {
    sessionStorage.setItem(forcedStepKey(), 'cards');
    sessionStorage.removeItem(`chat-onboard-provider-requested-${profileId}`);
    sessionStorage.removeItem(`chat-onboard-provider-branch-${profileId}`);
    sessionStorage.setItem(`chat-onboard-force-context-cards-${profileId}`, '1');
    localStorage.setItem(`labcharts-onboard-extras-done-${profileId}`, '1');
  }
  renderChatMessages();
}

/** Called by context-cards.js after saving a card. Nudges or advances the onboarding. */
export function _countFilledCards() {
  return ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'healthGoals']
    .filter(k => {
      const v = state.importedData?.[k];
      return v && typeof v === 'object' && Object.values(v).some(f => f != null && f !== '' && !(Array.isArray(f) && f.length === 0));
    }).length;
}

export function onContextCardSaved() {
  localStorage.removeItem(`labcharts-onboard-context-cards-skipped-${state.currentProfile}`);
  localStorage.removeItem(`labcharts-onboard-context-cards-done-${state.currentProfile}`);
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

initChatOnboardingDelegates();
