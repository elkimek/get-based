#!/usr/bin/env node
// test-sync-modal-refresh.js — shared sync-applied modal refresh guards.
//
// Run: node tests/test-sync-modal-refresh.js

import './_node-shim.js';

const { bindDetailModalSyncRefresh } = await import('../js/utils.js');

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

function makeModal({ kind = 'note', dirty = false } = {}) {
  return {
    dataset: { syncRefreshKind: kind },
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
} finally {
  document.getElementById = originalGetElementById;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail ? 1 : 0);
