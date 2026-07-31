// @ts-check
// app-chat-hooks.js - first-use Chat wiring that must not enter the startup graph.

import { setAIPaused } from './api.js';
import { configureChatMessageActionDeps } from './chat-actions.js';
import { configureChatEmptyStateDeps } from './chat-empty-state.js';
import {
  continueDiscussion,
  endDiscussion,
  startDiscussionFromPicker,
  updateDiscussButton,
} from './chat-discussion.js';
import {
  initChatImageHandlers,
  openImageLightbox,
  removeImageAttachment,
  updateAttachButtonVisibility,
} from './chat-images.js';
import {
  closeChatPanel,
  configureChatPanel,
  refreshWebSearchToggle,
  updateChatInputState,
} from './chat-panel.js';
import { configureChatOnboardingHostBindings } from './chat-onboarding-host-bindings.js';
import { configureChatRuntimeCallbacks } from './chat-runtime.js';
import { renderChatMessages } from './chat-render.js';
import { isChatStreaming, sendChatMessage } from './chat-send.js';
import {
  closeSummaryModal,
  copySummary,
  deleteSavedSummary,
  downloadSummary,
  printSummary,
  viewSavedSummary,
} from './chat-summaries.js';
import { jumpToSearchResult } from './chat-thread-search.js';
import { updateChatNudge } from './chat-nudge.js';
import {
  updateChatHeaderModel,
} from './chat-personalities.js';
import { stopVoiceActivity, toggleMessageSpeech } from './voice-loader.js';
let initialized = false;

function resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

/** @param {Record<string, any>} [deps] */
export function configureAppChatHooks(deps = {}) {
  configureChatOnboardingHostBindings(deps);
  configureChatEmptyStateDeps({
    closeChatPanel,
    openChatProviderQuiz: deps.openChatProviderQuiz,
    setOnboardingFocus: deps.setOnboardingFocus,
  });
  configureChatPanel({
    refreshMobileDashboardActiveTab: deps.refreshMobileDashboardActiveTab,
    stopVoiceActivity,
  });
  configureChatRuntimeCallbacks({
    closeModal: deps.closeModal,
    isChatStreaming,
    refreshWebSearchToggle,
    renderChatMessages,
    resumeAI,
    sendChatMessage,
    updateDiscussButton,
    updateChatHeaderModel,
    updateChatNudge,
  });
  configureChatMessageActionDeps({
    closeSummaryModal,
    continueDiscussion,
    copySummary,
    deleteSavedSummary,
    downloadSummary,
    endDiscussion,
    jumpToSearchResult,
    openImageLightbox,
    printSummary,
    removeImageAttachment,
    startDiscussionFromPicker,
    toggleMessageSpeech,
    viewSavedSummary,
  });

  if (!initialized) {
    initialized = true;
    initChatImageHandlers();
    updateAttachButtonVisibility();
  }
}
