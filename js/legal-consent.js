// @ts-check
// legal-consent.js — first-launch Terms/Privacy gate and re-consent on document updates.

const LEGAL_ACCEPTANCE_KEY = 'labcharts-legal-acceptance';
export const TERMS_VERSION = '2026-06-22';
export const PRIVACY_VERSION = '2026-06-22';

const LEGAL_ACTION_ATTR = 'data-legal-consent-action';

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
    appVersion: globalThis.APP_VERSION || null,
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
        <li>Anonymous, cookieless usage analytics may run on the hosted app and can be turned off in Settings → Privacy.</li>
      </ul>
      <label class="legal-consent-check">
        <input type="checkbox" id="legal-consent-checkbox">
        <span>I have read and agree to the <a href="${legalHref('/terms')}" target="_blank" rel="noopener">Terms of Service</a> and <a href="${legalHref('/privacy')}" target="_blank" rel="noopener">Privacy Policy</a>.</span>
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
  window.dispatchEvent(new CustomEvent('legal-consent-accepted'));
  if (persisted) {
    globalThis.showNotification?.('Terms and Privacy accepted.', 'success', 3000);
  } else {
    globalThis.showNotification?.('Terms accepted for this session. Your browser blocked saving the acceptance record, so you may be asked again next visit.', 'warning', 6000);
  }
}

function handleLegalConsentChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== 'legal-consent-checkbox') return;
  const acceptBtn = /** @type {HTMLButtonElement | null} */ (document.querySelector('#legal-consent-overlay [data-legal-consent-action="accept"]'));
  if (acceptBtn) acceptBtn.disabled = !target.checked;
}

export function maybeShowLegalConsentGate() {
  if (hasAcceptedCurrentLegal()) return false;
  if (document.getElementById('legal-consent-overlay')) return true;
  const previous = getLegalAcceptance();
  const overlay = document.createElement('div');
  overlay.id = 'legal-consent-overlay';
  overlay.className = 'modal-overlay legal-consent-overlay show';
  overlay.innerHTML = renderLegalConsentModal({ update: !!previous });
  overlay.addEventListener('click', handleLegalConsentClick);
  overlay.addEventListener('change', handleLegalConsentChange);
  document.body.appendChild(overlay);
  document.body.classList.add('legal-consent-visible');
  setTimeout(() => document.getElementById('legal-consent-checkbox')?.focus(), 30);
  return true;
}
