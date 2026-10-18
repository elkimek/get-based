// legal-consent.js — first-launch Terms/Privacy gate and re-consent on document updates.

import { dispatchUtilsRuntimeEvent, getAppVersionRuntime } from './utils-runtime.js';
import { showNotification } from './utils.js';
import { getDeploymentOperatorPolicy } from './deployment-policy.js';
import { renderFirstLaunchLegal } from './legal-first-launch-presentation.js';
import { TERMS_VERSION, PRIVACY_VERSION } from './legal-first-launch-view.js';
export { TERMS_VERSION, PRIVACY_VERSION } from './legal-first-launch-view.js';

export interface LegalAcceptanceReader {
  accepted?: unknown;
  termsVersion?: unknown;
  privacyVersion?: unknown;
  policyScope?: unknown;
  appVersion?: unknown;
  [key: string]: unknown;
}
type LegalConsentOptions = { update?: boolean | undefined };
interface LegalConsentClickTarget { closest?: (selector: string) => Element | null; }
interface LegalConsentClickRoot { contains?: (element: Element) => boolean; }

const LEGAL_ACCEPTANCE_KEY = 'labcharts-legal-acceptance';

const LEGAL_ACTION_ATTR = 'data-legal-consent-action';
let bootstrapNotificationBound = false;

function nowIso() {
  try { return new Date().toISOString(); } catch { return ''; }
}

export function getLegalAcceptance(): LegalAcceptanceReader | null {
  try {
    const raw = localStorage.getItem(LEGAL_ACCEPTANCE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as LegalAcceptanceReader : null;
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentLegal() {
  const accepted = getLegalAcceptance();
  return accepted?.termsVersion === TERMS_VERSION
    && accepted?.privacyVersion === PRIVACY_VERSION
    && accepted?.policyScope === currentPolicyScope()
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
    policyScope: currentPolicyScope(),
    acceptedAt: nowIso(),
    appVersion: getAppVersionRuntime() || null,
    location: typeof location !== 'undefined' ? location.origin + location.pathname : null,
  };
  localStorage.setItem(LEGAL_ACCEPTANCE_KEY, JSON.stringify(payload));
  return payload;
}

function currentPolicy() {
  return getDeploymentOperatorPolicy();
}

function currentPolicyScope() {
  const policy = currentPolicy();
  return policy.name || policy.termsUrl || policy.privacyUrl
    ? [policy.name, policy.termsUrl, policy.privacyUrl].join('|')
    : 'self-hosted-notice';
}

function renderLegalConsentModal({ update = false }: LegalConsentOptions = {}) {
  return renderFirstLaunchLegal(currentPolicy(), update);
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

function showAcceptanceNotification(persisted: boolean) {
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

function prepareLegalConsentOverlay(overlay: HTMLElement, { update = false }: LegalConsentOptions = {}) {
  if (update) {
    const title = overlay.querySelector('#legal-consent-title');
    const description = overlay.querySelector('#legal-consent-desc');
    const policy = currentPolicy();
    const hasPolicies = !!(policy.termsUrl || policy.privacyUrl);
    if (title) title.textContent = hasPolicies ? 'Review updated Terms & Privacy' : 'Review updated app notice';
    if (description) {
      description.textContent = hasPolicies
        ? 'The deployment policy identity or links changed since this browser last accepted them. Please review the current documents before continuing.'
        : 'The self-hosted app notice changed since this browser last acknowledged it. Please review it before continuing.';
    }
  }
}

function applyDeploymentPolicyFooter() {
  const group = document.querySelector('[data-deployment-policy-footer]');
  if (!group) return;
  const policy = currentPolicy();
  const privacy = (group.querySelector('[data-footer-policy-kind="privacy"]') as HTMLAnchorElement | null);
  const terms = (group.querySelector('[data-footer-policy-kind="terms"]') as HTMLAnchorElement | null);
  if (!policy.privacyUrl && !policy.termsUrl) {
    group.remove();
    return;
  }
  if (privacy) {
    if (policy.privacyUrl) privacy.href = policy.privacyUrl;
    else privacy.remove();
  }
  if (terms) {
    if (policy.termsUrl) terms.href = policy.termsUrl;
    else terms.remove();
  }
}

function bindLegalConsentOverlay(overlay: HTMLElement) {
  if (overlay.dataset.legalConsentModuleBound === 'true') return;
  overlay.dataset.legalConsentModuleBound = 'true';
  overlay.addEventListener('click', handleLegalConsentClick);
  overlay.addEventListener('change', handleLegalConsentChange);
  const checkbox = (
    overlay.querySelector('#legal-consent-checkbox') as HTMLInputElement | null
  );
  const acceptButton = (
    overlay.querySelector(`[${LEGAL_ACTION_ATTR}="accept"]`) as HTMLButtonElement | null
  );
  if (acceptButton) acceptButton.disabled = !checkbox?.checked;
}

function handleLegalConsentClick(event: Event) {
  const target = event.target as LegalConsentClickTarget | null;
  if (!target || typeof target.closest !== 'function') return;
  const actionEl = target.closest(`[${LEGAL_ACTION_ATTR}]`);
  if (!actionEl || !(event.currentTarget as LegalConsentClickRoot | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(LEGAL_ACTION_ATTR);
  if (action !== 'accept') return;
  event.preventDefault();
  const checkbox = (document.getElementById('legal-consent-checkbox') as HTMLInputElement | null);
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

function handleLegalConsentChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== 'legal-consent-checkbox') return;
  const acceptBtn = (document.querySelector('#legal-consent-overlay [data-legal-consent-action="accept"]') as HTMLButtonElement | null);
  if (acceptBtn) acceptBtn.disabled = !target.checked;
}

export function maybeShowLegalConsentGate() {
  applyDeploymentPolicyFooter();
  const bootstrapResult = document.documentElement.dataset.legalConsentBootstrapResult;
  if (hasAcceptedCurrentLegal() || bootstrapResult === 'session') {
    if (bootstrapResult === 'persisted') backfillBootstrapAcceptanceMetadata();
    closeLegalConsentGate();
    notifyBootstrapAcceptance();
    return false;
  }
  const previous = getLegalAcceptance();
  let overlay = (document.getElementById('legal-consent-overlay') as HTMLElement | null);
  const prerenderMatchesCurrent = overlay?.dataset.termsVersion === TERMS_VERSION
    && overlay?.dataset.privacyVersion === PRIVACY_VERSION
    && overlay?.dataset.policyScope === currentPolicyScope();
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
    overlay.dataset.policyScope = currentPolicyScope();
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
