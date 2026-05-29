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

  // Seed importedData with enough sun sessions to force the modal body to
  // overflow; wheel forwarding is only meaningful when there is somewhere to
  // scroll.
  const S = window._labState;
  const _saved = S?.importedData ? JSON.parse(JSON.stringify(S.importedData)) : null;
  if (S?.importedData) {
    S.importedData.sunSessions = Array.from({ length: 12 }, (_, i) => ({
      id: `sess-modal-probe-${i}`,
      startedAt: Date.now() - (i + 1) * 600000,
      endedAt: Date.now() - (i + 1) * 600000 + 300000,
      doses: { vitamin_d: 100 },
      bodyExposure: { fraction: 0.3, rotatedSides: false },
      safety: { fitzpatrick: 'III' },
      atmosphere: { uvIndex: 6 },
    }));
    S.importedData.deviceSessions = [];
  }

  const before = document.querySelectorAll('.modal-overlay').length;
  try { window._openAllSessionsModal(); } catch (e) {
    assert('_openAllSessionsModal does not throw', false, e.message);
  }
  const after = document.querySelectorAll('.modal-overlay').length;
  assert('_openAllSessionsModal opens a modal-overlay', after > before,
    `before=${before}, after=${after}`);
  const overlay = document.querySelectorAll('.modal-overlay')[after - 1];
  const modal = overlay?.querySelector('.light-sessions-modal');
  assert('all sessions modal uses dedicated shell',
    !!modal && modal.getAttribute('aria-modal') === 'true' &&
      modal.getAttribute('aria-labelledby') === 'light-all-sessions-title');
  assert('all sessions modal summary renders sun/device counts',
    /Total\s*12/.test(modal?.querySelector('.light-sessions-modal-summary')?.textContent || '') &&
      /Sun\s*12/.test(modal?.querySelector('.light-sessions-modal-summary')?.textContent || '') &&
      /Device\s*0/.test(modal?.querySelector('.light-sessions-modal-summary')?.textContent || ''));
  assert('all sessions modal renders session rows',
    modal?.querySelectorAll('.sun-sessions-list .sun-session').length === 12);
  const body = modal?.querySelector('.light-sessions-modal-body');
  if (body) body.scrollTop = 0;
  modal?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 600 }));
  assert('all sessions modal mouse wheel scrolls its body',
    (body?.scrollTop || 0) > 0,
    `scrollTop=${body?.scrollTop || 0}, scrollHeight=${body?.scrollHeight || 0}, clientHeight=${body?.clientHeight || 0}`);

  // Clean up so downstream tests see clean state.
  const m = document.querySelectorAll('.modal-overlay');
  if (m.length > before) m[m.length - 1].remove();
  if (S?.importedData && _saved) S.importedData = _saved;

  console.log(`%c All Sessions Modal: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);
})();
