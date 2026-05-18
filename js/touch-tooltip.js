// touch-tooltip.js — app-wide tooltip overlay for title/data tooltip text.
//
// The app historically used native `title` attributes for hundreds of small
// affordances. Native browser tooltips are visually inconsistent, unavailable
// to keyboard focus in many browsers, and absent on touch. This module keeps
// the existing markup working while rendering one styled, viewport-clamped
// tooltip for hover, focus, and long-press.

const HOLD_MS = 500;
const MAX_DRIFT_PX = 10;
const TOOLTIP_ID = 'app-tooltip';
const TITLE_CACHE = new WeakMap();

let _holdTimer = null;
let _startX = 0, _startY = 0;
let _tooltip = null;
let _activeTarget = null;
let _touchAnchor = null;
let _lastTouchAt = 0;

function _isTouchDevice() {
  return typeof window !== 'undefined'
    && (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches);
}

function _tooltipText(el) {
  if (!el || el.nodeType !== 1) return '';
  return el.getAttribute('data-app-tooltip')
    || el.getAttribute('data-conditions-tooltip')
    || el.getAttribute('title')
    || TITLE_CACHE.get(el)
    || '';
}

function _findTooltipEl(el) {
  while (el && el !== document.body) {
    if (el.nodeType === 1 && _tooltipText(el).trim()) return el;
    el = el.parentNode;
  }
  return null;
}

function _suspendNativeTitle(el) {
  if (!el?.hasAttribute?.('title')) return;
  const title = el.getAttribute('title');
  if (!title) return;
  TITLE_CACHE.set(el, title);
  el.removeAttribute('title');
}

function _restoreNativeTitle(el) {
  if (!el || !TITLE_CACHE.has(el)) return;
  if (!el.hasAttribute('title')) el.setAttribute('title', TITLE_CACHE.get(el));
  TITLE_CACHE.delete(el);
}

function _ensureTooltip() {
  if (_tooltip) return _tooltip;
  _tooltip = document.createElement('div');
  _tooltip.id = TOOLTIP_ID;
  _tooltip.className = 'app-tooltip';
  _tooltip.setAttribute('role', 'tooltip');
  document.body.appendChild(_tooltip);
  return _tooltip;
}

function _clearHoldTimer() {
  if (_holdTimer) {
    clearTimeout(_holdTimer);
    _holdTimer = null;
  }
}

function _positionTooltip() {
  if (!_activeTarget || !_tooltip || !_activeTarget.isConnected) {
    _hideTooltip();
    return;
  }
  const margin = 10;
  const gap = 10;
  const anchor = _touchAnchor || (() => {
    const rect = _activeTarget.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      centerX: rect.left + rect.width / 2,
    };
  })();
  _tooltip.style.left = '0px';
  _tooltip.style.top = '0px';
  const tipRect = _tooltip.getBoundingClientRect();
  let top = anchor.top - tipRect.height - gap;
  let placement = 'top';
  if (top < margin) {
    top = anchor.bottom + gap;
    placement = 'bottom';
  }
  let left = anchor.centerX - (tipRect.width / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));
  _tooltip.style.left = `${Math.round(left)}px`;
  _tooltip.style.top = `${Math.round(top)}px`;
  _tooltip.dataset.placement = placement;
}

function _showTooltip(target, touchPoint = null) {
  const text = _tooltipText(target).trim();
  if (!text) return;
  if (_activeTarget && _activeTarget !== target) _restoreNativeTitle(_activeTarget);
  _activeTarget = target;
  _touchAnchor = touchPoint
    ? {
        left: touchPoint.clientX,
        right: touchPoint.clientX,
        top: touchPoint.clientY,
        bottom: touchPoint.clientY,
        centerX: touchPoint.clientX,
      }
    : null;
  _suspendNativeTitle(target);

  const tip = _ensureTooltip();
  target.setAttribute('aria-describedby', TOOLTIP_ID);
  tip.textContent = text;
  tip.classList.remove('is-visible');
  _positionTooltip();
  requestAnimationFrame(() => {
    if (_activeTarget === target) {
      _positionTooltip();
      tip.classList.add('is-visible');
    }
  });
}

