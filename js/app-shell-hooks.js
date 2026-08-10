// @ts-check
// app-shell-hooks.js - wire app shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { configureApiProviderStorageRuntimeDeps } from './api-provider-storage-runtime.js';
import { startOpenRouterOAuth } from './api.js';
import { configureApiRuntimeCallbacks } from './api-runtime.js';
import { buildBiologyScoresAIContext } from './biology-score-ai-context.js';
import { configureBiologyScoresRuntimeDeps } from './biology-scores-runtime.js';
import { configureBiologyScoreContextAIDeps } from './biology-score-context-ai.js';
import { closeChangelog } from './changelog.js';
import { configureCategoryCustomizationRuntimeDeps } from './category-customization-runtime.js';
import { configureCategoryPageViewDeps } from './category-page-view.js';
import {
  askAIAboutCorrelations,
  askAIAboutMarker,
  clearChatHistory,
  closeChatPanel,
  closeSummaryModal,
  configureChatLoader,
  createNewThread,
  ensureActiveThreadIfLoaded,
  filterThreadList,
  handleChatKeydown,
  loadChatHistoryIfLoaded,
  loadChatThreadsIfLoaded,
  onContextCardSavedIfLoaded,
  openChatPanel,
  refreshChatPersonalitiesIfLoaded,
  renderThreadListIfLoaded,
  sendChatMessage,
  setChatPersonality,
  setChatWebSearchEnabled,
  startDiscussion,
  summarizeThread,
  toggleChatFullscreen,
  toggleChatPanel,
  toggleHDMode,
  togglePersonalityBar,
  toggleThreadRail,
  toggleVoiceRecording,
  updateChatContextStatusIfLoaded,
  updateChatHeaderModelIfLoaded,
  useChatPrompt,
} from './chat-loader.js';
import { configureDashboardAIContextStatus } from './context-card-dashboard-ai-runtime.js';
import { configureContextCardLifestyleRuntimeDeps } from './context-card-lifestyle-runtime.js';
import { configureDashboardPageRuntimeDeps } from './dashboard-page-view.js';
import { configureDashboardRecommendationRuntimeDeps } from './dashboard-recommendation-widget.js';
import { configureDashboardWidgetRuntimeDeps } from './dashboard-widget-runtime.js';
import { createDashboardViewComposition } from './dashboard-view-composition.js';
import { updateChatNudge } from './chat-nudge.js';
import { configureChatRuntimeCallbacks } from './chat-runtime.js';
import { closeClientList, configureClientListRuntime, openClientList, openProfileLocationEditor } from './client-list.js';
import { configureClientListRuntimeDeps } from './client-list-runtime.js';
import { configureCompareCorrelationViews } from './compare-correlations.js';
import {
  configureContextCardsRuntimeCallbacks,
  recordContextCardChange as recordChange,
} from './context-cards-runtime.js';
import {
  configureCryptoProfileDeps,
  encryptedSetItem,
} from './crypto.js';
import { parseAppleHealthCycleBlob, showCycleImportPreview } from './cycle-import-loader.js';
import { configureCycleRuntimeDeps } from './cycle-runtime.js';
import {
  configureDataRuntimeDeps,
  destroyAllCharts,
  getActiveData,
  saveImportedData,
  updateHeaderDates,
  updateHeaderRangeToggle,
} from './data.js';
import { configureDnaRuntimeDeps } from './dna-runtime.js';
import { configureEMFRuntimeDeps } from './emf-runtime.js';
import { closeEMFInterpretation, configureEMFInterpretationRuntimeDeps } from './emf-interpretation.js';
import {
  clearAllData,
  closeReportBuilder,
  configureExportFacadeLoaderDeps,
  exportAllDataJSON,
  exportClientJSON,
  importDataJSON,
  loadDemoData,
} from './export-loader.js';
import { configureExportImportRuntimeDeps } from './export-runtime.js';
import { closeFeedbackModal, openFeedbackModal } from './feedback.js';
import { loadImportStylesheet } from './import-loader.js';
import { configurePdfImportReviewRuntimeDeps } from './pdf-import-review-runtime.js';
import { configureLabContext, invalidateLabContextCache } from './lab-context.js';
import { configureLensPageShell } from './lens-page-shell.js';
import {
  detectWearableTrendSlots,
  loadHealthDataContextForPersistedState,
  openMenstrualCycleEditor,
  renderMenstrualCycleSection,
  renderSupplementsSection,
} from './health-data-loader.js';
import {
  configureLightSunShellLoaderDeps,
  loadLightSunModulesForPersistedState,
} from './light-sun-loader.js';
import { closeModal, rememberModalTrigger } from './marker-detail-modal.js';
import { configureMarkerDetailRuntime } from './marker-detail-runtime.js';
import { buildSidebar, closeMobileSidebar, configureNavActions, renderProfileButton, toggleMobileSidebar } from './nav.js';
import { configureNavRuntime } from './nav-runtime.js';
import { configureNotesRuntimeDeps } from './notes-runtime.js';
import { configureOnboardingViewRuntimeDeps } from './onboarding-view-runtime.js';
import {
  closeSettingsModal,
  closeTweaksPanel,
  configureSettingsLoader,
  openSettingsModal,
} from './settings-loader.js';
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
import { openProfileShareModal } from './profile-share-loader.js';
import {
  configureProfileDeps,
  configureProfileRuntimeDeps,
  getActiveProfileId,
  setProfileHeight,
} from './profile.js';
import {
  configureProfileRefreshDeps,
  dispatchProfileSwitched,
  invalidateProfileContextCache,
  refreshProfileButton,
  refreshProfileWearables,
  reloadProfileRuntimeShell,
} from './profile-runtime.js';
import {
  deleteProfileFromRelay,
  onChatSaved,
  onProfileSaved,
  pushContextToGateway,
} from './sync.js';
import { configureRecommendationsRuntime } from './recommendations-runtime.js';
import {
  configureShellChatActionDeps,
  configureShellChatImageDeps,
  configureShellChatThreadDeps,
  configureShellNavDeps,
  configureShellProfileShareDeps,
} from './shell-actions.js';
import { switchAIProviderBridge } from './settings-provider-bridge.js';
import { configureStartupUIDeps } from './startup-ui.js';
import { configureStartupOAuthCallbackDeps } from './startup-oauth-callbacks.js';
import { configureSyncPull } from './sync-pull.js';
import { configureSyncPullActiveRefreshDeps } from './sync-pull-active-refresh-runtime.js';
import { configureSupplementsRuntimeDeps } from './supplements-runtime.js';
import { configureTourRuntimeDeps } from './tour-runtime.js';
import { configureAppleHealthRuntimeDeps } from './wearables-apple-health-runtime.js';
import { configureWearablesConnectRuntimeDeps } from './wearables-connect-runtime.js';
import { configureWearableDetailRuntimeDeps } from './wearables-detail-runtime.js';
import { configureWearablesRuntime } from './wearables-runtime.js';
import { configureWearableSettingsRuntimeDeps } from './wearables-settings-runtime.js';
import { configureWearableSummary, syncWearableSummary } from './wearables-summary.js';
import { migrateBiometricsToManual } from './wearables-manual.js';

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
configureChatRuntimeCallbacks({
  onChatSaved,
  updateChatHeaderModel: updateChatHeaderModelIfLoaded,
  updateChatNudge,
});
configureChatLoader({
  closeModal,
  getActiveData,
  navigate,
  openChatProviderQuiz,
  openSettingsModal,
  prepareHealthDataContext: loadHealthDataContextForPersistedState,
  prepareLightSunContext: loadLightSunModulesForPersistedState,
  recordChange,
  refreshMobileDashboardActiveTab,
  renderMenstrualCycleSection,
  renderProfileButton,
  renderSupplementsSection,
  setOnboardingFocus,
  setProfileHeight,
  startOpenRouterOAuth,
  switchAIProvider: switchAIProviderBridge,
});
configureDashboardViewFactory(createDashboardViewComposition);
configureLabContext({ buildBiologyScoresAIContext });
configureProfileDeps({ deleteProfileFromRelay, onProfileSaved, pushContextToGateway });
configureProfileRuntimeDeps({
  dispatchProfileSwitched,
  invalidateProfileContextCache,
  refreshProfileButton,
  refreshProfileWearables,
  reloadProfileRuntimeShell,
});
configureProfileRefreshDeps({
  buildSidebar,
  destroyAllCharts,
  getInitialView,
  invalidateLabContextCache,
  migrateBiometricsToManual,
  navigate,
  renderProfileButton,
  syncWearableSummary,
  updateHeaderDates,
  updateHeaderRangeToggle,
});

