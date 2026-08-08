// @ts-check
// chat-scroll.js — transcript follow state and the jump-to-latest control.

const NEAR_LATEST_PX = 80;

/** @type {WeakMap<HTMLElement, { followingLatest: boolean, hasNewContent: boolean, scrollingToLatest: boolean }>} */
const scrollStates = new WeakMap();
/** @type {WeakSet<HTMLElement>} */
const installedContainers = new WeakSet();

/** @param {ScrollBehavior} [behavior] @returns {ScrollBehavior} */
export function preferredChatScrollBehavior(behavior = 'smooth') {
  return behavior === 'smooth' && globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : behavior;
}

/** @param {HTMLElement} container */
function getScrollState(container) {
  let scrollState = scrollStates.get(container);
  if (!scrollState) {
    scrollState = {
      followingLatest: isChatNearLatest(container),
      hasNewContent: false,
      scrollingToLatest: false,
    };
    scrollStates.set(container, scrollState);
  }
  return scrollState;
}

/** @param {HTMLElement} container */
function getLatestButton(container) {
  if (typeof document === 'undefined' || container.id !== 'chat-messages') return null;
  return /** @type {HTMLButtonElement | null} */ (document.getElementById('chat-jump-latest'));
}

/** @param {HTMLElement} container */
function refreshLatestButton(container) {
  const button = getLatestButton(container);
  if (!button) return;
  const scrollState = getScrollState(container);
  const visible = !scrollState.followingLatest && !isChatNearLatest(container);
  button.hidden = !visible;
  button.classList.toggle('has-new-content', visible && scrollState.hasNewContent);
  const label = button.querySelector('.chat-jump-latest-label');
  if (label) label.textContent = scrollState.hasNewContent ? 'New response' : 'Jump to latest';
  button.setAttribute('aria-label', scrollState.hasNewContent
    ? 'New response available. Jump to latest message'
    : 'Jump to latest message');
}

/** @param {HTMLElement} container */
export function isChatNearLatest(container) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_LATEST_PX;
}

/**
 * Keep following new transcript content when the reader is already at the
 * bottom. Otherwise, surface the control without changing their position.
 * @param {HTMLElement} container
 */
export function notifyChatContentAdded(container) {
  const scrollState = getScrollState(container);
  if (scrollState.followingLatest || isChatNearLatest(container)) {
    scrollState.followingLatest = true;
    scrollState.hasNewContent = false;
    container.scrollTop = container.scrollHeight;
    refreshLatestButton(container);
    return true;
  }
  scrollState.hasNewContent = true;
  refreshLatestButton(container);
  return false;
}

/**
 * Resume transcript following and move to the newest content.
 * @param {HTMLElement} container
 * @param {{ behavior?: ScrollBehavior }} [options]
 */
export function followChatLatest(container, { behavior = 'smooth' } = {}) {
  behavior = preferredChatScrollBehavior(behavior);
  const scrollState = getScrollState(container);
  scrollState.followingLatest = true;
  scrollState.hasNewContent = false;
  scrollState.scrollingToLatest = behavior === 'smooth';
  refreshLatestButton(container);

  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: container.scrollHeight, behavior });
  } else {
    container.scrollTop = container.scrollHeight;
  }

  if (behavior !== 'smooth') {
    scrollState.scrollingToLatest = false;
  } else {
    setTimeout(() => {
      if (!scrollState.scrollingToLatest) return;
      scrollState.scrollingToLatest = false;
      scrollState.followingLatest = isChatNearLatest(container);
      refreshLatestButton(container);
    }, 750);
  }
}

/** Install the scroll and button listeners for the primary transcript. */
export function initChatScrollControls() {
  if (typeof document === 'undefined') return;
  const container = /** @type {HTMLElement | null} */ (document.getElementById('chat-messages'));
  if (!container || installedContainers.has(container)) return;
  installedContainers.add(container);
  getScrollState(container);

  container.addEventListener('scroll', () => {
    const scrollState = getScrollState(container);
    const nearLatest = isChatNearLatest(container);
    if (scrollState.scrollingToLatest) {
      if (nearLatest) {
        scrollState.scrollingToLatest = false;
        scrollState.followingLatest = true;
        scrollState.hasNewContent = false;
      }
      refreshLatestButton(container);
      return;
    }
    scrollState.followingLatest = nearLatest;
    if (nearLatest) scrollState.hasNewContent = false;
    refreshLatestButton(container);
  }, { passive: true });

  const button = getLatestButton(container);
  button?.addEventListener('click', () => followChatLatest(container));
  refreshLatestButton(container);
}
