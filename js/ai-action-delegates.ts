// ai-action-delegates.js - shared delegated actions for AI verdict controls.

import { escapeAttr } from './utils.js';
import { captureAIVerdictOwner } from './ai-verdict-owner.js';

export const aiActionOwner = () => captureAIVerdictOwner().key('control');

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
] as const;
export type AIActionName = typeof KNOWN_AI_ACTIONS[number];

export type AIActionHandler = ((targetId: string) => unknown) | (() => unknown);
const AI_ACTION_HANDLERS = new Map<string, AIActionHandler>();

export function registerAIActionHandler(action: string, handler: AIActionHandler) {
  if (!KNOWN_AI_ACTIONS.some(known => known === action)) throw new Error(`Unknown AI action: ${action}`);
  if (typeof handler !== 'function') throw new Error(`AI action handler must be a function: ${action}`);
  AI_ACTION_HANDLERS.set(action, handler);
  return () => {
    if (AI_ACTION_HANDLERS.get(action) === handler) AI_ACTION_HANDLERS.delete(action);
  };
}

export function getRegisteredAIActionHandler(action: string) {
  return AI_ACTION_HANDLERS.get(action) || null;
}

export function aiActionAttrs(action: unknown, targetId: unknown = '', opts: { stopPropagation?: boolean } = {}) {
  const attrs = [`data-ai-action="${escapeAttr(action)}"`, `data-ai-owner="${aiActionOwner()}"`];
  if (targetId != null && targetId !== '') attrs.push(`data-ai-target="${escapeAttr(String(targetId))}"`);
  if (opts.stopPropagation) attrs.push('data-ai-stop-propagation="true"');
  return attrs.join(' ');
}

function _handleAIActionClick(event: Event) {
  const target = event.target as (EventTarget & { closest?: (selector: string) => HTMLElement | null }) | null;
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
  // A retained modal/row must never start work in a replacement profile.
  if (actionEl.dataset.aiOwner !== aiActionOwner()) return;
  if (actionEl.dataset.aiTarget === undefined) (handler as () => unknown)();
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
