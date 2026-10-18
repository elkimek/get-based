import {tsStaticStyles} from './ts-static-ui-inline-style-map.generated.js';
import MessageActions, { hydrate, unmount, flushSync } from './components/ChatMessageActions.svelte.native.js';
import { renderHTML } from './components/ChatMessageActions.svelte.html.js';
import { state } from './state.js';
import { projectChatMessageActions } from './chat-message-actions-contract.js';
import { hasChatMessageActionOwner, chatMessageActionTicket } from './chat-message-actions-view.js';

const mounted = new Map<HTMLElement, ReturnType<typeof hydrate>>();
const retired = new WeakSet<HTMLElement>();
let observer: MutationObserver | null = null;

function sweep(): void {
  for (const [root, component] of mounted) {
    if (hasChatMessageActionOwner(root)) continue;
    mounted.delete(root);
    retired.add(root);
    void unmount(component);
    flushSync();
  }
  if (!mounted.size) {
    observer?.disconnect();
    observer = null;
  }
}

export function ensureChatMessageActions(): void {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  sweep();
  for (const root of document.querySelectorAll<HTMLElement>('[data-chat-message-actions-view]')) {
    if (mounted.has(root) || retired.has(root) || hasChatMessageActionOwner(root)) continue;
    const index = Number(root.dataset.chatMessageIndex);
    const view = projectChatMessageActions(state.chatHistory, index);
    if (!view || !root.isConnected) continue;
    const host = root.closest<HTMLElement>('[data-chat-message-actions-host]');
    if (!host || host.dataset.chatMessageTicket !== chatMessageActionTicket(index)) {
      retired.add(root);
      continue;
    }
    const component = hydrate(MessageActions, { target: host, props: { view }, recover: false });
    mounted.set(root, component);
    flushSync();
  }
  if (mounted.size && !observer) {
    observer = new MutationObserver(sweep);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

/** Legacy live senders and restored transcript markup share one authored view. */
export function renderChatMessageActions(index: number, kind: 'user' | 'assistant'): string {
  const view = projectChatMessageActions(state.chatHistory, index);
  if (!view || view.kind !== kind) return '';
  queueMicrotask(ensureChatMessageActions);
  return `<div data-chat-message-actions-host data-chat-message-ticket="${chatMessageActionTicket(index)}" style="${tsStaticStyles.messageActionsHost}">${renderHTML({ view })}</div>`;
}
