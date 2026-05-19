// views-router.js — route validation, route persistence, and scroll anchoring

import { state } from './state.js';
import { getActiveData } from './data.js';
import { profileStorageKey } from './profile.js';
import { safeMarkerId } from './utils.js';

export const CORE_ROUTES = new Set([
  'dashboard',
  'labs',
  'genome',
  'body',
  'insight',
  'recommendations',
  'correlations',
  'compare',
  'light',
]);

function _lastViewStorageKey() {
  return profileStorageKey(state.currentProfile || 'default', 'lastViewV1');
}

function _routeData(preData) {
  return preData && typeof preData === 'object' && preData.categories ? preData : getActiveData();
}

export function isKnownRoute(route, preData = null) {
  route = String(route || '');
  if (CORE_ROUTES.has(route)) return true;
  if (!safeMarkerId(route)) return false;
  const data = _routeData(preData);
  return !!data?.categories?.[route];
}

function _persistCurrentView(route) {
  if (!isKnownRoute(route)) return;
  try { localStorage.setItem(_lastViewStorageKey(), route); } catch (_) {}
}

export function getInitialView() {
  let saved = '';
  try { saved = localStorage.getItem(_lastViewStorageKey()) || ''; } catch (_) {}
  return isKnownRoute(saved) ? saved : 'dashboard';
}

