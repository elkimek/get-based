// @ts-check
// modal-lifecycle.js — shared modal backdrop, focus trap, and scroll lock.

export function wireBackdropClose(overlay, closeFn) {
  const close = typeof closeFn === 'function' ? closeFn : () => overlay.remove();
  let mouseDownInside = false;
  overlay.addEventListener('mousedown', (e) => {
    mouseDownInside = !!e.target.closest('.modal');
  });
  overlay.addEventListener('click', (e) => {
    if (mouseDownInside) { mouseDownInside = false; return; }
    if (e.target === overlay) close();
  });
}

export const _wireBackdropClose = wireBackdropClose;

const _modalScrollState = (() => {
  const fallback = { locks: new Set(), priorOverflow: '' };
  if (typeof window === 'undefined') return fallback;
  const appWindow = /** @type {any} */ (window);
  if (appWindow.__labModalScrollState && appWindow.__labModalScrollState.locks instanceof Set) {
    return appWindow.__labModalScrollState;
  }
  try {
    Object.defineProperty(appWindow, '__labModalScrollState', {
      value: fallback,
      configurable: true,
    });
  } catch (_) {
    appWindow.__labModalScrollState = fallback;
  }
  return fallback;
})();

const _modalScrollLocks = _modalScrollState.locks;

function _pruneDetachedModalScrollLocks() {
  for (const lock of Array.from(_modalScrollLocks)) {
    if (!document.body.contains(lock)) _modalScrollLocks.delete(lock);
  }
}

export function trapModalFocus(overlay) {
  _pruneDetachedModalScrollLocks();
  const previouslyFocused = document.activeElement;
  if (_modalScrollLocks.size === 0) {
    _modalScrollState.priorOverflow = document.body.style.overflow;
  }
  _modalScrollLocks.add(overlay);
  document.body.style.overflow = 'hidden';
  let teardown = false;
  setTimeout(() => {
    const focusables = overlay.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = /** @type {HTMLElement | undefined} */ (focusables[0]);
    if (firstFocusable) try { firstFocusable.focus(); } catch (e) {}
  }, 30);
  const onKeydown = (e) => {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      e.preventDefault();
      try { overlay.remove(); } catch (_) {}
    }
  };
  document.addEventListener('keydown', onKeydown);
  const restore = () => {
    if (teardown) return;
    teardown = true;
    document.removeEventListener('keydown', onKeydown);
    _modalScrollLocks.delete(overlay);
    _pruneDetachedModalScrollLocks();
    if (_modalScrollLocks.size === 0) {
      document.body.style.overflow = _modalScrollState.priorOverflow;
    } else {
      document.body.style.overflow = 'hidden';
    }
    const previousFocusTarget = /** @type {HTMLElement | null} */ (previouslyFocused instanceof HTMLElement ? previouslyFocused : null);
    if (previousFocusTarget && document.contains(previousFocusTarget)) {
      try { previousFocusTarget.focus(); } catch (e) {}
    }
  };
  const obs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      obs.disconnect();
      restore();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
