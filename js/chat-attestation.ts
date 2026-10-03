// chat-attestation.js - E2EE provider attestation lock markup

import { escapeAttr } from './utils.js';

// Opaque receipt fields are read for display only; this projection performs
// no provider verification or validation of persisted attestation metadata.
interface AttestationDisplayReader {
  securityVerified?: unknown; codeFingerprint?: unknown; enclaveFingerprint?: unknown;
  enclaveHost?: unknown; selectedRouterEndpoint?: unknown;
  nonceVerified?: unknown; signingKeyBound?: unknown; debugMode?: unknown;
  errors?: unknown; gpuVerified?: unknown; dcapVerified?: unknown; measurementsVerified?: unknown;
  gpu?: { tokensVerified?: unknown; arch?: unknown } | null;
  dcap?: { status?: unknown } | null;
  steps?: {
    verifyCode?: { status?: unknown } | null;
    verifyEnclave?: { status?: unknown } | null;
    compareMeasurements?: { status?: unknown } | null;
  } | null;
}
type BadgeLookupTarget = { closest?: unknown };

const ATTESTATION_BADGE_SELECTOR = '.e2ee-attestation-badge[data-attestation-tooltip]';
const ATTESTATION_TOOLTIP_ID = 'e2ee-attestation-tooltip';
let attestationTooltipElement: HTMLDivElement | null = null;
let attestationTooltipTarget: Element | null = null;
let attestationTooltipInstalled = false;

function findAttestationBadge(target: unknown) {
  return typeof (target as BadgeLookupTarget | null | undefined)?.closest === 'function'
    ? ((target as BadgeLookupTarget).closest as (selector: string) => Element | null)(ATTESTATION_BADGE_SELECTOR)
    : null;
}

function ensureAttestationTooltip(doc: Document) {
  if (attestationTooltipElement?.isConnected) return attestationTooltipElement;
  const tooltip = doc.createElement('div');
  tooltip.id = ATTESTATION_TOOLTIP_ID;
  tooltip.className = 'e2ee-attestation-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  doc.body.appendChild(tooltip);
  attestationTooltipElement = tooltip;
  return tooltip;
}

function hideAttestationTooltip() {
  if (attestationTooltipTarget) {
    attestationTooltipTarget.setAttribute('aria-expanded', 'false');
    attestationTooltipTarget.removeAttribute('aria-describedby');
  }
  if (attestationTooltipElement) attestationTooltipElement.hidden = true;
  attestationTooltipTarget = null;
}

function showAttestationTooltip(target: Element) {
  const text = target.getAttribute('data-attestation-tooltip');
  const doc = target.ownerDocument;
  if (!text || !doc?.body) return;
  const tooltip = ensureAttestationTooltip(doc);
  tooltip.textContent = text;
  tooltip.hidden = false;

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = doc.documentElement.clientWidth;
  const viewportHeight = doc.documentElement.clientHeight;
  const margin = 10;
  const gap = 8;
  const idealLeft = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
  const left = Math.max(margin, Math.min(idealLeft, viewportWidth - tooltipRect.width - margin));
  const belowTop = targetRect.bottom + gap;
  const top = belowTop + tooltipRect.height <= viewportHeight - margin
    ? belowTop
    : Math.max(margin, targetRect.top - tooltipRect.height - gap);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;

  if (attestationTooltipTarget && attestationTooltipTarget !== target) {
    attestationTooltipTarget.setAttribute('aria-expanded', 'false');
    attestationTooltipTarget.removeAttribute('aria-describedby');
  }
  attestationTooltipTarget = target;
  target.setAttribute('aria-expanded', 'true');
  target.setAttribute('aria-describedby', ATTESTATION_TOOLTIP_ID);
}

