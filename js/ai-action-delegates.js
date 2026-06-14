// @ts-check
// ai-action-delegates.js - shared delegated actions for AI verdict controls.

import { escapeAttr } from './utils.js';

let aiActionDelegatesInstalled = false;

function callWindowAction(name, targetId) {
  const fn = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window))[name];
  if (typeof fn !== 'function') return undefined;
  if (targetId === undefined) return fn();
  return fn(targetId);
}

const AI_ACTIONS = {
  'refresh-sun-session': (targetId) => callWindowAction('refreshSessionAIAnalysis', targetId),
  'refresh-device-session': (targetId) => callWindowAction('refreshDeviceSessionAIAnalysis', targetId),
  'refresh-measurement': (targetId) => callWindowAction('refreshMeasurementAIAnalysis', targetId),
  'refresh-audit': (targetId) => callWindowAction('refreshAuditAIAnalysis', targetId),
  'refresh-room': (targetId) => callWindowAction('refreshRoomAIAnalysis', targetId),
  'refresh-screen': (targetId) => callWindowAction('refreshScreenAIAnalysis', targetId),
  'refresh-day': (targetId) => callWindowAction('refreshDayAIAnalysis', targetId),
  'refresh-channel-mix': () => callWindowAction('refreshChannelMixAI', undefined),
  'refresh-burden': () => callWindowAction('refreshBurdenAIAnalysis', undefined),
  'refresh-onboarding': () => callWindowAction('refreshOnboardingAIAnalysis', undefined),
};

export function aiActionAttrs(action, targetId = '', opts = {}) {
  const attrs = [`data-ai-action="${escapeAttr(action)}"`];
  if (targetId != null && targetId !== '') attrs.push(`data-ai-target="${escapeAttr(String(targetId))}"`);
  if (opts.stopPropagation) attrs.push('data-ai-stop-propagation="true"');
  return attrs.join(' ');
}

function _handleAIActionClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest('[data-ai-action]');
  if (!actionEl || !actionEl.dataset) return;

  const action = actionEl.dataset.aiAction || '';
  if (!action) return;
  if (action === 'stop-propagation' || actionEl.dataset.aiStopPropagation === 'true') {
    event.stopPropagation();
  }
  if (action === 'stop-propagation') return;

  const handler = AI_ACTIONS[action];
  if (!handler) return;
  event.preventDefault();
  handler(actionEl.dataset.aiTarget);
}

export function installAIActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || aiActionDelegatesInstalled) return;
  aiActionDelegatesInstalled = true;
  // Capture is intentional for data-ai-stop-propagation controls nested in
  // clickable rows: it blocks row-level bubble delegates before they open.
  root.addEventListener('click', _handleAIActionClick, true);
}

if (typeof window !== 'undefined') {
  installAIActionDelegates();
}
