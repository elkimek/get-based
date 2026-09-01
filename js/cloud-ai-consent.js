// @ts-check
// cloud-ai-consent.js — AI transparency plus route-aware processing approval.

import { getAIProcessingDestination } from './ai-provider-policy.js';
import { getSupplementaryDeploymentPolicy } from './deployment-policy.js';

export const AI_TRANSPARENCY_VERSION = '2026-08-31';
export const AI_TRANSPARENCY_KEY = 'labcharts-ai-transparency-acknowledgement';
export const AI_ROUTE_CONFIRMATION_VERSION = '2026-08-31';
export const AI_ROUTE_CONFIRMATION_KEY = 'labcharts-ai-route-confirmations';
export const CLOUD_AI_CONSENT_VERSION = '2026-08-31';
export const CLOUD_AI_CONSENT_KEY = 'labcharts-cloud-ai-consent';

const sessionApprovals = new Set();
const sessionRouteConfirmations = new Set();
let sessionTransparencyAcknowledged = false;
/** @type {Promise<boolean> | null} */
let activePrompt = null;

export class AITransparencyDeclinedError extends Error {
  constructor() {
    super('AI transparency was not acknowledged. No AI request was sent.');
    this.name = 'AITransparencyDeclinedError';
  }
}

export class AIRouteConfirmationDeclinedError extends Error {
  constructor() {
    super('The local-network AI destination was not confirmed. No request was sent.');
    this.name = 'AIRouteConfirmationDeclinedError';
  }
}

export class CloudAIConsentDeclinedError extends Error {
  constructor() {
    super('Remote AI sensitive-data approval was not granted. No request was sent.');
    this.name = 'CloudAIConsentDeclinedError';
  }
}

function readRecord(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function dispatchChange(name) {
  globalThis.dispatchEvent?.(new Event(name));
}

export function getAITransparencyRecord() {
  return readRecord(AI_TRANSPARENCY_KEY);
}

export function hasAcknowledgedAITransparency() {
  if (sessionTransparencyAcknowledged) return true;
  const record = getAITransparencyRecord();
  return record?.version === AI_TRANSPARENCY_VERSION && record?.acknowledged === true;
}

function storeAITransparencyAcknowledgement() {
  sessionTransparencyAcknowledged = true;
  try {
    localStorage.setItem(AI_TRANSPARENCY_KEY, JSON.stringify({
      version: AI_TRANSPARENCY_VERSION,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
      disclosure: 'AI-generated output and automatic AI insights',
    }));
  } catch {
    // The acknowledgement remains valid for this tab when storage is blocked.
  }
  dispatchChange('ai-transparency-changed');
}

export function withdrawAITransparencyAcknowledgement() {
  sessionTransparencyAcknowledged = false;
  try { localStorage.removeItem(AI_TRANSPARENCY_KEY); } catch {}
  dispatchChange('ai-transparency-changed');
}

export function cloudAIConsentDetails(provider, options = {}) {
  const details = getAIProcessingDestination(provider, options);
  return {
    ...details,
    required: details.boundary === 'remote',
  };
}

export function getCloudAIConsentRecord() {
  return readRecord(CLOUD_AI_CONSENT_KEY);
}

export function hasCloudAIConsent(provider, options = {}) {
  const details = cloudAIConsentDetails(provider, options);
  if (!details.required) return true;
  if (sessionApprovals.has(details.scope)) return true;
  const record = getCloudAIConsentRecord();
  return record?.version === CLOUD_AI_CONSENT_VERSION
    && record?.approvals?.[details.scope]?.accepted === true;
}

function storeRemoteApproval(details) {
  sessionApprovals.add(details.scope);
  const previous = getCloudAIConsentRecord();
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
          endpointOrigin: details.origin,
          route: details.route,
          purpose: 'AI and voice processing, including automatic insights after relevant profile or data changes',
          acceptedAt,
        },
      },
    }));
  } catch {
    // The express choice remains valid for this tab when storage is blocked.
  }
  dispatchChange('cloud-ai-consent-changed');
}

