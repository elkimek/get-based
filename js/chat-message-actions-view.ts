import { state } from './state.js';
import type { ChatCopyMode } from './chat-message-actions-contract.js';

interface ActionOwner {
  current(): boolean;
  copy(mode: ChatCopyMode): boolean;
  toggle(): boolean;
}
interface ActionPresentation {
  copy(mode: ChatCopyMode): void;
  toggle(): void;
}
const owners = new WeakMap<HTMLElement, ActionOwner>();
const historyTickets = new WeakMap<object, { profile: string | null; thread: string | null; ticket: number }>();
const messageTickets = new WeakMap<object, number>();
let sequence = 0;

/** Opaque render identity: no profile identifiers or message content enter markup. */
export function chatMessageActionTicket(index: number): string {
  const history = state.chatHistory;
  const message = history[index];
  if (!message) return '';
  let scope = historyTickets.get(history);
  if (!scope || scope.profile !== state.currentProfile || scope.thread !== state.currentThreadId) {
    scope = { profile: state.currentProfile, thread: state.currentThreadId, ticket: ++sequence };
    historyTickets.set(history, scope);
  }
  let ticket = messageTickets.get(message);
  if (!ticket) {
    ticket = ++sequence;
    messageTickets.set(message, ticket);
  }
  return `${scope.ticket}:${ticket}`;
}

export function ownChatMessageActions(root: HTMLElement, index: number, render: ActionPresentation): { destroy(): void } {
  const profile = state.currentProfile;
  const thread = state.currentThreadId;
  const history = state.chatHistory;
  const message = history[index];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const owner: ActionOwner = {
    current: () => owners.get(root) === owner && root.isConnected && !!message
      && state.currentProfile === profile && state.currentThreadId === thread
      && state.chatHistory === history && history[index] === message,
    copy(mode) {
      if (!owner.current()) return false;
      if (timer !== undefined) clearTimeout(timer);
      render.copy(mode);
      timer = setTimeout(() => {
        if (owner.current()) render.copy('idle');
        timer = undefined;
      }, 1500);
      return true;
    },
    toggle() {
      if (!owner.current()) return false;
      render.toggle();
      return true;
    },
  };
  owners.set(root, owner);
  return {
    destroy() {
      if (timer !== undefined) clearTimeout(timer);
      owners.delete(root);
    },
  };
}

export function isChatMessageActionCurrent(element: HTMLElement): boolean {
  const root = element.closest<HTMLElement>('[data-chat-message-actions-view]');
  return !root || !!owners.get(root)?.current();
}

export function hasChatMessageActionOwner(root: HTMLElement): boolean {
  return !!owners.get(root)?.current();
}

function findOwner(index: number): ActionOwner | undefined {
  if (typeof document === 'undefined') return undefined;
  const root = document.querySelector<HTMLElement>(`[data-chat-message-actions-view][data-chat-message-index="${index}"]`);
  return root ? owners.get(root) : undefined;
}

/** Capture the exact view before awaiting clipboard permission or completion. */
export function captureChatMessageCopyFeedback(index: number): (mode: ChatCopyMode) => boolean {
  const owner = findOwner(index);
  return mode => owner?.copy(mode) || false;
}

export function toggleOwnedChatMessageContext(index: number): boolean {
  return findOwner(index)?.toggle() || false;
}
