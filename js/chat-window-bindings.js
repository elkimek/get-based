// @ts-check
// chat-window-bindings.js — chat callback wiring and legacy window exports

import { setAIPaused } from './api.js';
import { configureChatThreadDeps } from './chat-threads.js';
import { renderChatMessages } from './chat-render.js';
import { askAIAboutMarker } from './chat-marker-prompts.js';
import {
  createTypewriter, getChatAbortController, isChatStreaming, sendChatMessage,
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
import {
  closeChatPanel, configureChatPanel, toggleChatPanel, openChatPanel,
  updateChatInputState,
} from './chat-panel.js';
import { setChatNudge, updateChatNudge } from './chat-nudge.js';
import {
  cleanupDiscussionState, configureChatDiscussion, restoreDiscussionContinuePrompt,
  updateDiscussButton,
} from './chat-discussion.js';
import {
  configureChatOnboarding, useChatPrompt,
} from './chat-onboarding.js';

function _resumeAI() {
  setAIPaused(false);
  renderChatMessages();
  updateChatInputState();
}

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
  updateChatHeaderTitle,
  updatePersonalityBar,
});

Object.assign(window, {
  _resumeAI,
  isChatStreaming,
  loadChatHistory,
  renderChatMessages,
  useChatPrompt,
  toggleChatPanel,
  openChatPanel,
  closeChatPanel,
  updateDiscussButton,
  askAIAboutMarker,
});
