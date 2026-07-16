// @ts-check
// app-shell-hooks.js - wire app shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { closeChangelog } from './changelog.js';
import { configureChatMessageActionDeps } from './chat-actions.js';
import {
  continueDiscussion,
  endDiscussion,
  startDiscussionFromPicker,
} from './chat-discussion.js';
import {
  initChatImageHandlers,
  openImageLightbox,
  removeImageAttachment,
  toggleHDMode,
  updateAttachButtonVisibility,
} from './chat-images.js';
import { configureDashboardAIContextStatus } from './context-card-dashboard-ai-runtime.js';
import { closeChatPanel, configureChatPanel, toggleChatPanel } from './chat-panel.js';
import { askAIAboutCorrelations } from './chat-marker-prompts.js';
import { onContextCardSaved } from './chat-onboarding.js';
import { updateChatNudge } from './chat-nudge.js';
import { updateChatContextStatus } from './chat-personalities.js';
import {
  closeSummaryModal,
  copySummary,
  deleteSavedSummary,
  downloadSummary,
  printSummary,
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
import { configureCompareCorrelationViews } from './compare-correlations.js';
import { configureContextCardsRuntimeCallbacks } from './context-cards-runtime.js';
import { closeEMFInterpretation } from './emf-interpretation.js';
import { clearAllData, closeReportBuilder } from './export.js';
import { exportAllDataJSON, exportClientJSON, importDataJSON, loadDemoData } from './export.js';
import { closeFeedbackModal, openFeedbackModal } from './feedback.js';
import { closeImportModal } from './pdf-import-review.js';
import { closeModal } from './marker-detail-modal.js';
import { closeMobileSidebar, configureNavActions } from './nav.js';
import { configureOnboardingViewRuntimeDeps } from './onboarding-view-runtime.js';
import { closeSettingsModal, closeTweaksPanel, configureSettingsRuntime } from './settings.js';
import { closeRestoreMnemonicDialog, closeSyncSetup } from './settings-sync-panel.js';
import {
  clearDashboardWidgets,
  navigate,
  refreshMobileDashboardActiveTab,
  resetDashboardWidgets,
  toggleDashboardOrganizeMode,
} from './views.js';
import { openProfileShareModal } from './profile-share.js';
import { getActiveProfileId } from './profile.js';
import { configureRecommendationsRuntime } from './recommendations-runtime.js';
import { configureShellChatImageDeps, configureShellChatThreadDeps } from './shell-actions.js';
import { configureStartupUIDeps } from './startup-ui.js';
import { configureSyncPullActiveRefreshDeps } from './sync-pull-active-refresh-runtime.js';
import { configureSunDefaultsRuntimeDeps } from './sun-defaults-runtime.js';

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
  openFeedbackModal,
  openProfileShareModal,
  refreshMobileDashboardActiveTab,
  resetDashboardWidgets,
  toggleDashboardOrganizeMode,
});

configureNavActions({ openClientList });
configureRecommendationsRuntime({ openProfileLocationEditor });
configureSunDefaultsRuntimeDeps({ openClientList, openProfileLocationEditor });

configureChatPanel({ refreshMobileDashboardActiveTab });
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
configureContextCardsRuntimeCallbacks({ onContextCardSaved });
configureShellChatImageDeps({ toggleHDMode });
configureShellChatThreadDeps({ createNewThread, filterThreadList, toggleThreadRail });
configureStartupUIDeps({ initChatImageHandlers, updateAttachButtonVisibility });
configureOnboardingViewRuntimeDeps({ createNewThread });
configureSyncPullActiveRefreshDeps({ ensureActiveThread, loadChatThreads, renderThreadList });
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
