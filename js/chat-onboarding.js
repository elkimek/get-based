// chat-onboarding.js — Chat-first onboarding handlers and render helpers

import { state } from './state.js';
import { LATITUDE_BANDS } from './constants.js';
import { escapeHTML, showNotification } from './utils.js';
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

const onboardingCallbacks = {
  closeChatPanel: () => {},
  renderChatMessages: () => {},
  sendChatMessage: () => {},
  setChatNudge: () => {},
  updateChatNudge: () => {},
};

export function configureChatOnboarding(callbacks = {}) {
  Object.assign(onboardingCallbacks, callbacks);
}

function closeChatPanel() {
  onboardingCallbacks.closeChatPanel?.();
}

function renderChatMessages() {
  onboardingCallbacks.renderChatMessages?.();
}

function sendChatMessage() {
  onboardingCallbacks.sendChatMessage?.();
}

function setChatNudge(mode) {
  onboardingCallbacks.setChatNudge?.(mode);
}

function updateChatNudge() {
  onboardingCallbacks.updateChatNudge?.();
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

export function _updateOnboardNextBtn() {
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

let _chatLocTimer = null;
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
    saveImportedData();
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
export function _renderOnboardCrumbs(currentStep, totalSteps = 4) {
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
export function _renderProviderQuiz(branch, name) {
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
export function _countFilledCards() {
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
