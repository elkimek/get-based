// touch-tooltip.js — Long-press → tooltip overlay for touch devices.
//
// HTML `title` attributes don't fire on touch (no hover event), so on
// phones / tablets every tooltip the app relies on for skim-without-
// clicking is invisible. This module captures touchstart on any
// [title]-bearing element, waits ~500ms, and renders the title text
// as a positioned popover. Released when the user lifts a finger,
// scrolls, or taps elsewhere. Desktop behaviour is unchanged.
//
// Discoverability is admittedly low (long-press isn't a learned
// pattern for tooltips); the value is "graceful enhancement" — second-
// time users who poke around on a control find their info instead of
// hitting a wall.

const HOLD_MS = 500;
const MAX_DRIFT_PX = 10;

let _holdTimer = null;
let _startX = 0, _startY = 0;
let _activeTooltip = null;

function _isTouchDevice() {
  return typeof window !== 'undefined'
    && (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches);
}

function _findTitleEl(el) {
  // Walk up to the first ancestor with a non-empty title attribute.
  // Stops at body — no title there means no tooltip.
  while (el && el !== document.body) {
    if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('title')) {
      const t = el.getAttribute('title');
      if (t && t.trim()) return el;
    }
    el = el.parentNode;
  }
  return null;
}

function _hideTooltip() {
  if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
  if (_activeTooltip) {
    _activeTooltip.remove();
    _activeTooltip = null;
  }
}

function _showTooltip(targetEl, anchorX, anchorY) {
  _hideTooltip();
  const text = targetEl.getAttribute('title');
  if (!text) return;
  const tip = document.createElement('div');
  tip.className = 'touch-tooltip';
  tip.setAttribute('role', 'tooltip');
  // Use textContent — `title` is always plain text, never HTML.
  tip.textContent = text;
  document.body.appendChild(tip);

  // Position above the touch point if there's room, otherwise below.
  // Clamp horizontally to viewport.
  const vw = window.innerWidth;
  const tipRect = tip.getBoundingClientRect();
  const margin = 12;
  let left = anchorX - tipRect.width / 2;
  if (left < margin) left = margin;
  if (left + tipRect.width > vw - margin) left = vw - margin - tipRect.width;
  let top = anchorY - tipRect.height - 12;
  if (top < margin) top = anchorY + 24;  // flip below the finger
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.classList.add('touch-tooltip-show');
  _activeTooltip = tip;
}

function _onTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return;
  const t = e.touches[0];
  _startX = t.clientX;
  _startY = t.clientY;
  const titleEl = _findTitleEl(e.target);
  if (!titleEl) return;
  _holdTimer = setTimeout(() => {
    _holdTimer = null;
    _showTooltip(titleEl, _startX, _startY);
  }, HOLD_MS);
}

function _onTouchMove(e) {
  if (!_holdTimer && !_activeTooltip) return;
  const t = e.touches?.[0];
  if (!t) return;
  if (Math.abs(t.clientX - _startX) > MAX_DRIFT_PX
      || Math.abs(t.clientY - _startY) > MAX_DRIFT_PX) {
    _hideTooltip();
  }
}

function _onTouchEnd() { _hideTooltip(); }

function _initTouchTooltip() {
  if (!_isTouchDevice()) return;
  // Use passive listeners — we don't preventDefault, just observe.
  document.addEventListener('touchstart', _onTouchStart, { passive: true });
  document.addEventListener('touchmove', _onTouchMove, { passive: true });
  document.addEventListener('touchend', _onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', _onTouchEnd, { passive: true });
  // Hide on scroll so a long-press tooltip doesn't drift with content.
  window.addEventListener('scroll', _hideTooltip, { passive: true });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initTouchTooltip);
  } else {
    _initTouchTooltip();
  }
}
