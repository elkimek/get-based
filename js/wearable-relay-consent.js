// @ts-check
// wearable-relay-consent.js — explicit approval for hosted wearable relay processing.

export const HOSTED_WEARABLE_CONSENT_VERSION = '2026-08-22';
export const HOSTED_WEARABLE_CONSENT_KEY = 'labcharts-hosted-wearable-consent';

const sessionApprovals = new Set();
/** @type {Promise<boolean> | null} */
let activePrompt = null;

function consentScope(adapterId) {
  return String(adapterId || '').trim().toLowerCase();
}

function readConsentRecord() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOSTED_WEARABLE_CONSENT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function getHostedWearableConsentRecord() {
  return readConsentRecord();
}

export function hasHostedWearableRelayConsent(adapterId) {
  const scope = consentScope(adapterId);
  if (!scope) return false;
  if (sessionApprovals.has(scope)) return true;
  const record = readConsentRecord();
  return record?.version === HOSTED_WEARABLE_CONSENT_VERSION
    && record?.approvals?.[scope]?.accepted === true;
}

function storeApproval(adapterId, providerName) {
  const scope = consentScope(adapterId);
  if (!scope) return;
  sessionApprovals.add(scope);
  const previous = readConsentRecord();
  const approvals = previous?.version === HOSTED_WEARABLE_CONSENT_VERSION
    && previous?.approvals && typeof previous.approvals === 'object'
    ? previous.approvals
    : {};
  const acceptedAt = new Date().toISOString();
  try {
    localStorage.setItem(HOSTED_WEARABLE_CONSENT_KEY, JSON.stringify({
      version: HOSTED_WEARABLE_CONSENT_VERSION,
      approvals: {
        ...approvals,
        [scope]: {
          accepted: true,
          provider: scope,
          recipient: String(providerName || adapterId || 'wearable provider'),
          controller: 'getbased s.r.o.',
          purpose: 'connect the selected wearable account and import requested readings into the active profile',
          acceptedAt,
        },
      },
    }));
  } catch {
    // The express choice remains valid for this tab when storage is blocked.
  }
  globalThis.dispatchEvent?.(new Event('hosted-wearable-consent-changed'));
}

export function withdrawHostedWearableRelayConsent(adapterId) {
  const scope = consentScope(adapterId);
  if (!scope) return;
  sessionApprovals.delete(scope);
  const record = readConsentRecord();
  if (record?.version === HOSTED_WEARABLE_CONSENT_VERSION
      && record.approvals && typeof record.approvals === 'object') {
    const approvals = { ...record.approvals };
    delete approvals[scope];
    try {
      if (Object.keys(approvals).length) {
        localStorage.setItem(HOSTED_WEARABLE_CONSENT_KEY, JSON.stringify({
          ...record,
          approvals,
        }));
      } else {
        localStorage.removeItem(HOSTED_WEARABLE_CONSENT_KEY);
      }
    } catch {
      // The session approval was still withdrawn even if storage is blocked.
    }
  }
  globalThis.dispatchEvent?.(new Event('hosted-wearable-consent-changed'));
}

function showConsentPrompt(adapterId, providerName) {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(false);
  document.getElementById('wearable-relay-consent-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'wearable-relay-consent-overlay';
  overlay.className = 'modal-overlay legal-consent-overlay show';
  overlay.innerHTML = `
    <div class="legal-consent-modal" role="dialog" aria-modal="true" aria-labelledby="wearable-relay-consent-title" aria-describedby="wearable-relay-consent-desc">
      <div class="legal-consent-kicker">Wearable privacy</div>
      <h2 id="wearable-relay-consent-title"></h2>
      <p id="wearable-relay-consent-desc" class="legal-consent-copy"></p>
      <div class="legal-consent-summary wearable-relay-consent-summary">
        <div><strong>Purpose</strong><br><span id="wearable-relay-consent-purpose"></span></div>
        <div><strong>Secure relay</strong><br>Data is readable while being forwarded; request and response contents are not intentionally stored.</div>
        <div><strong>On this device</strong><br>Your connection key is encrypted. Encrypted sync and cloud AI are separate choices.</div>
        <div><strong>Your control</strong><br><span id="wearable-relay-consent-withdrawal"></span></div>
      </div>
      <label class="legal-consent-check">
        <input type="checkbox" id="wearable-relay-consent-checkbox">
        <span id="wearable-relay-consent-statement"></span>
      </label>
      <p class="cloud-ai-consent-links"><a href="https://getbased.health/privacy" target="_blank" rel="noopener">Read the Privacy Policy</a></p>
      <div class="legal-consent-actions">
        <button type="button" class="cloud-ai-consent-cancel" data-wearable-relay-consent-action="cancel">Not now</button>
        <button type="button" class="legal-consent-accept" data-wearable-relay-consent-action="approve" disabled></button>
      </div>
    </div>`;

  const provider = String(providerName || adapterId || 'wearable provider');
  const title = overlay.querySelector('#wearable-relay-consent-title');
  const description = overlay.querySelector('#wearable-relay-consent-desc');
  const purpose = overlay.querySelector('#wearable-relay-consent-purpose');
  const withdrawal = overlay.querySelector('#wearable-relay-consent-withdrawal');
  const statement = overlay.querySelector('#wearable-relay-consent-statement');
  const approve = /** @type {HTMLButtonElement | null} */ (
    overlay.querySelector('[data-wearable-relay-consent-action="approve"]')
  );
  if (title) title.textContent = `Connect ${provider}`;
  if (description) {
    description.textContent = `getbased will open ${provider}, where you choose which data to share. On getbased.health, getbased s.r.o. forwards the connection and readings through its secure relay.`;
  }
  if (purpose) {
    purpose.textContent = `Connect ${provider} and import the account details and health readings you choose into this profile.`;
  }
  if (withdrawal) {
    withdrawal.textContent = `Disconnect ${provider} to stop imports and remove the local connection and data. You can also revoke access in ${provider}.`;
  }
  if (statement) {
    statement.textContent = `I explicitly consent to getbased s.r.o. processing the ${provider} account details and health readings I choose, only to connect ${provider} and import them into this profile.`;
  }
  if (approve) approve.textContent = `Continue to ${provider}`;

  document.body.appendChild(overlay);
  document.body.classList.add('wearable-relay-consent-visible');
  const checkbox = /** @type {HTMLInputElement | null} */ (
    overlay.querySelector('#wearable-relay-consent-checkbox')
  );

  return new Promise(resolve => {
    let settled = false;
    const finish = granted => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      document.body.classList.remove('wearable-relay-consent-visible');
      resolve(granted);
    };
    const onKey = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish(false);
    };
    checkbox?.addEventListener('change', () => {
      if (approve) approve.disabled = !checkbox.checked;
    });
    overlay.addEventListener('click', event => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-wearable-relay-consent-action]')
        : null;
      if (!target || !overlay.contains(target)) return;
      const action = target.getAttribute('data-wearable-relay-consent-action');
      if (action === 'cancel') finish(false);
      if (action === 'approve' && checkbox?.checked) {
        storeApproval(adapterId, provider);
        finish(true);
      }
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => checkbox?.focus(), 30);
  });
}

export async function requestHostedWearableRelayConsent(adapterId, providerName) {
  if (hasHostedWearableRelayConsent(adapterId)) return true;
  if (activePrompt) {
    await activePrompt;
    if (hasHostedWearableRelayConsent(adapterId)) return true;
  }
  activePrompt = showConsentPrompt(adapterId, providerName);
  try {
    return await activePrompt;
  } finally {
    activePrompt = null;
  }
}
