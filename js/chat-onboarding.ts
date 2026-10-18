import {tsStateStyles} from './ts-state-ui-inline-style-map.generated.js';
import { isChatOptionalSetupActionCurrent } from './chat-optional-setup-component.js';
// chat-onboarding.js — Chat-first onboarding handlers and render helpers

import type { ProfileData } from '../types/app-state.js';
import type { ActiveData } from './data-view-types.js';
import { state } from './state.js';
import { projectOnboardingProgress } from './chat-onboarding-presentation.js';
import { renderHTML as renderProgressHTML } from './components/ChatOnboardingProgress.svelte.html.js';
import { renderHTML as renderProviderHTML } from './components/ChatProviderQuiz.svelte.html.js';
import { isChatProviderSetupActionCurrent } from './chat-provider-setup-component.js';
import { createChatProfileOnboarding } from './chat-profile-onboarding.js';
import { showNotification } from './utils.js';
import { actionAttributes } from './action-attributes.js';
import { saveImportedData } from './data.js';
import { appendImportedArrayItem, deleteImportedArrayItem } from './data-merge.js';
import { isAIPaused } from './api.js';
import { hasChatResponseBackend } from './chat-backend-selection.js';
import { handleAppExtensionOnboardingAction, renderAppExtensionOnboardingSlot } from './app-extension-runtime.js';

interface ChatOnboardingCallbacks {
  closeChatPanel(): void; getActiveData(): ActiveData | ProfileData | null;
  navigate(route: string, data?: unknown): void;
  openChatProviderQuiz: (() => void) | null;
  openSettingsModal(tab?: string): unknown; recordChange(field: string): void;
  renderChatMessages(): void;
  renderMenstrualCycleSection: typeof import('./cycle.js').renderMenstrualCycleSection | null;
  renderProfileButton(): void; renderSupplementsSection: (() => string) | null;
  sendChatMessage(): void; setChatNudge(mode?: string): void;
  setProfileHeight: ((profileId: string, height: number, unit: string) => Promise<boolean> | boolean | void) | null;
  startOpenRouterOAuth(): void; switchAIProvider(provider: string): void; updateChatNudge(): void;
}

