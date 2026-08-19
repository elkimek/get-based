// @ts-check
// legal-consent.js — first-launch Terms/Privacy gate and re-consent on document updates.

import { dispatchUtilsRuntimeEvent, getAppVersionRuntime } from './utils-runtime.js';
import { showNotification } from './utils.js';

const LEGAL_ACCEPTANCE_KEY = 'labcharts-legal-acceptance';
export const TERMS_VERSION = '2026-08-19';
export const PRIVACY_VERSION = '2026-08-19';

const LEGAL_ACTION_ATTR = 'data-legal-consent-action';
let bootstrapNotificationBound = false;

function nowIso() {
  try { return new Date().toISOString(); } catch { return ''; }
}

export function getLegalAcceptance() {
  try {
    const raw = localStorage.getItem(LEGAL_ACCEPTANCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentLegal() {
  const accepted = getLegalAcceptance();
  return accepted?.termsVersion === TERMS_VERSION
    && accepted?.privacyVersion === PRIVACY_VERSION
    && accepted?.accepted === true;
}

export function isLegalConsentGateVisible() {
  return !!document.getElementById('legal-consent-overlay');
}

function storeLegalAcceptance() {
  const payload = {
    accepted: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: nowIso(),
    appVersion: getAppVersionRuntime() || null,
    location: typeof location !== 'undefined' ? location.origin + location.pathname : null,
  };
  localStorage.setItem(LEGAL_ACCEPTANCE_KEY, JSON.stringify(payload));
  return payload;
}

function shouldUseLocalLegalLinks() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function legalHref(path) {
  return shouldUseLocalLegalLinks() ? path : `https://getbased.health${path}`;
}

function renderLegalConsentModal({ update = false } = {}) {
  const intro = update
    ? 'The Terms or Privacy Policy changed since this browser last accepted them. Please review and accept the current versions before continuing.'
    : 'Before using getbased, please review and accept the Terms and Privacy Policy.';
  const title = update ? 'Review updated Terms & Privacy' : 'Accept Terms & Privacy';
  return `
    <div class="legal-consent-modal" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title" aria-describedby="legal-consent-desc">
      <div class="legal-consent-kicker">getbased legal</div>
      <h2 id="legal-consent-title">${title}</h2>
      <p id="legal-consent-desc" class="legal-consent-copy">${intro}</p>
      <div class="legal-consent-summary">
        <div><strong>Terms:</strong> ${TERMS_VERSION}</div>
        <div><strong>Privacy:</strong> ${PRIVACY_VERSION}</div>
      </div>
      <ul class="legal-consent-points">
        <li>getbased is a wellness, self-tracking, and educational tool — not medical advice or a medical device.</li>
        <li>Your health data is stored locally by default; optional network features are described in the Privacy Policy.</li>
        <li>Cloud AI requires a separate, provider-specific approval before the first request sends sensitive data.</li>
        <li>Cookieless product analytics may run on the hosted app and can be turned off in Settings → Privacy; the analytics service does not store the raw IP address, while ordinary hosting metadata is described in the Privacy Policy.</li>
      </ul>
      <label class="legal-consent-check">
        <input type="checkbox" id="legal-consent-checkbox">
        <span>I have read and agree to the <a href="${legalHref('/terms')}" data-legal-path="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="${legalHref('/privacy')}" data-legal-path="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span>
      </label>
      <div class="legal-consent-actions">
        <button type="button" class="legal-consent-accept" ${LEGAL_ACTION_ATTR}="accept" disabled>Accept & continue</button>
      </div>
    </div>`;
}

function closeLegalConsentGate() {
  document.getElementById('legal-consent-overlay')?.remove();
  document.body.classList.remove('legal-consent-visible');
}

function backfillBootstrapAcceptanceMetadata() {
  const accepted = getLegalAcceptance();
  if (!accepted?.accepted || accepted.appVersion) return;
  try {
    localStorage.setItem(LEGAL_ACCEPTANCE_KEY, JSON.stringify({
      ...accepted,
      appVersion: getAppVersionRuntime() || null,
    }));
  } catch {
    // Acceptance already succeeded. Metadata backfill must not reopen the gate
    // when storage becomes unavailable between bootstrap and app startup.
  }
}

function showAcceptanceNotification(persisted) {
  if (persisted) {
    showNotification('Terms and Privacy accepted.', 'success', 3000);
  } else {
    showNotification('Terms accepted for this session. Your browser blocked saving the acceptance record, so you may be asked again next visit.', 'warning', 6000);
  }
}

function consumeBootstrapAcceptanceResult() {
  const result = document.documentElement.dataset.legalConsentBootstrapResult;
  if (result !== 'persisted' && result !== 'session') return null;
  delete document.documentElement.dataset.legalConsentBootstrapResult;
  return result;
}

function notifyBootstrapAcceptance() {
  const result = consumeBootstrapAcceptanceResult();
  if (result) showAcceptanceNotification(result === 'persisted');
}

function bindBootstrapAcceptanceNotification() {
  if (bootstrapNotificationBound) return;
  bootstrapNotificationBound = true;
  globalThis.addEventListener('legal-consent-accepted', notifyBootstrapAcceptance, { once: true });
}

function prepareLegalConsentOverlay(overlay, { update = false } = {}) {
  overlay.querySelectorAll('[data-legal-path]').forEach(link => {
    if (!(link instanceof HTMLAnchorElement)) return;
    link.href = legalHref(link.dataset.legalPath || '/');
  });
  if (update) {
    const title = overlay.querySelector('#legal-consent-title');
    const description = overlay.querySelector('#legal-consent-desc');
    if (title) title.textContent = 'Review updated Terms & Privacy';
    if (description) {
      description.textContent = 'The Terms or Privacy Policy changed since this browser last accepted them. Please review and accept the current versions before continuing.';
    }
  }
}

function bindLegalConsentOverlay(overlay) {
  if (overlay.dataset.legalConsentModuleBound === 'true') return;
  overlay.dataset.legalConsentModuleBound = 'true';
  overlay.addEventListener('click', handleLegalConsentClick);
  overlay.addEventListener('change', handleLegalConsentChange);
  const checkbox = /** @type {HTMLInputElement | null} */ (
    overlay.querySelector('#legal-consent-checkbox')
  );
  const acceptButton = /** @type {HTMLButtonElement | null} */ (
    overlay.querySelector(`[${LEGAL_ACTION_ATTR}="accept"]`)
  );
  if (acceptButton) acceptButton.disabled = !checkbox?.checked;
}

function handleLegalConsentClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest(`[${LEGAL_ACTION_ATTR}]`);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LEGAL_ACTION_ATTR);
  if (action !== 'accept') return;
  event.preventDefault();
  const checkbox = /** @type {HTMLInputElement | null} */ (document.getElementById('legal-consent-checkbox'));
  if (!checkbox?.checked) return;
  let persisted = true;
  try {
    storeLegalAcceptance();
  } catch (err) {
    persisted = false;
    console.warn('[legal-consent] Failed to persist acceptance:', err);
  }
  closeLegalConsentGate();
  dispatchUtilsRuntimeEvent('legal-consent-accepted');
  showAcceptanceNotification(persisted);
}

function handleLegalConsentChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== 'legal-consent-checkbox') return;
  const acceptBtn = /** @type {HTMLButtonElement | null} */ (document.querySelector('#legal-consent-overlay [data-legal-consent-action="accept"]'));
  if (acceptBtn) acceptBtn.disabled = !target.checked;
}

