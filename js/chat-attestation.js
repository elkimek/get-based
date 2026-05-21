// chat-attestation.js - Venice E2EE attestation lock markup

import { escapeAttr } from './utils.js';

export function attestationTooltip(attestation) {
  if (!attestation) return 'TEE attestation: no data';
  const ok = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const lines = [
    `Nonce: ${attestation.nonceVerified ? '\u2713' : '\u2717'}`,
    `Key binding: ${attestation.signingKeyBound ? '\u2713' : '\u2717'}`,
    `Debug mode: ${attestation.debugMode ? 'YES \u2717' : 'no \u2713'}`,
    attestation.serverTdxValid != null ? `Server TDX: ${attestation.serverTdxValid ? '\u2713' : '\u2717'}` : null,
    attestation.dcap ? `DCAP: ${attestation.dcap.status}` : null,
  ].filter(Boolean);
  return (ok ? 'TEE attestation verified' : 'TEE attestation FAILED') + '\n' + lines.join('\n');
}

function attestationTitle(attestation) {
  return escapeAttr(attestationTooltip(attestation));
}

export function e2eeLockHTML(attestation) {
  if (!attestation) return ' \uD83D\uDD12';
  const ok = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const color = ok ? '#22c55e' : '#ef4444';
  const mark = ok ? '\u2713' : '\u2717';
  return ` <span title="${attestationTitle(attestation)}">\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span></span>`;
}

export function e2eeLockFootnote(attestation) {
  if (!attestation) return ' \u00b7 \uD83D\uDD12 e2ee';
  const ok = attestation.nonceVerified && attestation.signingKeyBound && !attestation.debugMode;
  const color = ok ? '#22c55e' : '#ef4444';
  const mark = ok ? '\u2713' : '\u2717';
  return ` \u00b7 <span title="${attestationTitle(attestation)}">\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span> e2ee</span>`;
}
