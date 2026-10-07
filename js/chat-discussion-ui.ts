// Public discussion presentation facade. Svelte owns controls and their attributes.
import { state } from './state.js';
import { getThreadPersonaCount } from './chat-discussion-state.js';
import { refreshChatComposer } from './chat-composer.js';
import { chatDiscussionScope } from './chat-discussion-picker.js';
import { publishDiscussionButton, publishDiscussionRound, publishDiscussionProgress } from './chat-discussion-view.js';
export { readDiscussPersonaPickerSelection, removeDiscussPersonaPicker, showDiscussPersonaPicker } from './chat-discussion-picker.js';
export interface DiscussionUIPersona { icon?: unknown; name?: unknown; }
export interface DiscussionUIOptions { onPersist?: unknown; pendingPersonas?: unknown; }
type DiscussionUIState = { _discussionPersonas?: unknown; _discussionOriginalPersonality?: unknown; };
export function updateDiscussButton() {
  publishDiscussionButton(chatDiscussionScope(), {
    visible: !!state.chatHistory?.some(message => message.role === 'assistant'),
    dim: getThreadPersonaCount() < 2,
    active: !!state.chatThreads.find(thread => thread.id === state.currentThreadId)?.discussionPersonas?.length,
  });
}
export function showDiscussContinuePrompt(personas: DiscussionUIPersona[], originalPersonality: unknown, { onPersist, pendingPersonas = [] }: DiscussionUIOptions = {}) {
  if (!publishDiscussionRound(chatDiscussionScope(), {
    participants: personas.map(persona => `${persona.icon || ''} ${persona.name || ''}`.trim()),
    pending: Array.isArray(pendingPersonas) ? pendingPersonas.length : 0,
    progress: '',
  })) return;
  (state as DiscussionUIState)._discussionPersonas = personas;
  (state as DiscussionUIState)._discussionOriginalPersonality = originalPersonality;
  (onPersist as (() => unknown) | null | undefined)?.();
  refreshChatComposer();
}
export function removeDiscussContinuePrompt() {
  publishDiscussionRound(chatDiscussionScope(), null);
  refreshChatComposer();
}
export function updateDiscussionProgress(persona: DiscussionUIPersona | null | undefined, index: unknown, total: unknown, status: unknown = 'responding') {
  const name = `${persona?.icon || ''} ${persona?.name || 'Participant'}`.trim();
  publishDiscussionProgress(!persona || !total ? '' : status === 'responding'
    ? `${name} is responding · ${(index as number) + 1} of ${total}`
    : `${name} ${status} · ${(index as number) + 1} of ${total}`);
}
