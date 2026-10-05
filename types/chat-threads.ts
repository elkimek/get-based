import type { showPromptDialog } from '../js/utils.js';
import type { CHAT_PERSONALITIES } from '../js/constants.js';

/** Method readers at the original unguarded injected-callback calls. */
export interface ChatThreadDependencyMethods {
  cleanupDiscussionState: () => unknown;
  deleteAttachmentDraft: (threadId: string) => unknown;
  getActivePersonality: () => Pick<(typeof CHAT_PERSONALITIES)[number], 'name' | 'icon'> | null | undefined;
  loadChatHistory: () => unknown;
  renderChatMessages: () => unknown;
  renderSavedSummaries: () => unknown;
  refreshAttachmentDraft: () => unknown;
  restoreDiscussionContinuePrompt: () => unknown;
  saveChatHistory: () => unknown;
  stopChatGeneration: () => unknown;
  showPromptDialog: typeof showPromptDialog;
  stopVoiceActivity: () => unknown;
  updateChatHeaderTitle: () => unknown;
  updatePersonalityBar: () => unknown;
}
/** Object.assign accepts raw replacements, including explicit undefined. */
export type ChatThreadDependencyRegistry = { [Key in keyof ChatThreadDependencyMethods]: unknown };
export interface PendingThreadDrag { threadId: string; item: Element; source: Element; pointerId: number; startX: number; startY: number }
