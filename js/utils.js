// utils.js — Pure utility functions, notifications, dialogs

/// Encode all five HTML-special characters — &, <, >, ", '. Safe to use
/// in both text content AND attribute contexts. The prior implementation
/// (textContent → innerHTML) only encoded & < >, which made every
/// `attr="${escapeHTML(userStr)}"` site in the codebase breakout-vulnerable
/// whenever the value contained a bare " character — user-authored
/// supplement notes, marker names, PDF-parsed labels, custom personality
/// fields, etc. The regex below handles all five in one pass so every
/// existing caller becomes safe without touching call sites.
const _ESCAPE_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => _ESCAPE_HTML_MAP[c]);
}

export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

export function getStatus(value, refMin, refMax) {
  if (value === null || value === undefined) return "missing";
  if (refMin == null && refMax == null) return "normal";
  if (refMin != null && value < refMin) return "low";
  if (refMax != null && value > refMax) return "high";
  return "normal";
}

export function getRangePosition(value, refMin, refMax) {
  if (value === null || value === undefined) return null;
  if (refMin == null || refMax == null || refMax === refMin) return 50;
  return ((value - refMin) / (refMax - refMin)) * 100;
}

// Trend arrow: a single percent threshold separates "stable" from a real
// rise / fall. Tight enough that natural lab variability still trips the
// arrow; loose enough that a single decimal-place rounding doesn't.
const STABLE_TREND_PCT = 2;
export function getTrend(values, refMin, refMax) {
  const nn = values.filter(v=>v!==null);
  if (nn.length<2) return {arrow:"\u2014",cls:"trend-stable"};
  const prev = nn[nn.length-2];
  if (prev === 0) return {arrow:"→",cls:"trend-stable"};
  const curr = nn[nn.length-1];
  const pct = ((curr-prev)/prev)*100;
  if (Math.abs(pct)<STABLE_TREND_PCT) return {arrow:"\u2192",cls:"trend-stable"};
  const dir = pct > 0 ? 'up' : 'down';
  const arrow = pct > 0 ? `\u2191 +${pct.toFixed(1)}%` : `\u2193 ${pct.toFixed(1)}%`;
  // Color based on whether change is good or bad relative to ref range
  const status = getStatus(curr, refMin, refMax);
  let quality;
  if (status === 'high') quality = dir === 'down' ? 'good' : 'bad';
  else if (status === 'low') quality = dir === 'up' ? 'good' : 'bad';
  else quality = 'neutral';
  return {arrow, cls:`trend-${dir} trend-${quality}`};
}

