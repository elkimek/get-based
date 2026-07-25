// @ts-check
// modal-trigger-memory.js — shared focus restoration for modal shells

/** @type {(Element & { focus: () => void }) | null} */
let modalLastTrigger = null;

export function rememberModalTrigger() {
  if (typeof document === 'undefined') {
    modalLastTrigger = null;
    return;
  }
  const el = document.activeElement;
  if (!(el instanceof Element) || el === document.body) {
    modalLastTrigger = null;
    return;
  }
  const focusableEl = /** @type {Element & { focus?: unknown }} */ (el);
  modalLastTrigger = typeof focusableEl.focus === 'function'
    ? /** @type {Element & { focus: () => void }} */ (focusableEl)
    : null;
}

export function restoreModalTrigger() {
  const el = modalLastTrigger;
  modalLastTrigger = null;
  if (typeof document === 'undefined' || !el || !document.contains(el)) return;
  try { el.focus(); } catch { /* element may have been replaced */ }
}
