// app-chat-hooks.js - first-use Chat wiring that must not enter the startup graph.

import { setAIPaused } from './api.js';
import { configureChatMessageActionDeps } from './chat-actions.js';
import { configureChatEmptyStateDeps } from './chat-empty-state.js';
import {
  continueDiscussion,
  endDiscussion,
  resumeDiscussion,
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
import { renderChatMessages, revealChatMessage, showEarlierChatMessages } from './chat-render.js';
import {
  beginChatMessageEdit,
  cancelChatMessageEdit,
  configureChatMessageEditDeps,
  forkChatFromMessage,
  submitChatMessageEdit,
} from './chat-message-edit.js';
import { isChatStreaming, sendChatMessage, stopChatGeneration } from './chat-send.js';
import {
  closeSummaryModal,
  copySummary,
  deleteSavedSummary,
  downloadSummary,
  printSummary,
  viewSavedSummary,
} from './chat-summaries.js';
import { configureChatThreadSearch, jumpToSearchResult } from './chat-thread-search.js';
import { updateChatNudge } from './chat-nudge.js';
import {
  updateChatHeaderModel,
} from './chat-personalities.js';
import {
  isVoicePlaybackActive,
  restoreVoicePlaybackUi,
  stopVoiceActivity,
  toggleMessageSpeech,
} from './voice-loader.js';
import { switchToThread } from './chat-threads.js';
let initialized = false;

function resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

export function configureAppChatHooks(deps: unknown = {}) {
  (configureChatOnboardingHostBindings as (deps: unknown) => ReturnType<typeof configureChatOnboardingHostBindings>)(deps);
  configureChatEmptyStateDeps({
    closeChatPanel,
    openChatProviderQuiz: (deps as Record<string, unknown>).openChatProviderQuiz,
    setOnboardingFocus: (deps as Record<string, unknown>).setOnboardingFocus,
  });
  configureChatPanel({
    isVoicePlaybackActive,
    refreshMobileDashboardActiveTab: (deps as Record<string, unknown>).refreshMobileDashboardActiveTab,
    restoreVoicePlaybackUi,
    stopVoiceActivity,
  });
  (configureChatRuntimeCallbacks as (callbacks: Omit<NonNullable<Parameters<typeof configureChatRuntimeCallbacks>[0]>, 'closeModal'> & { closeModal: unknown }) => ReturnType<typeof configureChatRuntimeCallbacks>)({
    closeModal: (deps as Record<string, unknown>).closeModal,
    isChatStreaming,
    refreshWebSearchToggle: () => {
      refreshWebSearchToggle();
      updateAttachButtonVisibility();
      updateChatInputState();
    },
    renderChatMessages,
    resumeAI,
    sendChatMessage,
    updateDiscussButton,
    updateChatHeaderModel,
    updateChatNudge,
  });
  configureChatMessageEditDeps({ renderChatMessages, sendChatMessage, updateChatInputState });
  configureChatMessageActionDeps({
    closeSummaryModal,
    continueDiscussion,
    copySummary,
    deleteSavedSummary,
    downloadSummary,
    endDiscussion,
    editUserMessage: beginChatMessageEdit,
    forkMessage: forkChatFromMessage,
    jumpToSearchResult,
    openImageLightbox,
    pauseDiscussion: stopChatGeneration,
    printSummary,
    cancelMessageEdit: cancelChatMessageEdit,
    removeImageAttachment,
    renderChatMessages,
    resumeDiscussion,
    retryDiscussionParticipant: resumeDiscussion,
    showEarlierMessages: showEarlierChatMessages,
    startDiscussionFromPicker,
    submitMessageEdit: submitChatMessageEdit,
    switchThread: switchToThread,
    toggleMessageSpeech,
    viewSavedSummary,
  });
  configureChatThreadSearch({ revealMessage: revealChatMessage });

  if (!initialized) {
    initialized = true;
    initChatImageHandlers();
    updateAttachButtonVisibility();
  }
}
