import { renderHTML as renderEmptyPresentation } from './components/ChatEmptyState.svelte.html.js';
import { projectChatEmpty, type ChatEmptyKind } from './chat-empty-presentation.js';
import { configureRuntimeFunctions } from './runtime-callbacks.js';
// chat-empty-state.js — chat empty states and onboarding message HTML

import { state } from './state.js';
import { disposeChatProviderSetup, renderChatProviderSetup } from './chat-provider-setup-component.js';
import { disposeChatProfileSetup, renderChatProfileSetup } from './chat-profile-setup-component.js';
import { disposeChatOptionalSetup, renderChatOptionalSetup, isChatOptionalSetupActionCurrent } from './chat-optional-setup-component.js';
import { projectChatOptionalSetup } from './chat-optional-onboarding-presentation.js';
import { projectChatProfileLatitude } from './chat-profile-onboarding.js';
import { projectOnboardingProgress } from './chat-onboarding-presentation.js';
import { renderAppExtensionOnboardingSlot } from './app-extension-runtime.js';
import { isAIPaused } from './api.js';
import { hasChatResponseBackend } from './chat-backend-selection.js';
import { getActiveData } from './data.js';
import { getProfileHeight, getProfileLocation, getProfiles } from './profile.js';
import { projectProfileContextCards } from './context-cards.js';
import { disposeChatEmptyCatalog, hydrateChatEmptyCatalog } from './chat-empty-catalog-component.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { openMenstrualCycleEditor } from './cycle.js';
import { openSupplementsEditor } from './supplements.js';
import { hasCardContent } from './utils.js';
import { getActivePersonality } from './chat-personalities.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { resumeChatAIRuntime } from './chat-runtime.js';
import {
  chatOnboardingActionAttrs,
  _countFilledCards,
  onboardHeightUnitChanged,
  continueAfterContextCards, requestOnboardingLabImportProvider, saveChatLocation, saveChatProfile,
  setChatProfileSex, skipContextCards, skipOnboardingExtras, startOnboardingFileImport, startOnboardingLabImport,
  useChatPrompt,
} from './chat-onboarding.js';

const CHAT_EMPTY_STOP_PROPAGATION_ACTIONS = new Set([
  'open-cycle-editor',
  'open-supplements-editor',
  'import-dna',
  'import-mtdna',
  'open-wearables-settings',
]);

type ChatEmptyStateOperations = {closeChatPanel():unknown;openChatProviderQuiz():unknown;setOnboardingFocus(focus:unknown):unknown};
type ChatEmptyStateDependencies = {[Key in keyof ChatEmptyStateOperations]:unknown};
type EmptyChatContext = ReturnType<typeof getEmptyChatContext>;
type PersonaContext = Pick<EmptyChatContext,'personality'|'name'>;
// Private operations at unchecked storage boundaries; these readers do not validate persisted data.
type EmptyDataOperations = {entries?:{length:number};healthGoals?:{length:number}|null;[field:string]:unknown};
const chatEmptyStateDeps: ChatEmptyStateDependencies = {
  closeChatPanel: () => {},
  openChatProviderQuiz: () => {},
  setOnboardingFocus: (_focus: unknown) => {},
};

export function configureChatEmptyStateDeps(deps: unknown = {}) {
  return (configureRuntimeFunctions as (current:ChatEmptyStateDependencies,updates:unknown,fields:Parameters<typeof configureRuntimeFunctions<ChatEmptyStateOperations>>[2])=>ChatEmptyStateDependencies)(chatEmptyStateDeps, deps, ["closeChatPanel","openChatProviderQuiz","setOnboardingFocus"]);
}

function closestChatEmptyAction(event: Event, selector = '[data-chat-empty-action]') {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const actionEl = target.closest<HTMLElement>(selector);
  if (!actionEl) return null;
  return (event.currentTarget as HTMLElement|null)?.contains(actionEl) ? actionEl : null;
}

function callChatEmptyRuntime(name: string, ...args: unknown[]) {
  const fn = getSettingsModuleFunction(name)
    || getDnaModuleFunction(name);
  return typeof fn === 'function' ? fn(...args) : undefined;
}

function closeChatPanel() {
  (chatEmptyStateDeps as ChatEmptyStateOperations).closeChatPanel();
}

function getChatProfileHeight(profileId: Parameters<typeof getProfileHeight>[0]) {
  return getProfileHeight(profileId);
}