export function withdrawCloudAIConsent() {
  sessionApprovals.clear();
  try { localStorage.removeItem(CLOUD_AI_CONSENT_KEY); } catch {}
  dispatchChange('cloud-ai-consent-changed');
}

export function getAIRouteConfirmationRecord() {
  return readRecord(AI_ROUTE_CONFIRMATION_KEY);
}

export function hasAIRouteConfirmation(provider, options = {}) {
  const details = cloudAIConsentDetails(provider, options);
  if (details.boundary !== 'private-network') return true;
  if (sessionRouteConfirmations.has(details.scope)) return true;
  const record = getAIRouteConfirmationRecord();
  return record?.version === AI_ROUTE_CONFIRMATION_VERSION
    && record?.confirmations?.[details.scope]?.confirmed === true;
}

function storeRouteConfirmation(details) {
  sessionRouteConfirmations.add(details.scope);
  const previous = getAIRouteConfirmationRecord();
  const confirmations = previous?.version === AI_ROUTE_CONFIRMATION_VERSION
    && previous?.confirmations && typeof previous.confirmations === 'object'
    ? previous.confirmations
    : {};
  try {
    localStorage.setItem(AI_ROUTE_CONFIRMATION_KEY, JSON.stringify({
      version: AI_ROUTE_CONFIRMATION_VERSION,
      confirmations: {
        ...confirmations,
        [details.scope]: {
          confirmed: true,
          provider: details.provider,
          recipient: details.label,
          endpointOrigin: details.origin,
          route: details.route,
          confirmedAt: new Date().toISOString(),
        },
      },
    }));
  } catch {
    // The express choice remains valid for this tab when storage is blocked.
  }
  dispatchChange('ai-route-confirmation-changed');
}

export function withdrawAIRouteConfirmations() {
  sessionRouteConfirmations.clear();
  try { localStorage.removeItem(AI_ROUTE_CONFIRMATION_KEY); } catch {}
  dispatchChange('ai-route-confirmation-changed');
}

function purposeCopy(kind) {
  if (kind === 'activation') return 'activating this AI connection';
  if (kind === 'meal-photo') return 'analyzing the selected meal photos and any details you entered';
  if (kind === 'voice-input') return 'transcribing the audio you choose to record';
  if (kind === 'voice-output') return 'generating speech from the text selected for playback';
  if (kind === 'automatic-insight') return 'generating an automatic AI insight after relevant profile or data changes';
  return 'generating AI responses and insights';
}

function addLink(container, label, url) {
  if (!url) return;
  if (container.childNodes.length) container.append(' · ');
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = label;
  container.appendChild(link);
}

function appendPolicyLinks(container, details) {
  if (details.privacyUrl || details.termsUrl) {
    const recipient = document.createElement('span');
    recipient.append(`${details.label}: `);
    addLink(recipient, 'Privacy', details.privacyUrl);
    addLink(recipient, 'Terms', details.termsUrl);
    container.appendChild(recipient);
  }

  const supplementary = getSupplementaryDeploymentPolicy();
  const duplicatesRecipient = supplementary
    && supplementary.privacyUrl === details.privacyUrl
    && supplementary.termsUrl === details.termsUrl;
  if (!supplementary || duplicatesRecipient) return;
  const operator = document.createElement('span');
  if (container.childNodes.length) operator.append(document.createElement('br'));
  operator.append(details.provider === 'routstr'
    ? `${supplementary.name || 'Deployment operator'} app policies (these do not govern the selected Routstr node): `
    : `Supplementary ${supplementary.name || 'deployment operator'} policies: `);
  addLink(operator, 'Privacy', supplementary.privacyUrl);
  addLink(operator, 'Terms', supplementary.termsUrl);
  container.appendChild(operator);
}

function recipientPracticesPoint(details) {
  if (details.provider === 'routstr') {
    return 'Routstr is a decentralized protocol, not the recipient. The selected independent node receives the request and may pass it to an upstream model provider; the node may publish no privacy policy or terms.';
  }
  return 'The recipient and any model provider it routes to may process requests under their own privacy, retention, and security practices. Changing the recipient requires a new approval.';
}

