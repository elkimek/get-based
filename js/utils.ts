export interface DetachedModalSyncRefreshOptions {
  overlay?: HTMLElement; id?: string; opener?: (id?: string) => void; exists?: (id?: string) => boolean;
  bodySelector?: string; restoreSelector?: string;
}
export interface ModalSyncRefreshContext { overlay: HTMLElement | null; modal: HTMLElement | null; itemId?: string; scrollTop?: number; }
export interface ModalSyncRefreshOptions {
  overlay?: HTMLElement; overlayId?: string; overlaySelector?: string; modalId?: string; modalSelector?: string; kind?: string;
  refresh?: (context: ModalSyncRefreshContext) => void; getItemId?: (context: ModalSyncRefreshContext) => string;
  scrollSelector?: string; getScrollElement?: (context: ModalSyncRefreshContext) => HTMLElement | null | undefined; preserveScroll?: boolean;
}
export interface ConfirmDialogOptions { confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'primary'; ariaLabel?: string; }
export interface PromptDialogOptions { defaultValue?: string; okLabel?: string; cancelLabel?: string; placeholder?: string; inputType?: string; allowEmpty?: boolean; }
export type MarkerStatus = 'missing' | 'normal' | 'low' | 'high';
export interface MarkerTrend { arrow: string; cls: string; label: string; }

// utils.js — Pure utility functions, notifications, dialogs

import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  addUtilsRuntimeListener,
  getUtilsElementStyleRuntime,
  hasUtilsRuntime,
  removeUtilsRuntimeListener,
} from './utils-runtime.js';

/// Encode all five HTML-special characters — &, <, >, ", '. Safe to use
/// in both text content AND attribute contexts. The prior implementation
/// (textContent → innerHTML) only encoded & < >, which made every
/// `attr="${escapeHTML(userStr)}"` site in the codebase breakout-vulnerable
/// whenever the value contained a bare " character — user-authored
/// supplement notes, marker names, PDF-parsed labels, custom personality
/// fields, etc. The regex below handles all five in one pass so every
/// existing caller becomes safe without touching call sites.
const _ESCAPE_HTML_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => _ESCAPE_HTML_MAP[c]!);
}

export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

export function queryRequired<T extends Element = Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return (el as T);
}

// Marker keys are interpolated into inline-onclick JS string literals
// (for example, old inline click attribute strings), where escapeHTML is not
// enough — a key containing `'` or `\` would close the JS string and
// inject. Custom marker keys come from PDF AI extraction, so the only
// way to be sure is an allowlist + proto-pollution guard. Returns the
// input unchanged when safe, or null when not (callers should skip
// rendering that element rather than coerce to a wrong id).
const _PROTO_PARTS = new Set(['__proto__', 'constructor', 'prototype']);
export function safeMarkerId(id: unknown): string | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) return null;
  if (!/^[a-zA-Z0-9_.]+$/.test(id)) return null;
  // Reject the whole id matching a proto name (would pollute when used
  // as a property key) and each `.`-separated part (would pollute when
  // a downstream site splits and indexes per-part).
  if (_PROTO_PARTS.has(id)) return null;
  for (const part of id.split('.')) {
    if (_PROTO_PARTS.has(part)) return null;
  }
  return id;
}

// Sanitize a `category.markerKey` at write time so unsafe keys never
// enter `state.importedData`. Returns the cleaned key, or null when the
// shape is wrong (no dot, empty part) or either part collides with a
// prototype-pollution name. Keep in sync with safeMarkerId's allowlist.
export function sanitizeMarkerKey(fullKey: unknown): string | null {
  if (typeof fullKey !== 'string') return null;
  const dotIdx = fullKey.indexOf('.');
  if (dotIdx < 1 || dotIdx >= fullKey.length - 1) return null;
  const cat = fullKey.slice(0, dotIdx).replace(/[^a-zA-Z0-9_]/g, '');
  const mk  = fullKey.slice(dotIdx + 1).replace(/[^a-zA-Z0-9_]/g, '');
  if (!cat || !mk) return null;
  if (_PROTO_PARTS.has(cat) || _PROTO_PARTS.has(mk)) return null;
  return `${cat}.${mk}`;
}