function handleChatEmptyClick(event: Event) {
  const actionEl = closestChatEmptyAction(event);
  if (!actionEl || !isChatOptionalSetupActionCurrent(actionEl)) return;
  const action = actionEl.dataset.chatEmptyAction;
  if (!action) return;

  if (CHAT_EMPTY_STOP_PROPAGATION_ACTIONS.has(action)) event.stopPropagation();

  if (action === 'set-profile-sex') {
    void setChatProfileSex(actionEl.dataset.sex || '', actionEl);
  } else if (action === 'save-profile-advance') {
    void saveChatProfile(true, actionEl);
  } else if (action === 'resume-ai') {
    resumeChatAIRuntime();
  } else if (action === 'skip-extras') {
    skipOnboardingExtras();
  } else if (action === 'continue-after-context-cards') {
    continueAfterContextCards();
  } else if (action === 'skip-context-cards') {
    skipContextCards();
  } else if (action === 'open-cycle-editor') {
    closeChatPanel();
    openMenstrualCycleEditor();
  } else if (action === 'open-supplements-editor') {
    closeChatPanel();
    openSupplementsEditor();
  } else if (action === 'import-dna') {
    closeChatPanel();
    triggerContextCardDNAFilePickerRuntime();
  } else if (action === 'import-mtdna') {
    const input = (event.currentTarget as HTMLElement|null)?.querySelector<HTMLInputElement>('#mtdna-onboard-input') || null;
    closeChatPanel();
    input?.click();
  } else if (action === 'open-wearables-settings') {
    closeChatPanel();
    callChatEmptyRuntime('openSettingsModal', 'wearables');
  } else if (action === 'use-prompt') {
    useChatPrompt(actionEl.dataset.prompt || '');
  } else if (action === 'request-lab-import-provider') {
    requestOnboardingLabImportProvider();
  } else if (action === 'open-provider-quiz') {
    (chatEmptyStateDeps as ChatEmptyStateOperations).openChatProviderQuiz();
  } else if (action === 'scroll-context-cards') {
    const currentTarget = event.currentTarget instanceof Element ? event.currentTarget : null;
    currentTarget?.querySelector('.chat-context-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (action === 'start-lab-import') {
    startOnboardingLabImport();
  } else if (action === 'start-file-import') {
    startOnboardingFileImport();
  } else if (action === 'set-onboarding-focus') {
    (chatEmptyStateDeps as ChatEmptyStateOperations).setOnboardingFocus(actionEl.dataset.focus || '');
  }
}

function handleChatEmptyChange(event: Event) {
  const actionEl = closestChatEmptyAction(event);
  if (!actionEl || !isChatOptionalSetupActionCurrent(actionEl)) return;
  const action = actionEl.dataset.chatEmptyAction;
  if (!action) return;

  if (action === 'save-profile') {
    void saveChatProfile(false, actionEl);
  } else if (action === 'height-unit-changed') {
    onboardHeightUnitChanged(actionEl);
  } else if (action === 'import-mtdna-file' && actionEl instanceof HTMLInputElement) {
    const file = actionEl.files?.[0];
    if (file) {
      callChatEmptyRuntime('handleMtDNAFile', file);
      actionEl.value = '';
    }
  }
}

function handleChatEmptyInput(event: Event) {
  const actionEl = closestChatEmptyAction(event);
  if (!actionEl || !isChatOptionalSetupActionCurrent(actionEl)) return;
  if (actionEl.dataset.chatEmptyAction === 'save-location') void saveChatLocation(actionEl);
}

function installChatEmptyStateDelegates(container: HTMLElement|null) {
  if (!container || container.dataset.chatEmptyDelegates === '1') return;
  container.dataset.chatEmptyDelegates = '1';
  container.addEventListener('click', handleChatEmptyClick);
  container.addEventListener('change', handleChatEmptyChange);
  container.addEventListener('input', handleChatEmptyInput);
}

export function _getNoDataPrompts() {
  const data = getActiveData();
  const hasLabs = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate);
  if (hasLabs) return null;
  const cardKeys = ['healthGoals', 'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment'];
  const filledCount = cardKeys.filter(k => {
    if (k === 'healthGoals') return ((state.importedData as EmptyDataOperations).healthGoals || []).length > 0;
    return hasCardContent((state.importedData as EmptyDataOperations)[k]);
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

export function renderEmptyChatState(container: HTMLElement, panel?: HTMLElement|null) {
  installChatEmptyStateDelegates(container);
  const context = getEmptyChatContext();
  const forcedStep = sessionStorage.getItem(`chat-onboard-force-step-${state.currentProfile}`) || '';
  const providerStep = context.hasProfile && forcedStep !== 'profile' && !isAIPaused()
    && (forcedStep === 'provider' || (!(!context.hasData && forcedStep === 'extras') && shouldRenderProviderSetup()));
  const forceContext = forcedStep === 'cards' || sessionStorage.getItem(`chat-onboard-force-context-cards-${state.currentProfile}`) === '1';
  const optionalStep = context.hasProfile && !isAIPaused() && !context.hasData && forcedStep !== 'profile'
    && forcedStep !== 'provider' && (forcedStep === 'extras' || (!providerStep
      && !localStorage.getItem(`labcharts-onboard-extras-done-${state.currentProfile}`) && !forceContext));
  if (!optionalStep) disposeChatOptionalSetup();
  if (!providerStep) disposeChatProviderSetup();
  if (forcedStep !== 'profile' && context.hasProfile) disposeChatProfileSetup();

  if (forcedStep === 'profile') return renderProfileOnboardingState(container, panel, context);
  if (!context.hasProfile) return renderProfileOnboardingState(container, panel, context);
  if (isAIPaused()) return renderAIPausedState(container, panel, context);
  if (forcedStep === 'provider') return renderProviderSetupState(container, panel, context);
  if (!context.hasData && forcedStep === 'extras') return renderOptionalContextState(container, panel, context);
  if (shouldRenderProviderSetup()) return renderProviderSetupState(container, panel, context);

  const filled = _countFilledCards();
  const extrasDone = localStorage.getItem(`labcharts-onboard-extras-done-${state.currentProfile}`);
  const contextCardsSkipped = localStorage.getItem(`labcharts-onboard-context-cards-skipped-${state.currentProfile}`) === '1';
  const contextCardsDone = localStorage.getItem(`labcharts-onboard-context-cards-done-${state.currentProfile}`) === '1';
  const forceContextCards = forcedStep === 'cards' || sessionStorage.getItem(`chat-onboard-force-context-cards-${state.currentProfile}`) === '1';

  if (!context.hasData && !extrasDone && !forceContextCards) return renderOptionalContextState(container, panel, context);
  if (filled >= 9 && !context.hasData) return renderFullContextNoDataState(container, panel, context);
  if (!context.hasData && contextCardsSkipped && !forceContextCards) return renderContextImportHandoffState(container, panel, context, true);
  if (!context.hasData && contextCardsDone && !forceContextCards) return renderContextImportHandoffState(container, panel, context, false);
  if (!context.hasData && filled > 0) return renderPartialContextNoDataState(container, panel, context, filled);
  if (!context.hasData) return renderInitialNoDataState(container, panel, context);
  if (filled < 3 && !contextCardsSkipped) return renderDataContextNudgeState(container, context);

  return renderGeneralPromptState(container, context);
}

function getEmptyChatContext() {
  const personality = getActivePersonality();
  const hasData = ((state.importedData as EmptyDataOperations)?.entries?.length as number) > 0;
  const currentP = getProfiles().find(p => p.id === state.currentProfile);
  const hasProfile = Boolean(currentP?.name && currentP.name !== 'Default' && state.profileSex);
  const name = currentP?.name || 'there';

  return { personality, hasData, currentP, hasProfile, name };
}

function setOnboardingActive(panel: HTMLElement|null|undefined) {
  panel?.classList.add('chat-onboarding-active');
}

// Preserve the committed parent before catalog projection; genuine parent hydration
// then owns the catalog and its existing delegated actions and child lifetimes.
function renderEmptyPresentationState(container: HTMLElement, kind: ChatEmptyKind, context: PersonaContext, extras: { filled?: number; skipped?: boolean; prompts?: readonly string[] } = {}) {
  const { personality, name } = context;
  const view = projectChatEmpty({ kind, personalityLabel: `${personality.icon} ${personality.name}`, name,
    icon: personality.icon, greeting: personality.greeting, connected: hasChatResponseBackend(), ...extras });
  disposeChatEmptyCatalog(container);
  container.innerHTML = renderEmptyPresentation({ view });
  const slot = container.querySelector('[data-chat-empty-context-slot]');
  if (slot) hydrateChatEmptyCatalog(container, view, projectProfileContextCards());
  return true;
}

function shouldRenderProviderSetup() {
  const providerRequested = sessionStorage.getItem(`chat-onboard-provider-requested-${state.currentProfile}`) === '1';
  return !hasChatResponseBackend() && providerRequested;
}

function renderProfileOnboardingState(container: HTMLElement, panel: HTMLElement|null|undefined, { personality, currentP }: Pick<EmptyChatContext,'personality'|'currentP'>) {
  setOnboardingActive(panel);
  const pName = (currentP?.name && currentP.name !== 'Default') ? currentP.name : '';
  const pSex = state.profileSex || '';
  const pDob = state.profileDob || '';
  const pLoc = getProfileLocation(state.currentProfile);
  const _pH = getChatProfileHeight(state.currentProfile);
  const pHeight = _pH.height ? (_pH.unit === 'in' ? (Number(_pH.height) / 2.54).toFixed(1) : _pH.height) : '';
  const pHeightUnit = _pH.unit || 'cm';
  renderChatProfileSetup(container, {
    personalityLabel: `${personality.icon} ${personality.name}`,
    progress: projectOnboardingProgress(1, hasChatResponseBackend()),
    name: pName, sex: pSex || null, dob: pDob,
    height: String(pHeight || ''), heightUnit: pHeightUnit, weight: '', weightUnit: 'kg',
    country: pLoc.country || '', latitude: projectChatProfileLatitude(pLoc.country || ''),
    today: new Date().toISOString().slice(0, 10),
  });
  return true;
}

function renderAIPausedState(container: HTMLElement, panel: HTMLElement|null|undefined, context: PersonaContext) {
  setOnboardingActive(panel);
  return renderEmptyPresentationState(container, 'paused', context);
}

function renderProviderSetupState(container: HTMLElement, panel: HTMLElement|null|undefined, { personality, name }: PersonaContext) {
  setOnboardingActive(panel);
  const connected = hasChatResponseBackend();
  const branch = sessionStorage.getItem(`chat-onboard-provider-branch-${state.currentProfile}`) || '';
  renderChatProviderSetup(container, {
    name,
    personalityLabel: `${personality.icon} ${personality.name}`,
    connected, branch,
    progress: projectOnboardingProgress(2, connected),
    extensionHTML: connected ? '' : renderAppExtensionOnboardingSlot('provider-quiz', { actionAttrs: chatOnboardingActionAttrs, branch, name }),
  });
  return true;
}

function renderOptionalContextState(container: HTMLElement, panel: HTMLElement|null|undefined, { personality }: Pick<EmptyChatContext,'personality'>) {
  setOnboardingActive(panel);
  renderChatOptionalSetup(container, projectChatOptionalSetup(state.importedData, state.profileSex,
    hasChatResponseBackend(), `${personality.icon} ${personality.name}`));
  return true;
}

function renderFullContextNoDataState(container: HTMLElement, panel: HTMLElement|null|undefined, context: PersonaContext) {
  panel?.classList.remove('chat-onboarding-active');
  return renderEmptyPresentationState(container, 'complete', context);
}
function renderPartialContextNoDataState(container: HTMLElement, panel: HTMLElement|null|undefined, context: PersonaContext, filled: number) {
  setOnboardingActive(panel);
  return renderEmptyPresentationState(container, 'partial', context, { filled });
}
function renderContextImportHandoffState(container: HTMLElement, panel: HTMLElement|null|undefined, context: PersonaContext, skipped: boolean) {
  panel?.classList.remove('chat-onboarding-active');
  return renderEmptyPresentationState(container, 'handoff', context, { skipped, filled: _countFilledCards() });
}
function renderInitialNoDataState(container: HTMLElement, panel: HTMLElement|null|undefined, context: PersonaContext) {
  setOnboardingActive(panel);
  return renderEmptyPresentationState(container, 'initial', context);
}
function renderDataContextNudgeState(container: HTMLElement, context: PersonaContext) {
  return renderEmptyPresentationState(container, 'nudge', context);
}
function renderGeneralPromptState(container: HTMLElement, context: PersonaContext) {
  const prompts = _getNoDataPrompts() || [
    'What are my most concerning results?', 'How has my bloodwork changed over time?',
    'Are there any patterns in my flagged markers?', 'Explain my thyroid panel', 'What should I test next?',
  ];
  return renderEmptyPresentationState(container, 'general', context, { prompts });
}
