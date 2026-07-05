// @ts-check
// light-devices-actions.js - delegated actions for light device cards

const LIGHT_DEVICES_ACTION_ATTR = 'data-light-devices-action';
const LIGHT_DEVICE_ID_ATTR = 'data-light-device-id';
const LIGHT_DEVICE_SESSION_ID_ATTR = 'data-light-device-session-id';
const LIGHT_DEVICES_ACTION_DELEGATE_KEY = Symbol.for('getbased.lightDevicesActionDelegatesInstalled');
const lightDevicesActionDelegateRoots = new WeakSet();

function closestLightDevicesAction(target) {
  return target?.closest?.(`[${LIGHT_DEVICES_ACTION_ATTR}]`) || null;
}

function handleLightDevicesActionClick(event) {
  const actionEl = closestLightDevicesAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LIGHT_DEVICES_ACTION_ATTR);
  const appWindow = /** @type {any} */ (window);
  if (action === 'suppress') {
    event.stopPropagation();
    return;
  }
  if (action === 'stop-device-session') {
    event.stopPropagation();
    const sessionId = actionEl.getAttribute(LIGHT_DEVICE_SESSION_ID_ATTR) || '';
    if (sessionId) appWindow.stopDeviceSessionAndNotify?.(sessionId);
    return;
  }
  if (action === 'add-device') { appWindow.openAddDeviceDialog?.(); return; }
  if (action === 'delete-device') {
    const deviceId = actionEl.getAttribute(LIGHT_DEVICE_ID_ATTR) || '';
    if (deviceId) appWindow.deleteLightDevice?.(deviceId);
    return;
  }
  if (action === 'log-device-session') {
    const deviceId = actionEl.getAttribute(LIGHT_DEVICE_ID_ATTR) || '';
    if (deviceId) appWindow.openDeviceSessionDialog?.(deviceId);
  }
}

export function installLightDevicesActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || lightDevicesActionDelegateRoots.has(root) || root[LIGHT_DEVICES_ACTION_DELEGATE_KEY]) return;
  lightDevicesActionDelegateRoots.add(root);
  Object.defineProperty(root, LIGHT_DEVICES_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleLightDevicesActionClick);
}
