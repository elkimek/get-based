// @ts-check
// chat-window-bindings.js — chat callback wiring

import { configureChatThreadDeps } from './chat-threads.js';
import { renderChatMessages } from './chat-render.js';
import {
  createTypewriter, getChatAbortController, sendChatMessage,
  setChatAbortController,
  setSendButtonMode,
} from './chat-send.js';
import { renderSavedSummaries } from './chat-summaries.js';
import {
  getActivePersonality, updateChatHeaderTitle, updatePersonalityBar,
} from './chat-personalities.js';
import {
  loadChatHistory, saveChatHistory,
} from './chat-history.js';
import { closeChatPanel, configureChatPanel } from './chat-panel.js';
import { setChatNudge, updateChatNudge } from './chat-nudge.js';
import {
  cleanupDiscussionState, configureChatDiscussion, restoreDiscussionContinuePrompt,
} from './chat-discussion.js';
import { configureChatOnboarding } from './chat-onboarding.js';
import { stopVoiceActivity } from './voice-loader.js';

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
configureChatThreadDeps({
  cleanupDiscussionState,
  getActivePersonality,
  loadChatHistory,
  renderChatMessages,
  renderSavedSummaries,
  restoreDiscussionContinuePrompt,
  saveChatHistory,
  stopVoiceActivity,
  updateChatHeaderTitle,
  updatePersonalityBar,
});
