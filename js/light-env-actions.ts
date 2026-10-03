// light-env-actions.js - delegated action contract for Light Environment UI.

import { escapeAttr } from './utils.js';

type RoomUpdate = NonNullable<Parameters<typeof import('./light-env-store.js').updateRoom>[1]>;
type ScreenUpdate = NonNullable<Parameters<typeof import('./light-env-store.js').updateScreen>[1]>;
export interface LightEnvActions {
  setLightEnvRoomSourceArchetype?: ((id: string, key: string) => unknown) | null | undefined;
  setLightEnvRoomDaylightLevel?: ((id: string, key: string) => unknown) | null | undefined;
  updateLightEnvRoomAndRender?: ((id: string, patch: RoomUpdate) => unknown) | null | undefined;
  setLightEnvRoomHoursBucket?: ((id: string, key: string) => unknown) | null | undefined;
  updateLightEnvRoom?: ((id: string, patch: RoomUpdate) => unknown) | null | undefined;
  setLightEnvRoomEveningBucket?: ((id: string, key: string) => unknown) | null | undefined;
  setLightEnvTodayActive?: ((kind: string, id: string, active: boolean) => unknown) | null | undefined;
  toggleLightEnvScreenExpanded?: ((id: string, event: Event) => unknown) | null | undefined;
  deleteLightEnvScreenConfirm?: ((id: string) => unknown) | null | undefined;
  setLightEnvScreenHoursBucket?: ((id: string, key: string) => unknown) | null | undefined;
  setLightEnvScreenEveningBucket?: ((id: string, key: string) => unknown) | null | undefined;
  updateLightEnvScreenAndRender?: ((id: string, patch: ScreenUpdate) => unknown) | null | undefined;
  addLightEnvRoomNamed?: ((name: string) => unknown) | null | undefined;
  addLightEnvRoomCustom?: (() => unknown) | null | undefined;
  addLightEnvScreenWithDevice?: ((roomId: string | null, device: string) => unknown) | null | undefined;
  addLightEnvScreen?: ((roomId: string | null) => unknown) | null | undefined;
  openLightEnvironmentAssessment?: (() => unknown) | null | undefined;
  saveLightAuditFromUI?: (() => unknown) | null | undefined;
  closeLightEnvironmentAssessment?: (() => unknown) | null | undefined;
  toggleLightEnvRoomExpanded?: ((id: string, event: Event) => unknown) | null | undefined;
  deleteLightEnvRoomConfirm?: ((id: string) => unknown) | null | undefined;
  openLightEnvTool?: ((tool: string, roomId: string) => unknown) | null | undefined;
  addLightEnvRoom?: (() => unknown) | null | undefined;
  toggleLightAudit?: ((id: string) => unknown) | null | undefined;
  updateLightAuditField?: ((id: string, field: string, value: unknown) => unknown) | null | undefined;
  deleteLightAuditConfirm?: ((id: string) => unknown) | null | undefined;
  interpretLightAuditCompare?: ((oldId: string, newId: string) => unknown) | null | undefined;
  toggleLightAuditCompare?: (() => unknown) | null | undefined;
  toggleLightAuditHistory?: (() => unknown) | null | undefined;
  setLightAuditsBlockOpen?: ((open: boolean) => unknown) | null | undefined;
}
interface ActionElement {
  dataset: DOMStringMap;
  getAttribute: Element['getAttribute'];
  matches?: Element['matches'];
  value?: unknown;
  checked?: unknown;
  open?: unknown;
}
interface ActionTarget { closest?: (selector: string) => ActionElement | null }
interface ActionRoot { contains?: (element: ActionElement) => boolean }

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

