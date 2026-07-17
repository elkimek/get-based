// @ts-check
// app-shell-hooks.js - wire app shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { setAIPaused } from './api.js';
import { configureBiologyScoresRuntimeDeps } from './biology-scores-runtime.js';
import { closeChangelog } from './changelog.js';
import { configureChatMessageActionDeps } from './chat-actions.js';
import { configureChatEmptyStateDeps } from './chat-empty-state.js';
import { configureCategoryCustomizationRuntimeDeps } from './category-customization-runtime.js';
import {
  continueDiscussion,
  endDiscussion,
  startDiscussion,
  startDiscussionFromPicker,
  updateDiscussButton,
} from './chat-discussion.js';
import {
  initChatImageHandlers,
  openImageLightbox,
  removeImageAttachment,
  toggleHDMode,
  updateAttachButtonVisibility,
} from './chat-images.js';
import { configureDashboardAIContextStatus } from './context-card-dashboard-ai-runtime.js';
import { configureContextCardLifestyleRuntimeDeps } from './context-card-lifestyle-runtime.js';
import { configureDashboardPageRuntimeDeps } from './dashboard-page-view.js';
import { configureDashboardWidgetRuntimeDeps } from './dashboard-widget-runtime.js';
import {
  closeChatPanel,
  configureChatPanel,
  openChatPanel,
  refreshWebSearchToggle,
  setChatWebSearchEnabled,
  toggleChatFullscreen,
  toggleChatPanel,
  updateChatInputState,
} from './chat-panel.js';
import { clearChatHistory, loadChatHistory } from './chat-history.js';
import { askAIAboutCorrelations, askAIAboutMarker } from './chat-marker-prompts.js';
import { onContextCardSaved, useChatPrompt } from './chat-onboarding.js';
import { updateChatNudge } from './chat-nudge.js';
import {
  setChatPersonality,
  togglePersonalityBar,
  updateChatContextStatus,
  updateChatHeaderModel,
} from './chat-personalities.js';
import { configureChatRuntimeCallbacks } from './chat-runtime.js';
import { renderChatMessages } from './chat-render.js';
import { handleChatKeydown, isChatStreaming, sendChatMessage } from './chat-send.js';
import {
  closeSummaryModal,
  copySummary,
  deleteSavedSummary,
  downloadSummary,
  printSummary,
  summarizeThread,
  viewSavedSummary,
} from './chat-summaries.js';
import { jumpToSearchResult } from './chat-thread-search.js';
import {
  createNewThread,
  ensureActiveThread,
  filterThreadList,
  loadChatThreads,
  renderThreadList,
  toggleThreadRail,
} from './chat-threads.js';
import { closeClientList, configureClientListRuntime, openClientList, openProfileLocationEditor } from './client-list.js';
import { configureClientListRuntimeDeps } from './client-list-runtime.js';
import { configureCompareCorrelationViews } from './compare-correlations.js';
import { configureContextCardsRuntimeCallbacks } from './context-cards-runtime.js';
import { configureCycleRuntimeDeps } from './cycle-runtime.js';
import { configureDnaRuntimeDeps } from './dna-runtime.js';
import { closeEMFInterpretation, configureEMFInterpretationRuntimeDeps } from './emf-interpretation.js';
import { clearAllData, closeReportBuilder } from './export.js';
import { exportAllDataJSON, exportClientJSON, importDataJSON, loadDemoData } from './export.js';
import { closeFeedbackModal, openFeedbackModal } from './feedback.js';
import { closeImportModal } from './pdf-import-review.js';
import { configurePdfImportReviewRuntimeDeps } from './pdf-import-review-runtime.js';
import { _openChannelOnLightPage } from './light-channel-view.js';
import { configureLightDevicesRuntimeDeps } from './light-devices-runtime.js';
import { closeModal } from './marker-detail-modal.js';
import { configureMarkerDetailRuntime } from './marker-detail-runtime.js';
import { buildSidebar, closeMobileSidebar, configureNavActions, renderProfileButton, toggleMobileSidebar } from './nav.js';
import { configureOnboardingViewRuntimeDeps } from './onboarding-view-runtime.js';
import { closeSettingsModal, closeTweaksPanel, configureSettingsRuntime, openSettingsModal } from './settings.js';
import { closeRestoreMnemonicDialog, closeSyncSetup } from './settings-sync-panel.js';
import {
  clearDashboardWidgets,
  getInitialView,
  navigate,
  refreshMobileDashboardActiveTab,
  renderLightChannelsLive,
  renderLightTodayStrip,
  resetDashboardWidgets,
  showDetailModal,
  toggleDashboardOrganizeMode,
} from './views.js';
import { configureViewsRouterRuntimeDeps } from './views-router-runtime.js';
import { openProfileShareModal } from './profile-share.js';
import { getActiveProfileId } from './profile.js';
import { configureRecommendationsRuntime } from './recommendations-runtime.js';
import {
  configureShellChatActionDeps,
  configureShellChatImageDeps,
  configureShellChatThreadDeps,
  configureShellNavDeps,
} from './shell-actions.js';
import { configureStartupUIDeps } from './startup-ui.js';
import { configureSyncPullActiveRefreshDeps } from './sync-pull-active-refresh-runtime.js';
import { configureSunDefaultsRuntimeDeps } from './sun-defaults-runtime.js';
import { configureSunRuntimeDeps } from './sun-runtime.js';
import { configureSupplementsRuntimeDeps } from './supplements-runtime.js';
import { configureTourRuntimeDeps } from './tour-runtime.js';
import { configureWearablesConnectRuntimeDeps } from './wearables-connect-runtime.js';
import { configureWearableSettingsRuntimeDeps } from './wearables-settings-runtime.js';

