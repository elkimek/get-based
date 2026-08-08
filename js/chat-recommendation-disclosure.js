// @ts-check
// chat-recommendation-disclosure.js — progressive recommendation discovery.

/** @param {unknown} value */
function uniqueSlots(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(slot => typeof slot === 'string' && slot))];
}

/** @param {string[]} left @param {string[]} right */
function haveSameSlots(left, right) {
  if (left.length !== right.length) return false;
  const rightSlots = new Set(right);
  return left.every(slot => rightSlots.has(slot));
}

/**
 * Keep recommendation disclosures collapsed. The first set receives a New
 * cue for discovery; later sets receive it only when their recommendation
 * areas differ from the previous set.
 * @param {any[]} history
 * @param {unknown} slots
 * @param {any} [currentMessage]
 */
export function getRecommendationDisclosureState(history, slots, currentMessage) {
  const nextSlots = uniqueSlots(slots);
  const previousMessage = [...history].reverse().find(message =>
    message !== currentMessage && uniqueSlots(message?.recSlots).length > 0
  );
  const previousSlots = uniqueSlots(previousMessage?.recSlots);
  return {
    count: nextSlots.length,
    open: false,
    isNew: previousSlots.length === 0 || !haveSameSlots(previousSlots, nextSlots),
  };
}

/** @param {number} count @param {boolean} [isNew] */
export function recommendationSummaryHTML(count, isNew = false) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  const noun = safeCount === 1 ? 'suggestion' : 'suggestions';
  const newBadge = isNew ? '<span class="rec-chat-new">New</span>' : '';
  return `See <span class="rec-chat-count">${safeCount} helpful ${noun}</span>${newBadge}`;
}

/**
 * Start the finite attention animation once the newly inserted CTA is
 * actually visible. This is called only for live responses, never restores.
 * @param {HTMLDetailsElement} wrapper
 */
export function startRecommendationAttention(wrapper) {
  if (!wrapper.classList.contains('rec-chat-unseen')) return;
  const summary = wrapper.querySelector('.rec-chat-summary');
  if (!summary) return;

  const start = () => {
    requestAnimationFrame(() => wrapper.classList.add('rec-chat-attention'));
    summary.addEventListener('animationend', () => {
      wrapper.classList.remove('rec-chat-attention');
    }, { once: true });
  };

  if (typeof IntersectionObserver !== 'function') {
    start();
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    start();
  }, { threshold: 0.5 });
  observer.observe(wrapper);
}