export function createNavigate({ routeHandlers, syncMobileBottomNav, destroyAllCharts }) {
  // Monotonic counter for in-flight anchor-restore loops. Each navigate
  // captures a new token; older loops compare and bail when the user
  // has moved on.
  let _navAnchorToken = 0;
  // Currently-active anchor for this navigator — rapid same-selector
  // re-navigates reuse the original captured viewportTop instead of
  // re-capturing AFTER the jump that the original was trying to prevent.
  let _activeAnchor = null;

  return function navigate(category, data) {
    const requestedCategory = String(category || 'dashboard');
    const routeCategory = isKnownRoute(requestedCategory, data) ? requestedCategory : 'dashboard';
    const activeCategory = routeCategory;

    // Detect "re-render in place" (callsite is requesting a refresh of the
    // current view, not a real navigation). On in-place re-renders we use
    // ELEMENT-ANCHOR scroll preservation, not pixel-based: capture the
    // viewport-top of the clicked element (or the closest stable container
    // with a data-id), then after the rebuild scroll so that same element
    // lands at the same viewport position. Pixel-based preservation breaks
    // when the new layout has different content heights above the user's
    // viewport — they'd see a jump even though scrollY was technically
    // preserved.
    const sameView = routeCategory === state.currentView;
    let anchor = null;
    // Track whether the caller explicitly requested an anchor — even if
    // the element isn't found, an explicit request means "don't fall
    // back to auto-pick." This covers the cross-view race where an AI
    // verdict completes for a Light measurement after the user has
    // already navigated to Dashboard: the room's data-id no longer
    // exists, and we should leave the user's current scroll alone, not
    // grab some random Dashboard element via the proximity heuristic.
    const explicitAnchorRequested = !!(data && typeof data === 'object' && data.scrollAnchor);
    if (sameView && typeof document !== 'undefined') {
      if (explicitAnchorRequested) {
        // If a restore loop is ALREADY running for this same anchor (rapid
        // re-render burst — e.g. saveMeasurement → AI verdict engine's
        // _refresh → setTimeout-navigate all firing within ms), reuse the
        // original captured viewportTop. Without this, each successive
        // navigate captures AFTER the jump and pins to the wrong place.
        if (_activeAnchor && _activeAnchor.selector === data.scrollAnchor) {
          anchor = _activeAnchor;
        } else {
          const el = document.querySelector(data.scrollAnchor);
          if (el) {
            const rect = el.getBoundingClientRect();
            anchor = { selector: data.scrollAnchor, viewportTop: rect.top };
          }
          // Element not found AND explicit anchor was requested →
          // intentionally skip the auto-pick fallback below.
        }
      } else {
        anchor = _captureScrollAnchor();
      }
    }
    _syncSidebarActive(activeCategory);
    // Close mobile sidebar on navigation
    if (window.closeMobileSidebar) window.closeMobileSidebar();
    if (routeCategory !== "dashboard" && typeof document !== 'undefined') {
      document.body.classList.remove('mobile-dashboard-active', 'empty-dashboard-active');
    }
    if (window.syncImportStatusFab) window.syncImportStatusFab();
    destroyAllCharts?.();
    if (routeCategory === "dashboard") routeHandlers.dashboard?.(data);
    else if (routeCategory === "labs") routeHandlers.labs?.(data);
    else if (routeCategory === "genome") routeHandlers.genome?.(data);
    else if (routeCategory === "body") routeHandlers.body?.(data);
    else if (routeCategory === "insight") routeHandlers.insight?.(data);
    else if (routeCategory === "recommendations") routeHandlers.recommendations?.(data);
    else if (routeCategory === "correlations") routeHandlers.correlations?.(data);
    else if (routeCategory === "compare") routeHandlers.compare?.(data);
    else if (routeCategory === "light") routeHandlers.light?.(data);
    else routeHandlers.category?.(routeCategory, data);
    state.currentView = routeCategory;
    _persistCurrentView(routeCategory);
    syncMobileBottomNav?.(routeCategory);
    _syncSidebarActive(routeCategory);

    if (anchor) {
      // Force synchronous layout so getBoundingClientRect is accurate.
      void document.body.offsetHeight;
      _restoreScrollAnchor(anchor);
      // Re-apply over a 1.2s window so async layout (Chart.js paints,
      // image decodes, AI verdict chips rendering for OTHER rows above
      // ours) doesn't drift the anchor element away from its captured
      // viewport position. Earlier 3-RAF approach (~50ms total) caught
      // synchronous reflows but missed downstream async ones — the
      // measurement chip would land correctly, then a chart 200ms later
      // would shift content above the room by 1115 px and the user saw
      // the page "jump up" to the session list.
      //
      // Cancellation: (a) a NEW navigate to a DIFFERENT anchor increments
      // the token and the old loop bails. Same-anchor re-navigates reuse
      // _activeAnchor (captured above) so all back-to-back navigates pin
      // to the SAME original viewport position even if intermediate ones
      // captured after content shifted. (b) user-initiated scroll
      // (wheel/touch/keydown) also cancels so we never fight a manual
      // scroll. The 'scroll' event itself isn't a cancellation signal
      // because OUR scrollBy calls also fire it.
      _activeAnchor = anchor;
      const myToken = ++_navAnchorToken;
      const start = Date.now();
      let cancelled = false;
      const cancel = () => { cancelled = true; };
      const inputOpts = { passive: true, capture: true };
      window.addEventListener('wheel', cancel, inputOpts);
      window.addEventListener('touchstart', cancel, inputOpts);
      window.addEventListener('keydown', cancel, inputOpts);
      const cleanup = () => {
        window.removeEventListener('wheel', cancel, inputOpts);
        window.removeEventListener('touchstart', cancel, inputOpts);
        window.removeEventListener('keydown', cancel, inputOpts);
        if (myToken === _navAnchorToken) _activeAnchor = null;
      };
      const reapply = () => {
        if (cancelled || myToken !== _navAnchorToken) { cleanup(); return; }
        if (Date.now() - start > 1200) { cleanup(); return; }
        _restoreScrollAnchor(anchor);
        requestAnimationFrame(reapply);
      };
      requestAnimationFrame(reapply);
    }
  };
}

