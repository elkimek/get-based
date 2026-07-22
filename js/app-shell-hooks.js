// @ts-check
// app-shell-hooks.js - wire app shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { configureApiProviderStorageRuntimeDeps } from './api-provider-storage-runtime.js';
import { setAIPaused } from './api.js';
import { configureApiRuntimeCallbacks } from './api-runtime.js';
import { buildBiologyScoresAIContext } from './biology-score-ai-context.js';
import { configureBiologyScoresRuntimeDeps } from './biology-scores-runtime.js';
import { configureBiologyScoreContextAIDeps } from './biology-score-context-ai.js';
import { closeChangelog } from './changelog.js';
import { configureChatMessageActionDeps } from './chat-actions.js';
import { configureChatEmptyStateDeps } from './chat-empty-state.js';
import { configureCategoryCustomizationRuntimeDeps } from './category-customization-runtime.js';
import { configureCategoryPageViewDeps } from './category-page-view.js';
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
import { configureDashboardRecommendationRuntimeDeps } from './dashboard-recommendation-widget.js';
import { configureDashboardWidgetRuntimeDeps } from './dashboard-widget-runtime.js';
import { createDashboardViewComposition } from './dashboard-view-composition.js';
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
import { configureCryptoProfileDeps, encryptedSetItem } from './crypto.js';
import { configureCycleRuntimeDeps } from './cycle-runtime.js';
import { configureDataRuntimeDeps } from './data.js';
import { configureDnaRuntimeDeps } from './dna-runtime.js';
import { configureEMFRuntimeDeps } from './emf-runtime.js';
import { closeEMFInterpretation, configureEMFInterpretationRuntimeDeps } from './emf-interpretation.js';
import { clearAllData, closeReportBuilder, configureExportRuntimeDeps } from './export.js';
import { exportAllDataJSON, exportClientJSON, importDataJSON, loadDemoData } from './export.js';
import { closeFeedbackModal, openFeedbackModal } from './feedback.js';
import { closeImportModal } from './pdf-import-review.js';
import { configurePdfImportReviewRuntimeDeps } from './pdf-import-review-runtime.js';
import { _openChannelOnLightPage } from './light-channel-view.js';
import { configureLightDevicesRuntimeDeps } from './light-devices-runtime.js';
import { configureLabContext } from './lab-context.js';
import { configureLensPageShell } from './lens-page-shell.js';
import { closeModal, rememberModalTrigger } from './marker-detail-modal.js';
import { configureMarkerDetailRuntime } from './marker-detail-runtime.js';
import { buildSidebar, closeMobileSidebar, configureNavActions, renderProfileButton, toggleMobileSidebar } from './nav.js';
import { configureNavRuntime } from './nav-runtime.js';
import { configureNotesRuntimeDeps } from './notes-runtime.js';
import { configureOnboardingViewRuntimeDeps } from './onboarding-view-runtime.js';
import { closeSettingsModal, closeTweaksPanel, configureSettingsRuntime, openSettingsModal } from './settings.js';
import { closeRestoreMnemonicDialog, closeSyncSetup } from './settings-sync-panel.js';
import {
  clearDashboardWidgets,
  configureDashboardViewFactory,
  getInitialView,
  navigate,
  openChatProviderQuiz,
  openCreateMarkerModal,
  openRecommendationDetail,
  refreshMobileDashboardActiveTab,
  renameCategory,
  renameMarker,
  renderLightChannelsLive,
  renderLightTodayStrip,
  resetDashboardWidgets,
  revertMarkerName,
  showDetailModal,
  setOnboardingFocus,
  dismissRecommendation,
  discussRecommendation,
  saveRecommendation,
  toggleDashboardOrganizeMode,
} from './views.js';
import { configureViewsRouterRuntimeDeps } from './views-router-runtime.js';
import { openProfileShareModal } from './profile-share.js';
import { configureProfileRuntimeDeps, getActiveProfileId } from './profile.js';
import {
  dispatchProfileSwitched,
  invalidateProfileContextCache,
  refreshProfileButton,
  reloadProfileRuntimeShell,
} from './profile-runtime.js';
import { detectWearableTrendSlots } from './recommendations.js';
import { configureRecommendationsRuntime } from './recommendations-runtime.js';
import {
  configureShellChatActionDeps,
  configureShellChatImageDeps,
  configureShellChatThreadDeps,
  configureShellNavDeps,
  configureShellProfileShareDeps,
} from './shell-actions.js';
import { configureStartupUIDeps } from './startup-ui.js';
import { configureStartupOAuthCallbackDeps } from './startup-oauth-callbacks.js';
import { configureSyncPull } from './sync-pull.js';
import { configureSyncPullActiveRefreshDeps } from './sync-pull-active-refresh-runtime.js';
import { configureSunDefaultsRuntimeDeps } from './sun-defaults-runtime.js';
import { configureSunRuntimeDeps } from './sun-runtime.js';
import { configureSupplementsRuntimeDeps } from './supplements-runtime.js';
import { configureTourRuntimeDeps } from './tour-runtime.js';
import { configureWearablesConnectRuntimeDeps } from './wearables-connect-runtime.js';
import { configureWearableDetailRuntimeDeps } from './wearables-detail-runtime.js';
import { configureWearablesRuntime } from './wearables-runtime.js';
import { configureWearableSettingsRuntimeDeps } from './wearables-settings-runtime.js';

