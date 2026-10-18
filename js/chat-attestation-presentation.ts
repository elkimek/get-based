// Opaque receipt fields are read for display only; this projection performs
// no provider verification or validation of persisted attestation metadata.
interface AttestationDisplayReader {
  securityVerified?: unknown; codeFingerprint?: unknown; enclaveFingerprint?: unknown;
  enclaveHost?: unknown; selectedRouterEndpoint?: unknown;
  nonceVerified?: unknown; signingKeyBound?: unknown; debugMode?: unknown;
  errors?: unknown; gpuVerified?: unknown; dcapVerified?: unknown; measurementsVerified?: unknown;
  gpu?: { tokensVerified?: unknown; arch?: unknown; } | null;
  dcap?: { status?: unknown; } | null;
  steps?: {
    verifyCode?: { status?: unknown; } | null;
    verifyEnclave?: { status?: unknown; } | null;
    compareMeasurements?: { status?: unknown; } | null;
  } | null;
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

export interface AttestationBadgeView {
  readonly color: '#ef4444' | '#22c55e' | '#a78bfa' | '#38bdf8' | '#f59e0b';
  readonly mark: 'failed' | 'verified' | 'TEE + GPU' | 'TEE' | 'basic';
  readonly tooltip: string;
}
export type AttestationBadgeProps = { readonly footnote?: boolean } & (
  { readonly view: AttestationBadgeView | null; readonly attestation?: never }
  | { readonly attestation: unknown; readonly view?: never }
);
export function projectAttestationBadge(attestation: unknown): AttestationBadgeView | null {
  if (!attestation) return null;
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
  return { color, mark, tooltip: attestationTooltip(attestation) };
}
