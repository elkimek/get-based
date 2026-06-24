// @ts-check
// ai-action-delegates.js - shared delegated actions for AI verdict controls.

import { escapeAttr } from './utils.js';

let aiActionDelegatesInstalled = false;

export const KNOWN_AI_ACTIONS = [
  'refresh-sun-session',
  'refresh-device-session',
  'refresh-measurement',
  'refresh-audit',
  'refresh-room',
  'refresh-screen',
  'refresh-day',
  'refresh-channel-mix',
  'refresh-burden',
  'refresh-onboarding',
];

const AI_ACTION_HANDLERS = new Map();

export function registerAIActionHandler(action, handler) {
  if (!KNOWN_AI_ACTIONS.includes(action)) throw new Error(`Unknown AI action: ${action}`);
  if (typeof handler !== 'function') throw new Error(`AI action handler must be a function: ${action}`);
  AI_ACTION_HANDLERS.set(action, handler);
  return () => {
    if (AI_ACTION_HANDLERS.get(action) === handler) AI_ACTION_HANDLERS.delete(action);
  };
}

export function getRegisteredAIActionHandler(action) {
  return AI_ACTION_HANDLERS.get(action) || null;
}

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
    // This document-level capture listener intentionally stops downstream
    // capture/target handlers as well as row-level bubble delegates.
    event.stopPropagation();
  }
  if (action === 'stop-propagation') return;

  const handler = getRegisteredAIActionHandler(action);
  if (!handler) return;
  event.preventDefault();
  if (actionEl.dataset.aiTarget === undefined) handler();
  else handler(actionEl.dataset.aiTarget);
}

export function installAIActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || aiActionDelegatesInstalled) return;
  aiActionDelegatesInstalled = true;
  root.addEventListener('click', _handleAIActionClick, true);
}

if (typeof window !== 'undefined') {
  installAIActionDelegates();
}
