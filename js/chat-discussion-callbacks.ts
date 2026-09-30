// chat-discussion-callbacks.js - shared callback bridge for discussion rounds

interface DiscussionCallbacks {
  createTypewriter: ((el: HTMLElement, typingEl: HTMLElement, container: HTMLElement) => DiscussionTypewriter) | null;
  getChatAbortController: () => AbortController | null;
  renderChatMessages: (options?: { preserveScroll?: boolean }) => void;
  setChatAbortController: (controller: AbortController | null) => void;
  setSendButtonMode: (button: HTMLElement | null, mode: string) => void;
}
export interface DiscussionTypewriter { update(text: string): void; stop(): void; }
const discussionCallbacks: DiscussionCallbacks = {
  createTypewriter: null,
  getChatAbortController: () => null,
  renderChatMessages: () => {},
  setChatAbortController: () => {},
  setSendButtonMode: () => {},
};

export function configureChatDiscussion(callbacks: Partial<DiscussionCallbacks> = {}): void {
  Object.assign(discussionCallbacks, callbacks);
}

export function getChatAbortController() {
  return discussionCallbacks.getChatAbortController?.() || null;
}

export function setChatAbortController(controller: AbortController | null): void {
  discussionCallbacks.setChatAbortController?.(controller);
}

export function renderChatMessages(options: { preserveScroll?: boolean } = {}): void {
  discussionCallbacks.renderChatMessages?.(options);
}

export function setSendButtonMode(btn: HTMLElement | null, mode: string): void {
  discussionCallbacks.setSendButtonMode?.((btn), mode);
}

export function createDiscussionTypewriter(el: HTMLElement, typingEl: HTMLElement, container: HTMLElement): DiscussionTypewriter {
  if (!discussionCallbacks.createTypewriter) {
    return {
      update() {},
      stop() {},
    };
  }
  return discussionCallbacks.createTypewriter(el, typingEl, container);
}
