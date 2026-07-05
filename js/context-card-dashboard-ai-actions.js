// @ts-check
// context-card-dashboard-ai-actions.js - delegated actions for dashboard AI CTAs

import { escapeAttr } from './utils.js';

const DASHBOARD_AI_ACTION_ATTR = 'data-dashboard-ai-action';
const DASHBOARD_AI_ACTION_SELECTOR = `[${DASHBOARD_AI_ACTION_ATTR}]`;
const dashboardAIActionDelegateRoots = new WeakSet();

/** @type {Record<string, () => void>} */
let dashboardAIActionHandlers = {};

export function configureDashboardAIActionDelegates(handlers = {}) {
  dashboardAIActionHandlers = { ...handlers };
}

export function dashboardAIActionAttrs(action) {
  return `${DASHBOARD_AI_ACTION_ATTR}="${escapeAttr(action)}"`;
}

function closestDashboardAIAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(DASHBOARD_AI_ACTION_SELECTOR)
      : null
  );
}

function runDashboardAIAction(action) {
  const handler = action ? dashboardAIActionHandlers[action] : null;
  if (typeof handler !== 'function') return false;
  handler();
  return true;
}

function handleDashboardAIActionClick(event) {
  const actionEl = closestDashboardAIAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(DASHBOARD_AI_ACTION_ATTR);
  if (!runDashboardAIAction(action)) return;
  event.preventDefault();
  event.stopPropagation();
}

function handleDashboardAIActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestDashboardAIAction(event.target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  handleDashboardAIActionClick(event);
}

export function installDashboardAIActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || dashboardAIActionDelegateRoots.has(root)) return;
  dashboardAIActionDelegateRoots.add(root);
  root.addEventListener('click', handleDashboardAIActionClick);
  root.addEventListener('keydown', handleDashboardAIActionKeydown);
}
