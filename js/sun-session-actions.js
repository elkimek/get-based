// @ts-check
// sun-session-actions.js - delegated action contract for sun session UI.

import { escapeAttr } from './utils.js';
import { removeModalOverlay } from './modal-lifecycle.js';

const sunSessionActionDelegateRoots = new WeakSet();
const SUN_SESSION_KEYBOARD_ACTIONS = new Set([
  'open-detail',
  'forgot-stop',
  'open-channel',
]);

function dataAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function sunSessionActionAttrs(action, attrs = {}) {
  return [
    `data-sun-session-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([name, value]) => `data-sun-session-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function closestSunSessionAction(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const actionEl = target.closest('[data-sun-session-action]');
  if (!(actionEl instanceof HTMLElement)) return null;
  return event.currentTarget?.contains(actionEl) ? actionEl : null;
}

function closeContainingOverlay(actionEl) {
  const overlay = actionEl.closest('.modal-overlay');
  if (overlay) removeModalOverlay(overlay);
}

export function setSunChannelChipsExpanded(container, expanded) {
  if (!(container instanceof Element)) return;
  container.classList.toggle('sun-chips-expanded', !!expanded);
  const toggle = /** @type {HTMLElement | null} */ (container.querySelector('[data-sun-session-action="toggle-chips"]'));
  if (!toggle) return;
  const hiddenCount = Math.max(0, Number(toggle.dataset.sunSessionHiddenCount) || 0);
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggle.setAttribute('aria-label', expanded
    ? 'Show fewer light channels'
    : `Show ${hiddenCount} additional light channel${hiddenCount === 1 ? '' : 's'}`);
}

function handleSunSessionAction(actionEl, actions) {
  const action = actionEl.dataset.sunSessionAction || '';
  const id = actionEl.dataset.sunSessionId || '';
  const channel = actionEl.dataset.sunSessionChannel || '';

  if (action === 'ignore') {
    return;
  } else if (action === 'open-detail') {
    actions.openSunSessionDetail?.(id);
  } else if (action === 'delete-session') {
    if (actionEl.dataset.sunSessionCloseModal === 'true') closeContainingOverlay(actionEl);
    void actions.deleteSunSession?.(id);
  } else if (action === 'quick-log-sun') {
    void actions.quickLogSunSession?.();
  } else if (action === 'pause-session') {
    void actions.pauseSunSession?.(id);
  } else if (action === 'resume-session') {
    void actions.resumeSunSession?.(id);
  } else if (action === 'flip-sides') {
    void actions.flipSidesMidSession?.(id);
  } else if (action === 'change-coverage') {
    void actions.changeCoverageMidSession?.(id);
  } else if (action === 'apply-sunscreen') {
    void actions.applySunscreenMidSession?.(id);
  } else if (action === 'override-ozone') {
    void actions.setOzoneOverrideMidSession?.();
  } else if (action === 'forgot-stop') {
    void actions.forgotStopPrompt?.(id);
  } else if (action === 'open-channel') {
    closeContainingOverlay(actionEl);
    actions.openChannelOnLightPage?.(channel);
  } else if (action === 'close-modal') {
    closeContainingOverlay(actionEl);
  } else if (action === 'edit-duration') {
    closeContainingOverlay(actionEl);
    void actions.editSunSessionDuration?.(id);
  } else if (action === 'retry-calculation') {
    void actions.retrySunSessionCalculation?.(id);
  } else if (action === 'toggle-chips') {
    const container = actionEl.closest('.sun-channel-chips');
    if (container) setSunChannelChipsExpanded(container, !container.classList.contains('sun-chips-expanded'));
  }
}

function handleSunSessionClick(event, actions) {
  const actionEl = closestSunSessionAction(event);
  if (!actionEl) return;
  event.preventDefault();
  event.stopPropagation();
  handleSunSessionAction(actionEl, actions);
}

function handleSunSessionKeydown(event, actions) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestSunSessionAction(event);
  if (!actionEl) return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  if (!SUN_SESSION_KEYBOARD_ACTIONS.has(actionEl.dataset.sunSessionAction || '')) return;
  event.preventDefault();
  event.stopPropagation();
  handleSunSessionAction(actionEl, actions);
}

export function installSunSessionActionDelegates(actions = {}, root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || sunSessionActionDelegateRoots.has(root)) return;
  sunSessionActionDelegateRoots.add(root);
  root.addEventListener('click', event => handleSunSessionClick(event, actions));
  root.addEventListener('keydown', event => handleSunSessionKeydown(event, actions));
}