function _hideTooltip() {
  _clearHoldTimer();
  if (_activeTarget) {
    _activeTarget.removeAttribute('aria-describedby');
    _restoreNativeTitle(_activeTarget);
  }
  _activeTarget = null;
  _touchAnchor = null;
  if (_tooltip) _tooltip.classList.remove('is-visible');
}

function _onHoverStart(e) {
  if (e.pointerType === 'touch') return;
  if (e.type?.startsWith('mouse') && _isTouchDevice()) return;
  const target = _findTooltipEl(e.target);
  if (target) _showTooltip(target);
}

function _onHoverEnd(e) {
  if (!_activeTarget || e.pointerType === 'touch') return;
  if (e.type?.startsWith('mouse') && _isTouchDevice()) return;
  const leaving = _findTooltipEl(e.target);
  if (leaving !== _activeTarget) return;
  if (e.relatedTarget && _activeTarget.contains(e.relatedTarget)) return;
  const targetToHide = _activeTarget;
  requestAnimationFrame(() => {
    if (_activeTarget !== targetToHide) return;
    if (targetToHide.matches(':hover') || targetToHide.contains(document.activeElement)) return;
    _hideTooltip();
  });
}

function _onFocusIn(e) {
  if (_isTouchDevice() && Date.now() - _lastTouchAt < 1000) return;
  const target = _findTooltipEl(e.target);
  if (target) _showTooltip(target);
}

function _onFocusOut(e) {
  if (!_activeTarget) return;
  if (e.relatedTarget && _activeTarget.contains(e.relatedTarget)) return;
  _hideTooltip();
}

function _onTouchStart(e) {
  _lastTouchAt = Date.now();
  _hideTooltip();
  if (!e.touches || e.touches.length !== 1) return;
  const target = _findTooltipEl(e.target);
  if (!target) return;
  const t = e.touches[0];
  _startX = t.clientX;
  _startY = t.clientY;
  _clearHoldTimer();
  _holdTimer = setTimeout(() => {
    _holdTimer = null;
    _showTooltip(target, { clientX: _startX, clientY: _startY });
  }, HOLD_MS);
}

function _onTouchMove(e) {
  if (!_holdTimer && !_activeTarget) return;
  const t = e.touches?.[0];
  if (!t) return;
  if (Math.abs(t.clientX - _startX) > MAX_DRIFT_PX
      || Math.abs(t.clientY - _startY) > MAX_DRIFT_PX) {
    _hideTooltip();
  }
}

function _initAppTooltip() {
  document.addEventListener('pointerover', _onHoverStart, true);
  document.addEventListener('pointerout', _onHoverEnd, true);
  document.addEventListener('mouseover', _onHoverStart, true);
  document.addEventListener('mouseout', _onHoverEnd, true);
  document.addEventListener('focusin', _onFocusIn, true);
  document.addEventListener('focusout', _onFocusOut, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideTooltip();
  });
  if (_isTouchDevice()) {
    document.addEventListener('touchstart', _onTouchStart, { passive: true });
    document.addEventListener('touchmove', _onTouchMove, { passive: true });
    document.addEventListener('touchend', () => {
      _lastTouchAt = Date.now();
      _hideTooltip();
    }, { passive: true });
    document.addEventListener('touchcancel', () => {
      _lastTouchAt = Date.now();
      _hideTooltip();
    }, { passive: true });
  }
  document.addEventListener('click', _hideTooltip, true);
  window.addEventListener('scroll', () => {
    if (_activeTarget && !_touchAnchor) _positionTooltip();
    else if (_activeTarget) _hideTooltip();
  }, true);
  window.addEventListener('resize', _hideTooltip);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initAppTooltip);
  } else {
    _initAppTooltip();
  }
}
