export interface ModalFocusTrapOptions { autoFocus?: boolean | undefined; closeOnEscape?: boolean; onEscape?: () => void; }
export interface ModalOverlayOptions {
  initialFocus?: string | HTMLElement; focusDelay?: number; showClass?: string;
  scrollLock?: boolean; autoFocus?: boolean; restoreFocus?: boolean;
  focusTrapOptions?: ModalFocusTrapOptions;
}
type OverlayReference = string | Element | null | undefined;
type ScrollLock = Element | { overlay: Element };
interface ModalScrollState { locks: Set<ScrollLock>; priorOverflow: string; }
type ModalWindow = Window & {
  __labModalScrollState?: ModalScrollState;
  __labModalOverlayScrollLockTokens?: WeakMap<Element, { overlay: Element }>;
  __labModalOverlayFocusTargets?: WeakMap<Element, HTMLElement>;
};

// modal-lifecycle.js — shared modal backdrop, focus trap, and scroll lock.

const DATA_PROTECTION_STYLESHEET_URL = new URL('../css/data-protection.css', import.meta.url).href;
const FOCUSABLE_SELECTOR = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
const VISIBLE_MODAL_SELECTOR = '.modal-overlay.show,.confirm-overlay.show,[data-modal-focus-trap]';

let dataProtectionStylesheetPromise: Promise<HTMLLinkElement> | null = null;
let dataProtectionStylesheetLoaded = false;
let useDataProtectionStylesheetRetryUrl = false;

