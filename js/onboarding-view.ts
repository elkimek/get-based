import {tsStateStyles} from './ts-state-ui-inline-style-map.generated.js';
// onboarding-view.js - Dashboard onboarding and AI connection reminders

import { state } from './state.js';
import { projectDashboardOnboardingBannerView, renderDashboardOnboardingHTML } from './dashboard-welcome-presentation.js';
import { getActiveData, updateHeaderDates } from './data.js';
import { profileStorageKey, setProfileSex, setProfileDob } from './profile.js';
import { hasChatResponseBackend } from './chat-backend-selection.js';
import { showNotification } from './utils.js';
import type {DashboardOnboardingBannerView, DashboardOnboardingReminderView} from './dashboard-welcome-presentation.js';
import {
  createOnboardingChatThreadRuntime,
  navigateOnboardingRuntime,
  openOnboardingChatPanelRuntime,
  openOnboardingProviderChatRuntime,
  rebuildOnboardingSidebarRuntime,
  renderOnboardingChatMessagesRuntime,
} from './onboarding-view-runtime.js';

let _navigate: unknown = null;
let _onboardingActionsInstalled = false;

const ONBOARDING_ACTION_ATTR = 'data-onboarding-action';
const ONBOARDING_ACTION_SELECTOR = `[${ONBOARDING_ACTION_ATTR}]`;

function closestOnboardingAction(target: unknown) {
  return /** @type {HTMLElement | null} */ (
    target && typeof (target as { closest?: unknown }).closest === 'function'
      ? (target as { closest(selector: string): HTMLElement | null }).closest(ONBOARDING_ACTION_SELECTOR)
      : null
  );
}

function handleOnboardingActionClick(event: MouseEvent) {
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

export function configureOnboardingView(options: { navigate?: unknown } = {}) {
  _navigate = typeof options.navigate === 'function' ? options.navigate : null;
}

export function projectOnboardingBanner(): DashboardOnboardingBannerView | null {
  const onboarded = localStorage.getItem(profileStorageKey(state.currentProfile, 'onboarded'));
  if (onboarded) return null;
  if (state.profileSex && state.profileDob) {
    localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
    return null;
  }
  return projectDashboardOnboardingBannerView({
    male: () => state.profileSex === 'male' ? ' active' : '',
    female: () => state.profileSex === 'female' ? ' active' : '',
    dob: () => state.profileDob || '',
  });
}

export function renderOnboardingBanner(): string {
  const view = projectOnboardingBanner();
  return view ? renderDashboardOnboardingHTML(view) : '';
}

export function openOnboardingImportFilePicker() {
  const input = document.getElementById('pdf-input') as HTMLInputElement | null;
  if (!input) {
    showNotification('Import control is not available on this screen.', 'error');
    return;
  }
  input.value = '';
  input.click();
}

export function completeOnboardingSex(sex: unknown) {
  document.querySelectorAll('.onboarding-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.onboarding-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
}

export async function completeOnboardingProfile() {
  const activeSexBtn = document.querySelector('.onboarding-sex-btn.active');
  const sex = activeSexBtn ? (activeSexBtn.textContent!.trim().toLowerCase()) : null;
  const dobInput = document.getElementById('onboarding-dob') as HTMLInputElement | null;
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
    banner.style.transition = tsStateStyles.bannerTransition;
    banner.style.opacity = tsStateStyles.fadeOpacity;
    banner.style.transform = tsStateStyles.bannerTransform;
    setTimeout(() => banner.remove(), 300);
  }
  showNotification('You can set sex and DOB anytime in Settings.', 'info');
}

export function projectAIConnectionReminder(): DashboardOnboardingReminderView | null {
  if (hasChatResponseBackend()) return null;
  const skipKey = `labcharts-onboard-provider-skipped-${state.currentProfile}`;
  const skipped = localStorage.getItem(skipKey);
  if (!skipped) return null;
  const dismissKey = profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
  if (localStorage.getItem(dismissKey)) return null;
  return {mode: 'reminder'};
}

export function renderAIConnectionReminder(): string {
  const view = projectAIConnectionReminder();
  return view ? renderDashboardOnboardingHTML(view) : '';
}

export function dismissAIReminder() {
  const dismissKey = profileStorageKey(state.currentProfile, 'ai-reminder-dismissed');
  localStorage.setItem(dismissKey, '1');
  const banner = document.getElementById('ai-reminder-banner');
  if (banner) {
    banner.style.transition = tsStateStyles.bannerTransition;
    banner.style.opacity = tsStateStyles.fadeOpacity;
    banner.style.transform = tsStateStyles.bannerTransform;
    setTimeout(() => banner.remove(), 300);
  }
}

export function setOnboardingFocus(mode: unknown) {
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
