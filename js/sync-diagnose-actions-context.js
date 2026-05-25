// sync-diagnose-actions-context.js - Injected dependencies shared by Diagnose actions.

let _enableSync = async () => false;
let _restoreFromMnemonic = async () => false;
let _isSyncEnabled = () => false;
let _pushProfile = async () => {};
let _enablePhase2Cutover = () => ({ ok: false, reason: 'unconfigured' });
let _disablePhase2Cutover = () => false;
let _showSyncDiagnose = async () => {};

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
