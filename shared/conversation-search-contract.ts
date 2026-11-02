// Read-only source links stay inside the active profile. Their fragment never
// contains message text, credentials, filesystem paths or executable commands.
export const CONVERSATION_SEARCH_LIMITS = Object.freeze({ threads: 20, messagesPerThread: 500, threadCharacters: 250000, scannedCharacters: 1000000, results: 10, messageCharacters: 20000, queryCharacters: 160 });
export interface ConversationSourceLink { profile: string; thread: string; index: number; role: 'user' | 'assistant'; digest: string }
const sourcePattern = /^#getbased-chat-source-v1\/([A-Za-z0-9_.:-]{1,128})\/([A-Za-z0-9_.:-]{1,128})\/(0|[1-9][0-9]{0,5})\/(user|assistant)\/([0-9a-f]{64})$/;
export function parseConversationSourceLink(href: unknown): ConversationSourceLink | null {
  if (typeof href !== 'string') return null;
  const match = sourcePattern.exec(href);
  if (match && [match[1], match[2]].some(id => ['__proto__', 'prototype', 'constructor'].includes(id!))) return null;
  return match ? { profile: match[1]!, thread: match[2]!, index: Number(match[3]), role: match[4] as 'user' | 'assistant', digest: match[5]! } : null;
}
export function conversationSourceHref(value: ConversationSourceLink) {
  const href = `#getbased-chat-source-v1/${value.profile}/${value.thread}/${value.index}/${value.role}/${value.digest}`;
  if (!parseConversationSourceLink(href)) throw new Error('The native conversation source identity is unsupported.');
  return href;
}
