// chat-discussion.js - public barrel for multi-persona discussion helpers

export { getCurrentDiscussionState, getThreadPersonaCount } from './chat-discussion-state.js';
export { configureChatDiscussion } from './chat-discussion-callbacks.js';
export { removeDiscussContinuePrompt, updateDiscussButton } from './chat-discussion-ui.js';
export {
  cleanupDiscussionState, continueDiscussion, endDiscussion,
  restoreDiscussionContinuePrompt, sendDiscussionUserTurn, showDiscussContinuePrompt,
  startDiscussion, startDiscussionFromPicker,
} from './chat-discussion-flow.js';