function showInsufficientBalanceDialog() {
  if (typeof document === 'undefined') return false;
  import('./provider-panels.js')
    .then(providerPanels => providerPanels.showInsufficientBalanceDialog())
    .catch(() => {});
  return true;
}

configureApiRuntimeCallbacks({ showInsufficientBalanceDialog });
configureApiProviderStorageRuntimeDeps({ encryptedSetItem });
configureStartupOAuthCallbackDeps({ showInsufficientBalanceDialog });
configureDashboardViewFactory(createDashboardViewComposition);
configureLabContext({ buildBiologyScoresAIContext });
configureProfileRuntimeDeps({
  dispatchProfileSwitched,
  invalidateProfileContextCache,
  refreshProfileButton,
  reloadProfileRuntimeShell,
});

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
configureNavRuntime({ navigate, openCreateMarkerModal });
configureClientListRuntimeDeps({ navigate, renderProfileButton });
configureCategoryCustomizationRuntimeDeps({ buildSidebar, navigate });
configureCategoryPageViewDeps({ renameCategory });
configureCryptoProfileDeps({ buildSidebar, navigate });
configureCycleRuntimeDeps({ closeModal, navigate, renderProfileButton });
configureDataRuntimeDeps({ buildSidebar, navigate, showDetailModal });
configureDnaRuntimeDeps({ buildSidebar, navigate });
configureExportRuntimeDeps({ buildSidebar, navigate });
configurePdfImportReviewRuntimeDeps({ buildSidebar, navigate });
configureViewsRouterRuntimeDeps({ closeMobileSidebar, navigate });
configureRecommendationsRuntime({ closeModal, openChatPanel, openProfileLocationEditor, openSettingsModal });
configureSupplementsRuntimeDeps({ closeModal, navigate });
configureSunDefaultsRuntimeDeps({ navigate, openClientList, openProfileLocationEditor });
configureSunRuntimeDeps({
  buildSidebar,
  navigate,
  openChannelOnLightPage: _openChannelOnLightPage,
  renderLightChannelsLive,
  renderLightTodayStrip,
});
configureBiologyScoreContextAIDeps({ navigate });
configureBiologyScoresRuntimeDeps({ navigate, openChatPanel, showDetailModal, useChatPrompt });
configureDashboardWidgetRuntimeDeps({ navigate, showDetailModal });
configureDashboardRecommendationRuntimeDeps({
  detectWearableTrendSlots,
  dismissRecommendation,
  discussRecommendation,
  navigate,
  openRecommendationDetail,
  openSettingsModal,
  saveRecommendation,
  showDetailModal,
});
configureLightDevicesRuntimeDeps({ navigate, openChannelOnLightPage: _openChannelOnLightPage });
configureLensPageShell({ navigate });
configureNotesRuntimeDeps({ closeModal, navigate, rememberModalTrigger });
configureContextCardLifestyleRuntimeDeps({ closeModal, navigate, openChatPanel, useChatPrompt });
configureChatEmptyStateDeps({ closeChatPanel, openChatProviderQuiz, setOnboardingFocus });
configureDashboardPageRuntimeDeps({ closeChatPanel, openChatPanel });
configureEMFRuntimeDeps({ closeModal });
configureEMFInterpretationRuntimeDeps({ closeModal, openChatPanel });

function resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

configureChatPanel({ refreshMobileDashboardActiveTab });
configureChatRuntimeCallbacks({
  closeModal,
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
configureMarkerDetailRuntime({ askAIAboutMarker, buildSidebar, navigate, renameMarker, revertMarkerName });
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
configureShellProfileShareDeps({ openProfileShareModal });
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
configureSyncPull({ renderProfileButton });
configureSyncPullActiveRefreshDeps({ buildSidebar, ensureActiveThread, loadChatHistory, loadChatThreads, navigate, renderThreadList });
configureWearablesConnectRuntimeDeps({ navigate });
configureWearableDetailRuntimeDeps({ closeModal, navigate, rememberModalTrigger });
configureWearablesRuntime({ closeModal, navigate });
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
