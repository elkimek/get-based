// @ts-check
// cloud-ai-consent.js — explicit, provider-scoped approval before cloud AI processing.

import { getCustomApiUrl } from './api-provider-storage.js';

export const CLOUD_AI_CONSENT_VERSION = '2026-08-19';
export const CLOUD_AI_CONSENT_KEY = 'labcharts-cloud-ai-consent';

const PROVIDERS = Object.freeze({
  openrouter: { label: 'OpenRouter', route: 'directly from this browser' },
  ppq: { label: 'PPQ', route: 'directly from this browser' },
  routstr: { label: 'the selected Routstr node', route: 'directly from this browser' },
  venice: { label: 'Venice', route: 'directly from this browser' },
  xai: { label: 'xAI', route: 'directly from this browser' },
  elevenlabs: { label: 'ElevenLabs', route: 'directly from this browser' },
});

const sessionApprovals = new Set();
/** @type {Promise<boolean> | null} */
let activePrompt = null;

export class CloudAIConsentDeclinedError extends Error {
  constructor() {
    super('Cloud AI consent was not granted. No request was sent.');
    this.name = 'CloudAIConsentDeclinedError';
  }
}

function safeOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch { return ''; }
}

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (/^(?:f[cd]|fe[89ab])[0-9a-f]*:/i.test(host)) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const match = /^172\.(\d{1,3})(?:\.\d{1,3}){2}$/.exec(host);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

export function cloudAIConsentDetails(provider) {
  if (provider === 'ollama') {
    return { required: false, provider, scope: 'local', label: 'Local AI', route: 'on your configured local endpoint' };
  }
  if (provider === 'custom') {
    const endpoint = getCustomApiUrl();
    const origin = safeOrigin(endpoint);
    let local = false;
    try { local = isPrivateHostname(new URL(endpoint).hostname); } catch {}
    return {
      required: !local,
      provider,
      scope: `custom:${origin || 'unconfigured'}`,
      label: origin ? `the custom API at ${origin}` : 'the configured custom API',
      route: local ? 'directly on your local network' : 'directly from this browser',
    };
  }
  const details = PROVIDERS[provider] || { label: provider || 'the selected provider', route: 'from this browser' };
  return { required: true, provider, scope: provider || 'unknown', ...details };
}

function readConsentRecord() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_AI_CONSENT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function getCloudAIConsentRecord() {
  return readConsentRecord();
}

export function hasCloudAIConsent(provider) {
  const details = cloudAIConsentDetails(provider);
  if (!details.required) return true;
  if (sessionApprovals.has(details.scope)) return true;
  const record = readConsentRecord();
  return record?.version === CLOUD_AI_CONSENT_VERSION
    && record?.approvals?.[details.scope]?.accepted === true;
}

function storeApproval(details) {
  sessionApprovals.add(details.scope);
  const previous = readConsentRecord();
  const approvals = previous?.version === CLOUD_AI_CONSENT_VERSION
    && previous?.approvals && typeof previous.approvals === 'object'
    ? previous.approvals
    : {};
  const acceptedAt = new Date().toISOString();
  try {
    localStorage.setItem(CLOUD_AI_CONSENT_KEY, JSON.stringify({
      version: CLOUD_AI_CONSENT_VERSION,
      approvals: {
        ...approvals,
        [details.scope]: {
          accepted: true,
          provider: details.provider,
          recipient: details.label,
          route: details.route,
          purpose: 'cloud AI and voice features initiated by the user',
          acceptedAt,
        },
      },
    }));
  } catch {
    // The express choice remains valid for this tab when storage is blocked.
  }
  globalThis.dispatchEvent?.(new Event('cloud-ai-consent-changed'));
}

export function withdrawCloudAIConsent() {
  sessionApprovals.clear();
  try { localStorage.removeItem(CLOUD_AI_CONSENT_KEY); } catch {}
  globalThis.dispatchEvent?.(new Event('cloud-ai-consent-changed'));
}

function purposeCopy(kind) {
  if (kind === 'meal-photo') return 'analyzing the selected meal photos and any Known details you entered';
  if (kind === 'voice-input') return 'transcribing the audio you choose to record';
  if (kind === 'voice-output') return 'generating speech from the text you choose to play';
  return 'generating the AI response you requested';
}

