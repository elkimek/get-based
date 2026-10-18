import type { EvoluDiagnostics } from './sync-diagnostics-snapshot.js';
import type { RelayHealthVerdict, RelayQuotaEstimate } from './sync-relay-health.js';
// Stable synchronous public facade; presentation owns the authored templates.

import { escapeAttr } from './utils.js';

export function syncDiagnoseActionAttrs(action: string) {
  return `data-sync-diagnose-action="${escapeAttr(action)}"`;
}

import { renderSyncDiagnosePresentation } from './sync-diagnose-presentation.js';

export function renderSyncDiagnoseModal({
  diagnostics,
  healthVerdict,
  quota,
  isDebug,
  cutoverEnabled,
}: {
  diagnostics: EvoluDiagnostics;
  healthVerdict: RelayHealthVerdict | null | undefined;
  quota: RelayQuotaEstimate | null | undefined;
  isDebug: boolean;
  cutoverEnabled: boolean;
}) {
  return renderSyncDiagnosePresentation({ diagnostics, healthVerdict, quota, isDebug, cutoverEnabled });
}
