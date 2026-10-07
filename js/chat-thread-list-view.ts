// Published renderer boundary; projection and presentation have separate owners.
import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { mountChatThreadNavigation } from './chat-thread-navigation-component.js';
import { projectThreadNavigation, threadProjectNames } from './chat-thread-navigation-presentation.js';
import type { ChatThreadNavigationActions } from './chat-thread-navigation-contract.js';

const actions: ChatThreadNavigationActions = {
  switch: () => {}, pin: () => {}, rename: () => {}, delete: () => {},
  move: () => {}, renameProject: () => {}, deleteProject: () => {}, jump: () => {},
};
let presentedProfile = state.currentProfile;

export function configureThreadNavigationActions(next: ChatThreadNavigationActions): void {
  // Mounted controls keep this port object, so reconfiguration remains current.
  Object.assign(actions, next);
}

export function renderChatThreadList(sort: string, filter?: string): void {
  const list = document.getElementById('chat-thread-list');
  if (!list) return;
  const input = document.getElementById('chat-thread-search') as HTMLInputElement | null;
  if (presentedProfile !== state.currentProfile) {
    presentedProfile = state.currentProfile;
    if (input) input.value = '';
    filter = '';
  }
  const sortSelect = document.getElementById('chat-thread-sort') as HTMLSelectElement | null;
  if (sortSelect) sortSelect.value = sort;
  const personalities = Object.fromEntries(CHAT_PERSONALITIES.map(personality => [personality.id, personality.icon]));
  const initial = projectThreadNavigation(
    state.chatThreads, state.currentThreadId, sort, filter ?? input?.value ?? '',
    threadProjectNames(state.chatThreads), personalities,
  );
  const profile = state.currentProfile;
  mountChatThreadNavigation(list, initial, actions, () => profile === state.currentProfile);
}
