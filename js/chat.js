// chat.js — chat public barrel and window-binding entry point

import './chat-window-bindings.js';

export { renderChatMessages } from './chat-render.js';
export { askAIAboutCorrelations, askAIAboutMarker } from './chat-marker-prompts.js';
export { handleChatKeydown, isChatStreaming, sendChatMessage } from './chat-send.js';
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
