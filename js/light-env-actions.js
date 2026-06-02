// light-env-actions.js - delegated action contract for Light Environment UI.

import { escapeAttr } from './utils.js';

const lightEnvActionDelegateRoots = new WeakSet();

function dataAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function lightEnvActionAttrs(action, attrs = {}) {
  return [
    `data-light-env-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
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

function handleLightEnvAction(actionEl, event, actions) {
  const action = actionEl.dataset.lightEnvAction || '';
  const id = actionEl.dataset.lightEnvId || '';
  const key = actionEl.dataset.lightEnvKey || '';
  const kind = actionEl.dataset.lightEnvKind || '';
  const device = actionEl.dataset.lightEnvDevice || '';
  const tool = actionEl.dataset.lightEnvTool || '';

  if (action === 'set-room-source-archetype') {
    void actions.setLightEnvRoomSourceArchetype?.(id, key);
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
  }
}

function handleLightEnvClick(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || actionEl.matches?.('input, select, textarea')) return;
  event.preventDefault();
  event.stopPropagation();
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvKeydown(event, actions) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestLightEnvAction(event);
  if (!actionEl) return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  if (actionEl.getAttribute('role') !== 'button') return;
  event.preventDefault();
  event.stopPropagation();
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
  ].includes(actionEl.dataset.lightEnvAction || '')) return;
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvInput(event, actions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || !actionEl.matches?.('input, textarea')) return;
  if (!['update-room-hours', 'update-room-name'].includes(actionEl.dataset.lightEnvAction || '')) return;
  handleLightEnvAction(actionEl, event, actions);
}

export function installLightEnvActionDelegates(actions = {}, root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || lightEnvActionDelegateRoots.has(root)) return;
  lightEnvActionDelegateRoots.add(root);
  root.addEventListener('click', event => handleLightEnvClick(event, actions));
  root.addEventListener('keydown', event => handleLightEnvKeydown(event, actions));
  root.addEventListener('change', event => handleLightEnvChange(event, actions));
  root.addEventListener('input', event => handleLightEnvInput(event, actions));
}
