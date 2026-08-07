// @ts-check
// modal-lifecycle.js — shared modal backdrop, focus trap, and scroll lock.

const DATA_PROTECTION_STYLESHEET_URL = new URL('../css/data-protection.css', import.meta.url).href;

/** @type {Promise<HTMLLinkElement> | null} */
let dataProtectionStylesheetPromise = null;
let dataProtectionStylesheetLoaded = false;
let useDataProtectionStylesheetRetryUrl = false;

function existingDataProtectionStylesheet() {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLLinkElement | null} */ (
    document.querySelector('link[data-data-protection-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname === '/css/data-protection.css';
        } catch {
          return false;
        }
      })
    || null
  );
}

function dataProtectionStylesheetUrl() {
  if (!useDataProtectionStylesheetRetryUrl) return DATA_PROTECTION_STYLESHEET_URL;
  const retryUrl = new URL(DATA_PROTECTION_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isDataProtectionStylesheetLoaded() {
  return dataProtectionStylesheetLoaded || !!existingDataProtectionStylesheet()?.sheet;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadDataProtectionStylesheet() {
  const existing = existingDataProtectionStylesheet();
  if (existing?.sheet) {
    dataProtectionStylesheetLoaded = true;
    return Promise.resolve(existing);
  }
  if (!dataProtectionStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Data protection stylesheet requires a document'));
    }
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = dataProtectionStylesheetUrl();
    link.dataset.dataProtectionStylesheet = '';
    dataProtectionStylesheetPromise = new Promise((resolve, reject) => {
      link.addEventListener('load', () => {
        dataProtectionStylesheetLoaded = true;
        resolve(link);
      }, { once: true });
      link.addEventListener('error', () => {
        reject(new Error('Data protection stylesheet could not be loaded'));
      }, { once: true });
      if (!link.isConnected) {
        const anchor = document.querySelector('[data-data-protection-stylesheet-anchor]');
        const parent = anchor?.parentNode || document.head;
        parent.insertBefore(link, anchor || null);
      }
    }).catch(err => {
      link.remove();
      dataProtectionStylesheetPromise = null;
      dataProtectionStylesheetLoaded = false;
      useDataProtectionStylesheetRetryUrl = true;
      throw err;
    });
  }
  return dataProtectionStylesheetPromise;
}

export async function loadDataProtectionStylesheetForAction() {
  try {
    await loadDataProtectionStylesheet();
    return true;
  } catch (err) {
    console.error('Failed to load data protection presentation', err);
    return false;
  }
}

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

/**
 * @param {Element} overlay
 * @param {Function} [closeFn]
 * @param {object} [options]
 */
export function openAppendedModalOverlay(overlay, closeFn, options = {}) {
  try { wireBackdropClose(overlay, closeFn); } catch (_) {}
  document.body.appendChild(overlay);
  openModalOverlay(overlay, options);
  try { trapModalFocus(overlay); } catch (_) {}
}

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

const _modalOverlayScrollLockTokens = (() => {
  if (typeof window === 'undefined') return new WeakMap();
  const appWindow = /** @type {any} */ (window);
  if (appWindow.__labModalOverlayScrollLockTokens instanceof WeakMap) {
    return appWindow.__labModalOverlayScrollLockTokens;
  }
  const tokens = new WeakMap();
  try {
    Object.defineProperty(appWindow, '__labModalOverlayScrollLockTokens', {
      value: tokens,
      configurable: true,
    });
  } catch (_) {
    appWindow.__labModalOverlayScrollLockTokens = tokens;
  }
  return tokens;
})();

const _overlayFocusTargets = (() => {
  if (typeof window === 'undefined') return new WeakMap();
  const appWindow = /** @type {any} */ (window);
  if (appWindow.__labModalOverlayFocusTargets instanceof WeakMap) {
    return appWindow.__labModalOverlayFocusTargets;
  }
  const focusTargets = new WeakMap();
  try {
    Object.defineProperty(appWindow, '__labModalOverlayFocusTargets', {
      value: focusTargets,
      configurable: true,
    });
  } catch (_) {
    appWindow.__labModalOverlayFocusTargets = focusTargets;
  }
  return focusTargets;
})();

function _resolveOverlay(overlayOrId) {
  if (!overlayOrId || typeof document === 'undefined') return null;
  if (typeof overlayOrId === 'string') return document.getElementById(overlayOrId);
  return overlayOrId;
}

function _isRestorableFocusTarget(target) {
  return typeof HTMLElement !== 'undefined'
    && target instanceof HTMLElement
    && target !== document.body
    && target !== document.documentElement
    && document.contains(target);
}

function _resolveFocusTarget(target, overlay) {
  if (!target) return null;
  if (typeof target === 'string') {
    return overlay.querySelector(target) || document.querySelector(target);
  }
  return target;
}

export function openModalOverlay(overlayOrId, options = {}) {
  const overlay = _resolveOverlay(overlayOrId);
  if (!overlay) return null;
  const showClass = options.showClass || 'show';
  const alreadyShown = overlay.classList.contains(showClass);
  const activeElement = document.activeElement;
  if (!alreadyShown && _isRestorableFocusTarget(activeElement)) {
    _overlayFocusTargets.set(overlay, activeElement);
  }
  overlay.classList.add(showClass);
  if (!alreadyShown) {
    const contextEditor = /** @type {HTMLElement | null} */ (overlay.querySelector('.ctx-editor-modal'));
    if (contextEditor) contextEditor.scrollTop = 0;
  }
  if (options.scrollLock === true) _acquireOverlayScrollLock(overlay);

  if (options.initialFocus) {
    const delay = Number.isFinite(options.focusDelay) ? Math.max(0, options.focusDelay) : 30;
    setTimeout(() => {
      const currentOverlay = _resolveOverlay(overlayOrId);
      if (!currentOverlay || !currentOverlay.classList.contains(showClass)) return;
      const target = _resolveFocusTarget(options.initialFocus, currentOverlay);
      if (target && typeof target.focus === 'function') {
        try { target.focus(); } catch (_) {}
      }
    }, delay);
  }

  return overlay;
}

export function closeModalOverlay(overlayOrId, options = {}) {
  const overlay = _resolveOverlay(overlayOrId);
  if (!overlay) return null;
  const showClass = options.showClass || 'show';
  overlay.classList.remove(showClass);
  _releaseOverlayScrollLock(overlay);

  if (options.restoreFocus !== false) {
    const focusTarget = _overlayFocusTargets.get(overlay);
    _overlayFocusTargets.delete(overlay);
    if (_isRestorableFocusTarget(focusTarget)) {
      try { focusTarget.focus(); } catch (_) {}
    }
  }

  return overlay;
}

/** @param {Element} overlay */
export function removeModalOverlay(overlay) {
  closeModalOverlay(overlay);
  overlay.remove();
}

function _modalScrollLockOverlay(lock) {
  if (typeof Element !== 'undefined' && lock instanceof Element) return lock;
  return lock?.overlay || null;
}

function _pruneDetachedModalScrollLocks() {
  for (const lock of Array.from(_modalScrollLocks)) {
    const overlay = _modalScrollLockOverlay(lock);
    if (overlay && !document.body.contains(overlay)) {
      _modalScrollLocks.delete(lock);
      if (lock?.overlay === overlay) _modalOverlayScrollLockTokens.delete(overlay);
    }
  }
}

function _restoreModalScrollLock() {
  _pruneDetachedModalScrollLocks();
  if (_modalScrollLocks.size === 0) {
    document.body.style.overflow = _modalScrollState.priorOverflow;
  } else {
    document.body.style.overflow = 'hidden';
  }
}

function _acquireModalScrollLock(lock) {
  _pruneDetachedModalScrollLocks();
  if (_modalScrollLocks.size === 0) {
    _modalScrollState.priorOverflow = document.body.style.overflow;
  }
  _modalScrollLocks.add(lock);
  document.body.style.overflow = 'hidden';
}

function _releaseModalScrollLock(lock) {
  _modalScrollLocks.delete(lock);
  _restoreModalScrollLock();
}

function _acquireOverlayScrollLock(overlay) {
  if (_modalOverlayScrollLockTokens.has(overlay)) return;
  const token = { overlay };
  _modalOverlayScrollLockTokens.set(overlay, token);
  _acquireModalScrollLock(token);
}

function _releaseOverlayScrollLock(overlay) {
  const token = _modalOverlayScrollLockTokens.get(overlay);
  if (!token) return;
  _modalOverlayScrollLockTokens.delete(overlay);
  _releaseModalScrollLock(token);
}

export function trapModalFocus(overlay, options = {}) {
  const previouslyFocused = document.activeElement;
  const closeOnEscape = options.closeOnEscape !== false;
  _acquireModalScrollLock(overlay);
  let teardown = false;
  setTimeout(() => {
    const focusables = overlay.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = /** @type {HTMLElement | undefined} */ (focusables[0]);
    if (firstFocusable) try { firstFocusable.focus(); } catch (e) {}
  }, 30);
  const onKeydown = (e) => {
    if (closeOnEscape && e.key === 'Escape' && document.body.contains(overlay)) {
      e.preventDefault();
      try { overlay.remove(); } catch (_) {}
    }
  };
  document.addEventListener('keydown', onKeydown);
  const restore = () => {
    if (teardown) return;
    teardown = true;
    document.removeEventListener('keydown', onKeydown);
    _releaseModalScrollLock(overlay);
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
