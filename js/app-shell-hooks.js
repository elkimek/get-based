// @ts-check
// app-shell-hooks.js - wire app shell actions without window lookups.

import { configureAppEventListeners } from './app-event-listeners.js';
import { closeChangelog } from './changelog.js';
import { configureChatMessageActionDeps } from './chat-actions.js';
import {
  initChatImageHandlers,
  openImageLightbox,
  removeImageAttachment,
  toggleHDMode,
  updateAttachButtonVisibility,
} from './chat-images.js';
import { configureDashboardAIContextStatus } from './context-card-dashboard-ai-runtime.js';
import { closeChatPanel, configureChatPanel, toggleChatPanel } from './chat-panel.js';
import { updateChatNudge } from './chat-nudge.js';
import { updateChatContextStatus } from './chat-personalities.js';
import { closeSummaryModal } from './chat-summaries.js';
import { closeClientList, configureClientListRuntime } from './client-list.js';
import { closeEMFInterpretation } from './emf-interpretation.js';
import { clearAllData, closeReportBuilder } from './export.js';
import { exportAllDataJSON, exportClientJSON, importDataJSON, loadDemoData } from './export.js';
import { closeFeedbackModal, openFeedbackModal } from './feedback.js';
import { closeImportModal } from './pdf-import-review.js';
import { closeModal } from './marker-detail-modal.js';
import { closeMobileSidebar } from './nav.js';
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
import { configureShellChatImageDeps } from './shell-actions.js';
import { configureStartupUIDeps } from './startup-ui.js';

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

configureChatPanel({ refreshMobileDashboardActiveTab });
configureChatMessageActionDeps({ openImageLightbox, removeImageAttachment });
configureShellChatImageDeps({ toggleHDMode });
configureStartupUIDeps({ initChatImageHandlers, updateAttachButtonVisibility });
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
