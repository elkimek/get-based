import { configureRuntimeDependencies } from './runtime-callbacks.js';
import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';

// sync-diagnostics-context.js - dependency access for sync diagnostics.

export interface SyncDiagnosticRow {
  profileId?: unknown;
  syncedAt?: unknown;
  dataJson?: unknown;
  [field: string]: unknown;
}
export interface SyncDiagnosticClient { getQueryRows(query: unknown): readonly SyncDiagnosticRow[] | null | undefined }

export interface SyncDiagnosticsDeps {
  getEvolu: () => SyncDiagnosticClient | null | undefined;
  getProfileQuery: () => unknown;
  getTombstoneQuery: () => unknown;
  getAppOwner: () => { id?: unknown; mnemonic?: unknown } | null | undefined;
  isSyncEnabled: () => unknown;
  getSubscriptionFireCount: () => unknown;
  isSyncing: () => unknown;
  isPulling: () => unknown;
}

const syncDiagnosticsDeps: SyncDiagnosticsDeps = {
  getEvolu: () => null,
  getProfileQuery: () => null,
  getTombstoneQuery: () => null,
  getAppOwner: () => null,
  isSyncEnabled: () => false,
  getSubscriptionFireCount: () => 0,
  isSyncing: () => false,
  isPulling: () => false,
};

export function configureSyncDiagnosticsContext({
  getEvolu,
  getProfileQuery,
  getTombstoneQuery,
  getAppOwner,
  isSyncEnabled,
  getSubscriptionFireCount,
  isSyncing,
  isPulling,
}: RuntimeDependencyUpdates<SyncDiagnosticsDeps> = {}) {
  configureRuntimeDependencies(syncDiagnosticsDeps, { getEvolu, getProfileQuery, getTombstoneQuery, getAppOwner, isSyncEnabled, getSubscriptionFireCount, isSyncing, isPulling });
}

export function currentDiagnosticEvolu() {
  try { return (0, syncDiagnosticsDeps.getEvolu)?.() || null; } catch { return null; }
}

export function currentDiagnosticProfileQuery() {
  try { return (0, syncDiagnosticsDeps.getProfileQuery)?.() || null; } catch { return null; }
}

export function currentDiagnosticTombstoneQuery() {
  try { return (0, syncDiagnosticsDeps.getTombstoneQuery)?.() || null; } catch { return null; }
}

export function currentDiagnosticAppOwner() {
  try { return (0, syncDiagnosticsDeps.getAppOwner)?.() || null; } catch { return null; }
}

export function currentDiagnosticSyncEnabled() {
  try { return !!(0, syncDiagnosticsDeps.isSyncEnabled)?.(); } catch { return false; }
}

export function currentDiagnosticSubscriptionFireCount() {
  try { return Number((0, syncDiagnosticsDeps.getSubscriptionFireCount)?.() || 0); } catch { return 0; }
}

export function currentDiagnosticSyncing() {
  try { return !!(0, syncDiagnosticsDeps.isSyncing)?.(); } catch { return false; }
}

export function currentDiagnosticPulling() {
  try { return !!(0, syncDiagnosticsDeps.isPulling)?.(); } catch { return false; }
}

export function configureSyncDiagnostics(options: RuntimeDependencyUpdates<SyncDiagnosticsDeps> = {}) {
  configureSyncDiagnosticsContext(options);
}
