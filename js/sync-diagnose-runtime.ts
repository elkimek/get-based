// sync-diagnose-runtime.js - Browser runtime adapters for Sync Diagnose shell hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { showConfirmDialog } from './utils.js';

export interface SyncDiagnoseRuntimeDeps { showConfirmDialog: typeof showConfirmDialog | null }

const syncDiagnoseRuntimeDeps: SyncDiagnoseRuntimeDeps = { showConfirmDialog };

export function configureSyncDiagnoseRuntimeDeps(deps: Partial<SyncDiagnoseRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(syncDiagnoseRuntimeDeps, deps, 'inherited');
}

export async function confirmSyncDiagnoseActionRuntime(message: string, opts: { fallback?: boolean } = {}) {
  const confirm = syncDiagnoseRuntimeDeps.showConfirmDialog;
  if (!confirm) return opts.fallback ?? true;
  return !!await confirm(message);
}
