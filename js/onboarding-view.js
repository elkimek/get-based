// @ts-check
// onboarding-view.js - Dashboard onboarding and AI connection reminders

import { state } from './state.js';
import { getActiveData, updateHeaderDates } from './data.js';
import { profileStorageKey, setProfileSex, setProfileDob } from './profile.js';
import { hasChatResponseBackend } from './chat-backend-selection.js';
import { escapeAttr, showNotification } from './utils.js';
import {
  createOnboardingChatThreadRuntime,
  navigateOnboardingRuntime,
  openOnboardingChatPanelRuntime,
  openOnboardingProviderChatRuntime,
  rebuildOnboardingSidebarRuntime,
  renderOnboardingChatMessagesRuntime,
} from './onboarding-view-runtime.js';

let _navigate = null;
let _onboardingActionsInstalled = false;

const ONBOARDING_ACTION_ATTR = 'data-onboarding-action';
const ONBOARDING_ACTION_SELECTOR = `[${ONBOARDING_ACTION_ATTR}]`;

function onboardingActionAttrs(action, attrs = {}) {
  let html = `${ONBOARDING_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-onboarding-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestOnboardingAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(ONBOARDING_ACTION_SELECTOR)
      : null
  );
}

function handleOnboardingActionClick(event) {
  const actionEl = closestOnboardingAction(event.target);
  if (!actionEl) return;
  const action = actionEl.getAttribute(ONBOARDING_ACTION_ATTR);
  if (action === 'set-sex') {
    const sex = actionEl.dataset.onboardingSex;
    if (sex === 'male' || sex === 'female') completeOnboardingSex(sex);
    else return;
  } else if (action === 'save-profile') {
    void completeOnboardingProfile();
  } else if (action === 'dismiss-profile') {
    dismissOnboarding();
  } else if (action === 'import-file') {
    openOnboardingImportFilePicker();
  } else if (action === 'open-provider-quiz') {
    openChatProviderQuiz();
  } else if (action === 'dismiss-ai-reminder') {
    dismissAIReminder();
  } else {
    return;
  }
  event.preventDefault();
}

export function installOnboardingActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || _onboardingActionsInstalled) return;
  _onboardingActionsInstalled = true;
  root.addEventListener('click', handleOnboardingActionClick);
}

installOnboardingActionDelegates();

export function configureOnboardingView(options = {}) {
  _navigate = typeof options.navigate === 'function' ? options.navigate : null;
}

export function renderOnboardingBanner() {
  const onboarded = localStorage.getItem(profileStorageKey(state.currentProfile, 'onboarded'));
  if (onboarded) return '';
  if (state.profileSex && state.profileDob) {
    localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
    return '';
  }
  return `<div class="onboarding-banner" id="onboarding-banner">
    <div class="onboarding-steps">
      <span class="onboarding-step completed">\u2713</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step active">2</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step">3</span>
    </div>
    <div class="onboarding-step-labels">
      <span class="onboarding-step-label">Import</span>
      <span class="onboarding-step-label active">Profile</span>
      <span class="onboarding-step-label">Ready</span>
    </div>
    <h3 class="onboarding-title">Set up your profile</h3>
    <p class="onboarding-subtitle">Sex and date of birth pick the right reference ranges for your results.</p>
    <div class="onboarding-form">
      <div class="onboarding-field">
        <label class="onboarding-label">Sex</label>
        <div class="onboarding-sex-toggle">
          <button type="button" class="onboarding-sex-btn${state.profileSex === 'male' ? ' active' : ''}" ${onboardingActionAttrs('set-sex', { sex: 'male' })}>Male</button>
          <button type="button" class="onboarding-sex-btn${state.profileSex === 'female' ? ' active' : ''}" ${onboardingActionAttrs('set-sex', { sex: 'female' })}>Female</button>
        </div>
      </div>
      <div class="onboarding-field">
        <label class="onboarding-label">Date of Birth</label>
        <input type="date" class="onboarding-dob-input" id="onboarding-dob" value="${state.profileDob || ''}" />
      </div>
      <div class="onboarding-actions">
        <button type="button" class="onboarding-file-btn" ${onboardingActionAttrs('import-file')}>Import data file</button>
        <button type="button" class="onboarding-save-btn" ${onboardingActionAttrs('save-profile')}>Save & Continue</button>
        <button type="button" class="onboarding-skip-btn" ${onboardingActionAttrs('dismiss-profile')}>Skip for now</button>
      </div>
    </div>
  </div>`;
}

export function openOnboardingImportFilePicker() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('pdf-input'));
  if (!input) {
    showNotification('Import control is not available on this screen.', 'error');
    return;
  }
  input.value = '';
  input.click();
}

export function completeOnboardingSex(sex) {
  document.querySelectorAll('.onboarding-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.onboarding-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
}

export async function completeOnboardingProfile() {
  const activeSexBtn = document.querySelector('.onboarding-sex-btn.active');
  const sex = activeSexBtn ? (activeSexBtn.textContent.trim().toLowerCase()) : null;
  const dobInput = /** @type {HTMLInputElement | null} */ (document.getElementById('onboarding-dob'));
  const dob = dobInput ? dobInput.value : null;
  try {
    if (sex && !await setProfileSex(state.currentProfile, sex)) return;
    if (dob && !await setProfileDob(state.currentProfile, dob)) return;
  } catch {
    return;
  }
  localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
  if (sex) state.profileSex = sex;
  if (dob) state.profileDob = dob;
  const data = getActiveData();
  rebuildOnboardingSidebarRuntime(data);
  updateHeaderDates(data);
  navigateOnboardingRuntime('dashboard', data, _navigate);
  showNotification("Profile set up \u2014 you're all set!", 'success');
}

export function dismissOnboarding() {
  localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'dismissed');
  const banner = document.getElementById('onboarding-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';
    setTimeout(() => banner.remove(), 300);
  }
  showNotification('You can set sex and DOB anytime in Settings.', 'info');
}

export function renderAIConnectionReminder() {
  if (hasChatResponseBackend()) return '';
  const skipKey = `labcharts-onboard-provider-skipped-${state.currentProfile}`;
  const skipped = localStorage.getItem(skipKey);
  if (!skipped) return '';
  const dismissKey = profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
  if (localStorage.getItem(dismissKey)) return '';
  return `<div class="ai-reminder-banner" id="ai-reminder-banner" role="region" aria-label="Connect AI to unlock lab analysis">
    <span class="ai-reminder-icon" aria-hidden="true">&#129504;</span>
    <span class="ai-reminder-body">
      <strong>Connect AI to unlock lab analysis</strong>
      <span>PDF import, trend insights, and chat all need an AI provider. About 30 seconds.</span>
    </span>
    <button type="button" class="ai-reminder-cta" ${onboardingActionAttrs('open-provider-quiz')}>Connect now</button>
    <button type="button" class="ai-reminder-dismiss" ${onboardingActionAttrs('dismiss-ai-reminder')} aria-label="Dismiss">&times;</button>
  </div>`;
}

export function dismissAIReminder() {
  const dismissKey = profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
  localStorage.setItem(dismissKey, '1');
  const banner = document.getElementById('ai-reminder-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';
    setTimeout(() => banner.remove(), 300);
  }
}

export function setOnboardingFocus(mode) {
  const body = document.body;
  body.classList.remove('cards-focus', 'import-focus');
  if (!mode) return;
  if (mode === 'cards') {
    body.classList.add('cards-focus');
  } else if (mode === 'import') {
    body.classList.add('import-focus');
  }
  if (body.classList.contains('chat-fullscreen')) {
    body.classList.remove('chat-fullscreen');
    localStorage.setItem('labcharts-chat-fullscreen', 'false');
  }
  if (mode === 'cards') {
    sessionStorage.setItem(`chat-onboard-force-context-cards-${state.currentProfile}`, '1');
    const cards = document.querySelector('.profile-context-cards');
    if (cards) {
      setTimeout(() => cards.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else {
      const openChatPanel = openOnboardingChatPanelRuntime();
      if (!openChatPanel) return;
      body.classList.remove('cards-focus');
      openChatPanel.then(() => {
        if (!document.querySelector('#chat-panel .chat-context-cards') && state.chatHistory.length > 0 && createOnboardingChatThreadRuntime()) {
          // Thread creation re-renders the empty-state card set.
        } else {
          renderOnboardingChatMessagesRuntime();
        }
        setTimeout(() => {
          document.querySelector('#chat-panel .chat-context-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      });
    }
  } else if (mode === 'import') {
    setTimeout(() => document.querySelector('.welcome-direct-import-btn, .welcome-primary-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }
}

export function openChatProviderQuiz() {
  const skipKey = `labcharts-onboard-provider-skipped-${state.currentProfile}`;
  localStorage.removeItem(skipKey);
  sessionStorage.setItem(`chat-onboard-provider-requested-${state.currentProfile}`, '1');
  sessionStorage.removeItem(`chat-onboard-provider-branch-${state.currentProfile}`);
  openOnboardingProviderChatRuntime();
  renderOnboardingChatMessagesRuntime();
}