function dataAttrName(name: unknown) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function lightEnvActionAttrs(action: unknown, attrs: Record<string, unknown> = {}) {
  return [
    `data-light-env-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      // Boolean false means "absent but false"; parseActive reads absence as false.
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([name, value]) => `data-light-env-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function closestLightEnvAction(event: Event) {
  const target = event.target as ActionTarget | null;
  if (!target || typeof target.closest !== 'function') return null;
  const actionEl = target.closest('[data-light-env-action]');
  if (!actionEl) return null;
  return typeof (event.currentTarget as ActionRoot | null)?.contains === 'function' && (event.currentTarget as ActionRoot).contains!(actionEl) ? actionEl : null;
}

function parseActive(actionEl: ActionElement) {
  return actionEl.dataset.lightEnvActive === 'true';
}

function roomId(actionEl: ActionElement) {
  return actionEl.dataset.lightEnvRoomId || null;
}

function actionName(actionEl: ActionElement) {
  return actionEl.dataset.lightEnvAction || '';
}

function shouldHandleClick(actionEl: ActionElement | null) {
  return actionEl && !NON_CLICK_ACTIONS.has(actionName(actionEl)) && !actionEl.matches?.('input, select, textarea');
}

function shouldHandleRoleButtonKeydown(actionEl: ActionElement | null, event: KeyboardEvent) {
  return actionEl &&
    (event.key === 'Enter' || event.key === ' ') &&
    !(event.target as ActionTarget | null)?.closest?.('button, a, input, textarea, select') &&
    actionEl.getAttribute('role') === 'button';
}

function handleLightEnvAction(actionEl: ActionElement, event: Event, actions: LightEnvActions) {
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
    void actions.updateLightEnvRoom?.(id, { hoursOccupiedPerDay: parseFloat(actionEl.value as string) || 0 });
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

function handleLightEnvCapturedClick(event: Event, actions: LightEnvActions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleClick(actionEl)) return;
  if (!PROPAGATION_STOPPING_CLICK_ACTIONS.has(actionName(actionEl!))) return;
  event.preventDefault();
  event.stopPropagation();
  handleLightEnvAction(actionEl!, event, actions);
}

function handleLightEnvClick(event: Event, actions: LightEnvActions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleClick(actionEl)) return;
  if (PROPAGATION_STOPPING_CLICK_ACTIONS.has(actionName(actionEl!))) return;
  event.preventDefault();
  handleLightEnvAction(actionEl!, event, actions);
}

function handleLightEnvCapturedKeydown(event: KeyboardEvent, actions: LightEnvActions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleRoleButtonKeydown(actionEl, event)) return;
  if (!PROPAGATION_STOPPING_KEYDOWN_ACTIONS.has(actionName(actionEl!))) return;
  event.preventDefault();
  event.stopPropagation();
  handleLightEnvAction(actionEl!, event, actions);
}

function handleLightEnvKeydown(event: KeyboardEvent, actions: LightEnvActions) {
  const actionEl = closestLightEnvAction(event);
  if (!shouldHandleRoleButtonKeydown(actionEl, event)) return;
  if (PROPAGATION_STOPPING_KEYDOWN_ACTIONS.has(actionName(actionEl!))) return;
  event.preventDefault();
  handleLightEnvAction(actionEl!, event, actions);
}

function handleLightEnvChange(event: Event, actions: LightEnvActions) {
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

function handleLightEnvInput(event: Event, actions: LightEnvActions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || !actionEl.matches?.('input, textarea')) return;
  if (!['update-room-hours', 'update-room-name'].includes(actionEl.dataset.lightEnvAction || '')) return;
  handleLightEnvAction(actionEl, event, actions);
}

function handleLightEnvToggle(event: Event, actions: LightEnvActions) {
  const actionEl = closestLightEnvAction(event);
  if (!actionEl || actionName(actionEl) !== 'set-audits-block-open') return;
  actions.setLightAuditsBlockOpen?.(!!actionEl.open);
}

export function installLightEnvActionDelegates(actions: LightEnvActions = {}, root: Pick<EventTarget, 'addEventListener'> | null = (typeof document !== 'undefined' ? document : null)) {
  if (!root || lightEnvActionDelegateRoots.has(root)) return;
  lightEnvActionDelegateRoots.add(root);
  root.addEventListener('click', event => handleLightEnvCapturedClick(event, actions), true);
  root.addEventListener('click', event => handleLightEnvClick(event, actions));
  root.addEventListener('keydown', event => handleLightEnvCapturedKeydown(event as KeyboardEvent, actions), true);
  root.addEventListener('keydown', event => handleLightEnvKeydown(event as KeyboardEvent, actions));
  root.addEventListener('change', event => handleLightEnvChange(event, actions));
  root.addEventListener('input', event => handleLightEnvInput(event, actions));
  root.addEventListener('toggle', event => handleLightEnvToggle(event, actions), true);
}