export function installAttestationTooltips(doc: Pick<Document, 'addEventListener'> | null = typeof document !== 'undefined' ? document : null) {
  if (!doc || attestationTooltipInstalled) return false;
  attestationTooltipInstalled = true;
  doc.addEventListener('pointerover', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge) showAttestationTooltip(badge);
  });
  doc.addEventListener('pointerout', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge && !badge.contains(event.relatedTarget as Node | null)) hideAttestationTooltip();
  });
  doc.addEventListener('focusin', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge) showAttestationTooltip(badge);
  });
  doc.addEventListener('focusout', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge && !badge.contains(event.relatedTarget as Node | null)) hideAttestationTooltip();
  });
  doc.addEventListener('click', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge) showAttestationTooltip(badge);
    else if (attestationTooltipTarget) hideAttestationTooltip();
  });
  doc.addEventListener('keydown', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      showAttestationTooltip(badge);
    } else if (event.key === 'Escape' && attestationTooltipTarget) {
      hideAttestationTooltip();
    }
  });
  return true;
}

export function attestationTooltip(attestation: unknown) {
  if (!attestation) return 'TEE attestation: no data';
  if ((attestation as AttestationDisplayReader).securityVerified != null || (attestation as AttestationDisplayReader).codeFingerprint || (attestation as AttestationDisplayReader).enclaveFingerprint) {
    const ok = !!(attestation as AttestationDisplayReader).securityVerified;
    const fp = (attestation as AttestationDisplayReader).codeFingerprint ? String((attestation as AttestationDisplayReader).codeFingerprint).slice(0, 16) + '\u2026' : 'unknown';
    const host = (attestation as AttestationDisplayReader).enclaveHost || (attestation as AttestationDisplayReader).selectedRouterEndpoint || 'unknown';
    const lines = [
      `Security verified: ${ok ? '\u2713' : '\u2717'}`,
      `Enclave: ${host}`,
      `Code fingerprint: ${fp}`,
      (attestation as AttestationDisplayReader).steps?.verifyCode?.status ? `Code: ${(attestation as AttestationDisplayReader).steps!.verifyCode!.status}` : null,
      (attestation as AttestationDisplayReader).steps?.verifyEnclave?.status ? `Enclave attestation: ${(attestation as AttestationDisplayReader).steps!.verifyEnclave!.status}` : null,
      (attestation as AttestationDisplayReader).steps?.compareMeasurements?.status ? `Measurement match: ${(attestation as AttestationDisplayReader).steps!.compareMeasurements!.status}` : null,
    ].filter(Boolean);
    return (ok ? 'TEE attestation verified' : 'TEE attestation FAILED') + '\n' + lines.join('\n');
  }
  const bindingChecks = (attestation as AttestationDisplayReader).nonceVerified && (attestation as AttestationDisplayReader).signingKeyBound && !(attestation as AttestationDisplayReader).debugMode;
  const failed = !bindingChecks || (Array.isArray((attestation as AttestationDisplayReader).errors) && ((attestation as AttestationDisplayReader).errors as unknown[]).length > 0);
  const gpuVerified = (attestation as AttestationDisplayReader).gpuVerified === true;
  const gpuTokensVerified = (attestation as AttestationDisplayReader).gpu?.tokensVerified === true;
  const dcapStatus = (attestation as AttestationDisplayReader).dcap?.status || 'unknown status';
  const gpuCheckPassed = gpuVerified && gpuTokensVerified;
  const lines = [
    failed ? 'Checks that must pass:' : 'Verified in your browser:',
    `${(attestation as AttestationDisplayReader).nonceVerified ? '\u2713' : '\u2717'} Fresh session`,
    `${(attestation as AttestationDisplayReader).signingKeyBound ? '\u2713' : '\u2717'} Encryption key bound to this session`,
    `${!(attestation as AttestationDisplayReader).debugMode ? '\u2713' : '\u2717'} Debug mode disabled`,
    (attestation as AttestationDisplayReader).dcapVerified
      ? `\u2713 Intel TDX environment (DCAP: ${dcapStatus})`
      : '\u2717 Intel TDX environment not verified',
    gpuCheckPassed
      ? `\u2713 NVIDIA GPU evidence (NRAS, ES384 signed${(attestation as AttestationDisplayReader).gpu?.arch ? `, ${(attestation as AttestationDisplayReader).gpu!.arch}` : ''})`
      : '\u2717 NVIDIA GPU evidence not verified',
    '',
    'Current limits:',
    gpuCheckPassed ? '\u2022 TDX and GPU are each verified, but not proven to run together' : null,
    (attestation as AttestationDisplayReader).measurementsVerified === true
      ? '\u2713 Approved code measurements matched'
      : '\u2022 Approved code measurements are not independently checked',
    '\u2022 The source of each response is not independently verified',
  ].filter((line) => line !== null);
  const summary = failed
    ? 'Encrypted Venice session \u00b7 verification FAILED'
    : (attestation as AttestationDisplayReader).dcapVerified && gpuCheckPassed
      ? 'Encrypted Venice session \u00b7 TEE + GPU checks passed'
      : (attestation as AttestationDisplayReader).dcapVerified
        ? 'Encrypted Venice session \u00b7 TEE check passed'
        : 'Encrypted Venice session \u00b7 basic checks only';
  return summary + '\n' + lines.join('\n');
}

