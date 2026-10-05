import { configureRuntimeDependencies, type RuntimeDependencyUpdates } from './runtime-callbacks.js';

interface DiagnoseCutoverResult { ok: boolean; reason?: unknown; blockers?: string[]; }
export interface SyncDiagnoseActionElement extends HTMLElement { disabled?: boolean }
export interface SyncDiagnoseDependencies {
  enableSync: (options?: { skipPush?: boolean }) => Promise<unknown>;
  restoreFromMnemonic: (mnemonic: string, options?: { seedLocal?: boolean }) => Promise<unknown>;
  isSyncEnabled: () => unknown;
  pushProfile: (profileId: string, data: unknown, options?: { force?: boolean }) => Promise<unknown>;
  enablePhase2Cutover: (profileId: string) => DiagnoseCutoverResult;
  disablePhase2Cutover: (profileId: string) => unknown;
  showSyncDiagnose: () => Promise<unknown>;
}

// sync-diagnose-actions-context.ts - Injected dependencies shared by Diagnose actions.

const diagnoseDependencies: SyncDiagnoseDependencies = {
  enableSync: async () => false,
  restoreFromMnemonic: async () => false,
  isSyncEnabled: () => false,
  pushProfile: async () => {},
  enablePhase2Cutover: () => ({ ok: false, reason: 'unconfigured' }),
  disablePhase2Cutover: () => false,
  showSyncDiagnose: async () => {},
};

export function configureSyncDiagnoseActionContext({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  showSyncDiagnose,
}: RuntimeDependencyUpdates<SyncDiagnoseDependencies> = {}) {
  configureRuntimeDependencies(diagnoseDependencies, {
    enableSync, restoreFromMnemonic, isSyncEnabled, pushProfile,
    enablePhase2Cutover, disablePhase2Cutover, showSyncDiagnose,
  });
}

export function currentSyncEnabled() {
  try { return !!(0, diagnoseDependencies.isSyncEnabled)?.(); } catch { return false; }
}

export async function enableSyncForDiagnose(...args: Parameters<SyncDiagnoseDependencies['enableSync']>) {
  return (0, diagnoseDependencies.enableSync)(...args);
}

export async function restoreMnemonicForDiagnose(...args: Parameters<SyncDiagnoseDependencies['restoreFromMnemonic']>) {
  return (0, diagnoseDependencies.restoreFromMnemonic)(...args);
}

export async function pushProfileForDiagnose(...args: Parameters<SyncDiagnoseDependencies['pushProfile']>) {
  return (0, diagnoseDependencies.pushProfile)(...args);
}

export function enablePhase2CutoverForDiagnose(...args: Parameters<SyncDiagnoseDependencies['enablePhase2Cutover']>) {
  return (0, diagnoseDependencies.enablePhase2Cutover)(...args);
}

export function disablePhase2CutoverForDiagnose(...args: Parameters<SyncDiagnoseDependencies['disablePhase2Cutover']>) {
  return (0, diagnoseDependencies.disablePhase2Cutover)(...args);
}

export async function showSyncDiagnoseForActions(...args: Parameters<SyncDiagnoseDependencies['showSyncDiagnose']>) {
  return (0, diagnoseDependencies.showSyncDiagnose)(...args);
}
