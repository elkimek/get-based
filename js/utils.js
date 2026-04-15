// utils.js — Pure utility functions, notifications, dialogs

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

export function getTrend(values, refMin, refMax) {
  const nn = values.filter(v=>v!==null);
  if (nn.length<2) return {arrow:"\u2014",cls:"trend-stable"};
  const prev = nn[nn.length-2];
  if (prev === 0) return {arrow:"→",cls:"trend-stable"};
  const curr = nn[nn.length-1];
  const pct = ((curr-prev)/prev)*100;
  if (Math.abs(pct)<2) return {arrow:"\u2192",cls:"trend-stable"};
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

export function hasCardContent(obj) {
  if (!obj) return false;
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'note') { if (val?.trim()) return true; }
    else if (Array.isArray(val)) { if (val.length > 0) return true; }
    else if (val != null && val !== '') return true;
  }
  return false;
}

export function escapeAttr(s) { return escapeHTML(s).replace(/'/g, '&#39;'); }

Object.assign(window, { showNotification, showConfirmDialog, isDebugMode, setDebugMode, isPIIReviewEnabled, setPIIReviewEnabled, isAnalyticsEnabled, setAnalyticsEnabled, hasCardContent, escapeAttr });
