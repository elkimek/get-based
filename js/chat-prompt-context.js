// chat-prompt-context.js - chat API prompt and message-context helpers

export function buildPersonalityPrompt(personality, customPersonality) {
  if (personality?.id && personality.id.startsWith('custom_')) {
    return customPersonality?.promptText ? `\n\nPersona: ${customPersonality.promptText}` : '';
  }
  return personality?.promptAddition ? '\n\n' + personality.promptAddition : '';
}

export function buildMultiPersonaInstruction(chatHistory, currentPersonaName) {
  const otherPersonas = new Set();
  for (const message of chatHistory || []) {
    if (message.role === 'assistant' && message.personalityName && message.personalityName !== currentPersonaName) {
      otherPersonas.add(message.personalityName);
    }
  }
  if (otherPersonas.size === 0) return '';
  return `\n\nThis conversation includes responses from other AI personalities (${[...otherPersonas].join(', ')}). Messages marked [Response from ...] were written by a different persona \u2014 treat them as a separate analyst's opinion, not your own. You may agree or disagree with their analysis, but never claim you wrote their responses.`;
}

export function buildTaggedChatMessages(chatHistory, currentPersonaName, limit = 30) {
  return (chatHistory || [])
    .filter((message) => !message.joined && message.role)
    .slice(-limit)
    .map((message) => {
      if (message.role === 'assistant' && message.personalityName && message.personalityName !== currentPersonaName) {
        return { role: message.role, content: `[Response from ${message.personalityName}]\n${message.content}` };
      }
      return { role: message.role, content: message.content };
    });
}

export function buildWebSearchHint({
  isE2EE = false,
  webSearchEnabled = false,
  webSearchSupported = false,
  includeActiveSearchHints = true,
} = {}) {
  if (isE2EE) {
    return '\n\n[NO WEB ACCESS \u2014 E2EE mode] Do not generate URLs. Suggest disabling E2EE for web-enabled queries.';
  }
  if (!includeActiveSearchHints) return '';
  if (webSearchEnabled) {
    return '\n\n[WEB SEARCH ACTIVE] You can search the internet. Always include direct URLs to specific products/pages when the user asks. Do not give generic advice without links when the user names a specific website.';
  }
  if (webSearchSupported) {
    return '\n\n[NO WEB ACCESS] Do not fabricate URLs. The user can enable web search via the "Web" toggle in the chat header.';
  }
  return '';
}

export function buildChatSystemPrompt({
  basePrompt,
  labContext,
  webHint = '',
  personalityPrompt = '',
  multiPersonaInstruction = '',
}) {
  return basePrompt + webHint + '\n\nCurrent lab data:\n' + labContext + personalityPrompt + multiPersonaInstruction;
}

export function serializeLensSources(lensResult) {
  if (!lensResult?.chunks?.length) return null;
  return {
    lensSources: lensResult.chunks.slice(0, 10).map((chunk) => ({
      text: typeof chunk.text === 'string' ? chunk.text.slice(0, 1500) : '',
      source: chunk.source || '',
      score: typeof chunk.score === 'number' ? chunk.score : null,
    })),
    lensSourceName: lensResult.sourceName || '',
  };
}

export function attachLensSources(message, lensResult) {
  const lensSources = serializeLensSources(lensResult);
  if (lensSources) Object.assign(message, lensSources);
  return message;
}