export function formatValue(v) {
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
export function formatDate(iso, style = 'short') {
  if (!iso) return '';
  // Append time so the date doesn't shift to the prior day in negative-UTC
  // timezones \u2014 the bug all the inline call sites were quietly working
  // around individually.
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts = style === 'long'      ? { month: 'long',  day: 'numeric', year: 'numeric' }
             : style === 'monthYear' ? { month: 'short', year: 'numeric' }
             : style === 'spoken'    ? { month: 'long',  day: 'numeric' }
             : /* short */             { month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

export function linearRegression(points) {
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += points[i];
    sumXY += i * points[i]; sumX2 += i * i; sumY2 += points[i] * points[i];
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
export function setDebugMode(on) { localStorage.setItem('labcharts-debug', on ? 'true' : 'false'); }
export function isPIIReviewEnabled() { return localStorage.getItem('labcharts-pii-review') !== 'false'; }
export function setPIIReviewEnabled(on) { localStorage.setItem('labcharts-pii-review', on ? 'true' : 'false'); }
// Analytics: opt-out, default ON. Setting `analytics-disabled=true` suppresses
// the Umami snippet on next page load. Cookieless, no personal data, no IP.
export function isAnalyticsEnabled() { return localStorage.getItem('labcharts-analytics-disabled') !== 'true'; }
export function setAnalyticsEnabled(on) { localStorage.setItem('labcharts-analytics-disabled', on ? 'false' : 'true'); }
function hasSeenAnalyticsConsent() { return localStorage.getItem('labcharts-analytics-consent-seen') === '1'; }
function markAnalyticsConsentSeen() { localStorage.setItem('labcharts-analytics-consent-seen', '1'); }

// One-time transparency banner shown to first-time users. Default state is
// analytics-on (preserves the maintainer's product signal) but the user is
// explicitly told upfront with a one-click disable. Better than silent
// opt-out (transparency), more pragmatic than buried opt-in (data signal).
export function maybeShowAnalyticsConsent() {
  if (hasSeenAnalyticsConsent()) return;
  // Skip on offline/Tor where Umami doesn't load anyway
  if (location.protocol === 'file:' || location.hostname.endsWith('.onion')) {
    markAnalyticsConsentSeen();
    return;
  }
  // Don't double-render if already in the DOM
  if (document.getElementById('analytics-consent-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'analytics-consent-banner';
  banner.className = 'analytics-consent-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Analytics consent');
  banner.innerHTML = `
    <div class="analytics-consent-body">
      <span aria-hidden="true">📊</span>
      <span>Anonymous usage stats are <strong>on</strong> to help me improve getbased — counts only, no IP, no health data, cookieless.</span>
    </div>
    <div class="analytics-consent-actions">
      <button type="button" class="analytics-consent-btn analytics-consent-btn-primary" onclick="dismissAnalyticsConsent()">Got it</button>
      <button type="button" class="analytics-consent-btn" onclick="dismissAnalyticsConsentAndDisable()">Turn off</button>
    </div>`;
  document.body.appendChild(banner);
}

export function dismissAnalyticsConsent() {
  markAnalyticsConsentSeen();
  document.getElementById('analytics-consent-banner')?.remove();
}

export function dismissAnalyticsConsentAndDisable() {
  setAnalyticsEnabled(false);
  markAnalyticsConsentSeen();
  document.getElementById('analytics-consent-banner')?.remove();
  showNotification('Anonymous usage stats turned off. You can change this anytime in Settings → Privacy.', 'info', 4000);
}

export function showNotification(message, type, duration) {
  type = type || "info";
  const container = document.getElementById("notification-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `notification-toast ${type}`;
  if (type === 'error') toast.setAttribute('role', 'alert');
  const icons = { success: "\u2713", error: "\u2717", info: "\u2139" };
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

export function showConfirmDialog(message, onConfirm) {
  let overlay = document.getElementById("confirm-dialog-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "confirm-dialog-overlay";
    overlay.className = "confirm-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Confirmation">
    <p class="confirm-message">${escapeHTML(message)}</p>
    <div class="confirm-actions">
      <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
      <button class="confirm-btn confirm-btn-danger" id="confirm-ok">Confirm</button>
    </div></div>`;
  overlay.classList.add("show");
  document.getElementById("confirm-ok").onclick = () => { overlay.classList.remove("show"); onConfirm(); };
  document.getElementById("confirm-cancel").onclick = () => { overlay.classList.remove("show"); };
  overlay.onclick = (e) => { if (e.target === overlay) { const d = overlay.querySelector('.confirm-dialog'); if (d) { d.classList.add('modal-nudge'); d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true }); } } };
  document.getElementById("confirm-cancel").focus();
}

/// Promise-based replacement for `window.prompt()`. Browsers block the
/// native prompt in many common contexts (file://, sandboxed iframes,
/// cross-origin workers, some PWA configurations) and its synchronous
/// nature makes it awkward inside async flows. This helper reuses the
/// confirm-dialog CSS so both dialogs look consistent; resolves to the
/// trimmed string on OK, or null on Cancel / Esc / backdrop-click.
export function showPromptDialog(message, { defaultValue = '', okLabel = 'OK', cancelLabel = 'Cancel', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('prompt-dialog-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'prompt-dialog-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Prompt">
      <p class="confirm-message">${escapeHTML(message)}</p>
      <input type="text" id="prompt-dialog-input" class="api-key-input"
             value="${escapeAttr(defaultValue)}"
             placeholder="${escapeAttr(placeholder)}"
             style="width:100%;margin:8px 0 14px;box-sizing:border-box"
             aria-label="${escapeAttr(message)}">
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="prompt-cancel">${escapeHTML(cancelLabel)}</button>
        <button class="confirm-btn confirm-btn-danger" id="prompt-ok" style="background:var(--accent)">${escapeHTML(okLabel)}</button>
      </div></div>`;
    overlay.classList.add('show');

    const input = document.getElementById('prompt-dialog-input');
    const ok = document.getElementById('prompt-ok');
    const cancel = document.getElementById('prompt-cancel');

    const close = (value) => {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); close(input.value.trim() || null); }
    };

    ok.onclick = () => close(input.value.trim() || null);
    cancel.onclick = () => close(null);
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    document.addEventListener('keydown', onKey);
    // Autofocus the input + select default text so the user can just type.
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

export function hasCardContent(obj) {
  if (!obj) return false;
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'note') { if (val?.trim()) return true; }
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

Object.assign(window, { showNotification, showConfirmDialog, showPromptDialog, isDebugMode, setDebugMode, isPIIReviewEnabled, setPIIReviewEnabled, isAnalyticsEnabled, setAnalyticsEnabled, maybeShowAnalyticsConsent, dismissAnalyticsConsent, dismissAnalyticsConsentAndDisable, hasCardContent, escapeAttr });
