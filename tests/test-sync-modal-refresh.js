#!/usr/bin/env node
// test-sync-modal-refresh.js — shared sync-applied modal refresh guards.
//
// Run: node tests/test-sync-modal-refresh.js

import './_node-shim.js';

const { bindDetailModalSyncRefresh, bindModalSyncRefresh } = await import('../js/utils.js');
const { state } = await import('../js/state.js');
const { configureSyncDelta } = await import('../js/sync-delta.js');
const { mergePulledImportedData } = await import('../js/sync-pull-merge.js');
const { refreshActiveProfileAfterPull } = await import('../js/sync-pull-active-refresh.js');
const { configureSyncPullActiveRefreshDeps } = await import('../js/sync-pull-active-refresh-runtime.js');
const { createNavigate } = await import('../js/views-router.js');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sync Modal Refresh Tests ===\n');

const originalGetElementById = document.getElementById;
const originalBodyContains = document.body?.contains;

function makeOverlay({ open = true, dataset = {}, querySelector = () => null } = {}) {
  return {
    dataset,
    classList: { contains: cls => cls === 'show' && open },
    querySelector,
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
  let body = { scrollTop: 37 };
  let modal = {
    querySelectorAll: () => [],
    querySelector: selector => selector === '#summary-modal-body' ? body : null,
  };
  let overlay = makeOverlay({
    dataset: { syncRefreshKind: 'chat-summary', syncRefreshSummaryId: 'summary-1' },
    querySelector: selector => selector === '.modal' ? modal : selector === '#summary-modal-body' ? body : null,
  });
  document.getElementById = id => id === 'summary-modal-overlay' ? overlay : null;
  let overlayRefreshCalls = 0;
  let overlayRefreshItemId = '';
  const detachOverlayRefresh = bindModalSyncRefresh({
    overlayId: 'summary-modal-overlay',
    modalSelector: '.modal',
    kind: 'chat-summary',
    scrollSelector: '#summary-modal-body',
    getItemId: ({ overlay: activeOverlay }) => activeOverlay.dataset.syncRefreshSummaryId,
    refresh: ({ itemId }) => {
      overlayRefreshCalls++;
      overlayRefreshItemId = itemId;
      body = { scrollTop: 0 };
      modal = {
        querySelectorAll: () => [],
        querySelector: selector => selector === '#summary-modal-body' ? body : null,
      };
    },
  });

  emitSyncApplied();
  assert('generic modal sync helper refreshes matching open clean modal and restores scroll',
    overlayRefreshCalls === 1 && overlayRefreshItemId === 'summary-1' && body.scrollTop === 37,
    JSON.stringify({ overlayRefreshCalls, overlayRefreshItemId, scrollTop: body.scrollTop }));

  body.scrollTop = 50;
  modal = {
    querySelectorAll: () => [{ disabled: false, tagName: 'INPUT', type: 'text', value: 'draft', defaultValue: '' }],
    querySelector: selector => selector === '#summary-modal-body' ? body : null,
  };
  emitSyncApplied();
  assert('generic modal sync helper skips dirty modal forms',
    overlayRefreshCalls === 1 && body.scrollTop === 50,
    JSON.stringify({ overlayRefreshCalls, scrollTop: body.scrollTop }));
  detachOverlayRefresh();

  let directBody = { scrollTop: 12 };
  let directModal = {
    querySelectorAll: () => [],
    querySelector: selector => selector === '.direct-body' ? directBody : null,
  };
  const directOverlay = makeOverlay({
    querySelector: selector => selector === '.direct-modal' ? directModal : selector === '.direct-body' ? directBody : null,
  });
  let directCalls = 0;
  document.body.contains = node => node === directOverlay;
  const detachDirectOverlay = bindModalSyncRefresh({
    overlay: directOverlay,
    modalSelector: '.direct-modal',
    scrollSelector: '.direct-body',
    refresh: () => {
      directCalls++;
      directBody = { scrollTop: 0 };
      directModal = {
        querySelectorAll: () => [],
        querySelector: selector => selector === '.direct-body' ? directBody : null,
      };
    },
  });
  emitSyncApplied();
  assert('generic modal sync helper supports detached overlay instances',
    directCalls === 1 && directBody.scrollTop === 12,
    JSON.stringify({ directCalls, scrollTop: directBody.scrollTop }));
  detachDirectOverlay();

  const ghostModal = {
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const ghostOverlay = makeOverlay({
    querySelector: selector => selector === '.ghost-modal' ? ghostModal : null,
  });
  document.body.contains = node => node !== ghostOverlay;
  let ghostCalls = 0;
  const detachGhostOverlay = bindModalSyncRefresh({
    overlay: ghostOverlay,
    modalSelector: '.ghost-modal',
    refresh: () => { ghostCalls++; },
  });
  emitSyncApplied();
  emitSyncApplied();
  assert('generic modal sync helper detaches removed direct overlay instances',
    ghostCalls === 0,
    JSON.stringify({ ghostCalls }));
  detachGhostOverlay();
} finally {
  document.getElementById = originalGetElementById;
  if (originalBodyContains === undefined) delete document.body.contains;
  else document.body.contains = originalBodyContains;
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
  const rawKey = 'diabetes.insulin:2026-05-01';
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

  state.importedData = { entries: [], biologyScoreContextAI: { summary: 'fresh local review', fingerprint: 'local-fp', updatedAt: 2000 } };
  const staleRemotePull = await mergePulledImportedData(profileId, { entries: [], biologyScoreContextAI: { summary: 'stale remote review', fingerprint: 'remote-fp', updatedAt: 1000 } });
  assert('pull merge preserves fresher local Biology Scores context review over stale remote blob',
    staleRemotePull.merged.biologyScoreContextAI?.fingerprint === 'local-fp'
    && staleRemotePull.needsRebroadcast === true);

  state.importedData = { entries: [], biologyScoreAI: { thyroidCoherence: { text: '**Fresh** local answer', fingerprint: 'fp-local', updatedAt: 3000 } } };
  const staleRemoteAnswerPull = await mergePulledImportedData(profileId, { entries: [], biologyScoreAI: { thyroidCoherence: { text: 'stale remote answer', fingerprint: 'fp-remote', updatedAt: 1000 } } });
  assert('pull merge preserves fresher local Biology Score AI answer over stale remote blob',
    staleRemoteAnswerPull.merged.biologyScoreAI?.thyroidCoherence?.text === '**Fresh** local answer'
    && staleRemoteAnswerPull.needsRebroadcast === true);

  const staleBiologyRows = [
    { profileId, arrayName: 'biologyScoreContextAI', itemId: 'biologyScoreContextAI', payload: JSON.stringify({ v: { summary: 'stale row review', fingerprint: 'row-fp', updatedAt: 500 } }), syncedAt: '2026-01-01T00:00:00.000Z', isDeleted: false },
    { profileId, arrayName: 'biologyScoreAI', itemId: 'thyroidCoherence', payload: JSON.stringify({ k: 'thyroidCoherence', v: { text: 'stale row answer', fingerprint: 'row-answer', updatedAt: 500 } }), syncedAt: '2026-01-01T00:00:00.000Z', isDeleted: false },
  ];
  configureSyncDelta({
    getEvolu: () => ({ getQueryRows: () => staleBiologyRows }),
    getItemRowQuery: () => ({}),
  });
  state.importedData = {
    entries: [],
    biologyScoreContextAI: { summary: 'fresh local review', fingerprint: 'local-row-fp', updatedAt: 2000 },
    biologyScoreAI: { thyroidCoherence: { text: '**Fresh row** local answer', fingerprint: 'fp-local-row', updatedAt: 3000 } },
  };
  const staleRowOverlayPull = await mergePulledImportedData(profileId, { entries: [], biologyScoreContextAI: { summary: 'fresh remote blob review', fingerprint: 'remote-newer', updatedAt: 2500 }, biologyScoreAI: { thyroidCoherence: { text: 'fresh remote blob answer', fingerprint: 'remote-answer', updatedAt: 3500 } } });
  assert('pull merge preserves fresher local Biology Score AI/context over stale delta rows, not only stale blobs',
    staleRowOverlayPull.merged.biologyScoreContextAI?.fingerprint === 'remote-newer'
    && staleRowOverlayPull.merged.biologyScoreAI?.thyroidCoherence?.text === 'fresh remote blob answer',
    JSON.stringify(staleRowOverlayPull.merged));

  configureSyncDelta({
    getEvolu: () => ({ getQueryRows: () => [] }),
    getItemRowQuery: () => ({}),
  });
  const legacyRemote = { entries: [{ date: '2026-01-01', markers: { 'hormones.cPeptide': 1 } }], customMarkers: { 'hormones.cPeptide': { name: 'C-peptide' } } };
  state.importedData = JSON.parse(JSON.stringify(legacyRemote));
  const legacyFirstPull = await mergePulledImportedData(profileId, JSON.parse(JSON.stringify(legacyRemote)));
  state.importedData = legacyFirstPull.merged;
  const legacyDuplicatePull = await mergePulledImportedData(profileId, JSON.parse(JSON.stringify(legacyRemote)));
  assert('pull merge persists schema migrations before change detection so stale remote rows do not retrigger update toasts',
    legacyFirstPull.localDataChanged === true
    && legacyFirstPull.merged.entries?.[0]?.markers?.['diabetes.cPeptide'] === 1
    && !('hormones.cPeptide' in (legacyFirstPull.merged.entries?.[0]?.markers || {}))
    && legacyDuplicatePull.localDataChanged === false,
    JSON.stringify({ firstChanged: legacyFirstPull.localDataChanged, duplicateChanged: legacyDuplicatePull.localDataChanged, merged: legacyDuplicatePull.merged }));
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
const originalCustomEvent = window.CustomEvent;
const originalRefreshCurrentProfile = state.currentProfile;
const originalRefreshCurrentView = state.currentView;
const originalRefreshImportedData = state.importedData;
let navigateCount = 0;
let navigateArgs = null;
const previousSyncPullActiveRefreshDeps = configureSyncPullActiveRefreshDeps({
  buildSidebar: () => {},
  navigate: (...args) => {
    navigateCount++;
    navigateArgs = args;
  },
});

try {
  let toastCount = 0;
  let syncAppliedCount = 0;
  const container = {
    appendChild: () => { toastCount++; },
  };
  document.getElementById = id => id === 'notification-container' ? container : null;
  document.querySelector = () => null;
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
    merged: { entries: [{ date: '2026-04-30', markers: { 'biochemistry.glucose': 4 } }] },
    remoteBroughtNewRows: false,
    localDataChanged: true,
    localCommitEcho: true,
  });
  assert('active refresh suppresses the remote-update toast for this browser own commit echo',
    navigateCount === 1 && toastCount === 0 && syncAppliedCount === 1);

  refreshActiveProfileAfterPull({
    profileId: 'sync-refresh-profile',
    merged: { entries: [{ date: '2026-05-01', markers: { 'biochemistry.glucose': 5 } }] },
    remoteBroughtNewRows: false,
    localDataChanged: true,
  });
  assert('active refresh still re-renders, notifies, and broadcasts real data changes',
    navigateCount === 2 && toastCount === 1 && syncAppliedCount === 2);

  refreshActiveProfileAfterPull({
    profileId: 'sync-refresh-profile',
    merged: { entries: [{ date: '2026-05-01', markers: { 'biochemistry.glucose': 6 } }] },
    remoteBroughtNewRows: true,
    localDataChanged: true,
  });
  assert('active refresh coalesces duplicate update toasts during bursty pull triggers',
    navigateCount === 3 && toastCount === 1 && syncAppliedCount === 3);

  document.querySelector = selector => selector === '.modal-overlay.show, #modal-overlay.show' ? {} : null;
  refreshActiveProfileAfterPull({
    profileId: 'sync-refresh-profile',
    merged: { entries: [{ date: '2026-05-01', markers: { 'biochemistry.glucose': 7 } }] },
    remoteBroughtNewRows: true,
    localDataChanged: true,
  });
  assert('active refresh preserves background scroll when a modal is open',
    navigateArgs?.[0] === 'labs' && navigateArgs?.[1]?.preserveScroll === true);

  window.removeEventListener('labcharts-sync-applied', onSyncApplied);
} finally {
  document.getElementById = originalGetElementById;
  document.querySelector = originalQuerySelector;
  configureSyncPullActiveRefreshDeps(previousSyncPullActiveRefreshDeps);
  window.CustomEvent = originalCustomEvent;
  state.currentProfile = originalRefreshCurrentProfile;
  state.currentView = originalRefreshCurrentView;
  state.importedData = originalRefreshImportedData;
}

const originalRouterCurrentProfile = state.currentProfile;
const originalRouterCurrentView = state.currentView;
const originalRouterImportedData = state.importedData;
const originalScrollTo = window.scrollTo;
const originalScrollX = Object.getOwnPropertyDescriptor(window, 'scrollX');
const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
const originalPageXOffset = Object.getOwnPropertyDescriptor(window, 'pageXOffset');
const originalPageYOffset = Object.getOwnPropertyDescriptor(window, 'pageYOffset');
try {
  let scrollCall = null;
  Object.defineProperty(window, 'scrollX', { configurable: true, value: 12 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 345 });
  Object.defineProperty(window, 'pageXOffset', { configurable: true, value: 12 });
  Object.defineProperty(window, 'pageYOffset', { configurable: true, value: 345 });
  window.scrollTo = arg => { scrollCall = arg; };
  state.currentProfile = 'sync-refresh-profile';
  state.currentView = 'labs';
  state.importedData = { entries: [] };
  let routePayload = 'unset';
  const navigate = createNavigate({
    routeHandlers: { labs: (data) => { routePayload = data; } },
    syncMobileBottomNav: () => {},
    destroyAllCharts: () => {},
  });
  navigate('labs', { preserveScroll: true });
  assert('router preserveScroll restores the same page scroll position after rerender',
    scrollCall?.left === 12 && scrollCall?.top === 345,
    JSON.stringify(scrollCall));
  assert('router preserveScroll option is not passed to page renderers as data',
    routePayload === undefined,
    JSON.stringify(routePayload));
} finally {
  state.currentProfile = originalRouterCurrentProfile;
  state.currentView = originalRouterCurrentView;
  state.importedData = originalRouterImportedData;
  window.scrollTo = originalScrollTo;
  if (originalScrollX) Object.defineProperty(window, 'scrollX', originalScrollX);
  else delete window.scrollX;
  if (originalScrollY) Object.defineProperty(window, 'scrollY', originalScrollY);
  else delete window.scrollY;
  if (originalPageXOffset) Object.defineProperty(window, 'pageXOffset', originalPageXOffset);
  else delete window.pageXOffset;
  if (originalPageYOffset) Object.defineProperty(window, 'pageYOffset', originalPageYOffset);
  else delete window.pageYOffset;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail ? 1 : 0);
