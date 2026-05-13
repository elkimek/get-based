// test-all-sessions-modal.js — Live modal-render check for window._openAllSessionsModal.
//
// Extracted from test-v1-6-shipped.js when that file migrated to Vitest in
// PR #204 — the live-DOM assertion can't run in Node (document shim returns
// null), and `Function(s)()` puppeteer evaluation can't parse ES modules, so
// the modal-render assertion needed its own home that stays in the puppeteer
// runner. Greptile #204 flagged the coverage gap.
//
// Run: fetch('tests/test-all-sessions-modal.js').then(r=>r.text()).then(s=>Function(s)())

return (async function () {
  let pass = 0, fail = 0;
  function assert(name, cond, detail) {
    if (cond) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c All Sessions Modal Render Test ', 'background:#0891b2;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  if (typeof window._openAllSessionsModal !== 'function') {
    assert('window._openAllSessionsModal exposed', false,
      'views.js should Object.assign(window, { _openAllSessionsModal }) at module load');
    return;
  }

  // Seed importedData with a single sun session so the modal has something
  // to render. The modal early-returns if there are zero sessions.
  const S = window._labState;
  const _saved = S?.importedData ? JSON.parse(JSON.stringify(S.importedData)) : null;
  if (S?.importedData) {
    S.importedData.sunSessions = [{
      id: 'sess-modal-probe',
      startedAt: Date.now() - 600000,
      endedAt: Date.now() - 300000,
      doses: { vitamin_d: 100 },
      bodyExposure: { fraction: 0.3, rotatedSides: false },
      safety: { fitzpatrick: 'III' },
      atmosphere: { uvIndex: 6 },
    }];
    S.importedData.deviceSessions = [];
  }

  const before = document.querySelectorAll('.modal-overlay').length;
  try { window._openAllSessionsModal(); } catch (e) {
    assert('_openAllSessionsModal does not throw', false, e.message);
  }
  const after = document.querySelectorAll('.modal-overlay').length;
  assert('_openAllSessionsModal opens a modal-overlay', after > before,
    `before=${before}, after=${after}`);

  // Clean up so downstream tests see clean state.
  const m = document.querySelectorAll('.modal-overlay');
  if (m.length > before) m[m.length - 1].remove();
  if (S?.importedData && _saved) S.importedData = _saved;

  console.log(`%c All Sessions Modal: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);
})();