/**
 * @param {{
 *   id: string,
 *   kicker: string,
 *   title: string,
 *   description: string,
 *   points: string[],
 *   statement: string,
 *   cancelLabel: string,
 *   approveLabel: string,
 *   links?: ((container: Element) => void) | null,
 *   onApprove: () => void,
 * }} options
 */
function showPrompt({
  id,
  kicker,
  title,
  description,
  points,
  statement,
  cancelLabel,
  approveLabel,
  links = null,
  onApprove,
}) {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined' || !document.body) return Promise.resolve(false);
  document.getElementById(id)?.remove();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'modal-overlay legal-consent-overlay show';
  overlay.innerHTML = `
    <div class="legal-consent-modal" role="dialog" aria-modal="true">
      <div class="legal-consent-kicker"></div>
      <h2></h2>
      <p class="legal-consent-copy"></p>
      <ul class="legal-consent-points"></ul>
      <label class="legal-consent-check">
        <input type="checkbox">
        <span class="ai-processing-statement"></span>
      </label>
      <p class="cloud-ai-consent-links"></p>
      <div class="legal-consent-actions">
        <button type="button" class="cloud-ai-consent-cancel" data-ai-processing-action="cancel"></button>
        <button type="button" class="legal-consent-accept" data-ai-processing-action="approve" disabled></button>
      </div>
    </div>`;
  const modal = overlay.querySelector('[role="dialog"]');
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  modal?.setAttribute('aria-labelledby', titleId);
  modal?.setAttribute('aria-describedby', descId);
  const kickerEl = overlay.querySelector('.legal-consent-kicker');
  const titleEl = overlay.querySelector('h2');
  const descEl = overlay.querySelector('.legal-consent-copy');
  const pointsEl = overlay.querySelector('.legal-consent-points');
  const statementEl = overlay.querySelector('.ai-processing-statement');
  const linksEl = overlay.querySelector('.cloud-ai-consent-links');
  if (kickerEl) kickerEl.textContent = kicker;
  if (titleEl) { titleEl.id = titleId; titleEl.textContent = title; }
  if (descEl) { descEl.id = descId; descEl.textContent = description; }
  for (const point of points) {
    const item = document.createElement('li');
    item.textContent = point;
    pointsEl?.appendChild(item);
  }
  if (statementEl) statementEl.textContent = statement;
  if (linksEl && links) links(linksEl);
  if (linksEl && !linksEl.childNodes.length) linksEl.remove();
  const checkbox = /** @type {HTMLInputElement | null} */ (overlay.querySelector('input[type="checkbox"]'));
  if (checkbox) checkbox.id = id === 'cloud-ai-consent-overlay' ? 'cloud-ai-consent-checkbox' : `${id}-checkbox`;
  const cancel = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('[data-ai-processing-action="cancel"]'));
  const approve = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('[data-ai-processing-action="approve"]'));
  if (id === 'cloud-ai-consent-overlay') {
    cancel?.setAttribute('data-cloud-ai-consent-action', 'cancel');
    approve?.setAttribute('data-cloud-ai-consent-action', 'approve');
  }
  if (cancel) cancel.textContent = cancelLabel;
  if (approve) approve.textContent = approveLabel;

  document.body.appendChild(overlay);
  document.body.classList.add('cloud-ai-consent-visible');
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
        ? event.target.closest('[data-ai-processing-action]')
        : null;
      if (!target || !overlay.contains(target)) return;
      const action = target.getAttribute('data-ai-processing-action');
      if (action === 'cancel') finish(false);
      if (action === 'approve' && checkbox?.checked) {
        onApprove();
        finish(true);
      }
    });
    setTimeout(() => checkbox?.focus(), 30);
  });
}

async function runPrompt(show, isSatisfied) {
  if (isSatisfied()) return true;
  if (activePrompt) {
    await activePrompt;
    if (isSatisfied()) return true;
  }
  activePrompt = show();
  try {
    return await activePrompt;
  } finally {
    activePrompt = null;
  }
}