function attestationTitle(attestation: unknown) {
  return escapeAttr(attestationTooltip(attestation));
}

function attestationBadgeAttributes(attestation: unknown) {
  const tooltip = attestationTitle(attestation);
  return `class="e2ee-attestation-badge" role="button" tabindex="0" aria-expanded="false" aria-label="${tooltip}" data-attestation-tooltip="${tooltip}"`;
}

export function e2eeLockHTML(attestation: unknown) {
  if (!attestation) return ' \uD83D\uDD12';
  const tinfoil = (attestation as AttestationDisplayReader).securityVerified != null;
  const failed = tinfoil
    ? !(attestation as AttestationDisplayReader).securityVerified
    : !(attestation as AttestationDisplayReader).nonceVerified || !(attestation as AttestationDisplayReader).signingKeyBound || (attestation as AttestationDisplayReader).debugMode
      || (Array.isArray((attestation as AttestationDisplayReader).errors) && ((attestation as AttestationDisplayReader).errors as unknown[]).length > 0);
  const verified = tinfoil && !!(attestation as AttestationDisplayReader).securityVerified;
  const dcapVerified = !tinfoil && !!(attestation as AttestationDisplayReader).dcapVerified;
  const gpuVerified = dcapVerified && !!(attestation as AttestationDisplayReader).gpuVerified && (attestation as AttestationDisplayReader).gpu?.tokensVerified === true;
  const color = failed ? '#ef4444' : verified ? '#22c55e' : gpuVerified ? '#a78bfa' : dcapVerified ? '#38bdf8' : '#f59e0b';
  const mark = failed ? 'failed' : verified ? 'verified' : gpuVerified ? 'TEE + GPU' : dcapVerified ? 'TEE' : 'basic';
  return ` <span ${attestationBadgeAttributes(attestation)}>\uD83D\uDD12\u00a0<span style="color:${color};font-weight:bold">${mark}</span></span>`;
}

export function e2eeLockFootnote(attestation: unknown) {
  if (!attestation) return ' \u00b7 \uD83D\uDD12 e2ee';
  const tinfoil = (attestation as AttestationDisplayReader).securityVerified != null;
  const failed = tinfoil
    ? !(attestation as AttestationDisplayReader).securityVerified
    : !(attestation as AttestationDisplayReader).nonceVerified || !(attestation as AttestationDisplayReader).signingKeyBound || (attestation as AttestationDisplayReader).debugMode
      || (Array.isArray((attestation as AttestationDisplayReader).errors) && ((attestation as AttestationDisplayReader).errors as unknown[]).length > 0);
  const verified = tinfoil && !!(attestation as AttestationDisplayReader).securityVerified;
  const dcapVerified = !tinfoil && !!(attestation as AttestationDisplayReader).dcapVerified;
  const gpuVerified = dcapVerified && !!(attestation as AttestationDisplayReader).gpuVerified && (attestation as AttestationDisplayReader).gpu?.tokensVerified === true;
  const color = failed ? '#ef4444' : verified ? '#22c55e' : gpuVerified ? '#a78bfa' : dcapVerified ? '#38bdf8' : '#f59e0b';
  const mark = failed ? 'failed' : verified ? 'verified' : gpuVerified ? 'TEE + GPU' : dcapVerified ? 'TEE' : 'basic';
  return ` \u00b7 <span ${attestationBadgeAttributes(attestation)}>\uD83D\uDD12\u00a0<span style="color:${color};font-weight:bold">${mark}</span> encrypted</span>`;
}

installAttestationTooltips();
