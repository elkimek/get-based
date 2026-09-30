// modal-trigger-memory.js — shared focus restoration for modal shells

let modalLastTrigger: (Element & { focus: () => void }) | null = null;

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
  const focusableEl = el as Element & { focus?: unknown };
  modalLastTrigger = typeof focusableEl.focus === 'function'
    ? (focusableEl as Element & { focus: () => void })
    : null;
}

export function restoreModalTrigger() {
  const el = modalLastTrigger;
  modalLastTrigger = null;
  if (typeof document === 'undefined' || !el || !document.contains(el)) return;
  try { el.focus(); } catch { /* element may have been replaced */ }
}
