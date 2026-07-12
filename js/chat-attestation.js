// @ts-check
// chat-attestation.js - E2EE provider attestation lock markup

import { escapeAttr } from './utils.js';

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
    attestation.measurementsVerified === true ? 'Approved measurements: matched' : 'Approved measurements: not validated',
    'Response origin binding: not verified',
  ].filter(Boolean);
  return (failed ? 'Venice E2EE checks FAILED' : 'Venice E2EE: limited verification') + '\n' + lines.join('\n');
}

function attestationTitle(attestation) {
  return escapeAttr(attestationTooltip(attestation));
}

export function e2eeLockHTML(attestation) {
  if (!attestation) return ' \uD83D\uDD12';
  const tinfoil = attestation.securityVerified != null;
  const failed = tinfoil
    ? !attestation.securityVerified
    : !attestation.nonceVerified || !attestation.signingKeyBound || attestation.debugMode
      || (Array.isArray(attestation.errors) && attestation.errors.length > 0);
  const verified = tinfoil && !!attestation.securityVerified;
  const color = failed ? '#ef4444' : verified ? '#22c55e' : '#f59e0b';
  const mark = failed ? '\u2717' : verified ? '\u2713' : '~';
  return ` <span title="${attestationTitle(attestation)}">\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span></span>`;
}

export function e2eeLockFootnote(attestation) {
  if (!attestation) return ' \u00b7 \uD83D\uDD12 e2ee';
  const tinfoil = attestation.securityVerified != null;
  const failed = tinfoil
    ? !attestation.securityVerified
    : !attestation.nonceVerified || !attestation.signingKeyBound || attestation.debugMode
      || (Array.isArray(attestation.errors) && attestation.errors.length > 0);
  const verified = tinfoil && !!attestation.securityVerified;
  const color = failed ? '#ef4444' : verified ? '#22c55e' : '#f59e0b';
  const mark = failed ? '\u2717' : verified ? '\u2713' : '~';
  return ` \u00b7 <span title="${attestationTitle(attestation)}">\uD83D\uDD12<span style="color:${color};font-weight:bold">${mark}</span> e2ee</span>`;
}
