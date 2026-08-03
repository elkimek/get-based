// @ts-check
// chat-attestation.js - E2EE provider attestation lock markup

import { escapeAttr } from './utils.js';

const ATTESTATION_BADGE_SELECTOR = '.e2ee-attestation-badge[data-attestation-tooltip]';
const ATTESTATION_TOOLTIP_ID = 'e2ee-attestation-tooltip';
let attestationTooltipElement = null;
let attestationTooltipTarget = null;
let attestationTooltipInstalled = false;

function findAttestationBadge(target) {
  return typeof target?.closest === 'function'
    ? target.closest(ATTESTATION_BADGE_SELECTOR)
    : null;
}

function ensureAttestationTooltip(doc) {
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

function showAttestationTooltip(target) {
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

export function installAttestationTooltips(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || attestationTooltipInstalled) return false;
  attestationTooltipInstalled = true;
  doc.addEventListener('pointerover', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge) showAttestationTooltip(badge);
  });
  doc.addEventListener('pointerout', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge && !badge.contains(event.relatedTarget)) hideAttestationTooltip();
  });
  doc.addEventListener('focusin', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge) showAttestationTooltip(badge);
  });
  doc.addEventListener('focusout', (event) => {
    const badge = findAttestationBadge(event.target);
    if (badge && !badge.contains(event.relatedTarget)) hideAttestationTooltip();
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

export function attestationTooltip(attestation) {
  if (!attestation) return 'TEE attestation: no data';
  if (attestation.securityVerified != null || attestation.codeFingerprint || attestation.enclaveFingerprint) {
    const ok = !!attestation.securityVerified;
    const fp = attestation.codeFingerprint ? String(attestation.codeFingerprint).slice(0, 16) + '\u2026' : 'unknown';
    const host = attestation.enclaveHost || attestation.selectedRouterEndpoint || 'unknown';
    const lines = [
      `Security verified: ${ok ? '\u2713' : '\u2717'}`,
      `Enclave: ${host}`,
      `Code fingerprint: ${fp}`,
      attestation.steps?.verifyCode?.status ? `Code: ${attestation.steps.verifyCode.status}` : null,
      attestation.steps?.verifyEnclave?.status ? `Enclave attestation: ${attestation.steps.verifyEnclave.status}` : null,
      attestation.steps?.compareMeasurements?.status ? `Measurement match: ${attestation.steps.compareMeasurements.status}` : null,
    ].filter(Boolean);
    return (ok ? 'TEE attestation verified' : 'TEE attestation FAILED') + '\n' + lines.join('\n');
  }
  const bindingChecks = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const failed = !bindingChecks || (Array.isArray(attestation.errors) && attestation.errors.length > 0);
  const level = attestation.verificationLevel || (attestation.dcapVerified ? 'dcap' : 'binding');
  const lines = [
    `Client verification level: ${level}`,
    `Nonce: ${attestation.nonceVerified ? '\u2713' : '\u2717'}`,
    `Key binding: ${attestation.signingKeyBound ? '\u2713' : '\u2717'}`,
    `Debug mode: ${attestation.debugMode ? 'YES \u2717' : 'no \u2713'}`,
    attestation.serverVerified != null ? `Venice-reported verification: ${attestation.serverVerified ? '\u2713' : '\u2717'}` : null,
    attestation.serverTdxValid != null ? `Venice-reported TDX: ${attestation.serverTdxValid ? '\u2713' : '\u2717'}` : null,
    attestation.dcap
      ? `Client DCAP: ${attestation.dcap.status || 'unknown'}${attestation.dcapVerified ? '' : ' (not accepted)'}`
      : 'Client DCAP: not run',
    attestation.dcap ? 'DCAP collateral: pccs.phala.network' : null,
    attestation.measurementsVerified === true ? 'Approved measurements: matched' : 'Approved measurements: not validated',
    'Response origin binding: not verified',
  ].filter(Boolean);
  const summary = failed
    ? 'Venice E2EE checks FAILED'
    : attestation.dcapVerified
      ? 'Venice E2EE: Intel DCAP verified (limited workload assurance)'
      : 'Venice E2EE: limited verification';
  return summary + '\n' + lines.join('\n');
}

function attestationTitle(attestation) {
  return escapeAttr(attestationTooltip(attestation));
}

function attestationBadgeAttributes(attestation) {
  const tooltip = attestationTitle(attestation);
  return `class="e2ee-attestation-badge" role="button" tabindex="0" aria-expanded="false" aria-label="${tooltip}" data-attestation-tooltip="${tooltip}"`;
}

export function e2eeLockHTML(attestation) {
  if (!attestation) return ' \uD83D\uDD12';
  const tinfoil = attestation.securityVerified != null;
  const failed = tinfoil
    ? !attestation.securityVerified
    : !attestation.nonceVerified || !attestation.signingKeyBound || attestation.debugMode
      || (Array.isArray(attestation.errors) && attestation.errors.length > 0);
  const verified = tinfoil && !!attestation.securityVerified;
  const dcapVerified = !tinfoil && !!attestation.dcapVerified;
  const color = failed ? '#ef4444' : verified ? '#22c55e' : dcapVerified ? '#38bdf8' : '#f59e0b';
  const mark = failed ? '\u2717' : verified ? '\u2713' : dcapVerified ? 'D' : '~';
  return ` <span ${attestationBadgeAttributes(attestation)}>\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span></span>`;
}

export function e2eeLockFootnote(attestation) {
  if (!attestation) return ' \u00b7 \uD83D\uDD12 e2ee';
  const tinfoil = attestation.securityVerified != null;
  const failed = tinfoil
    ? !attestation.securityVerified
    : !attestation.nonceVerified || !attestation.signingKeyBound || attestation.debugMode
      || (Array.isArray(attestation.errors) && attestation.errors.length > 0);
  const verified = tinfoil && !!attestation.securityVerified;
  const dcapVerified = !tinfoil && !!attestation.dcapVerified;
  const color = failed ? '#ef4444' : verified ? '#22c55e' : dcapVerified ? '#38bdf8' : '#f59e0b';
  const mark = failed ? '\u2717' : verified ? '\u2713' : dcapVerified ? 'D' : '~';
  return ` \u00b7 <span ${attestationBadgeAttributes(attestation)}>\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span> e2ee</span>`;
}

installAttestationTooltips();
