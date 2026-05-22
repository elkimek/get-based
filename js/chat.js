// chat.js — chat window compatibility exports and callback wiring

import { setAIPaused } from './api.js';
import { getChatThreadKey, getChatThreadsKey } from './chat-threads.js';
import { applyInlineMarkdown, renderMarkdown } from './markdown.js';
import { renderChatMessages } from './chat-render.js';
import { askAIAboutCorrelations, askAIAboutMarker } from './chat-marker-prompts.js';
import {
  createTypewriter, getChatAbortController, handleChatKeydown,
  isChatStreaming, sendChatMessage, setChatAbortController,
  setSendButtonMode,
} from './chat-send.js';
import {
  closeSummaryModal, copySummary, deleteSavedSummary, downloadSummary,
  printSummary, renderSavedSummaries, summarizeThread, viewSavedSummary,
} from './chat-summaries.js';
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
  endDiscussion, getThreadPersonaCount,
  removeDiscussContinuePrompt, restoreDiscussionContinuePrompt,
  showDiscussContinuePrompt, startDiscussion, startDiscussionFromPicker,
  updateDiscussButton,
} from './chat-discussion.js';
import {
  _updatePeriodBtn, addChatSupplement,
  backToProviderQuiz, configureChatOnboarding, onContextCardSaved,
  onboardHeightUnitChanged, removeChatSupplement,
  requestOnboardingLabImportProvider, saveChatLocation, saveChatPeriod,
  saveChatProfile, saveCycleStatus, setChatProfileSex,
  setProviderQuizBranch, showCycleNoMensesOptions, showCyclePeriodEntry,
  skipOnboardingExtras, skipProviderSetup, startOnboardingLabImport,
  useChatPrompt,
} from './chat-onboarding.js';
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
// WINDOW EXPORTS (for onclick handlers)
// ═══════════════════════════════════════════════
function _resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

configureChatDiscussion({
  createTypewriter,
  getChatAbortController,
  renderChatMessages,
  setChatAbortController,
  setSendButtonMode,
});
configureChatOnboarding({
  closeChatPanel,
  renderChatMessages,
  sendChatMessage,
  setChatNudge,
  updateChatNudge,
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
