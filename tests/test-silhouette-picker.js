// test-silhouette-picker.js — Body-region silhouette picker.
// Mounts bindBodySilhouette to a detached div, exercises every region
// (front + back independent), then detaches and verifies the
// 'sun-overlay-ready' listener self-removes — covers the listener leak
// fix that was producing the "chest blinking" overlay churn before.
// Run: fetch('tests/test-silhouette-picker.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; }
    else { fail++; console.error(`FAIL  ${name}` + (detail ? ` — ${detail}` : '')); }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  console.log('%c Silhouette Picker Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const sun = await import('/js/sun.js?bust=' + Date.now());
  const { bindBodySilhouette, renderBodySilhouette, BODY_REGIONS } = sun;

  // ─── 1. Renders an SVG with both views ───────────────────────────────
  const host = document.createElement('div');
  document.body.appendChild(host);
  const onChange = (set) => { onChangeCalls.push(new Set(set)); };
  let onChangeCalls = [];
  const selected = new Set();
  bindBodySilhouette(host, selected, onChange);

  // bindBodySilhouette doesn't render until first toggle / overlay-ready
  // event — render explicitly so we can inspect the SVG.
  host.innerHTML = renderBodySilhouette(selected);

  const svg = host.querySelector('svg.sun-silhouette');
  assert('Silhouette renders an SVG into the host', !!svg);

  const frontView = host.querySelector('.sun-silhouette-front');
  const backView  = host.querySelector('.sun-silhouette-back');
  assert('Both front + back views render', !!frontView && !!backView);

  // ─── 2. Each of the 16 region keys is reachable on at least one view ──
  // BODY_REGIONS may include shared keys (face, abdomen) on both views.
  // The picker exposes [data-region] paths inside each view; check that
  // every key in BODY_REGIONS is present in the rendered SVG.
  const regionPathKeys = new Set(
    Array.from(host.querySelectorAll('[data-region]')).map(el => el.dataset.region)
  );
  let missing = [];
  for (const r of BODY_REGIONS) {
    if (!regionPathKeys.has(r.key)) missing.push(r.key);
  }
  assert('Every BODY_REGIONS key has a path in the rendered SVG',
    missing.length === 0, `missing: ${missing.join(',')}`);

  // ─── 3. Click toggles selection + re-renders ─────────────────────────
  // Click handler in sun.js tries the region map first; when it's not
  // loaded (test env), falls back to e.target.closest('[data-region]').
  // Pick a region path on the front view and click it.
  const beforeCount = onChangeCalls.length;
  const armsFront = host.querySelector('[data-region="arms-front"][data-view="front"]');
  assert('arms-front path exists on front view', !!armsFront);
  if (armsFront) {
    armsFront.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(0);
    assert('Click on arms-front fires onChange', onChangeCalls.length === beforeCount + 1);
    assert('arms-front is now in selected set',
      onChangeCalls[onChangeCalls.length - 1]?.has('arms-front'));
  }

  // ─── 4. Keyboard Enter on a region toggles ───────────────────────────
  // After re-render, query for back-view torso and dispatch Enter.
  const torsoBack = host.querySelector('[data-region="torso-back"][data-view="back"]');
  assert('torso-back path exists on back view', !!torsoBack);
  if (torsoBack) {
    const beforeKbd = onChangeCalls.length;
    torsoBack.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(0);
    assert('Enter on torso-back fires onChange', onChangeCalls.length === beforeKbd + 1);
    assert('torso-back is now in selected set',
      onChangeCalls[onChangeCalls.length - 1]?.has('torso-back'));
  }

  // ─── 5. Independent front/back toggles ───────────────────────────────
  // Clicking arms-back should NOT remove arms-front (they're independent
  // region keys); selected set should grow, not flip.
  const armsBack = host.querySelector('[data-region="arms-back"][data-view="back"]');
  if (armsBack) {
    armsBack.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(0);
    const last = onChangeCalls[onChangeCalls.length - 1];
    assert('Front + back arm regions toggle independently',
      last?.has('arms-front') && last?.has('arms-back'));
  }

  // ─── 6. Listener self-removes after rootEl detaches ──────────────────
  // The fix: 'sun-overlay-ready' callback checks rootEl.isConnected
  // and removeEventListener's itself when detached. Before the fix,
  // multiple modal opens stacked listeners and rerenders ping-ponged
  // between concurrent selection sets (~10 Hz blob churn on chest).
  //
  // Mount a fresh picker, detach it, dispatch the event, then assert
  // that no rerender happened on the detached host (innerHTML stays
  // identical) AND that no error was thrown.
  const host2 = document.createElement('div');
  document.body.appendChild(host2);
  const sel2 = new Set(['face']);
  bindBodySilhouette(host2, sel2, () => {});
  host2.innerHTML = renderBodySilhouette(sel2);
  const snapshot = host2.innerHTML;

  // Detach
  host2.remove();
  assert('host2 is detached from DOM', !host2.isConnected);

  let dispatchThrew = false;
  try {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new CustomEvent('sun-overlay-ready'));
    }
  } catch (e) {
    dispatchThrew = true;
  }
  assert('Dispatching sun-overlay-ready on detached picker does not throw',
    !dispatchThrew);
  assert('Detached host innerHTML is not mutated by stale listener',
    host2.innerHTML === snapshot);

  // ─── 7. Repeated mount/unmount cycles do not accumulate listeners ────
  // Spy on add/removeEventListener for 'sun-overlay-ready'. With the
  // listener-leak fix, each bindBodySilhouette() call registers exactly
  // one listener, and after rootEl detaches that listener is removed
  // via two paths: (1) MutationObserver on the parent fires eagerly at
  // detach time; (2) the lazy path inside `_onOverlayReady` calls
  // removeEventListener if `_alive()` returns false at dispatch time.
  // Both paths run because removeEventListener is idempotent. The
  // invariant we assert is the real one: no LEAK — every add has at
  // least one matching remove. Counting events directly avoids timing
  // flakes from region-map loads + blob encodes dispatching their own
  // 'sun-overlay-ready' events asynchronously.
  let adds = 0, removes = 0;
  const origAdd = window.addEventListener.bind(window);
  const origRemove = window.removeEventListener.bind(window);
  window.addEventListener = function(type, ...rest) {
    if (type === 'sun-overlay-ready') adds++;
    return origAdd(type, ...rest);
  };
  window.removeEventListener = function(type, ...rest) {
    if (type === 'sun-overlay-ready') removes++;
    return origRemove(type, ...rest);
  };

  for (let i = 0; i < 20; i++) {
    const tmp = document.createElement('div');
    document.body.appendChild(tmp);
    bindBodySilhouette(tmp, new Set(), () => {});
    tmp.remove();
  }
  // Dispatch once — each leaked listener checks isConnected and
  // removeEventListener's itself.
  window.dispatchEvent(new CustomEvent('sun-overlay-ready'));
  await wait(50);

  // Restore originals before asserting so a wrapper bug doesn't poison
  // the rest of the page.
  window.addEventListener = origAdd;
  window.removeEventListener = origRemove;

  assert('20 transient pickers register exactly 20 sun-overlay-ready listeners',
    adds === 20, `adds=${adds}`);
  assert('No leaked listeners — every add has at least one matching remove',
    removes >= adds, `adds=${adds} removes=${removes}`);

  // Cleanup
  host.remove();

  console.log(`%c ${pass} passed, ${fail} failed, ${pass + fail} total`,
    fail === 0 ? 'color:#22c55e' : 'color:#ef4444');
})();