export function maybeShowLegalConsentGate() {
  const bootstrapResult = document.documentElement.dataset.legalConsentBootstrapResult;
  if (hasAcceptedCurrentLegal() || bootstrapResult === 'session') {
    if (bootstrapResult === 'persisted') backfillBootstrapAcceptanceMetadata();
    closeLegalConsentGate();
    notifyBootstrapAcceptance();
    return false;
  }
  const previous = getLegalAcceptance();
  let overlay = /** @type {HTMLElement | null} */ (document.getElementById('legal-consent-overlay'));
  const prerenderMatchesCurrent = overlay?.dataset.termsVersion === TERMS_VERSION
    && overlay?.dataset.privacyVersion === PRIVACY_VERSION;
  if (overlay && !prerenderMatchesCurrent) {
    overlay.remove();
    overlay = null;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'legal-consent-overlay';
    overlay.className = 'modal-overlay legal-consent-overlay show';
    overlay.dataset.termsVersion = TERMS_VERSION;
    overlay.dataset.privacyVersion = PRIVACY_VERSION;
    overlay.innerHTML = renderLegalConsentModal({ update: !!previous });
    document.body.appendChild(overlay);
  }
  prepareLegalConsentOverlay(overlay, { update: !!previous });
  if (overlay.dataset.legalConsentBootstrapBound === 'true') {
    bindBootstrapAcceptanceNotification();
  } else {
    bindLegalConsentOverlay(overlay);
  }
  document.body.classList.add('legal-consent-visible');
  setTimeout(() => document.getElementById('legal-consent-checkbox')?.focus(), 30);
  return true;
}