export function requestAITransparencyAcknowledgement() {
  return runPrompt(() => showPrompt({
    id: 'ai-transparency-overlay',
    kicker: 'AI transparency',
    title: 'Turn on AI-generated features?',
    description: 'getbased uses generative AI for optional responses, summaries, and insights. This notice is separate from any approval to send sensitive data to a remote recipient.',
    points: [
      'AI output is generated or altered by AI and may be incomplete, inaccurate, or unsuitable for health decisions.',
      'AI output is educational, not medical advice or a diagnosis; important conclusions need independent review.',
      'After AI is activated, automatic insights may make later requests following relevant profile or data changes. The applicable destination approval is checked before every request.',
    ],
    statement: 'I understand which getbased content is AI-generated and that automatic AI insights may run after relevant data changes.',
    cancelLabel: 'Not now',
    approveLabel: 'Acknowledge & continue',
    onApprove: storeAITransparencyAcknowledgement,
  }), hasAcknowledgedAITransparency);
}

function requestCombinedDestinationActivation(details, kind) {
  const privateNetwork = details.boundary === 'private-network';
  const id = privateNetwork ? 'ai-route-confirmation-overlay' : 'cloud-ai-consent-overlay';
  const destination = details.origin || details.label;
  return runPrompt(() => showPrompt({
    id,
    kicker: 'AI connection',
    title: `Activate ${details.label}?`,
    description: kind === 'activation'
      ? 'The connection check succeeded. Before getbased sends profile or request content, review how AI features work and where that content will go.'
      : 'Before getbased sends profile or request content, review how AI features work and where that content will go.',
    points: [
      'AI-generated output may be incomplete or inaccurate, is educational rather than medical advice, and should be independently reviewed for important health decisions.',
      'After activation, relevant profile or data changes may trigger later automatic AI insight requests through this destination.',
      privateNetwork
        ? `Relevant content will leave this browser device and go directly to ${destination} on your local network.`
        : `Requests may include health, genetic, biometric, wearable, voice, image, or other sensitive information sent ${details.route}.`,
      privateNetwork
        ? 'Only continue if this is an endpoint you or your organization controls and trusts. Changing its origin requires a new confirmation.'
        : recipientPracticesPoint(details),
    ],
    statement: privateNetwork
      ? `I understand the AI disclosure and confirm ${destination} as a trusted local-network destination for relevant content, including later automatic insights.`
      : `I understand the AI disclosure and approve sending relevant sensitive data to ${details.label}, including for later automatic insights.`,
    cancelLabel: 'Not now',
    approveLabel: 'Allow & activate',
    links: privateNetwork ? null : container => appendPolicyLinks(container, details),
    onApprove: () => {
      storeAITransparencyAcknowledgement();
      if (privateNetwork) storeRouteConfirmation(details);
      else storeRemoteApproval(details);
    },
  }), () => hasAcknowledgedAITransparency() && (
    privateNetwork
      ? hasAIRouteConfirmation(details.provider, { endpoint: details.endpoint })
      : hasCloudAIConsent(details.provider, { endpoint: details.endpoint, modelId: details.cloudModel ? 'cloud' : '' })
  ));
}

function requestRouteConfirmation(details, kind) {
  const activating = kind === 'activation';
  return runPrompt(() => showPrompt({
    id: 'ai-route-confirmation-overlay',
    kicker: activating ? 'AI connection' : 'Private-network AI destination',
    title: activating ? `Activate ${details.label}?` : 'Confirm this local-network endpoint',
    description: activating
      ? `The connection check succeeded. Before getbased sends profile or request content, confirm ${details.origin || details.label} as a trusted local-network destination.`
      : `For ${purposeCopy(kind)}, getbased will send data ${details.route}. Recipient: ${details.label}. The data leaves this browser device even though the destination is on a private network.`,
    points: [
      `Destination: ${details.origin || details.label}.`,
      'Only continue if this is an endpoint you or your organization controls and trusts.',
      'Changing the endpoint origin requires a new confirmation.',
    ],
    statement: `I recognize ${details.origin || details.label} as a trusted private-network AI destination and approve sending relevant data there.`,
    cancelLabel: activating ? 'Not now' : 'Keep data on this device',
    approveLabel: activating ? 'Allow & activate' : 'Confirm destination',
    onApprove: () => storeRouteConfirmation(details),
  }), () => hasAIRouteConfirmation(details.provider, { endpoint: details.endpoint }));
}