function existingDataProtectionStylesheet(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector<HTMLLinkElement>('link[data-data-protection-stylesheet]')
    || Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL((link as HTMLLinkElement).href).pathname === '/css/data-protection.css';
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

export function loadDataProtectionStylesheet(): Promise<HTMLLinkElement> {
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
    dataProtectionStylesheetPromise = new Promise<HTMLLinkElement>((resolve, reject) => {
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

export function wireBackdropClose(overlay: Element, closeFn?: (() => void) | null): void {
  const close = typeof closeFn === 'function' ? closeFn : () => overlay.remove();
  let mouseDownInside = false;
  overlay.addEventListener('mousedown', (e) => {
    mouseDownInside = !!(e.target as Element).closest('.modal');
  });
  overlay.addEventListener('click', (e) => {
    if (mouseDownInside) { mouseDownInside = false; return; }
    if (e.target === overlay) close();
  });
}

export const _wireBackdropClose = wireBackdropClose;

export function openAppendedModalOverlay(overlay: Element, closeFn?: (() => void) | null, options: ModalOverlayOptions = {}): void {
  try { wireBackdropClose(overlay, closeFn); } catch (_) {}
  // Appended overlays own resources and/or local workflow state often enough
  // that removing their DOM node is not a safe substitute for their close
  // callback. Mark them so the app-wide Escape handler leaves dismissal to
  // this lifecycle owner.
  overlay.setAttribute('data-modal-lifecycle-managed', '');
  document.body.appendChild(overlay);
  openModalOverlay(overlay, options);
  try {
    trapModalFocus(overlay, {
      ...(options.focusTrapOptions || {}),
      autoFocus: options.initialFocus ? false : options.focusTrapOptions?.autoFocus,
      onEscape: typeof closeFn === 'function' ? closeFn : () => removeModalOverlay(overlay),
    });
  } catch (_) {}
}

const _modalScrollState = (() => {
  const fallback = { locks: new Set<ScrollLock>(), priorOverflow: '' };
  if (typeof window === 'undefined') return fallback;
  const appWindow = (window as ModalWindow);
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
  if (typeof window === 'undefined') return new WeakMap<Element, { overlay: Element }>();
  const appWindow = (window as ModalWindow);
  if (appWindow.__labModalOverlayScrollLockTokens instanceof WeakMap) {
    return appWindow.__labModalOverlayScrollLockTokens;
  }
  const tokens = new WeakMap<Element, { overlay: Element }>();
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
  if (typeof window === 'undefined') return new WeakMap<Element, HTMLElement>();
  const appWindow = (window as ModalWindow);
  if (appWindow.__labModalOverlayFocusTargets instanceof WeakMap) {
    return appWindow.__labModalOverlayFocusTargets;
  }
  const focusTargets = new WeakMap<Element, HTMLElement>();
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

function _resolveOverlay(overlayOrId: OverlayReference): Element | null {
  if (!overlayOrId || typeof document === 'undefined') return null;
  if (typeof overlayOrId === 'string') return document.getElementById(overlayOrId);
  return overlayOrId;
}

function _isNodeConnected(node: Node | null | undefined): boolean {
  if (!node || typeof document === 'undefined') return false;
  if (typeof document.body?.contains === 'function') return document.body.contains(node);
  if (typeof document.contains === 'function') return document.contains(node);
  return node.isConnected !== false;
}

function _isRestorableFocusTarget(target: unknown): target is HTMLElement {
  return typeof HTMLElement !== 'undefined'
    && target instanceof HTMLElement
    && target !== document.body
    && target !== document.documentElement
    && document.contains(target);
}

function _resolveFocusTarget(target: string | HTMLElement | undefined, overlay: Element): (Element & { focus?: () => void }) | null {
  if (!target) return null;
  if (typeof target === 'string') {
    return overlay.querySelector(target) || document.querySelector(target);
  }
  return target;
}

export function openModalOverlay(overlayOrId: OverlayReference, options: ModalOverlayOptions = {}): Element | null {
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
    const contextEditor = (overlay.querySelector('.ctx-editor-modal') as HTMLElement | null);
    if (contextEditor) contextEditor.scrollTop = 0;
  }
  if (options.scrollLock === true) _acquireOverlayScrollLock(overlay);

  if (options.initialFocus) {
    const delay = Number.isFinite(options.focusDelay) ? Math.max(0, options.focusDelay!) : 30;
    setTimeout(() => {
      const currentOverlay = _resolveOverlay(overlayOrId);
      if (!currentOverlay || !currentOverlay.classList.contains(showClass)) return;
      const target = _resolveFocusTarget(options.initialFocus, currentOverlay);
      const activeElement = document.activeElement;
      if (!alreadyShown
        && activeElement
        && activeElement !== document.body
        && currentOverlay.contains(activeElement)) return;
      if (target && typeof target.focus === 'function') {
        try { target.focus(); } catch (_) {}
      }
    }, delay);
  } else if (options.autoFocus !== false) {
    // Static feature dialogs also need a predictable keyboard entry point.
    // Defer so feature-specific synchronous focus wins when a workflow has a
    // more meaningful target than its first control.
    const delay = Number.isFinite(options.focusDelay) ? Math.max(0, options.focusDelay!) : 30;
    setTimeout(() => {
      const currentOverlay = _resolveOverlay(overlayOrId);
      if (!currentOverlay || !currentOverlay.classList.contains(showClass)) return;
      if (currentOverlay.contains(document.activeElement)) return;
      const target = (currentOverlay.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null);
      if (target) {
        try { target.focus(); } catch (_) {}
      }
    }, delay);
  }

  return overlay;
}

export function closeModalOverlay(overlayOrId: OverlayReference, options: ModalOverlayOptions = {}): Element | null {
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

export function removeModalOverlay(overlay: Element): void {
  closeModalOverlay(overlay);
  overlay.remove();
}

function _modalScrollLockOverlay(lock: ScrollLock): Element | null {
  if (typeof Element !== 'undefined' && lock instanceof Element) return lock;
  return (lock as { overlay?: Element })?.overlay || null;
}

function _pruneDetachedModalScrollLocks() {
  for (const lock of Array.from(_modalScrollLocks)) {
    const overlay = _modalScrollLockOverlay(lock);
    if (overlay && !_isNodeConnected(overlay)) {
      _modalScrollLocks.delete(lock);
      if ((lock as { overlay?: Element })?.overlay === overlay) _modalOverlayScrollLockTokens.delete(overlay);
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

function _acquireModalScrollLock(lock: ScrollLock): void {
  _pruneDetachedModalScrollLocks();
  if (_modalScrollLocks.size === 0) {
    _modalScrollState.priorOverflow = document.body.style.overflow;
  }
  _modalScrollLocks.add(lock);
  document.body.style.overflow = 'hidden';
}

function _releaseModalScrollLock(lock: ScrollLock): void {
  _modalScrollLocks.delete(lock);
  _restoreModalScrollLock();
}

function _acquireOverlayScrollLock(overlay: Element): void {
  if (_modalOverlayScrollLockTokens.has(overlay)) return;
  const token = { overlay };
  _modalOverlayScrollLockTokens.set(overlay, token);
  _acquireModalScrollLock(token);
}

function _releaseOverlayScrollLock(overlay: Element): void {
  const token = _modalOverlayScrollLockTokens.get(overlay);
  if (!token) return;
  _modalOverlayScrollLockTokens.delete(overlay);
  _releaseModalScrollLock(token);
}

export function trapModalFocus(overlay: Element, options: ModalFocusTrapOptions = {}): void {
  const previouslyFocused = document.activeElement;
  const closeOnEscape = options.closeOnEscape !== false;
  const onEscape = typeof options.onEscape === 'function'
    ? options.onEscape
    : () => removeModalOverlay(overlay);
  _acquireModalScrollLock(overlay);
  overlay.setAttribute?.('data-modal-focus-trap', '');
  let teardown = false;
  if (options.autoFocus !== false) {
    setTimeout(() => {
      if (!_isNodeConnected(overlay)
        || (typeof overlay.contains === 'function' && overlay.contains(document.activeElement))
        || typeof overlay.querySelectorAll !== 'function') return;
      const focusables = overlay.querySelectorAll(FOCUSABLE_SELECTOR);
      const firstFocusable = (focusables[0] as HTMLElement | undefined);
      if (firstFocusable) try { firstFocusable.focus(); } catch (e) {}
    }, 30);
  }
  const onKeydown = (e: KeyboardEvent) => {
    if (!_isNodeConnected(overlay) || !_isTopmostFocusTrapOverlay(overlay)) return;
    if (e.key === 'Tab') {
      const modal = overlay.querySelector?.('[role="dialog"]')
        || overlay.querySelector?.('.modal')
        || overlay.querySelector?.('.confirm-dialog')
        || overlay;
      const focusables = modal.querySelectorAll?.(FOCUSABLE_SELECTOR) || [];
      if (focusables.length === 0) return;
      const first = (focusables[0] as HTMLElement);
      const last = (focusables[focusables.length - 1] as HTMLElement);
      if (!modal.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (closeOnEscape && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      try { onEscape(); } catch (err) { console.error('Modal close callback failed', err); }
    }
  };
  document.addEventListener('keydown', onKeydown);
  const restore = () => {
    if (teardown) return;
    teardown = true;
    document.removeEventListener('keydown', onKeydown);
    overlay.removeAttribute?.('data-modal-focus-trap');
    _releaseModalScrollLock(overlay);
    const previousFocusTarget = (previouslyFocused instanceof HTMLElement ? previouslyFocused : null as HTMLElement | null);
    if (previousFocusTarget && _isNodeConnected(previousFocusTarget)) {
      try { previousFocusTarget.focus(); } catch (e) {}
    }
  };
  const obs = new MutationObserver(() => {
    if (!_isNodeConnected(overlay)) {
      obs.disconnect();
      restore();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function _isTopmostFocusTrapOverlay(overlay: Element): boolean {
  if (typeof document === 'undefined') return true;
  const overlays = Array.from(document.querySelectorAll(VISIBLE_MODAL_SELECTOR)).filter(candidate => _isNodeConnected(candidate));
  return overlays.length === 0 || overlays[overlays.length - 1] === overlay;
}