export function hasDirtyFormFields(root: ParentNode | null | undefined): boolean {
  if (!root || !root.querySelectorAll) return false;
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
  for (const field of fields) {
    if (!field || field.disabled) continue;
    if (field.tagName === 'SELECT') {
      const options = Array.from((field as HTMLSelectElement).options || []);
      if (options.some(opt => opt.selected !== opt.defaultSelected)) return true;
      continue;
    }
    if (field.type === 'checkbox' || field.type === 'radio') {
      if ((field as HTMLInputElement).checked !== (field as HTMLInputElement).defaultChecked) return true;
      continue;
    }
    if (field.value !== (field as HTMLInputElement | HTMLTextAreaElement).defaultValue) return true;
  }
  return false;
}

export function bindSyncAppliedRefresh(refresh?: EventListener | null): () => void {
  if (!hasUtilsRuntime() || typeof refresh !== 'function') return () => {};
  addUtilsRuntimeListener('labcharts-sync-applied', refresh);
  return () => removeUtilsRuntimeListener('labcharts-sync-applied', refresh);
}

export function bindDetachedModalSyncRefresh({
  overlay,
  id,
  opener,
  exists,
  bodySelector = '.modal-body',
  restoreSelector = '.modal-overlay.show .sun-detail-modal .modal-body',
}: DetachedModalSyncRefreshOptions = {}) {
  if (!hasUtilsRuntime() || typeof document === 'undefined' || !overlay || typeof opener !== 'function') return;
  let detached = false;
  const nativeRemove = overlay.remove.bind(overlay);
  const detach = () => {
    if (detached) return;
    detached = true;
    removeUtilsRuntimeListener('labcharts-sync-applied', onSync);
  };
  const restoreScroll = (scrollTop: number) => {
    const nextBodies = document.querySelectorAll(restoreSelector);
    const nextBody = nextBodies[nextBodies.length - 1];
    if (nextBody) nextBody.scrollTop = scrollTop;
  };
  const onSync = () => {
    if (!document.body.contains(overlay)) { detach(); return; }
    if (hasDirtyFormFields(overlay)) return;
    const body = overlay.querySelector(bodySelector);
    const scrollTop = body ? body.scrollTop : 0;
    overlay.remove();
    if (typeof exists === 'function' && !exists(id)) return;
    opener(id);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => restoreScroll(scrollTop));
    } else {
      setTimeout(() => restoreScroll(scrollTop), 0);
    }
  };
  overlay.remove = () => {
    detach();
    nativeRemove();
  };
  addUtilsRuntimeListener('labcharts-sync-applied', onSync);
}

export function bindModalSyncRefresh({
  overlay: directOverlay,
  overlayId,
  overlaySelector,
  modalId,
  modalSelector,
  kind,
  refresh,
  getItemId,
  scrollSelector,
  getScrollElement,
  preserveScroll = true,
}: ModalSyncRefreshOptions = {}) {
  if (!hasUtilsRuntime() || typeof document === 'undefined' || typeof refresh !== 'function') {
    return () => {};
  }
    const findOverlay = () => {
    if (directOverlay) return directOverlay;
    if (overlayId) return document.getElementById(overlayId);
    if (overlaySelector && typeof document.querySelector === 'function') {
      return (document.querySelector(overlaySelector) as HTMLElement | null);
    }
    return null;
  };
    const findModal = (overlay: HTMLElement | null) => {
    if (modalId) return document.getElementById(modalId);
    if (modalSelector && overlay?.querySelector) return (overlay.querySelector(modalSelector) as HTMLElement | null);
    return overlay || null;
  };
    const resolveScrollElement = ({ overlay, modal }: ModalSyncRefreshContext) => {
    if (!preserveScroll) return null;
    if (typeof getScrollElement === 'function') return getScrollElement({ overlay, modal }) || null;
    if (scrollSelector) {
      return (overlay?.querySelector?.(scrollSelector) as HTMLElement | null)
        || (modal?.querySelector?.(scrollSelector) as HTMLElement | null)
        || null;
    }
    return modal || overlay || null;
  };
  const isDetachedDirectOverlay = (overlay: HTMLElement | null) => {
    if (!directOverlay || !overlay || typeof document.body?.contains !== 'function') return false;
    try {
      return !document.body.contains(overlay);
    } catch (_) {
      return false;
    }
  };
  const restoreScroll = (scrollTop: number) => {
    if (!Number.isFinite(scrollTop)) return;
    const overlay = findOverlay();
    const modal = findModal(overlay);
    const el = resolveScrollElement({ overlay, modal });
    if (!el || typeof el.scrollTop !== 'number') return;
    el.scrollTop = Math.max(0, scrollTop);
  };
  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    removeUtilsRuntimeListener('labcharts-sync-applied', onSync);
  };
  const onSync = () => {
    const overlay = findOverlay();
    if (isDetachedDirectOverlay(overlay)) { detach(); return; }
    const modal = findModal(overlay);
    if (!overlay?.classList?.contains('show') || !modal) return;
    if (kind && overlay?.dataset?.syncRefreshKind !== kind && modal?.dataset?.syncRefreshKind !== kind) return;
    if (hasDirtyFormFields(modal)) return;
    const scrollEl = resolveScrollElement({ overlay, modal });
    const scrollTop = scrollEl && typeof scrollEl.scrollTop === 'number' ? scrollEl.scrollTop : NaN;
    const itemId = typeof getItemId === 'function'
      ? getItemId({ overlay, modal })
      : (modal?.dataset?.syncRefreshItemId || overlay?.dataset?.syncRefreshItemId || '');
    refresh({ overlay, modal, itemId, scrollTop });
    if (Number.isFinite(scrollTop)) {
      restoreScroll(scrollTop);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => restoreScroll(scrollTop));
      } else {
        setTimeout(() => restoreScroll(scrollTop), 0);
      }
    }
  };
  addUtilsRuntimeListener('labcharts-sync-applied', onSync);
  return detach;
}

