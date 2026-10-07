// Public compatibility entry points; selection and rendering belong to Svelte.
import { requestChatLayoutSync } from './chat-layout-view.js';
import { closePersonalityPickerView } from './chat-personality-picker-view.js';
import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { getCustomPersonalities, isCustomPersonalityUsable } from './chat-personalities.js';
import {
  configureChatDiscussionContext, currentChatDiscussion, discussionPickerSelection,
  publishDiscussionPicker, type DiscussionOption,
} from './chat-discussion-view.js';
export function chatDiscussionScope(): string { return JSON.stringify([state.currentProfile, state.currentThreadId]); }
configureChatDiscussionContext(chatDiscussionScope);
export function removeDiscussPersonaPicker() { publishDiscussionPicker(chatDiscussionScope(), null); }
export function readDiscussPersonaPickerSelection() {
  return discussionPickerSelection(currentChatDiscussion()?.picker || null);
}
export function showDiscussPersonaPicker() {
  if (currentChatDiscussion()?.picker) { removeDiscussPersonaPicker(); return; }
  const allPersonas = [
    ...CHAT_PERSONALITIES.map(({ id, name, icon }) => ({ id, name, icon })),
    ...getCustomPersonalities().filter(personality => isCustomPersonalityUsable(personality))
      .map(persona => ({ id: persona.id, name: persona.name, icon: persona.icon || '✏️' })),
  ];
  if (allPersonas.length < 2) return;
  const thread = state.chatThreads.find(thread => thread.id === state.currentThreadId);
  const addingToExisting = Array.isArray(thread?.discussionPersonas)
    && thread.discussionPersonas.length >= 2 && !thread.discussionEnded;
  const active = new Set(addingToExisting
    ? thread!.discussionPersonas!.map(persona => persona.id)
    : [state.currentChatPersonality || 'default']);
  const options: DiscussionOption[] = allPersonas.map(persona => ({ ...persona, locked: active.has(persona.id) }));
  if (!publishDiscussionPicker(chatDiscussionScope(), { options, selected: [], addingToExisting })) return;
  closePersonalityPickerView();
  document.getElementById('chat-thread-rail')?.classList.remove('open');
  requestChatLayoutSync();
  document.querySelector<HTMLInputElement>('.discuss-persona-picker input:not(:disabled)')?.focus();
}
