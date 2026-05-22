// chat.js — chat window exports and marker/correlation entry points

import { state } from './state.js';
import { formatValue, getStatus } from './utils.js';
import { getActiveData, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex } from './data.js';
import { setAIPaused } from './api.js';
import { getChatThreadKey, getChatThreadsKey } from './chat-threads.js';
import { applyInlineMarkdown, renderMarkdown } from './markdown.js';
import { renderChatMessages } from './chat-render.js';
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

export function askAIAboutMarker(markerId) {
  const marker = state.markerRegistry[markerId];
  if (!marker) return;
  const data = getActiveData();
  const dates = marker.singlePoint ? [marker.singleDateLabel || 'N/A'] : data.dates;
  const valuesText = marker.values
    .map((v, i) => {
      if (v === null) return null;
      let text = `${dates[i]}: ${formatValue(v)} ${marker.unit}`;
      if (marker.phaseLabels && marker.phaseLabels[i]) {
        const pr = marker.phaseRefRanges[i];
        text += ` (${marker.phaseLabels[i]} phase, ref ${formatValue(pr.min)}\u2013${formatValue(pr.max)})`;
      }
      return text;
    })
    .filter(Boolean).join(', ');
  const latestIdx = getLatestValueIndex(marker.values);
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const status = latestIdx !== -1 ? getStatus(marker.values[latestIdx], lr.min, lr.max) : 'no data';
  let prompt = `Tell me about my ${marker.name} results. Values: ${valuesText}. Reference range: ${marker.refMin}\u2013${marker.refMax} ${marker.unit}${marker.optimalMin != null ? `. Optimal range: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}. Current status: ${status}.`;
  if (marker.phaseLabels) prompt += ' Note: reference ranges shown are phase-specific for the menstrual cycle.';
  const nonNull = marker.values.filter(v => v !== null);
  if (nonNull.length >= 2) {
    const prev = nonNull[nonNull.length - 2];
    const last = nonNull[nonNull.length - 1];
    if (prev !== 0) {
      const pctChange = ((last - prev) / prev * 100).toFixed(1);
      const dir = last > prev ? 'up' : last < prev ? 'down' : 'stable';
      prompt += ` Trend: ${dir} ${Math.abs(parseFloat(pctChange))}% from previous.`;
    }
  }
  prompt += ' What does this mean and should I be concerned about anything?';
  window.closeModal();
  openChatPanel(prompt);
}

export function askAIAboutCorrelations() {
  if (state.selectedCorrelationMarkers.length < 2) return;
  const data = getActiveData();
  const parts = state.selectedCorrelationMarkers.map(key => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return null;
    const valuesText = marker.values
      .map((v, i) => v !== null ? `${data.dates[i]}: ${formatValue(v)} ${marker.unit}` : null)
      .filter(Boolean).join(', ');
    const mr = getEffectiveRange(marker);
    const latestIdx = getLatestValueIndex(marker.values);
    const status = latestIdx !== -1 ? getStatus(marker.values[latestIdx], mr.min, mr.max) : 'no data';
    return `- ${marker.name}: ${valuesText} (ref: ${marker.refMin}\u2013${marker.refMax} ${marker.unit}${marker.optimalMin != null ? `, optimal: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}, status: ${status})`;
  }).filter(Boolean);
  const names = state.selectedCorrelationMarkers.map(key => {
    const [catKey, markerKey] = key.split('.');
    return data.categories[catKey]?.markers[markerKey]?.name || key;
  });
  const prompt = `Analyze the correlation between these biomarkers: ${names.join(', ')}.\n\nHere are my values:\n${parts.join('\n')}\n\nHow do these markers relate to each other? Are there any patterns, imbalances, or concerns based on their combined trends?`;
  openChatPanel(prompt);
}

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
