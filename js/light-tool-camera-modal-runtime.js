// @ts-check
// Shared delegated-close and dependency helpers for camera-backed Light tools.

/**
 * @template {Element} T
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {T | null}
 */
export function queryOptionalLightToolElement(root, selector) {
  return /** @type {T | null} */ (root.querySelector(selector));
}

export function lightToolModalActionAttrs(action) {
  return `data-light-tool-modal-action="${action}"`;
}

/** @type {Map<string, AnyFunction>} */
const activeCameraToolClosers = new Map();

function handleLightToolModalClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionEl = target.closest('[data-light-tool-modal-action]');
  if (!(actionEl instanceof HTMLElement)) return;
  const overlay = event.currentTarget;
  if (!(overlay instanceof HTMLElement) || !overlay.contains(actionEl)) return;

  const action = actionEl.dataset.lightToolModalAction || '';
  const close = activeCameraToolClosers.get(action);
  if (typeof close !== 'function') return;
  event.preventDefault();
  close();
}

export function installLightToolModalDelegates(overlay) {
  overlay.addEventListener('click', handleLightToolModalClick);
}

export function registerCameraToolCloser(action, close) {
  activeCameraToolClosers.set(action, close);
}

export function clearCameraToolCloser(action, close) {
  if (activeCameraToolClosers.get(action) === close) activeCameraToolClosers.delete(action);
}

export function closeCameraTool(action) {
  const close = activeCameraToolClosers.get(action);
  if (typeof close === 'function') close();
}

/** @param {{ saveMeasurement?: AnyFunction }} [deps] */
export function getSaveMeasurement(deps = {}) {
  const fn = deps.saveMeasurement;
  if (typeof fn !== 'function') throw new Error('saveMeasurement dependency is required');
  return fn;
}