function _syncSidebarActive(routeCategory) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(".nav-item").forEach(el => {
    const isActive = el.dataset.category === routeCategory;
    el.classList.toggle("active", isActive);
    el.classList.toggle("is-active", isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

// Capture identity + viewport position of the most reasonable scroll
// anchor for the current interaction. Priority:
//   1. The currently focused element (usually the button the user just
//      clicked) — walks up to a parent with data-id or [data-screen-id]
//      so the marker survives an innerHTML wipe of #main-content.
//   2. Failing that, the first element with data-id that's visible in
//      the viewport — keeps the on-screen content stable even when the
//      navigation wasn't user-initiated (e.g. async refresh).
function _captureScrollAnchor() {
  let el = document.activeElement;
  // Walk up looking for a stable selector
  while (el && el !== document.body && el !== document.documentElement) {
    const sel = _stableSelectorFor(el);
    if (sel) {
      const rect = el.getBoundingClientRect();
      // Skip if the anchor is off-screen — would still work but
      // intent-wise we want a viewport-visible anchor.
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        return { selector: sel, viewportTop: rect.top };
      }
    }
    el = el.parentElement;
  }
  // Fallback heuristic: find the stably-identifiable element the user
  // is most plausibly looking at. Two-tier:
  //
  // 1. Elements that CONTAIN the viewport center — the user's focus is
  //    almost certainly inside one of these (a large expanded room
  //    card, an open audit, etc.). Pick the SMALLEST containing element
  //    (innermost = most specific anchor).
  // 2. Failing that, the element whose rect center is closest to
  //    viewport center.
  //
  // First-in-DOM-order was the previous heuristic and produced the
  // "screen jumps to the session list" bug — session cards sit above
  // rooms in the DOM, so the room couldn't win even when it dominated
  // the viewport. Closest-center alone had the inverse problem: a huge
  // room card has its rect-center off-screen, so smaller off-to-the-
  // side elements with centers inside the viewport beat it.
  const candidates = document.querySelectorAll('[data-id], [data-screen-id], [data-room-id]');
  const vh = window.innerHeight;
  const viewportCenter = vh / 2;
  let containingBest = null;
  let containingBestArea = Infinity;
  let centerBest = null;
  let centerBestDist = Infinity;
  for (const c of candidates) {
    const rect = c.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= vh) continue;
    const sel = _stableSelectorFor(c);
    if (!sel) continue;
    const containsCenter = rect.top <= viewportCenter && rect.bottom >= viewportCenter;
    if (containsCenter) {
      const area = rect.width * rect.height;
      if (area < containingBestArea) {
        containingBestArea = area;
        containingBest = { selector: sel, viewportTop: rect.top };
      }
    } else {
      const center = rect.top + rect.height / 2;
      const dist = Math.abs(center - viewportCenter);
      if (dist < centerBestDist) {
        centerBestDist = dist;
        centerBest = { selector: sel, viewportTop: rect.top };
      }
    }
  }
  return containingBest || centerBest;
}

function _stableSelectorFor(el) {
  if (!el || !el.dataset) return null;
  if (el.dataset.id) return `[data-id="${CSS.escape(el.dataset.id)}"]`;
  if (el.dataset.screenId) return `[data-screen-id="${CSS.escape(el.dataset.screenId)}"]`;
  if (el.dataset.roomId) return `[data-room-id="${CSS.escape(el.dataset.roomId)}"]`;
  return null;
}

function _restoreScrollAnchor(anchor) {
  if (!anchor) return;
  let el;
  try {
    el = document.querySelector(anchor.selector);
  } catch (_) {
    // Malformed selector (e.g., a roomId that slipped past CSS.escape
    // and contained unbalanced brackets). querySelector throws
    // SyntaxError on malformed CSS — caught here so the RAF re-anchor
    // loop's cleanup() still runs (listener leak prevention).
    return;
  }
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const delta = rect.top - anchor.viewportTop;
  if (Math.abs(delta) > 1) {
    try { window.scrollBy({ top: delta, behavior: 'instant' }); } catch (_) {
      try { window.scrollBy(0, delta); } catch (__) {}
    }
  }
}
