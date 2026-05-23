// chat-discussion-turns.js - discussion round turn execution helpers

import { state } from './state.js';
import {
  runDiscussionRound,
} from './chat-discussion-round-runner.js';
import {
  persistDiscussionThreadState,
} from './chat-discussion-round-state.js';
import {
  buildDiscussionJoinMessage, DISCUSSION_JOIN_PROMPT,
} from './chat-discussion-round-prompts.js';
import {
  finishDiscussionRound,
} from './chat-discussion-lifecycle.js';

export async function runDiscussionContinuation(personas, originalPersonality, text, opts = {}) {
  const threadId = opts.threadId || state.currentThreadId;
  persistDiscussionThreadState(threadId, personas, originalPersonality);
  await runDiscussionRound(personas, text, {
    suppressAutoMsg: opts.suppressAutoMsg,
    threadId,
  });
  finishDiscussionRound(personas, originalPersonality, threadId);
}

export async function runSingleDiscussionTurn(persona, allPersonas) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  persistDiscussionThreadState(threadId, allPersonas, originalPersonality);
  state.chatHistory.push(buildDiscussionJoinMessage(persona));
  await runDiscussionRound([persona], DISCUSSION_JOIN_PROMPT, { hideAutoMsg: true, threadId });
  finishDiscussionRound(allPersonas, originalPersonality, threadId);
}

export async function runDiscussion(personas) {
  const originalPersonality = state.currentChatPersonality;
  const threadId = state.currentThreadId;
  await runDiscussionContinuation(personas, originalPersonality, null, { threadId });
}
