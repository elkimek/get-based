// sun-session-actions.js - delegated action contract for sun session UI.

import { escapeAttr } from './utils.js';
import { removeModalOverlay } from './modal-lifecycle.js';

// Optional calls preserve the original nullish guard and receiver; registry
// values remain opaque so malformed configured callbacks retain their errors.
export type SunSessionActionRegistry = Record<string, unknown>;
type SunSessionDelegateRoot = Document | Element;
type SunSessionCallback = ((value?: string) => unknown) | null | undefined;

const sunSessionActionDelegateRoots = new WeakSet<SunSessionDelegateRoot>();
const SUN_SESSION_KEYBOARD_ACTIONS = new Set([
  'open-detail',
  'forgot-stop',
  'open-channel',
]);

function dataAttrName(name: unknown) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function sunSessionActionAttrs(action: unknown, attrs: unknown = {}) {
  return [
    `data-sun-session-action="${escapeAttr(action)}"`,
    ...(Object.entries as (value: unknown) => Array<[string, unknown]>)(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([name, value]) => `data-sun-session-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function closestSunSessionAction(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const actionEl = target.closest('[data-sun-session-action]');
  if (!(actionEl instanceof HTMLElement)) return null;
  return (event.currentTarget as (EventTarget & { contains(node: Node): unknown }) | null)?.contains(actionEl) ? actionEl : null;
}

function closeContainingOverlay(actionEl: HTMLElement) {
  const overlay = actionEl.closest('.modal-overlay');
  if (overlay) removeModalOverlay(overlay);
}

export function setSunChannelChipsExpanded(container: unknown, expanded: unknown) {
  if (!(container instanceof Element)) return;
  container.classList.toggle('sun-chips-expanded', !!expanded);
  const toggle = (container.querySelector('[data-sun-session-action="toggle-chips"]') as HTMLElement | null);
  if (!toggle) return;
  const hiddenCount = Math.max(0, Number(toggle.dataset.sunSessionHiddenCount) || 0);
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggle.setAttribute('aria-label', expanded
    ? 'Show fewer light channels'
    : `Show ${hiddenCount} additional light channel${hiddenCount === 1 ? '' : 's'}`);
}

function handleSunSessionAction(actionEl: HTMLElement, actions: SunSessionActionRegistry) {
  const action = actionEl.dataset.sunSessionAction || '';
  const id = actionEl.dataset.sunSessionId || '';
  const channel = actionEl.dataset.sunSessionChannel || '';

  if (action === 'ignore') {
    return;
  } else if (action === 'open-detail') {
    (actions.openSunSessionDetail as SunSessionCallback)?.(id);
  } else if (action === 'delete-session') {
    if (actionEl.dataset.sunSessionCloseModal === 'true') closeContainingOverlay(actionEl);
    void (actions.deleteSunSession as SunSessionCallback)?.(id);
  } else if (action === 'quick-log-sun') {
    void (actions.quickLogSunSession as SunSessionCallback)?.();
  } else if (action === 'pause-session') {
    void (actions.pauseSunSession as SunSessionCallback)?.(id);
  } else if (action === 'resume-session') {
    void (actions.resumeSunSession as SunSessionCallback)?.(id);
  } else if (action === 'flip-sides') {
    void (actions.flipSidesMidSession as SunSessionCallback)?.(id);
  } else if (action === 'change-coverage') {
    void (actions.changeCoverageMidSession as SunSessionCallback)?.(id);
  } else if (action === 'apply-sunscreen') {
    void (actions.applySunscreenMidSession as SunSessionCallback)?.(id);
  } else if (action === 'override-ozone') {
    void (actions.setOzoneOverrideMidSession as SunSessionCallback)?.();
  } else if (action === 'forgot-stop') {
    void (actions.forgotStopPrompt as SunSessionCallback)?.(id);
  } else if (action === 'open-channel') {
    closeContainingOverlay(actionEl);
    (actions.openChannelOnLightPage as SunSessionCallback)?.(channel);
  } else if (action === 'close-modal') {
    closeContainingOverlay(actionEl);
  } else if (action === 'edit-duration') {
    closeContainingOverlay(actionEl);
    void (actions.editSunSessionDuration as SunSessionCallback)?.(id);
  } else if (action === 'retry-calculation') {
    void (actions.retrySunSessionCalculation as SunSessionCallback)?.(id);
  } else if (action === 'toggle-chips') {
    const container = actionEl.closest('.sun-channel-chips');
    if (container) setSunChannelChipsExpanded(container, !container.classList.contains('sun-chips-expanded'));
  }
}

function handleSunSessionClick(event: Event, actions: SunSessionActionRegistry) {
  const actionEl = closestSunSessionAction(event);
  if (!actionEl) return;
  event.preventDefault();
  event.stopPropagation();
  handleSunSessionAction(actionEl, actions);
}

function handleSunSessionKeydown(event: KeyboardEvent, actions: SunSessionActionRegistry) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestSunSessionAction(event);
  if (!actionEl) return;
  if ((event.target as Element | null)?.closest?.('button, a, input, textarea, select')) return;
  if (!SUN_SESSION_KEYBOARD_ACTIONS.has(actionEl.dataset.sunSessionAction || '')) return;
  event.preventDefault();
  event.stopPropagation();
  handleSunSessionAction(actionEl, actions);
}

export function installSunSessionActionDelegates(actions: SunSessionActionRegistry = {}, root: SunSessionDelegateRoot | null = (typeof document !== 'undefined' ? document : null)) {
  if (!root || sunSessionActionDelegateRoots.has(root)) return;
  sunSessionActionDelegateRoots.add(root);
  root.addEventListener('click', event => handleSunSessionClick(event, actions));
  root.addEventListener('keydown', event => handleSunSessionKeydown(event as KeyboardEvent, actions));
}
