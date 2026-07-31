// @ts-check
// app-ai-interaction-modules.js - first-use Chat and AI interaction composition

import './chat.js';

export * from './chat.js';
export { configureAppChatHooks } from './app-chat-hooks.js';
export {
  initChatImageHandlers,
  openImageLightbox,
  removeImageAttachment,
  toggleHDMode,
  updateAttachButtonVisibility,
} from './chat-images.js';
export {
  closeSummaryModal,
  copySummary,
  deleteSavedSummary,
  downloadSummary,
  printSummary,
  summarizeThread,
  viewSavedSummary,
} from './chat-summaries.js';
export {
  createNewThread,
  ensureActiveThread,
  filterThreadList,
  loadChatThreads,
  renderThreadList,
  toggleThreadRail,
} from './chat-threads.js';
export { updateChatContextStatus } from './chat-personalities.js';
export {
  stopVoiceActivity,
  toggleMessageSpeech,
  toggleVoiceRecording,
} from './voice-loader.js';