function requestRemoteSensitiveDataApproval(details, kind) {
  const activating = kind === 'activation';
  return runPrompt(() => showPrompt({
    id: 'cloud-ai-consent-overlay',
    kicker: activating ? 'AI connection' : 'Remote AI privacy',
    title: activating ? `Activate ${details.label}?` : 'Approve sensitive-data processing',
    description: activating
      ? `The connection check succeeded. Before getbased sends profile or request content, approve ${details.label} as this AI destination.`
      : `For ${purposeCopy(kind)}, getbased is ready to send data ${details.route}. Recipient: ${details.label}. Nothing is sent until you approve.`,
    points: [
      'Requests can include health, genetic, biometric, wearable, voice, image, or other sensitive information from the active profile and current operation.',
      recipientPracticesPoint(details),
      'This approval covers later requests to the same recipient, including automatic AI insights after relevant profile or data changes. You can withdraw it in Settings → Privacy.',
    ],
    statement: `I approve sending relevant sensitive data to ${details.label} for AI and voice processing, including later automatic insights.`,
    cancelLabel: activating ? 'Not now' : 'Keep data on this device',
    approveLabel: activating ? 'Allow & activate' : 'Approve & send',
    links: container => appendPolicyLinks(container, details),
    onApprove: () => storeRemoteApproval(details),
  }), () => hasCloudAIConsent(details.provider, { endpoint: details.endpoint, modelId: details.cloudModel ? 'cloud' : '' }));
}

/**
 * Provider-neutral first-use gate. The transparency record is separate from
 * route confirmation and remote sensitive-data approval records.
 */
export async function requestAIProcessingApproval(provider, { kind = 'text', endpoint = '', modelId = '' } = {}) {
  const details = cloudAIConsentDetails(provider, { endpoint, modelId });
  const needsTransparency = !hasAcknowledgedAITransparency();
  const needsDestination = details.boundary === 'private-network'
    ? !hasAIRouteConfirmation(provider, { endpoint: details.endpoint })
    : details.boundary === 'remote'
      ? !hasCloudAIConsent(provider, { endpoint: details.endpoint, modelId: details.cloudModel ? 'cloud' : '' })
      : false;
  if (needsTransparency && needsDestination) return requestCombinedDestinationActivation(details, kind);
  if (needsTransparency && !await requestAITransparencyAcknowledgement()) return false;
  if (details.boundary === 'same-device') return true;
  if (details.boundary === 'private-network') return requestRouteConfirmation(details, kind);
  return requestRemoteSensitiveDataApproval(details, kind);
}

export function requestAIProviderActivation(provider, options = {}) {
  return requestAIProcessingApproval(provider, { ...options, kind: 'activation' });
}

export async function requireAIProcessingApproval(provider, options = {}) {
  const details = cloudAIConsentDetails(provider, options);
  const destinationApproved = details.boundary === 'same-device'
    || (details.boundary === 'private-network' && hasAIRouteConfirmation(provider, options))
    || (details.boundary === 'remote' && hasCloudAIConsent(provider, options));
  if (options.kind === 'automatic-insight' && (!hasAcknowledgedAITransparency() || !destinationApproved)) {
    if (!hasAcknowledgedAITransparency()) throw new AITransparencyDeclinedError();
    if (details.boundary === 'private-network') throw new AIRouteConfirmationDeclinedError();
    throw new CloudAIConsentDeclinedError();
  }
  if (await requestAIProcessingApproval(provider, options)) return true;
  if (!hasAcknowledgedAITransparency()) throw new AITransparencyDeclinedError();
  if (details.boundary === 'private-network') throw new AIRouteConfirmationDeclinedError();
  throw new CloudAIConsentDeclinedError();
}

// Backward-compatible names retained for callers and extension integrations.
// They now run the complete transparency + destination-specific gate.
export function requestCloudAIConsent(provider, options) {
  return requestAIProcessingApproval(provider, options);
}

export function requireCloudAIConsent(provider, options) {
  return requireAIProcessingApproval(provider, options);
}