function showConsentPrompt(details, kind) {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(false);
  const existing = document.getElementById('cloud-ai-consent-overlay');
  if (existing) existing.remove();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.id = 'cloud-ai-consent-overlay';
  overlay.className = 'modal-overlay legal-consent-overlay show';
  const isMealPhoto = kind === 'meal-photo';
  overlay.innerHTML = isMealPhoto ? `
    <div class="legal-consent-modal cloud-ai-consent-compact" role="dialog" aria-modal="true" aria-labelledby="cloud-ai-consent-title" aria-describedby="cloud-ai-consent-desc">
      <div class="legal-consent-kicker">First cloud analysis</div>
      <h2 id="cloud-ai-consent-title">Send these meal details?</h2>
      <p id="cloud-ai-consent-desc" class="legal-consent-copy"></p>
      <label class="legal-consent-check">
        <input type="checkbox" id="cloud-ai-consent-checkbox">
        <span id="cloud-ai-consent-statement"></span>
      </label>
      <p class="cloud-ai-consent-links"><a href="https://getbased.health/privacy" target="_blank" rel="noopener">Privacy Policy</a> · You can withdraw this later in Settings → Privacy.</p>
      <div class="legal-consent-actions">
        <button type="button" class="cloud-ai-consent-cancel" data-cloud-ai-consent-action="cancel">Not now</button>
        <button type="button" class="legal-consent-accept" data-cloud-ai-consent-action="approve" disabled>Approve &amp; analyze</button>
      </div>
    </div>` : `
    <div class="legal-consent-modal" role="dialog" aria-modal="true" aria-labelledby="cloud-ai-consent-title" aria-describedby="cloud-ai-consent-desc">
      <div class="legal-consent-kicker">Cloud AI privacy</div>
      <h2 id="cloud-ai-consent-title">Approve sensitive-data processing</h2>
      <p id="cloud-ai-consent-desc" class="legal-consent-copy"></p>
      <ul class="legal-consent-points">
        <li>Your request can include health, genetic, biometric, wearable, or other sensitive information from the active profile and your message.</li>
        <li>The provider and any model provider it routes to may process the request under their own terms, retention settings, and privacy policy.</li>
        <li>You can refuse and continue using getbased locally, or withdraw this approval at any time in Settings &rarr; Privacy.</li>
      </ul>
      <label class="legal-consent-check">
        <input type="checkbox" id="cloud-ai-consent-checkbox">
        <span id="cloud-ai-consent-statement"></span>
      </label>
      <p class="cloud-ai-consent-links"><a href="https://getbased.health/privacy" target="_blank" rel="noopener">Read the Privacy Policy</a></p>
      <div class="legal-consent-actions">
        <button type="button" class="cloud-ai-consent-cancel" data-cloud-ai-consent-action="cancel">Keep data on this device</button>
        <button type="button" class="legal-consent-accept" data-cloud-ai-consent-action="approve" disabled>Approve &amp; send</button>
      </div>
    </div>`;

  const purpose = purposeCopy(kind);
  const description = overlay.querySelector('#cloud-ai-consent-desc');
  if (description) {
    description.textContent = isMealPhoto
      ? `getbased will send the selected photos and any Known details ${details.route} to ${details.label} for ${purpose}. Saved meal content, photos, and thumbnails are encrypted at rest with a device-local key.`
      : `getbased is ready to send data ${details.route} to ${details.label} for ${purpose}. This approval also covers later cloud AI requests you initiate with this provider, including prompts, recorded voice, and text sent for speech. Nothing will be sent until you approve.`;
  }
  const statement = overlay.querySelector('#cloud-ai-consent-statement');
  if (statement) {
    statement.textContent = isMealPhoto
      ? `I agree to send data I choose to submit to ${details.label}. Remember this approval for later AI requests I initiate with this provider.`
      : `I explicitly consent to getbased sending sensitive data I choose to submit to ${details.label} for cloud AI and voice features I initiate.`;
  }

  document.body.appendChild(overlay);
  document.body.classList.add('cloud-ai-consent-visible');
  const checkbox = /** @type {HTMLInputElement | null} */ (overlay.querySelector('#cloud-ai-consent-checkbox'));
  const approve = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('[data-cloud-ai-consent-action="approve"]'));

  return new Promise(resolve => {
    const finish = granted => {
      overlay.remove();
      document.body.classList.remove('cloud-ai-consent-visible');
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(granted);
    };
    checkbox?.addEventListener('change', () => {
      if (approve) approve.disabled = !checkbox.checked;
    });
    overlay.addEventListener('click', event => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-cloud-ai-consent-action]')
        : null;
      if (!target || !overlay.contains(target)) return;
      const action = target.getAttribute('data-cloud-ai-consent-action');
      if (action === 'cancel') finish(false);
      if (action === 'approve' && checkbox?.checked) {
        storeApproval(details);
        finish(true);
      }
    });
    setTimeout(() => checkbox?.focus(), 30);
  });
}

export async function requestCloudAIConsent(provider, { kind = 'text' } = {}) {
  const details = cloudAIConsentDetails(provider);
  if (!details.required || hasCloudAIConsent(provider)) return true;
  if (activePrompt) {
    await activePrompt;
    if (hasCloudAIConsent(provider)) return true;
  }
  activePrompt = showConsentPrompt(details, kind);
  try {
    return await activePrompt;
  } finally {
    activePrompt = null;
  }
}

export async function requireCloudAIConsent(provider, options) {
  if (await requestCloudAIConsent(provider, options)) return true;
  throw new CloudAIConsentDeclinedError();
}
