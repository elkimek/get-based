// chat-prompt-context.js - chat API prompt and message-context helpers

import { buildLabContext } from './lab-context.js';
import { isNutritionContextEnabled } from './lab-context-settings.js';
import type { ChatPersonality } from './constants.js';
import type { StoredCustomPersonality } from './chat-storage-safety.js';
import type { LensQueryChunk } from './lens-local-protocol.js';

export interface PromptHistoryMessage {
  role?: unknown; content?: unknown; joined?: unknown; error?: unknown; personalityName?: unknown;
}
type PromptPersonalityReader = { [Key in keyof Pick<ChatPersonality, 'id' | 'promptAddition'>]?: unknown };
type PromptCustomPersonalityReader = { [Key in keyof Pick<StoredCustomPersonality, 'promptText'>]?: unknown };
interface LensSerializationReader { chunks?: unknown; sourceName?: unknown }
type LensChunkSerializationReader = { [Key in keyof Pick<LensQueryChunk, 'text' | 'source' | 'score'>]?: unknown };
export interface SerializedLensSources {
  lensSources: Array<{ text: unknown; source: unknown; score: unknown }>;
  lensSourceName: unknown;
}
type AttachedLensMessage<Message> = Message extends object
  ? { [Key in keyof Message]: Key extends keyof SerializedLensSources ? Message[Key] | SerializedLensSources[Key] : Message[Key] } & Partial<SerializedLensSources>
  : Message;

function nutritionHistoryRequestFromQuery(queryText: unknown = '') {
  const match = String(queryText).match(/^Nutrition history range:\s*(30D|3M|6M|1Y|All)\s*\(([^\n)]+)\)\.\s*$/mi);
  return match ? { label: match[1], description: match[2]!.trim() } : null;
}

export function buildChatLabContext(queryText: unknown = '', options: Parameters<typeof buildLabContext>[0] = {}) {
  const history = isNutritionContextEnabled() ? nutritionHistoryRequestFromQuery(queryText) : null;
  const context = (buildLabContext as (options: Omit<NonNullable<Parameters<typeof buildLabContext>[0]>, 'queryText'> & { queryText: unknown }) => ReturnType<typeof buildLabContext>)({ ...options, queryText, nutritionHistoryLabel: history?.label || '' });
  if (!history) return context;
  return context + `[section:nutritionHistory]\n## Meals & Nutrition — ${history.label} one-off history\nOne-off aggregate is in the editable user message; automatic nutrition summary is omitted. Individual meals, names, notes, ingredients, and photos are not included.\n[/section:nutritionHistory]\n\n`;
}

export function buildPersonalityPrompt(personality: PromptPersonalityReader | null | undefined, customPersonality: PromptCustomPersonalityReader | null | undefined) {
  if (personality?.id && (personality.id as { startsWith(prefix: string): unknown }).startsWith('custom_')) {
    return customPersonality?.promptText ? `\n\n## Communication Persona\n${customPersonality.promptText}` : '';
  }
  return personality?.promptAddition ? '\n\n## Communication Persona\n' + (personality.promptAddition as string) : '';
}

export function buildMultiPersonaInstruction(chatHistory: readonly PromptHistoryMessage[] | null | undefined, currentPersonaName: unknown) {
  const otherPersonas = new Set<unknown>();
  for (const message of chatHistory || []) {
    if (message.error) continue;
    if (message.role === 'assistant' && message.personalityName && message.personalityName !== currentPersonaName) {
      otherPersonas.add(message.personalityName);
    }
  }
  if (otherPersonas.size === 0) return '';
  return `\n\nThis conversation includes responses from other AI personalities (${[...otherPersonas].join(', ')}). Messages marked [Response from ...] were written by a different persona \u2014 treat them as a separate analyst's opinion, not your own. You may agree or disagree with their analysis, but never claim you wrote their responses.`;
}

export type TaggedChatMessage<Message extends PromptHistoryMessage> = { role: Message['role']; content: Message['content'] | string };

export function buildTaggedChatMessages<Message extends PromptHistoryMessage>(chatHistory: readonly Message[] | null | undefined, currentPersonaName: unknown, limit = 30): TaggedChatMessage<Message>[] {
  return (chatHistory || [])
    .filter((message) => !message.joined && !message.error && message.role)
    .slice(-limit)
    .map((message) => {
      if (message.role === 'assistant' && message.personalityName && message.personalityName !== currentPersonaName) {
        return { role: message.role as Message['role'], content: `[Response from ${message.personalityName}]\n${message.content}` as Message['content'] | string };
      }
      return { role: message.role as Message['role'], content: message.content as Message['content'] | string };
    });
}

export function buildWebSearchHint({
  isE2EE = false,
  webSearchEnabled = false,
  webSearchSupported = false,
  includeActiveSearchHints = true,
}: { isE2EE?: unknown; webSearchEnabled?: unknown; webSearchSupported?: unknown; includeActiveSearchHints?: unknown } = {}) {
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
}: { basePrompt: unknown; labContext: unknown; webHint?: unknown; personalityPrompt?: unknown; multiPersonaInstruction?: unknown }) {
  return (basePrompt as string) + (webHint as string) + (personalityPrompt as string) + (multiPersonaInstruction as string)
    + '\n\n## Current User Health and Lab Context\n' + (labContext as string);
}

export function serializeLensSources(lensResult: unknown): SerializedLensSources | null {
  if (!(lensResult as { chunks?: { length?: unknown } | null } | null | undefined)?.chunks?.length) return null;
  return {
    lensSources: ((lensResult as LensSerializationReader).chunks as { slice(start: number, end: number): LensChunkSerializationReader[] }).slice(0, 10).map((chunk) => ({
      text: typeof chunk.text === 'string' ? (chunk.text as { slice(start: number, end: number): unknown }).slice(0, 1500) : '',
      source: chunk.source || '',
      score: typeof chunk.score === 'number' ? chunk.score : null,
    })),
    lensSourceName: (lensResult as LensSerializationReader).sourceName || '',
  };
}

export function attachLensSources<Message>(message: Message, lensResult: unknown): AttachedLensMessage<Message> {
  const lensSources = serializeLensSources(lensResult);
  if (lensSources) (Object.assign as (message: Message, sources: SerializedLensSources) => unknown)(message, lensSources);
  return message as AttachedLensMessage<Message>;
}
