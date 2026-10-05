// Shared delegated-close and dependency helpers for camera-backed Light tools.

type SaveLightMeasurement = (tool: string, value: unknown, options?: Record<string, unknown>) => unknown;

export function queryOptionalLightToolElement<T extends Element = Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector(selector) as T | null;
}

export function lightToolModalActionAttrs(action: string) {
  return `data-light-tool-modal-action="${action}"`;
}

const activeCameraToolClosers = new Map<string, (() => unknown)>();

function handleLightToolModalClick(event: Event) {
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

export function installLightToolModalDelegates(overlay: Element) {
  overlay.addEventListener('click', handleLightToolModalClick);
}

export function registerCameraToolCloser(action: string, close: () => unknown) {
  activeCameraToolClosers.set(action, close);
}

export function clearCameraToolCloser(action: string, close: () => unknown) {
  if (activeCameraToolClosers.get(action) === close) activeCameraToolClosers.delete(action);
}

export function closeCameraTool(action: string) {
  const close = activeCameraToolClosers.get(action);
  if (typeof close === 'function') close();
}

export function getSaveMeasurement(deps: { saveMeasurement?: SaveLightMeasurement } = {}): SaveLightMeasurement {
  const fn = deps.saveMeasurement;
  if (typeof fn !== 'function') throw new Error('saveMeasurement dependency is required');
  return fn;
}