export function bindDetailModalSyncRefresh(kind: string, refresh: (context: ModalSyncRefreshContext) => void): () => void {
  return bindModalSyncRefresh({
    overlayId: 'modal-overlay',
    modalId: 'detail-modal',
    kind,
    refresh,
  });
}

export function getStatus(value: number | null | undefined, refMin?: number | null, refMax?: number | null): MarkerStatus {
  if (value === null || value === undefined) return "missing";
  if (refMin == null && refMax == null) return "normal";
  if (refMin != null && value < refMin) return "low";
  if (refMax != null && value > refMax) return "high";
  return "normal";
}

export function getRangePosition(value: number | null | undefined, refMin?: number | null, refMax?: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (refMin == null || refMax == null || refMax === refMin) return 50;
  return ((value - refMin) / (refMax - refMin)) * 100;
}

// Trend arrow: a single percent threshold separates "stable" from a real
// rise / fall. Tight enough that natural lab variability still trips the
// arrow; loose enough that a single decimal-place rounding doesn't.
const STABLE_TREND_PCT = 2;
export function getTrend(values: readonly (number | null | undefined)[], refMin?: number | null, refMax?: number | null): MarkerTrend {
  const nn = values.filter(v=>v!==null && v!==undefined);
  if (nn.length<2) return {arrow:"\u2014",cls:"trend-stable",label:"No previous result"};
  const prev = nn[nn.length-2]!;
  const curr = nn[nn.length-1]!;
  if (prev === 0) {
    if (curr === 0) return {arrow:"Stable",cls:"trend-stable",label:"Stable versus previous result"};
    return {arrow:"Changed",cls:"trend-stable",label:"Changed versus previous result; percentage unavailable because the previous value was zero"};
  }
  const pct = ((curr-prev)/prev)*100;
  if (Math.abs(pct)<STABLE_TREND_PCT) {
    return {arrow:"Stable",cls:"trend-stable",label:`Stable versus previous result (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`};
  }
  const dir = pct > 0 ? 'up' : 'down';
  const arrow = pct > 0 ? `\u2191 +${pct.toFixed(1)}%` : `\u2193 ${pct.toFixed(1)}%`;
  // Color based on whether change is good or bad relative to ref range
  const status = getStatus(curr, refMin, refMax);
  let quality;
  if (status === 'high') quality = dir === 'down' ? 'good' : 'bad';
  else if (status === 'low') quality = dir === 'up' ? 'good' : 'bad';
  else quality = 'neutral';
  const label = `${pct > 0 ? 'Increased' : 'Decreased'} ${Math.abs(pct).toFixed(1)}% versus previous result`;
  return {arrow, cls:`trend-${dir} trend-${quality}`, label};
}

export function formatValue(v: number | null | undefined): string {
  if (v===null||v===undefined) return "\u2014";
  if (Number.isInteger(v)) return v.toString();
  if (Math.abs(v)>=100) return v.toFixed(0);
  if (Math.abs(v)>=10) return v.toFixed(1);
  if (Math.abs(v)>=1) return v.toFixed(2);
  return v.toFixed(3);
}