configureClientListRuntime({
  exportAllDataJSON,
  exportClientJSON,
  importDataJSON,
  loadDemoData,
  openProfileShareModal,
});

configureSettingsLoader({
  configureModule(settingsModule) {
    settingsModule.configureSettingsRuntime({
      clearDashboardWidgets,
      clearAllData,
      exportAllDataJSON,
      exportClientJSON: profileId => profileId ? exportClientJSON(profileId) : undefined,
      getActiveProfileId,
      navigate,
      openFeedbackModal,
      openProfileShareModal,
      refreshMobileDashboardActiveTab,
      resetDashboardWidgets,
      toggleDashboardOrganizeMode,
    });
  },
});

configureNavActions({ openClientList });
configureNavRuntime({ navigate, openCreateMarkerModal });
configureClientListRuntimeDeps({ navigate, renderProfileButton });
configureCategoryCustomizationRuntimeDeps({ buildSidebar, navigate });
configureCategoryPageViewDeps({ renameCategory });
configureCryptoProfileDeps({ buildSidebar, navigate });
configureCycleRuntimeDeps({
  closeModal,
  loadImportStylesheet,
  navigate,
  openEditor: openMenstrualCycleEditor,
  renderProfileButton,
});
configureDataRuntimeDeps({ buildSidebar, navigate, showDetailModal });
configureDnaRuntimeDeps({ buildSidebar, navigate, openChatPanel });
configureExportFacadeLoaderDeps({ buildSidebar, navigate });
configureExportImportRuntimeDeps({
  buildSidebar,
  navigate,
  refreshChatPersonalities: refreshChatPersonalitiesIfLoaded,
  renderProfileButton,
  updateHeaderDates,
});
const confirmPdfImport = () => import('./pdf-import-commit.js').then(module => module.confirmImport());
const closeImportModal = () => {
  import('./pdf-import-review.js')
    .then(module => module.closeImportModal())
    .catch(() => {});
};
configurePdfImportReviewRuntimeDeps({ buildSidebar, confirmImport: confirmPdfImport, navigate });
configureViewsRouterRuntimeDeps({ closeMobileSidebar, navigate });
configureRecommendationsRuntime({ closeModal, openChatPanel, openProfileLocationEditor, openSettingsModal });
configureSupplementsRuntimeDeps({ closeModal, navigate });
configureLightSunShellLoaderDeps({
  buildSidebar,
  navigate,
  openClientList,
  openProfileLocationEditor,
});
configureBiologyScoreContextAIDeps({ navigate });
configureBiologyScoresRuntimeDeps({ navigate, openChatPanel, showDetailModal, useChatPrompt });
configureDashboardWidgetRuntimeDeps({ navigate, openChatPanel, showDetailModal });
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
configureLensPageShell({ navigate });
configureNotesRuntimeDeps({ closeModal, navigate, rememberModalTrigger });
configureContextCardLifestyleRuntimeDeps({ closeModal, navigate, openChatPanel, useChatPrompt });
configureDashboardPageRuntimeDeps({ closeChatPanel, openChatPanel });
configureEMFRuntimeDeps({
  closeModal,
  loadModule: () => import('./emf.js'),
});
configureEMFInterpretationRuntimeDeps({ closeModal, openChatPanel });

