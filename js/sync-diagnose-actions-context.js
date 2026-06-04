// @ts-check
// sync-diagnose-actions-context.js - Injected dependencies shared by Diagnose actions.

/** @typedef {(...args: any[]) => any} SyncDiagnoseActionFn */
/** @typedef {(...args: any[]) => Promise<any>} SyncDiagnoseAsyncActionFn */

/** @type {SyncDiagnoseAsyncActionFn} */
let _enableSync = async () => false;
/** @type {SyncDiagnoseAsyncActionFn} */
let _restoreFromMnemonic = async () => false;
/** @type {SyncDiagnoseActionFn} */
let _isSyncEnabled = () => false;
/** @type {SyncDiagnoseAsyncActionFn} */
let _pushProfile = async () => {};
/** @type {SyncDiagnoseActionFn} */
let _enablePhase2Cutover = () => ({ ok: false, reason: 'unconfigured' });
/** @type {SyncDiagnoseActionFn} */
let _disablePhase2Cutover = () => false;
/** @type {SyncDiagnoseAsyncActionFn} */
let _showSyncDiagnose = async () => {};

/** @param {{
 *   enableSync?: SyncDiagnoseActionFn,
 *   restoreFromMnemonic?: SyncDiagnoseActionFn,
 *   isSyncEnabled?: SyncDiagnoseActionFn,
 *   pushProfile?: SyncDiagnoseActionFn,
 *   enablePhase2Cutover?: SyncDiagnoseActionFn,
 *   disablePhase2Cutover?: SyncDiagnoseActionFn,
 *   showSyncDiagnose?: SyncDiagnoseActionFn,
 * }} [deps]
 */
export function configureSyncDiagnoseActionContext({
  enableSync,
  restoreFromMnemonic,
  isSyncEnabled,
  pushProfile,
  enablePhase2Cutover,
  disablePhase2Cutover,
  showSyncDiagnose,
} = {}) {
  if (typeof enableSync === 'function') _enableSync = enableSync;
  if (typeof restoreFromMnemonic === 'function') _restoreFromMnemonic = restoreFromMnemonic;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof pushProfile === 'function') _pushProfile = pushProfile;
  if (typeof enablePhase2Cutover === 'function') _enablePhase2Cutover = enablePhase2Cutover;
  if (typeof disablePhase2Cutover === 'function') _disablePhase2Cutover = disablePhase2Cutover;
  if (typeof showSyncDiagnose === 'function') _showSyncDiagnose = showSyncDiagnose;
}

export function currentSyncEnabled() {
  try { return !!_isSyncEnabled?.(); } catch { return false; }
}

export async function enableSyncForDiagnose(...args) {
  return _enableSync(...args);
}

export async function restoreMnemonicForDiagnose(...args) {
  return _restoreFromMnemonic(...args);
}

export async function pushProfileForDiagnose(...args) {
  return _pushProfile(...args);
}

export function enablePhase2CutoverForDiagnose(...args) {
  return _enablePhase2Cutover(...args);
}

export function disablePhase2CutoverForDiagnose(...args) {
  return _disablePhase2Cutover(...args);
}

export async function showSyncDiagnoseForActions(...args) {
  return _showSyncDiagnose(...args);
}