// Canonical date formatter \u2014 replaces a half-dozen scattered helpers and
// inline `toLocaleDateString` calls. Style choices map to the three
// formats actually used in the UI.
//   short    \u2014 "Apr 29" (default for chart axis labels, supplement bars)
//   long     \u2014 "April 29, 2026" (modal headers, change history)
//   monthYear \u2014 "Apr 2026" (focus card, group separators)
//   spoken   \u2014 "April 29" (wearables strip, accessibility-first)
// Accepts ISO 'YYYY-MM-DD' or any Date-parseable string.
export function formatDate(iso: string | null | undefined, style = 'short'): string {
  if (!iso) return '';
  // Append time so the date doesn't shift to the prior day in negative-UTC
  // timezones \u2014 the bug all the inline call sites were quietly working
  // around individually.
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = style === 'long'      ? { month: 'long',  day: 'numeric', year: 'numeric' }
             : style === 'monthYear' ? { month: 'short', year: 'numeric' }
             : style === 'spoken'    ? { month: 'long',  day: 'numeric' }
             : /* short */             { month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

export function linearRegression(points: readonly number[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += points[i]!;
    sumXY += i * points[i]!; sumX2 += i * i; sumY2 += points[i]! * points[i]!;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: points[0] || 0, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const ssTot = sumY2 - (sumY * sumY) / n;
  const ssRes = points.reduce((s, y, i) => { const e = y - (intercept + slope * i); return s + e * e; }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

export function isDebugMode() { return localStorage.getItem('labcharts-debug') === 'true'; }
export function setDebugMode(on: boolean): void { localStorage.setItem('labcharts-debug', on ? 'true' : 'false'); }
export function isPIIReviewEnabled() { return localStorage.getItem('labcharts-pii-review') !== 'false'; }
export function setPIIReviewEnabled(on: boolean): void { localStorage.setItem('labcharts-pii-review', on ? 'true' : 'false'); }
// Analytics is cookieless and enabled by default. The historical storage key
// remains an explicit opt-out: `analytics-disabled=true` suppresses Umami on
// the next page load.
const ANALYTICS_CONSENT_ACTION_ATTR = 'data-analytics-consent-action';
let analyticsConsentRetryTimer: ReturnType<typeof setTimeout> | null = null;

export function isAnalyticsEnabled() { return localStorage.getItem('labcharts-analytics-disabled') !== 'true'; }
export function setAnalyticsEnabled(on: boolean): void { localStorage.setItem('labcharts-analytics-disabled', on ? 'false' : 'true'); }
function hasSeenAnalyticsConsent() { return localStorage.getItem('labcharts-analytics-consent-seen') === '1'; }
function markAnalyticsConsentSeen() { localStorage.setItem('labcharts-analytics-consent-seen', '1'); }

function isVisibleBlockingElement(el: Element): boolean {
  const style = getUtilsElementStyleRuntime(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
  const rect = el.getBoundingClientRect?.();
  return !rect || rect.width > 0 || rect.height > 0 || style?.position === 'fixed';
}

export function isStartupNudgeBlocked() {
  const selectors = [
    '#legal-consent-overlay',
    '.modal-overlay.show',
    '.confirm-overlay.show',
    '.chat-backdrop.open',
    '#tour-overlay',
  ];
  return selectors.some(selector => Array.from(document.querySelectorAll(selector)).some(el => isVisibleBlockingElement(el)));
}

function clearAnalyticsConsentRetry() {
  if (analyticsConsentRetryTimer === null) return;
  clearTimeout(analyticsConsentRetryTimer);
  analyticsConsentRetryTimer = null;
}

function scheduleAnalyticsConsentRetry() {
  if (analyticsConsentRetryTimer !== null) return;
  analyticsConsentRetryTimer = setTimeout(() => {
    analyticsConsentRetryTimer = null;
    maybeShowAnalyticsConsent();
  }, 1200);
}

function handleAnalyticsConsentActionClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest(`[${ANALYTICS_CONSENT_ACTION_ATTR}]`);
  if (!actionEl || !(event.currentTarget as Element | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(ANALYTICS_CONSENT_ACTION_ATTR);
  if (action === 'dismiss') {
    event.preventDefault();
    event.stopPropagation();
    dismissAnalyticsConsent();
    return;
  }
  if (action === 'disable') {
    event.preventDefault();
    event.stopPropagation();
    dismissAnalyticsConsentAndDisable();
  }
}

// One-time transparency banner shown to first-time users. Analytics starts on,
// while the banner provides an immediate opt-out and points to the persistent
// Settings control.
export function maybeShowAnalyticsConsent() {
  if (hasSeenAnalyticsConsent()) return;
  // Skip on offline/Tor where Umami doesn't load anyway
  if (location.protocol === 'file:' || location.hostname.endsWith('.onion')) {
    markAnalyticsConsentSeen();
    return;
  }
  if (isStartupNudgeBlocked()) {
    scheduleAnalyticsConsentRetry();
    return;
  }
  // Don't double-render if already in the DOM
  if (document.getElementById('analytics-consent-banner')) return;
  clearAnalyticsConsentRetry();
  const banner = document.createElement('div');
  banner.id = 'analytics-consent-banner';
  banner.className = 'analytics-consent-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Analytics consent');
  banner.innerHTML = `
    <div class="analytics-consent-body">
      <span aria-hidden="true">📊</span>
      <span class="analytics-consent-copy analytics-consent-copy-long">Cookieless usage stats are <strong>on</strong> to help improve getbased. Health records, chat content, uploaded files, and provider credentials are not included.</span>
      <span class="analytics-consent-copy analytics-consent-copy-short">Cookieless usage stats are <strong>on</strong>. No health data.</span>
    </div>
    <div class="analytics-consent-actions">
      <button type="button" class="analytics-consent-btn analytics-consent-btn-primary" ${ANALYTICS_CONSENT_ACTION_ATTR}="dismiss">Got it</button>
      <button type="button" class="analytics-consent-btn" ${ANALYTICS_CONSENT_ACTION_ATTR}="disable">Turn off</button>
    </div>`;
  banner.addEventListener('click', handleAnalyticsConsentActionClick);
  document.body.appendChild(banner);
  document.body.classList.add('analytics-consent-visible');
}

export function dismissAnalyticsConsent() {
  clearAnalyticsConsentRetry();
  markAnalyticsConsentSeen();
  document.getElementById('analytics-consent-banner')?.remove();
  document.body.classList.remove('analytics-consent-visible');
}

export function dismissAnalyticsConsentAndDisable() {
  clearAnalyticsConsentRetry();
  setAnalyticsEnabled(false);
  markAnalyticsConsentSeen();
  document.getElementById('analytics-consent-banner')?.remove();
  document.body.classList.remove('analytics-consent-visible');
  showNotification('Cookieless usage stats turned off. You can change this anytime in Settings → Privacy.', 'info', 4000);
}

export function showNotification(message: unknown, type?: string, duration?: number): void {
  type = type || "info";
  const container = document.getElementById("notification-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `notification-toast ${type}`;
  if (type === 'error') toast.setAttribute('role', 'alert');
  const icons: Record<string, string> = { success: "\u2713", error: "\u2717", info: "\u2139" };
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icons[type] || "\u2139";
  toast.appendChild(iconSpan);
  toast.appendChild(document.createTextNode(' ' + message));
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0"; toast.style.transform = "translateX(100%)"; toast.style.transition = "all 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration || 3000);
}

export function showConfirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const confirmLabel = options.confirmLabel || 'Confirm';
    const cancelLabel = options.cancelLabel || 'Cancel';
    const confirmTone = options.tone === 'primary' ? 'primary' : 'danger';
    const ariaLabel = options.ariaLabel || 'Confirmation';
    let overlay = document.getElementById("confirm-dialog-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "confirm-dialog-overlay";
      overlay.className = "confirm-overlay";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-label="${escapeHTML(ariaLabel)}">
    <p class="confirm-message">${escapeHTML(message)}</p>
    <div class="confirm-actions">
      <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">${escapeHTML(cancelLabel)}</button>
      <button class="confirm-btn confirm-btn-${confirmTone}" id="confirm-ok">${escapeHTML(confirmLabel)}</button>
    </div></div>`;
    const ok = (overlay.querySelector('#confirm-ok') as HTMLButtonElement | null);
    const cancel = (overlay.querySelector('#confirm-cancel') as HTMLButtonElement | null);
    if (!ok || !cancel) {
      resolve(false);
      return;
    }
    let settled = false;
    const previousOnclick = overlay.onclick;
    overlay.dataset.escapeOwner = 'utils-confirm';
    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      overlay.onclick = previousOnclick;
      delete overlay.dataset.escapeOwner;
    };
    const close = (result: boolean) => {
      if (settled) return;
      settled = true;
      closeModalOverlay(overlay);
      cleanup();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    document.addEventListener('keydown', onKey);
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        const d = overlay.querySelector('.confirm-dialog');
        if (d) {
          d.classList.add('modal-nudge');
          d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true });
        }
      }
    };
    openModalOverlay(overlay, { initialFocus: '#confirm-cancel', focusDelay: 0 });
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
  });
}

/// Promise-based replacement for the native prompt dialog. Browsers block the
/// native prompt in many common contexts (file://, sandboxed iframes,
/// cross-origin workers, some PWA configurations) and its synchronous
/// nature makes it awkward inside async flows. This helper reuses the
/// confirm-dialog CSS so both dialogs look consistent; resolves to the
/// trimmed string on OK, or null on Cancel / Esc / backdrop-click. Callers
/// that need to distinguish empty OK from cancel can pass allowEmpty.
export function showPromptDialog(message: string, { defaultValue = '', okLabel = 'OK', cancelLabel = 'Cancel', placeholder = '', inputType = 'text', allowEmpty = false }: PromptDialogOptions = {}): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let overlay = document.getElementById('prompt-dialog-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'prompt-dialog-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Prompt">
      <p class="confirm-message">${escapeHTML(message)}</p>
      <input type="${escapeAttr(inputType)}" id="prompt-dialog-input" class="confirm-input"
             value="${escapeAttr(defaultValue)}"
             placeholder="${escapeAttr(placeholder)}"
             aria-label="${escapeAttr(message)}">
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="prompt-cancel">${escapeHTML(cancelLabel)}</button>
        <button class="confirm-btn confirm-btn-primary" id="prompt-ok">${escapeHTML(okLabel)}</button>
      </div></div>`;

    const input = (overlay.querySelector('#prompt-dialog-input') as HTMLInputElement | null);
    const ok = (overlay.querySelector('#prompt-ok') as HTMLButtonElement | null);
    const cancel = (overlay.querySelector('#prompt-cancel') as HTMLButtonElement | null);
    if (!input || !ok || !cancel) {
      resolve(null);
      return;
    }
    let settled = false;
    const previousOnclick = overlay.onclick;

    const close = (value: string | null) => {
      if (settled) return;
      settled = true;
      closeModalOverlay(overlay);
      document.removeEventListener('keydown', onKey);
      overlay.onclick = previousOnclick;
      resolve(value);
    };
    const readValue = () => {
      const trimmed = input.value.trim();
      return allowEmpty ? trimmed : (trimmed || null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); close(readValue()); }
    };

    ok.onclick = () => close(readValue());
    cancel.onclick = () => close(null);
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    document.addEventListener('keydown', onKey);
    openModalOverlay(overlay, { initialFocus: input, focusDelay: 0 });
    // Select default text so the user can just type.
    setTimeout(() => { if (overlay.classList.contains('show')) input.select(); }, 0);
  });
}

export function hasCardContent<T>(obj: T): obj is NonNullable<T> {
  if (!obj) return false;
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'note') { if ((val as { trim(): unknown } | null | undefined)?.trim()) return true; }
    else if (Array.isArray(val)) { if (val.length > 0) return true; }
    else if (val != null && val !== '') return true;
  }
  return false;
}

/// Historical alias: escapeAttr used to add an extra `'` encoding on top
/// of an escapeHTML that missed quote chars. Now that escapeHTML encodes
/// all five HTML-special chars including both quote styles, escapeAttr is
/// redundant but kept as an alias so existing call sites that chose
/// escapeAttr for attribute contexts continue to work and read clearly.
export const escapeAttr = escapeHTML;

const _scriptLoadPromises = new Map<string, Promise<HTMLScriptElement>>();

export function loadScriptOnce(src?: string | null): Promise<HTMLScriptElement> {
  if (!src) return Promise.reject(new Error('Missing script src'));
  const existing = Array.from(document.scripts || []).find(s => s.getAttribute('src') === src);
  if (existing?.dataset.loaded === 'true') return Promise.resolve(existing);
  if (_scriptLoadPromises.has(src)) return _scriptLoadPromises.get(src)!;
  const p = new Promise<HTMLScriptElement>((resolve, reject) => {
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve(script);
    };
    script.onerror = () => {
      _scriptLoadPromises.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    if (!existing) document.head.appendChild(script);
  });
  _scriptLoadPromises.set(src, p);
  return p;
}