configureCompareCorrelationViews({ askAIAboutCorrelations });
configureContextCardsRuntimeCallbacks({ closeModal, navigate, onContextCardSaved: onContextCardSavedIfLoaded });
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
  toggleVoiceRecording,
});
configureShellChatImageDeps({ toggleHDMode });
configureShellChatThreadDeps({ createNewThread, filterThreadList, toggleThreadRail });
configureShellNavDeps({ closeMobileSidebar, toggleMobileSidebar });
configureShellProfileShareDeps({ openProfileShareModal });
configureStartupUIDeps({
  getInitialView,
  navigate,
  openChatPanel,
  openSettingsModal,
});
configureOnboardingViewRuntimeDeps({ buildSidebar, createNewThread, navigate, openChatPanel, toggleChatPanel });
configureTourRuntimeDeps({ openChatPanel });
configureSyncPull({ renderProfileButton });
configureSyncPullActiveRefreshDeps({
  buildSidebar,
  ensureActiveThread: ensureActiveThreadIfLoaded,
  loadChatHistory: loadChatHistoryIfLoaded,
  loadChatThreads: loadChatThreadsIfLoaded,
  navigate,
  refreshChatPersonalities: refreshChatPersonalitiesIfLoaded,
  renderThreadList: renderThreadListIfLoaded,
});
configureAppleHealthRuntimeDeps({
  parseCycleBlob: parseAppleHealthCycleBlob,
  showCyclePreview: showCycleImportPreview,
});
configureWearablesConnectRuntimeDeps({ navigate });
configureWearableDetailRuntimeDeps({ closeModal, navigate, rememberModalTrigger });
configureWearablesRuntime({
  closeModal,
  loadModule: useRetryUrl => {
    if (useRetryUrl) {
      // @ts-expect-error The browser accepts a fixed query-string module URL;
      // TypeScript resolves declarations only for the query-free source path.
      return import('./wearables.js?lazy-retry=1');
    }
    return import('./wearables.js');
  },
  navigate,
});
configureWearableSettingsRuntimeDeps({ navigate });
configureWearableSummary({ saveImportedData });
configureDashboardAIContextStatus(updateChatContextStatusIfLoaded);

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
