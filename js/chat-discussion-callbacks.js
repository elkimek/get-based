// chat-discussion-callbacks.js - shared callback bridge for discussion rounds

const discussionCallbacks = {
  createTypewriter: null,
  getChatAbortController: () => null,
  renderChatMessages: () => {},
  setChatAbortController: () => {},
  setSendButtonMode: () => {},
};

export function configureChatDiscussion(callbacks = {}) {
  Object.assign(discussionCallbacks, callbacks);
}

export function getChatAbortController() {
  return discussionCallbacks.getChatAbortController?.() || null;
}

export function setChatAbortController(controller) {
  discussionCallbacks.setChatAbortController?.(controller);
}

export function renderChatMessages() {
  discussionCallbacks.renderChatMessages?.();
}

export function setSendButtonMode(btn, mode) {
  discussionCallbacks.setSendButtonMode?.(btn, mode);
}

export function createDiscussionTypewriter(el, typingEl, container) {
  if (!discussionCallbacks.createTypewriter) {
    return {
      update() {},
      stop() {},
    };
  }
  return discussionCallbacks.createTypewriter(el, typingEl, container);
}
