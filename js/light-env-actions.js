// @ts-check
// light-env-actions.js - delegated action contract for Light Environment UI.

import { escapeAttr } from './utils.js';

const lightEnvActionDelegateRoots = new WeakSet();
const PROPAGATION_STOPPING_CLICK_ACTIONS = new Set([
  'set-today-active',
  'toggle-screen-expanded',
  'delete-screen-confirm',
  'toggle-room-expanded',
  'delete-room-confirm',
  'toggle-audit-compare',
  'save-audit',
  'toggle-audit-history',
]);
const PROPAGATION_STOPPING_KEYDOWN_ACTIONS = new Set([
  'toggle-screen-expanded',
  'toggle-room-expanded',
]);
const NON_CLICK_ACTIONS = new Set([
  'set-audits-block-open',
]);

function dataAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function lightEnvActionAttrs(action, attrs = {}) {
  return [
    `data-light-env-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      // Boolean false means "absent but false"; parseActive reads absence as false.
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([name, value]) => `data-light-env-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function closestLightEnvAction(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  const actionEl = target.closest('[data-light-env-action]');
  if (!actionEl) return null;
  return typeof event.currentTarget?.contains === 'function' && event.currentTarget.contains(actionEl) ? actionEl : null;
}

function parseActive(actionEl) {
  return actionEl.dataset.lightEnvActive === 'true';
}

function roomId(actionEl) {
  return actionEl.dataset.lightEnvRoomId || null;
}

function actionName(actionEl) {
  return actionEl.dataset.lightEnvAction || '';
}

function shouldHandleClick(actionEl) {
  return actionEl && !NON_CLICK_ACTIONS.has(actionName(actionEl)) && !actionEl.matches?.('input, select, textarea');
}

function shouldHandleRoleButtonKeydown(actionEl, event) {
  return actionEl &&
    (event.key === 'Enter' || event.key === ' ') &&
    !event.target?.closest?.('button, a, input, textarea, select') &&
    actionEl.getAttribute('role') === 'button';
}

function handleLightEnvAction(actionEl, event, actions) {
  const action = actionName(actionEl);
  const id = actionEl.dataset.lightEnvId || '';
  const key = actionEl.dataset.lightEnvKey || '';
  const kind = actionEl.dataset.lightEnvKind || '';
  const device = actionEl.dataset.lightEnvDevice || '';
  const tool = actionEl.dataset.lightEnvTool || '';
  const field = actionEl.dataset.lightEnvField || '';
  const oldId = actionEl.dataset.lightEnvOldId || '';
  const newId = actionEl.dataset.lightEnvNewId || '';

  if (action === 'set-room-source-archetype') {
    void actions.setLightEnvRoomSourceArchetype?.(id, key);
  } else if (action === 'set-room-daylight-level') {
    void actions.setLightEnvRoomDaylightLevel?.(id, key);
  } else if (action === 'update-room-primary-source') {
    void actions.updateLightEnvRoomAndRender?.(id, { primarySource: actionEl.value });
  } else if (action === 'set-room-hours-bucket') {
    void actions.setLightEnvRoomHoursBucket?.(id, key);
  } else if (action === 'update-room-hours') {
    void actions.updateLightEnvRoom?.(id, { hoursOccupiedPerDay: parseFloat(actionEl.value) || 0 });
  } else if (action === 'set-room-evening-bucket') {
    void actions.setLightEnvRoomEveningBucket?.(id, key);
  } else if (action === 'set-today-active') {
    void actions.setLightEnvTodayActive?.(kind, id, parseActive(actionEl));
  } else if (action === 'toggle-screen-expanded') {
    actions.toggleLightEnvScreenExpanded?.(id, event);
  } else if (action === 'delete-screen-confirm') {
    void actions.deleteLightEnvScreenConfirm?.(id);
  } else if (action === 'set-screen-hours-bucket') {
    void actions.setLightEnvScreenHoursBucket?.(id, key);
  } else if (action === 'set-screen-evening-bucket') {
    void actions.setLightEnvScreenEveningBucket?.(id, key);
  } else if (action === 'update-screen-room') {
    void actions.updateLightEnvScreenAndRender?.(id, { roomId: actionEl.value || null });
  } else if (action === 'update-screen-device') {
    void actions.updateLightEnvScreenAndRender?.(id, { device: actionEl.value });
  } else if (action === 'update-screen-blue-blocker') {
    void actions.updateLightEnvScreenAndRender?.(id, { blueBlockerEnabled: !!actionEl.checked });
  } else if (action === 'add-room-named') {
    void actions.addLightEnvRoomNamed?.(actionEl.dataset.lightEnvName || '');
  } else if (action === 'add-room-custom') {
    void actions.addLightEnvRoomCustom?.();
  } else if (action === 'add-screen-with-device') {
    void actions.addLightEnvScreenWithDevice?.(roomId(actionEl), device);
  } else if (action === 'add-screen') {
    void actions.addLightEnvScreen?.(roomId(actionEl));
  } else if (action === 'open-assessment') {
    actions.openLightEnvironmentAssessment?.();
  } else if (action === 'open-assessment-save-audit') {
    actions.openLightEnvironmentAssessment?.();
    setTimeout(() => actions.saveLightAuditFromUI?.(), 0);
  } else if (action === 'close-assessment') {
    actions.closeLightEnvironmentAssessment?.();
  } else if (action === 'toggle-room-expanded') {
    actions.toggleLightEnvRoomExpanded?.(id, event);
  } else if (action === 'delete-room-confirm') {
    void actions.deleteLightEnvRoomConfirm?.(id);
  } else if (action === 'update-room-name') {
    void actions.updateLightEnvRoom?.(id, { name: actionEl.value });
  } else if (action === 'open-tool') {
    actions.openLightEnvTool?.(tool, id);
  } else if (action === 'add-room') {
    void actions.addLightEnvRoom?.();
  } else if (action === 'toggle-audit') {
    actions.toggleLightAudit?.(id);
  } else if (action === 'update-audit-field') {
    void actions.updateLightAuditField?.(id, field, actionEl.value);
  } else if (action === 'delete-audit-confirm') {
    void actions.deleteLightAuditConfirm?.(id);
  } else if (action === 'interpret-audit-compare') {
    actions.interpretLightAuditCompare?.(oldId, newId);
  } else if (action === 'toggle-audit-compare') {
    actions.toggleLightAuditCompare?.();
  } else if (action === 'save-audit') {
    void actions.saveLightAuditFromUI?.();
  } else if (action === 'toggle-audit-history') {
    actions.toggleLightAuditHistory?.();
  }
}

function handleLightEnvCapturedClick(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleClick(actionEl)) return;
  if (!PROPAGATION_STOPPING_CLICK_ACTIONS.has(actionName(actionEl))) return;
  event.preventDefault();
  event.stopPropagation();
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvClick(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleClick(actionEl)) return;
  if (PROPAGATION_STOPPING_CLICK_ACTIONS.has(actionName(actionEl))) return;
  event.preventDefault();
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvCapturedKeydown(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleRoleButtonKeydown(actionEl, event)) return;
  if (!PROPAGATION_STOPPING_KEYDOWN_ACTIONS.has(actionName(actionEl))) return;
  event.preventDefault();
  event.stopPropagation();
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvKeydown(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleRoleButtonKeydown(actionEl, event)) return;
  if (PROPAGATION_STOPPING_KEYDOWN_ACTIONS.has(actionName(actionEl))) return;
  event.preventDefault();
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvChange(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || !actionEl.matches?.('input, select, textarea')) return;
  if (![
    'update-room-primary-source',
    'update-screen-room',
    'update-screen-device',
    'update-screen-blue-blocker',
    'update-audit-field',
  ].includes(actionEl.dataset.lightEnvAction || '')) return;
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvInput(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || !actionEl.matches?.('input, textarea')) return;
  if (!['update-room-hours', 'update-room-name'].includes(actionEl.dataset.lightEnvAction || '')) return;
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvToggle(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || actionName(actionEl) !== 'set-audits-block-open') return;
  actions.setLightAuditsBlockOpen?.(!!actionEl.open);
}

export function installLightEnvActionDelegates(actions = {}, root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || lightEnvActionDelegateRoots.has(root)) return;
  lightEnvActionDelegateRoots.add(root);
  root.addEventListener('click', event => handleLightEnvCapturedClick(event, actions), true);
  root.addEventListener('click', event => handleLightEnvClick(event, actions));
  root.addEventListener('keydown', event => handleLightEnvCapturedKeydown(event, actions), true);
  root.addEventListener('keydown', event => handleLightEnvKeydown(event, actions));
  root.addEventListener('change', event => handleLightEnvChange(event, actions));
  root.addEventListener('input', event => handleLightEnvInput(event, actions));
  root.addEventListener('toggle', event => handleLightEnvToggle(event, actions), true);
}
