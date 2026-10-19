// modal-trigger-memory.js — shared focus restoration for modal shells

let modalLastTrigger: (Element & { focus: () => void }) | null = null;

export function rememberModalTrigger(trigger?: unknown) {
  if (typeof document === 'undefined') {
    modalLastTrigger = null;
    return;
  }
  const el = trigger instanceof Element && document.contains(trigger) ? trigger : document.activeElement;
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
