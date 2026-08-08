// @ts-check
// chat-discussion-callbacks.js - shared callback bridge for discussion rounds

/** @type {{
 *   createTypewriter: null | ((el: HTMLElement, typingEl: HTMLElement, container: HTMLElement) => { update(text: string): void, stop(): void }),
 *   getChatAbortController: () => AbortController | null,
 *   renderChatMessages: (options?: { preserveScroll?: boolean }) => void,
 *   setChatAbortController: (controller: AbortController | null) => void,
 *   setSendButtonMode: (btn: HTMLElement | null, mode: string) => void,
 * }} */
const discussionCallbacks = {
  createTypewriter: null,
  getChatAbortController: () => null,
  renderChatMessages: () => {},
  setChatAbortController: () => {},
  setSendButtonMode: () => {},
};

/** @param {Partial<typeof discussionCallbacks>} [callbacks] */
export function configureChatDiscussion(callbacks = {}) {
  Object.assign(discussionCallbacks, callbacks);
}

/** @returns {AbortController | null} */
export function getChatAbortController() {
  return discussionCallbacks.getChatAbortController?.() || null;
}

/** @param {AbortController | null} controller */
export function setChatAbortController(controller) {
  discussionCallbacks.setChatAbortController?.(controller);
}

/** @param {{ preserveScroll?: boolean }} [options] */
export function renderChatMessages(options = {}) {
  discussionCallbacks.renderChatMessages?.(options);
}

/**
 * @param {HTMLElement | null} btn
 * @param {string} mode
 */
export function setSendButtonMode(btn, mode) {
  discussionCallbacks.setSendButtonMode?.(/** @type {HTMLElement | null} */ (btn), mode);
}

/**
 * @param {HTMLElement} el
 * @param {HTMLElement} typingEl
 * @param {HTMLElement} container
 * @returns {{ update(text: string): void, stop(): void }}
 */
export function createDiscussionTypewriter(el, typingEl, container) {
  if (!discussionCallbacks.createTypewriter) {
    return {
      update() {},
      stop() {},
    };
  }
  return discussionCallbacks.createTypewriter(el, typingEl, container);
}
