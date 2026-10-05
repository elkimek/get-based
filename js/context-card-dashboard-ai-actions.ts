// context-card-dashboard-ai-actions.js - delegated actions for dashboard AI CTAs

import { escapeAttr } from './utils.js';

const DASHBOARD_AI_ACTION_ATTR = 'data-dashboard-ai-action';
const DASHBOARD_AI_ACTION_SELECTOR = `[${DASHBOARD_AI_ACTION_ATTR}]`;
const dashboardAIActionDelegateRoots = new WeakSet<Pick<Document, 'addEventListener'>>();

let dashboardAIActionHandlers: Record<string, unknown> = {};

export function configureDashboardAIActionDelegates(handlers: unknown = {}) {
  dashboardAIActionHandlers = { ...(handlers as Record<string, unknown> | null | undefined) };
}

export function dashboardAIActionAttrs(action: unknown) {
  return `${DASHBOARD_AI_ACTION_ATTR}="${escapeAttr(action)}"`;
}

function closestDashboardAIAction(target: unknown) {
  return (
    target && typeof (target as { closest?: unknown }).closest === 'function'
      ? (target as { closest(selector: string): HTMLElement | null }).closest(DASHBOARD_AI_ACTION_SELECTOR)
      : null
  );
}

function runDashboardAIAction(action: string | null) {
  const handler = action ? dashboardAIActionHandlers[action] : null;
  if (typeof handler !== 'function') return false;
  (handler as () => unknown)();
  return true;
}

function handleDashboardAIActionClick(event: Event) {
  const actionEl = closestDashboardAIAction(event.target);
  if (!actionEl || !(event.currentTarget as { contains?(node: Node): unknown } | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(DASHBOARD_AI_ACTION_ATTR);
  if (!runDashboardAIAction(action)) return;
  event.preventDefault();
  event.stopPropagation();
}

function handleDashboardAIActionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestDashboardAIAction(event.target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  if ((event.target as { closest?(selector: string): unknown } | null)?.closest?.('button, a, input, textarea, select')) return;
  handleDashboardAIActionClick(event);
}

export function installDashboardAIActionDelegates(root: Pick<Document, 'addEventListener'> | null = typeof document !== 'undefined' ? document : null) {
  if (!root || dashboardAIActionDelegateRoots.has(root)) return;
  dashboardAIActionDelegateRoots.add(root);
  root.addEventListener('click', handleDashboardAIActionClick);
  root.addEventListener('keydown', handleDashboardAIActionKeydown);
}
