// chat-discussion-round-prompts.js - prompt and message helpers for discussion rounds

export const DEFAULT_DISCUSS_PROMPT = 'Respond to the other analyst\'s points above. Where do you agree or disagree? Add any insights they may have missed.';
export const INITIAL_DISCUSS_PROMPT = 'Share your analysis and interpretation of these lab results.';
export const DISCUSSION_JOIN_PROMPT = 'You\'ve just joined this conversation. Review the discussion above and weigh in with your perspective.';

export function hasExistingDiscussionResponses(messages) {
  return messages.some(m => m.role === 'assistant' && m.personalityName);
}

export function getDiscussionPromptText({ hasExistingDebate, personaIndex, steerPrompt }) {
  const promptText = steerPrompt || DEFAULT_DISCUSS_PROMPT;
  const isFirstEver = !hasExistingDebate && personaIndex === 0;
  return isFirstEver ? (steerPrompt || INITIAL_DISCUSS_PROMPT) : promptText;
}

export function buildDiscussionAutoMessage(content, { hideAutoMsg = false } = {}) {
  return { role: 'user', content, auto: true, hidden: !!hideAutoMsg };
}

export function buildDiscussionJoinMessage(persona) {
  return { joined: true, joinName: persona.name, joinIcon: persona.icon };
}