const onboardingCallbacks: ChatOnboardingCallbacks = {
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

export function chatOnboardingActionAttrs(action: string, attrs: Parameters<typeof actionAttributes>[2] = {}) {
  return actionAttributes("chat-onboarding", action, attrs, "chat");
}

function isChatOnboardingActionScope(actionEl: Element) {
  return !!actionEl.closest('#chat-panel, .chat-provider-quiz') && isChatProviderSetupActionCurrent(actionEl) && isChatOptionalSetupActionCurrent(actionEl);
}

function openAiSettings(current: () => boolean) {
  clearForcedOnboardingStep();
  closeChatPanel();
  setTimeout(() => {
    if (current()) openSettingsModal('ai');
  }, 300);
}

function openAiProviderSettings(provider: string, current: () => boolean) {
  clearForcedOnboardingStep();
  closeChatPanel();
  setTimeout(async () => {
    if (!current()) return;
    await openSettingsModal('ai');
    if (!current()) return;
    if (provider === 'cli') {
      const cliButton = (document.querySelector('[data-settings-action="show-cli-agent-provider"]') as HTMLElement | null);
      cliButton?.click();
    } else if (CHAT_ONBOARDING_SETTING_PROVIDERS.has(provider)) switchAIProvider(provider);
  }, 300);
}

async function handleChatOnboardingClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = (target.closest('[data-chat-onboarding-action]') as HTMLElement | null);
  if (!actionEl || !isChatOnboardingActionScope(actionEl)) return;
  const action = actionEl.dataset.chatOnboardingAction || '';
  const profile = state.currentProfile;
  const thread = state.currentThreadId;
  const history = state.chatHistory;
  const current = () => profile === state.currentProfile && thread === state.currentThreadId
    && history === state.chatHistory && actionEl.isConnected && isChatProviderSetupActionCurrent(actionEl) && isChatOptionalSetupActionCurrent(actionEl);
  event.preventDefault();

  const extensionHandled = handleAppExtensionOnboardingAction({
    action,
    actionEl,
    currentProfile: state.currentProfile,
    openSettingsModal,
    renderChatMessages,
    setProviderQuizBranch,
  });
  if (extensionHandled === true
    || (extensionHandled instanceof Promise && await extensionHandled)) return;
  if (!current()) return;

  if (action === 'back-to-provider-quiz') {
    backToProviderQuiz();
  } else if (action === 'start-openrouter-oauth') {
    clearForcedOnboardingStep();
    startOpenRouterOAuth();
  } else if (action === 'open-ai-settings') {
    openAiSettings(current);
  } else if (action === 'open-provider-settings') {
    openAiProviderSettings(actionEl.dataset.chatProvider || '', current);
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

export function configureChatOnboarding(callbacks: Partial<ChatOnboardingCallbacks> = {}) {
  Object.assign(onboardingCallbacks, callbacks);
}

function textControlById(id: string) {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null);
}

function inputById(id: string) {
  return (document.getElementById(id) as HTMLInputElement | null);
}

function selectById(id: string) {
  return (document.getElementById(id) as HTMLSelectElement | null);
}

function buttonById(id: string) {
  return (document.getElementById(id) as HTMLButtonElement | null);
}

function closeChatPanel() {
  onboardingCallbacks.closeChatPanel?.();
}

function getActiveData() {
  return onboardingCallbacks.getActiveData?.() || state.importedData;
}

function navigate(route: string, data?: unknown) {
  onboardingCallbacks.navigate?.(route, data);
}

function openChatProviderQuiz() {
  if (typeof onboardingCallbacks.openChatProviderQuiz !== 'function') return false;
  onboardingCallbacks.openChatProviderQuiz();
  return true;
}

function openSettingsModal(tab?: string) {
  return onboardingCallbacks.openSettingsModal?.(tab);
}

function recordChange(field: string) {
  onboardingCallbacks.recordChange?.(field);
}

function renderChatMessages() {
  onboardingCallbacks.renderChatMessages?.();
}

function renderMenstrualCycleSection(data: ActiveData | ProfileData | null, opts?: { variant?: string; showHeader?: boolean }) {
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

function setChatNudge(mode?: string) {
  onboardingCallbacks.setChatNudge?.(mode);
}

async function setProfileHeight(profileId: string, height: number, unit: string) {
  if (!onboardingCallbacks.setProfileHeight) return false;
  return await onboardingCallbacks.setProfileHeight(profileId, height, unit) !== false;
}

function startOpenRouterOAuth() {
  onboardingCallbacks.startOpenRouterOAuth?.();
}

function switchAIProvider(provider: string) {
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

export function useChatPrompt(text: string) {
  if (!hasChatResponseBackend()) {
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
  if (!hasChatResponseBackend()) {
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

const profileOnboarding = createChatProfileOnboarding({
  height: setProfileHeight,
  saved(advance) {
    renderProfileButton();
    _updateOnboardNextBtn();
    if (!advance) return;
    if (!state.importedData?.entries?.length && !isAIPaused()) {
      goToOnboardingStep(hasChatResponseBackend() ? 3 : 2);
      return;
    }
    clearForcedOnboardingStep();
    updateChatNudge();
    renderChatMessages();
  },
});

export function _updateOnboardNextBtn() { profileOnboarding.updateNext(); }
export function setChatProfileSex(sex: string | null, source?: Element) { return profileOnboarding.setSex(sex, source); }
export function onboardHeightUnitChanged(source?: Element) { profileOnboarding.heightUnitChanged(source); }
export function saveChatLocation(source?: Element) { return profileOnboarding.saveLocation(source); }
export function saveChatProfile(advance?: boolean, source?: Element) { return profileOnboarding.saveProfile(advance, source); }

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

export function saveCycleStatus(status: string) {
  if (!state.importedData!.menstrualCycle) state.importedData!.menstrualCycle = {};
  state.importedData!.menstrualCycle.cycleStatus = status;
  if (!state.importedData!.menstrualCycle.periods) state.importedData!.menstrualCycle.periods = [];
  recordChange('menstrualCycle');
  saveImportedData();
  const labels: Record<string, string> = { perimenopause: 'Perimenopause noted', postmenopause: 'Noted — postmenopause', pregnant: 'Noted — pregnant', breastfeeding: 'Noted — breastfeeding', absent: 'Noted — no active cycle' };
  showNotification(labels[status] || 'Cycle status saved', 'success');
  _refreshDashboardCycle();
  renderChatMessages();
}

function _inferPeriodDates(startDay: number, endDay: number) {
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth();
  if (startDay > now.getDate()) month--;
  if (month < 0) { month = 11; year--; }
  const pad = (n: number) => String(n).padStart(2, '0');
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
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (days <= 10) {
      preview.textContent = `→ ${fmt(s)} – ${fmt(e)} (${days} day${days !== 1 ? 's' : ''})`;
      preview.style.color = tsStateStyles.mutedColor;
    } else {
      preview.textContent = `→ ${fmt(s)} – ${fmt(e)} (${days} days) — that seems long, double-check?`;
      preview.style.color = tsStateStyles.cautionColor;
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
  if (!state.importedData!.menstrualCycle) state.importedData!.menstrualCycle = {};
  const mc = state.importedData!.menstrualCycle;
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

export function removeChatSupplement(idx: number) {
  if (!state.importedData!.supplements?.[idx]) return;
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
  const details = (document.querySelector('.welcome-context-details') as HTMLDetailsElement | null);
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

/** Displayed progress skips provider setup when a response backend is already connected. */
export function _renderOnboardCrumbs(currentStep: number) {
  return renderProgressHTML({ progress: projectOnboardingProgress(currentStep, hasChatResponseBackend()) });
}

/** Extension-owned quiz HTML keeps its established slot/action contract. */
export function _renderProviderQuiz(branch: string, name: string) {
  const extensionQuiz = renderAppExtensionOnboardingSlot('provider-quiz', { actionAttrs: chatOnboardingActionAttrs, branch, name });
  return extensionQuiz || renderProviderHTML({ branch, name });
}

export function setProviderQuizBranch(branch: string) {
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

function finishContextCards(completed: boolean) {
  clearForcedOnboardingStep();
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`, '1');
  localStorage.setItem(`labcharts-onboard-context-cards-${completed ? 'done' : 'skipped'}-${state.currentProfile}`, '1');
  localStorage.removeItem(`labcharts-onboard-context-cards-${completed ? 'skipped' : 'done'}-${state.currentProfile}`);
  sessionStorage.removeItem(`chat-onboard-force-context-cards-${state.currentProfile}`);
  sessionStorage.setItem('welcome-details-open', '1');
  navigate('dashboard');
  updateChatNudge();
  renderChatMessages();
}

export function skipContextCards() {
  finishContextCards(false);
}

export function continueAfterContextCards() {
  finishContextCards(true);
}

export function goToOnboardingStep(step: number) {
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
  const hasData = state.importedData?.entries?.length! > 0;
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
