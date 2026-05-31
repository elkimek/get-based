#!/usr/bin/env node
// test-sync-modal-refresh.js — shared sync-applied modal refresh guards.
//
// Run: node tests/test-sync-modal-refresh.js

import './_node-shim.js';

const { bindDetailModalSyncRefresh } = await import('../js/utils.js');
const { state } = await import('../js/state.js');
const { configureSyncDelta } = await import('../js/sync-delta.js');
const { mergePulledImportedData } = await import('../js/sync-pull-merge.js');
const { refreshActiveProfileAfterPull } = await import('../js/sync-pull-active-refresh.js');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sync Modal Refresh Tests ===\n');

const originalGetElementById = document.getElementById;

function makeOverlay({ open = true } = {}) {
  return {
    classList: { contains: cls => cls === 'show' && open },
  };
}

function makeModal({ kind = 'note', dirty = false, itemId = null } = {}) {
  const dataset = { syncRefreshKind: kind };
  if (itemId) dataset.syncRefreshItemId = itemId;
  return {
    dataset,
    querySelectorAll: () => dirty
      ? [{ disabled: false, tagName: 'INPUT', type: 'text', value: 'changed', defaultValue: '' }]
      : [],
  };
}

function emitSyncApplied() {
  window.dispatchEvent({ type: 'labcharts-sync-applied' });
}

try {
  let overlay = makeOverlay();
  let modal = makeModal();
  document.getElementById = id => id === 'modal-overlay' ? overlay : id === 'detail-modal' ? modal : null;

  let calls = 0;
  let gotModal = null;
  let gotOverlay = null;
  const detach = bindDetailModalSyncRefresh('note', ({ overlay: activeOverlay, modal: activeModal }) => {
    calls++;
    gotOverlay = activeOverlay;
    gotModal = activeModal;
  });

  emitSyncApplied();
  assert('refresh runs for matching open clean detail modal',
    calls === 1 && gotOverlay === overlay && gotModal === modal);

  modal = makeModal({ kind: 'supplements' });
  emitSyncApplied();
  assert('refresh ignores other modal kinds', calls === 1);

  overlay = makeOverlay({ open: false });
  modal = makeModal({ kind: 'note' });
  emitSyncApplied();
  assert('refresh ignores closed overlay', calls === 1);

  overlay = makeOverlay();
  modal = makeModal({ kind: 'note', dirty: true });
  emitSyncApplied();
  assert('refresh skips dirty forms', calls === 1);

  detach();
  modal = makeModal({ kind: 'note' });
  emitSyncApplied();
  assert('detach unregisters sync listener', calls === 1);

  overlay = makeOverlay();
  modal = makeModal({ kind: 'marker', itemId: 'hormones_insulin' });
  let markerCalls = 0;
  let gotItemId = null;
  const detachMarker = bindDetailModalSyncRefresh('marker', ({ modal: activeModal }) => {
    markerCalls++;
    gotItemId = activeModal.dataset.syncRefreshItemId;
  });
  emitSyncApplied();
  assert('refresh exposes detail modal item id to shared callbacks',
    markerCalls === 1 && gotItemId === 'hormones_insulin');
  detachMarker();
} finally {
  document.getElementById = originalGetElementById;
}

const originalMergeCurrentProfile = state.currentProfile;
const originalMergeCurrentView = state.currentView;
const originalMergeImportedData = state.importedData;

try {
  const profileId = 'sync-merge-profile';
  const rawKey = 'hormones.insulin:2026-05-01';
  const itemId = rawKey.replace(/_/g, '__').replace(/:/g, '_');
  const rows = [{
    profileId,
    arrayName: 'manualValues',
    itemId,
    payload: JSON.stringify({ k: rawKey, v: 8 }),
    syncedAt: '2026-05-31T00:00:00.000Z',
    isDeleted: false,
  }];
  configureSyncDelta({
    getEvolu: () => ({ getQueryRows: () => rows }),
    getItemRowQuery: () => ({}),
  });

  state.currentProfile = profileId;
  state.importedData = { entries: [], manualValues: {} };

  const firstPull = await mergePulledImportedData(profileId, null);
  assert('pull merge reports v4 per-row overlay as local data change',
    firstPull.localDataChanged === true && firstPull.merged.manualValues?.[rawKey] === 8);

  const duplicatePull = await mergePulledImportedData(profileId, null);
  assert('pull merge reports duplicate v4 per-row overlay as no-op',
    duplicatePull.localDataChanged === false && duplicatePull.merged.manualValues?.[rawKey] === 8);
} finally {
  configureSyncDelta({
    getEvolu: () => null,
    getItemRowQuery: () => null,
  });
  state.currentProfile = originalMergeCurrentProfile;
  state.currentView = originalMergeCurrentView;
  state.importedData = originalMergeImportedData;
}

const originalQuerySelector = document.querySelector;
const originalBuildSidebar = window.buildSidebar;
const originalNavigate = window.navigate;
const originalCustomEvent = window.CustomEvent;
const originalRefreshCurrentProfile = state.currentProfile;
const originalRefreshCurrentView = state.currentView;
const originalRefreshImportedData = state.importedData;

try {
  let toastCount = 0;
  let navigateCount = 0;
  let syncAppliedCount = 0;
  const container = {
    appendChild: () => { toastCount++; },
  };
  document.getElementById = id => id === 'notification-container' ? container : null;
  document.querySelector = () => null;
  window.buildSidebar = () => {};
  window.navigate = () => { navigateCount++; };
  window.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  const onSyncApplied = () => { syncAppliedCount++; };
  window.addEventListener('labcharts-sync-applied', onSyncApplied);

  state.currentProfile = 'sync-refresh-profile';
  state.currentView = 'labs';
  state.importedData = { entries: [] };

  refreshActiveProfileAfterPull({
    profileId: 'sync-refresh-profile',
    merged: { entries: [] },
    remoteBroughtNewRows: true,
    localDataChanged: false,
  });
  assert('active refresh skips duplicate no-op pulls even when remote row looked newer',
    navigateCount === 0 && toastCount === 0 && syncAppliedCount === 0);

  refreshActiveProfileAfterPull({
    profileId: 'sync-refresh-profile',
    merged: { entries: [{ date: '2026-05-01', markers: { 'biochemistry.glucose': 5 } }] },
    remoteBroughtNewRows: false,
    localDataChanged: true,
  });
  assert('active refresh still re-renders, notifies, and broadcasts real data changes',
    navigateCount === 1 && toastCount === 1 && syncAppliedCount === 1);

  refreshActiveProfileAfterPull({
    profileId: 'sync-refresh-profile',
    merged: { entries: [{ date: '2026-05-01', markers: { 'biochemistry.glucose': 6 } }] },
    remoteBroughtNewRows: true,
    localDataChanged: true,
  });
  assert('active refresh coalesces duplicate update toasts during bursty pull triggers',
    navigateCount === 2 && toastCount === 1 && syncAppliedCount === 2);

  window.removeEventListener('labcharts-sync-applied', onSyncApplied);
} finally {
  document.getElementById = originalGetElementById;
  document.querySelector = originalQuerySelector;
  window.buildSidebar = originalBuildSidebar;
  window.navigate = originalNavigate;
  window.CustomEvent = originalCustomEvent;
  state.currentProfile = originalRefreshCurrentProfile;
  state.currentView = originalRefreshCurrentView;
  state.importedData = originalRefreshImportedData;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail ? 1 : 0);