configureClientListRuntime({
  exportAllDataJSON,
  exportClientJSON,
  importDataJSON,
  loadDemoData,
  openProfileShareModal,
});

configureSettingsRuntime({
  clearDashboardWidgets,
  clearAllData,
  exportAllDataJSON,
  exportClientJSON,
  getActiveProfileId,
  navigate,
  openFeedbackModal,
  openProfileShareModal,
  refreshMobileDashboardActiveTab,
  resetDashboardWidgets,
  toggleDashboardOrganizeMode,
});

configureNavActions({ openClientList });
configureClientListRuntimeDeps({ navigate, renderProfileButton });
configureCategoryCustomizationRuntimeDeps({ buildSidebar, navigate });
configureCycleRuntimeDeps({ closeModal, navigate, renderProfileButton });
configureDnaRuntimeDeps({ buildSidebar, navigate });
configurePdfImportReviewRuntimeDeps({ buildSidebar, navigate });
configureViewsRouterRuntimeDeps({ closeMobileSidebar, navigate });
configureRecommendationsRuntime({ openChatPanel, openProfileLocationEditor });
configureSupplementsRuntimeDeps({ closeModal, navigate });
configureSunDefaultsRuntimeDeps({ navigate, openClientList, openProfileLocationEditor });
configureSunRuntimeDeps({
  buildSidebar,
  navigate,
  openChannelOnLightPage: _openChannelOnLightPage,
  renderLightChannelsLive,
  renderLightTodayStrip,
});
configureBiologyScoresRuntimeDeps({ navigate, openChatPanel, showDetailModal, useChatPrompt });
configureDashboardWidgetRuntimeDeps({ navigate, showDetailModal });
configureLightDevicesRuntimeDeps({ navigate, openChannelOnLightPage: _openChannelOnLightPage });
configureContextCardLifestyleRuntimeDeps({ closeModal, navigate, openChatPanel, useChatPrompt });
configureChatEmptyStateDeps({ closeChatPanel });
configureDashboardPageRuntimeDeps({ closeChatPanel, openChatPanel });
configureEMFInterpretationRuntimeDeps({ openChatPanel });

function resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

configureChatPanel({ refreshMobileDashboardActiveTab });
configureChatRuntimeCallbacks({
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
  viewSavedSummary,
});
configureCompareCorrelationViews({ askAIAboutCorrelations });
configureContextCardsRuntimeCallbacks({ closeModal, navigate, onContextCardSaved });
configureMarkerDetailRuntime({ askAIAboutMarker });
configureShellChatActionDeps({
  closeChatPanel,
  clearChatHistory,
  handleChatKeydown,
  sendChatMessage,
  setChatPersonality,
  setChatWebSearchEnabled,
  startDiscussion,
  summarizeThread,
  toggleChatPanel,
  toggleChatFullscreen,
  togglePersonalityBar,
});
configureShellChatImageDeps({ toggleHDMode });
configureShellChatThreadDeps({ createNewThread, filterThreadList, toggleThreadRail });
configureShellNavDeps({ closeMobileSidebar, toggleMobileSidebar });
configureStartupUIDeps({
  getInitialView,
  initChatImageHandlers,
  navigate,
  openChatPanel,
  openSettingsModal,
  updateAttachButtonVisibility,
});
configureOnboardingViewRuntimeDeps({ buildSidebar, createNewThread, navigate, openChatPanel, toggleChatPanel });
configureTourRuntimeDeps({ openChatPanel });
configureSyncPullActiveRefreshDeps({ buildSidebar, ensureActiveThread, loadChatHistory, loadChatThreads, navigate, renderThreadList });
configureWearablesConnectRuntimeDeps({ navigate });
configureWearableSettingsRuntimeDeps({ navigate });
configureDashboardAIContextStatus(updateChatContextStatus);

configureAppEventListeners({
  closeChangelog,
  closeChatPanel,
  closeClientList,
  closeEMFInterpretation,
  closeFeedbackModal,
  closeImportModal,
  closeMobileSidebar,
  closeModal,
  closeReportBuilder,
  closeRestoreMnemonicDialog,
  closeSettingsModal,
  closeSummaryModal,
  closeSyncSetup,
  closeTweaksPanel,
  navigate,
  toggleChatPanel,
  updateChatNudge,
});
