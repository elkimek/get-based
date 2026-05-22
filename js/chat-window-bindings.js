// chat-window-bindings.js — chat callback wiring and legacy window exports

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
  endDiscussion, getThreadPersonaCount, removeDiscussContinuePrompt,
  restoreDiscussionContinuePrompt, showDiscussContinuePrompt,
  startDiscussion, startDiscussionFromPicker, updateDiscussButton,
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
