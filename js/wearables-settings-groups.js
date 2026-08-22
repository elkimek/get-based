// @ts-check
// Presentation grouping and provider-scoped consent UI for Settings → Wearables.

export const WEARABLE_GROUP_COPY = Object.freeze({
  connected: {
    title: 'Connected',
    hint: 'Choose a source to update or disconnect it.',
  },
  available: {
    title: 'Ready to connect',
    hint: 'Connect an account to import its readings.',
  },
  self_host: {
    title: 'For self-hosted getbased',
    hint: 'Available when you run getbased on your own server.',
  },
  local: {
    title: 'Import or enter data',
    hint: 'Use an Apple Health export or add readings yourself.',
  },
});

/** @type {Readonly<Record<string, number>>} */
const SELF_HOST_ADAPTER_ORDER = Object.freeze({
  google_health: 0,
  whoop: 1,
  ultrahuman: 2,
});

/**
 * @param {Array<any>} adapters
 * @param {object} connected
 * @param {(adapter: any) => boolean} needsAttention
 */
export function groupWearableAdapters(adapters, connected, needsAttention) {
  /** @type {Record<string, Array<any>>} */
  const grouped = { connected: [], available: [], self_host: [], local: [] };
  const registryIndex = new Map(adapters.map((adapter, index) => [adapter.id, index]));

  for (const adapter of adapters) {
    if (Object.prototype.hasOwnProperty.call(connected, adapter.id)) grouped.connected.push(adapter);
    else if (adapter.authType === 'manual' || adapter.authType === 'file-import') grouped.local.push(adapter);
    else if (adapter.hostConfiguredOnly || adapter.experimentalSelfHost || adapter.integrationKind === 'aggregator') grouped.self_host.push(adapter);
    else grouped.available.push(adapter);
  }

  grouped.connected.sort((a, b) => {
    const attention = Number(Boolean(needsAttention(b))) - Number(Boolean(needsAttention(a)));
    return attention || (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
  });
  grouped.self_host.sort((a, b) => {
    const aRank = SELF_HOST_ADAPTER_ORDER[a.id] ?? Number.MAX_SAFE_INTEGER;
    const bRank = SELF_HOST_ADAPTER_ORDER[b.id] ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
  });
  grouped.local.sort((a, b) => {
    const typeOrder = Number(a.authType === 'manual') - Number(b.authType === 'manual');
    return typeOrder || (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
  });

  return Object.entries(grouped)
    .filter(([, items]) => items.length)
    .map(([id, items]) => ({ id, items, ...WEARABLE_GROUP_COPY[id] }));
}

export const HOSTED_WEARABLE_CONSENT_VERSION = '2026-08-22';
export const HOSTED_WEARABLE_CONSENT_KEY = 'labcharts-hosted-wearable-consent';

const sessionApprovals = new Set();
/** @type {Promise<boolean> | null} */
let activeConsentPrompt = null;

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
  if (activeConsentPrompt) {
    await activeConsentPrompt;
    if (hasHostedWearableRelayConsent(adapterId)) return true;
  }
  activeConsentPrompt = showConsentPrompt(adapterId, providerName);
  try {
    return await activeConsentPrompt;
  } finally {
    activeConsentPrompt = null;
  }
}
