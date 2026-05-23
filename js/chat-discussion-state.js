// chat-discussion-state.js — multi-persona discussion state helpers

import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { getCustomPersonalities } from './chat-personalities.js';

export function getThreadPersonaCount() {
  const names = new Set();
  for (const m of state.chatHistory) {
    if (m.role === 'assistant' && m.personalityName) names.add(m.personalityName);
  }
  return names.size;
}

export function collectDiscussionPersonas() {
  // Walk history backwards to find the 2 most recently active personas.
  const seenIds = new Set();
  const personas = [];
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    const m = state.chatHistory[i];
    if (m.role !== 'assistant' || !m.personalityName) continue;

    let pid = null;
    const builtIn = CHAT_PERSONALITIES.find(p => p.name === m.personalityName);
    if (builtIn) {
      pid = builtIn.id;
    } else {
      const cp = getCustomPersonalities().find(p => p.name === m.personalityName);
      if (cp) pid = cp.id;
    }

    if (pid && !seenIds.has(pid)) {
      seenIds.add(pid);
      personas.unshift({ id: pid, name: m.personalityName, icon: m.personalityIcon });
      if (personas.length === 2) break;
    }
  }
  return personas;
}

export function getCurrentThread() {
  return state.chatThreads.find(t => t.id === state.currentThreadId) || null;
}

export function getCurrentDiscussionState({ allowHistoryFallback = true } = {}) {
  const thread = getCurrentThread();
  if (thread?.discussionEnded) return null;

  if (Array.isArray(state._discussionPersonas) && state._discussionPersonas.length >= 2) {
    return {
      personas: state._discussionPersonas,
      originalPersonality: state._discussionOriginalPersonality || thread?.discussionOriginalPersonality || state.currentChatPersonality,
    };
  }

  if (Array.isArray(thread?.discussionPersonas) && thread.discussionPersonas.length >= 2) {
    return {
      personas: thread.discussionPersonas,
      originalPersonality: thread.discussionOriginalPersonality || state.currentChatPersonality,
    };
  }

  if (allowHistoryFallback) {
    const personas = collectDiscussionPersonas();
    if (personas.length >= 2) {
      return {
        personas,
        originalPersonality: thread?.discussionOriginalPersonality || state.currentChatPersonality,
      };
    }
  }

  return null;
}
